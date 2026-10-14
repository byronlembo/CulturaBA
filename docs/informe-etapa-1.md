# Informe de entrega — Etapa 1 (14 de octubre de 2026)

Rama: `claude/wonderful-ride-0g1771` · repositorio `byronlembo/CulturaBA`.

## 1. Qué quedó implementado

| Área | Estado | Evidencia |
|---|---|---|
| Monorepo pnpm (shared · ingestion · devapi · mobile), Biome, TypeScript estricto | ✅ | `pnpm lint`, `pnpm typecheck` limpios |
| Esquema Postgres/Supabase: 8 migraciones, Evento ≠ Función, procedencia completa, RLS con grants explícitos, vistas públicas, `event_stats` por trigger | ✅ | `pnpm db:reset` aplica dos veces limpio; `pnpm db:check-rls` pasa (anon + 2 usuarios) |
| Postgres local sin Docker + stub `auth` compatible con Supabase | ✅ | `scripts/pg-local.sh` |
| Dominio compartido: contrato `NormalizedEvent` (zod 4), publicabilidad con motivos, fechas/horas/rangos en español con inferencia de año acotada, dedup (Dice), slugs estables, enlaces | ✅ | **92 tests** (vitest) |
| Worker de ingestión: HTTP cortés (cola por host, backoff, `Retry-After`, timeout, UA, robots.txt), fixtures grabables, pipeline con matching por external id → dedup key + fechas → fuzzy con revisión, merge por prioridad, detección de cambios con severidad, reconciliación de funciones (reprogramación, cancelación, venue, ausencias), política de desaparición con guardia, dry-run transaccional, métricas por corrida, CLI | ✅ | **31 tests** (14 de HTTP/fixtures + 17 escenarios de integración sobre Postgres real con fixtures relativos al reloj) |
| Conector sintético `sample` (plantilla) | ✅ | `pnpm ingest run --source sample --from-fixture latest` |
| **Conectores Teatro Colón, MNBA, Palacio Libertad** | ⛔ **no implementados** | ver §2 |
| App Expo SDK 57: onboarding de invitado (2–3 intereses), Para vos, Explorar (búsqueda + filtros), Calendario (30 días, rangos por día), Guardados, Perfil, ficha completa, Asistiré/Recomiendo/Guardar idempotentes y reversibles, compartir nativo con enlace estable y fuente oficial, deep links `culturaba://event/<slug>` y `https://…/event/<slug>`, imágenes de respaldo, estados de carga/error/vacío, claro/oscuro | ✅ | **21 tests** (Jest) + recorrido Playwright de 9 pantallas sobre la web export con datos reales de la base local (`docs/screenshots/`) |
| API de desarrollo (`packages/devapi`) para la app sin Supabase | ✅ | usada por el recorrido Playwright |
| CI (`ci.yml`): lint, typecheck, RLS smoke, vitest + jest, export web | ✅ | pendiente de ver correr en GitHub (se activa con el push) |
| Cron de ingestión (`ingest.yml`) cada 6 h + manual, resumen y logs | ✅ (en espera) | sin efecto hasta registrar un conector real y cargar `DATABASE_URL` |
| Documentación: inventario de fuentes, arquitectura, especificación de producto, roadmap, 5 ADR, README | ✅ | `docs/` |

## 2. Fuentes: qué funciona realmente

**Ninguna fuente real está conectada todavía.** La política de red del entorno de
desarrollo denegó (HTTP 403 en el túnel del proxy, en todos los reintentos a lo largo
de la sesión) el acceso a `teatrocolon.org.ar`, `bellasartes.gob.ar`,
`palaciolibertad.gob.ar`, `complejoteatral.gob.ar`, `turismo.buenosaires.gob.ar`,
`cultura.gob.ar` y también a `*.supabase.co`. Sin poder leer una sola página, escribir
un parser habría sido inventar estructura y datos, cosa que el encargo prohíbe.

Lo que sí está listo para que la implementación sea corta en cuanto haya red:
- Contrato de conector (`discover`/`enrich` con IO, `parse` puro), cliente de grabación
  de fixtures y de reproducción offline, y una plantilla funcional (`sample`).
- Tokenizadores de fechas en español probados contra los formatos típicos de agenda.
- Protocolo de relevamiento por fuente y fichas con hipótesis marcadas
  (`docs/source-inventory.md`).

## 3. Cantidad de eventos reales importados

**0 eventos reales.** La base local contiene únicamente los eventos sintéticos del
conector `sample` (3 publicados + 2 candidatos en la base de test), usados para
validar el pipeline y la app. No se rellenó nada con datos ficticios en el catálogo
"de producción": el proyecto de Supabase sigue vacío (no se alcanzó por red).

## 4. Qué se probó y cómo

