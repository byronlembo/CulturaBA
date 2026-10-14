# Arquitectura

## Componentes

```
┌──────────────────────┐   cron 6 h / manual   ┌──────────────────────────┐
│ GitHub Actions       │ ─────────────────────▶│ packages/ingestion       │
│ (.github/workflows/  │                       │ worker TypeScript (tsx)  │
│  ingest.yml)         │                       │ conectores por fuente    │
└──────────────────────┘                       └───────────┬──────────────┘
                                                           │ postgres.js (session pooler)
                                                           ▼
                                               ┌──────────────────────────┐
                                               │ Supabase (Postgres)      │
                                               │ migrations + RLS + vistas│
                                               └───────────┬──────────────┘
                                                           │ PostgREST (clave publicable) + Auth anónima
                                                           ▼
                                               ┌──────────────────────────┐
                                               │ apps/mobile (Expo)       │
                                               │ Router · TanStack Query  │
                                               └──────────────────────────┘
```

- **`packages/shared`**: contrato `NormalizedEvent` (zod), publicabilidad, fechas en
  español, normalización/dedup, enlaces, tipos generados de la base. Sin APIs de
  Node: corre en Hermes.
- **`packages/ingestion`**: cliente HTTP cortés, clientes de fixtures/grabación,
  pipeline, conectores, CLI.
- **`packages/devapi`**: servidor HTTP de solo lectura que expone las vistas públicas
  del Postgres local para desarrollar la app sin Supabase.
- **`supabase/`**: migraciones versionadas (formato CLI), seed, stub de `auth` para
  desarrollo local y smoke test de RLS.
- **`apps/mobile`**: app Expo (Android/iOS/web).

## Modelo de datos (resumen)

**Evento ≠ función.** `events` guarda la información editorial una sola vez;
`occurrences` guarda cada realización (función, fecha de taller o rango de una
muestra) con su propio venue, estado, precio y procedencia.

| Tabla | Rol |
|---|---|
| `institutions`, `venues` | Quién y dónde. `venues.address_source_url` registra de dónde salió la dirección; nunca se inventa. |
| `sources` | Fuentes con `priority` (institución 100 > agregador 10). |
| `events` | Editorial: título, texto original + atribución, `ai_summary` separado, imagen (`image_source` = `source`/`fallback`), precio solo si `price_verified`, `slug` estable, `dedup_key`, `status`, `candidate_reasons`, `last_verified_at`, `search_tsv`. |
| `event_disciplines` | N disciplinas por evento (una primaria). |
| `occurrences` | `kind` timed/all_day/range, `starts_at/ends_at` (timestamptz), `start_date/end_date` (locales BA), `schedule_text`, `recurrence_rule`, `status` (scheduled/rescheduled/cancelled/postponed/sold_out/missing), `previous_starts_at`, precio, procedencia (`source_record_id`, `external_id`, `consecutive_misses`). |
| `source_records` | Relación evento↔fuente: una fila por ítem externo con `content_hash`, `raw_payload` acotado, `normalized`, `last_seen_at`, `consecutive_misses`, `missing_since`. |
| `ingestion_runs` | Métricas por corrida (`stats` jsonb), estado, avisos. |
| `event_changes` | Auditoría de cambios con severidad (base de las notificaciones de Etapa 2). |
| `event_duplicates` | Parecidos que necesitan revisión humana. |
| `profiles`, `user_interests`, `user_event_actions`, `user_devices`, `user_notification_prefs`, `notifications`, `reminders` | Usuario. `user_event_actions` tiene `unique(user_id, event_id, action)` ⇒ acciones idempotentes y reversibles. |
| `event_stats` | Conteos públicos sin identidades, mantenidos por trigger. |

Vistas públicas (`security_invoker`): `v_events_public` (publicados + institución,
venue, disciplinas, `next_starts_at`, `next_kind`, `next_ends_at`, `upcoming_count`,
`is_ongoing`, conteos), `v_occurrences_public`, `v_event_sources_public`.

### Seguridad
- RLS en todas las tablas. `anon`/`authenticated` leen solo lo publicado;
  `source_records` solo columnas de procedencia (grant por columna); internals de
  ingestión sin política ⇒ invisibles.
- Usuarios: `user_id = auth.uid()` en `using` y `with check`.
- El worker usa `DATABASE_URL` (rol postgres por el *session pooler*) solo desde CI o
  local. La app solo conoce la clave publicable. La clave secreta no se usa en
  ningún lado del código.
- Sesión anónima de Supabase para invitados (`enable_anonymous_sign_ins`); si falla,
  intereses y acciones viven en el dispositivo (`AsyncStorage`).

## Pipeline de ingestión

```
start run (detección de solapamiento) → discover → enrich (cola por host) →
parse (puro) → validar (zod) + publicabilidad → upsert source_record (hash) →
match evento → upsert evento (merge por prioridad) + disciplinas →
reconciliar ocurrencias → estado del evento → cambios → política de ausencias →
métricas y cierre
```

- **Transacciones:** una por registro (un ítem roto no afecta al resto). `--dry-run`
  ejecuta el mismo código dentro de una transacción con savepoints que se revierte.
- **Matching:** (1) `external_id` de la fuente; (2) `dedup_key` = título normalizado |
  institución, con compatibilidad de fechas (±1 día o solapamiento) para no fusionar
  temporadas distintas; (3) Dice de bigramas entre eventos de la institución con
  fechas en común: ≥ 0,85 fusiona, 0,70–0,85 crea nuevo y deja fila en
  `event_duplicates`; agregadores cross-institución exigen ≥ 0,90 y mismo venue.
- **Merge editorial:** la fuente primaria (o de mayor `priority`) sobrescribe; una
  secundaria solo rellena nulos. Cambio de título ⇒ `major` y nuevo `dedup_key`; el
  `slug` nunca rota.
- **Ocurrencias:** match por `external_id` o `(venue, starts_at)`; heurística de
  reprogramación (una desaparece, una aparece, mismo venue, ≤ 90 días) ⇒
  `rescheduled` + `previous_starts_at`; texto de cancelación/postergación/agotado ⇒
  estado + cambio `major`/`minor`; una función que desaparece de un registro aún
  visible acumula `consecutive_misses` y a la 2.ª pasa a `missing`.
- **Ausencias (nunca se borra):** solo se cuentan si `discover` tuvo éxito y
  descubrió ≥ 50 % de la corrida anterior (si la anterior tenía ≥ 10 ítems); a la 2.ª
  ausencia consecutiva las funciones futuras pasan a `missing` y, si el evento no
  tiene nada visible en ninguna fuente, queda `suspended`. La reaparición restaura y
  registra `*_reappeared`.
- **Idempotencia:** la misma entrada dos veces produce cero cambios (probado).
- **Cortesía HTTP:** concurrencia 2 por host, ≥ 700 ms entre peticiones, reintentos
  con backoff solo ante red/408/429/5xx (respetando `Retry-After`), timeout,
  `User-Agent` identificable con contacto y `robots.txt`.

## Ejecución programada

`.github/workflows/ingest.yml`: cron cada 6 h + `workflow_dispatch` (fuente, dry-run),
`concurrency` para evitar solapamientos, 30 min de timeout, resumen en
`$GITHUB_STEP_SUMMARY`, logs como artefacto. Secreto `DATABASE_URL` = URI del
*session pooler* de Supabase (IPv4; los runners no tienen IPv6 hacia el host directo).
Limitaciones conocidas: retrasos de cron, auto-desactivación tras 60 días sin
actividad en el repo, posibles bloqueos de WAF a IPs de datacenter (fallback: mismo
CLI en un VPS mínimo).

## Entornos

| | Local | CI | Producción |
|---|---|---|---|
| Base | Postgres 16 nativo (`scripts/pg-local.sh`) + `supabase/tests/local_auth_stub.sql` | servicio `postgres:16` + stub | Supabase (`supabase db push`) |
| API para la app | `packages/devapi` (`pnpm dev:api`) | — | PostgREST de Supabase |
| Ingestión | `pnpm ingest run …` | tests de integración | Actions cron |
| App | `expo start` / `expo export -p web` | typecheck, Jest, export web | Expo Go / EAS (Etapa 2) |

## Decisiones (ADR)

Ver `docs/adr/`.