- **Unitario:** 92 (shared) + 14 (HTTP/fixtures) + 21 (app) tests.
- **Integración con base real:** 17 escenarios: creación y publicación selectiva,
  candidatos con motivos, venue creado solo con dirección de la fuente, dry-run sin
  persistir, idempotencia (segunda corrida = 0 cambios), reprogramación, cancelación,
  cambios editoriales con severidad, promoción candidato→publicado, ausencia en dos
  corridas → `missing`/`suspended` → reaparición, guardia anti-ausencias masivas,
  función desaparecida de un registro aún visible, dedup por título equivalente,
  no-fusión por temporada distinta, parecidos marcados para revisión, venue
  irresoluble sin inventar dirección, fuente deshabilitada, fallo de descubrimiento,
  aislamiento de un ítem roto.
- **RLS:** `supabase/tests/rls.sql` (anon ve solo publicados y nunca `raw_payload`
  ni internals; usuarios solo sus filas; contadores por trigger; unicidad).
- **App end-to-end (web):** Playwright sobre `expo export -p web` + `devapi`:
  bienvenida → intereses → feed → ficha → Guardar/Asistiré → Guardados → búsqueda
  "goya" filtra de verdad → calendario → deep link en frío por slug.
- **No probado (imposible aquí):** builds nativos, Expo Go en dispositivo, push, sesión
  anónima contra Supabase real, universal links en dominio, PostgREST real (la
  implementación Supabase del `CatalogApi` está escrita contra la API de supabase-js
  pero no ejecutada).

## 5. Comandos

```bash
pnpm install
pnpm db:reset && pnpm db:check-rls && pnpm db:reset-test
pnpm lint && pnpm typecheck && pnpm test
pnpm ingest list-sources
pnpm ingest run --source sample --from-fixture latest --dry-run
pnpm dev:api                                   # terminal aparte
pnpm mobile                                    # expo start (con apps/mobile/.env en modo dev)
pnpm --filter @culturaba/mobile export:web && node scripts/serve-dist.mjs apps/mobile/dist 3000
node scripts/screenshot-web.cjs                # requiere `playwright`
```

## 6. Variables de entorno (sin secretos)

Raíz `.env` (ver `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`,
`INGEST_USER_AGENT`, `AI_SUMMARY_ENABLED`, `LOG_LEVEL`, `HTTP_TIMEOUT_MS`,
`HTTP_MAX_RETRIES`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
(solo scripts de administración; **no se usa en el código**), `DEV_API_PORT`.

App `apps/mobile/.env` (ver `apps/mobile/.env.example`): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_BASE_URL`, o `EXPO_PUBLIC_API_MODE=dev`
+ `EXPO_PUBLIC_DEV_API_URL`.

GitHub Actions: secreto `DATABASE_URL` (session pooler) y variable opcional
`INGEST_USER_AGENT`.

## 7. Configuración pendiente de servicios externos

1. **Entorno de desarrollo:** permitir en *Network access* los dominios culturales y
   `*.supabase.co`, `*.pooler.supabase.com` (probablemente en una sesión nueva).
2. **Supabase:** `supabase db push --db-url <pooler>` + `seed.sql`; activar *Anonymous
   sign-ins*; obtener la cadena del *session pooler* (las API keys no sirven para
   migraciones); **rotar la clave `sb_secret_`** que se compartió por chat.
3. **GitHub:** secreto `DATABASE_URL`; primera corrida por *workflow_dispatch* cuando
   exista un conector real.
4. **Dominio:** confirmar `culturaba.lembodiseno.com` (o la variante elegida; evitar
   la ñ en el host) para universal links; publicar la web export ahí para que los
   enlaces compartidos abran algo útil.
5. **Expo:** bundle id/package (`ar.com.culturaba.app` placeholder); imágenes de
   respaldo definitivas (hoy son gradientes generados); EAS en Etapa 2.

## 8. Limitaciones conocidas y riesgos

- Sin conectores reales no hay catálogo; es la primera tarea de la próxima sesión.
- Direcciones de los tres venues del seed son datos públicos conocidos pero quedan
  con `address_verified_at = null` hasta confirmarlas en los sitios.
- Inferencia de año en fechas sin año: acotada a 12 meses; casos límite reales por ver.
- `react-native-web`: no poner `style` a un `Pressable` dentro de `<Link asChild>`
  (reenvía el array al `<a>`); patrón ya corregido y documentado.
- Hotlinking de imágenes de las fuentes: respaldo automático si falla; caché en Etapa 3.
- Cron de GitHub: retrasos y auto-desactivación tras 60 días sin actividad.

## 9. Próximos pasos recomendados

1. Sesión con red: relevar + grabar fixtures + implementar Teatro Colón, MNBA y
   Palacio Libertad; correr en vivo; revisar candidatos y duplicados.
2. Desplegar esquema a Supabase y apuntar la app; probar en Expo Go (deep link,
   compartir, acciones con sesión anónima).
3. Etapa 2: push con resumen diario, recordatorios y `.ics` (el esquema ya está).
