# Informe de entrega — Etapa 1 (15 de octubre de 2026)

Rama: `claude/wonderful-ride-0g1771` · repositorio `byronlembo/CulturaBA` · proyecto
Supabase `ioyaejccerbfczpjgstg`.

## 1. Resumen

El catálogo real está cargado y la app lo muestra. Dos fuentes oficiales funcionan en
vivo: **Teatro Colón** y la **agenda oficial de la Ciudad (Linda)**. Juntas aportan
**266 eventos publicados y 736 funciones futuras** al 15-oct-2026, más 38 candidatos que
no se publican porque les falta un dato. La app web, conectada a Supabase con sesión
anónima, recorre las nueve pantallas con esos datos.

Tres fuentes quedan fuera de esta etapa. MNBA y Palacio Libertad están detrás de un
desafío interactivo de Cloudflare que no se elude. El conector del Complejo Teatral
existe, pero está fuera de las corridas programadas hasta corregir defectos de su
lectura de horarios. Sus producciones igual llegan al catálogo a través de Linda.

## 2. Fuentes: qué funciona realmente

| Fuente | Estado | Método | Corrida en vivo (15-oct) | Verificación |
|---|---|---|---|---|
| Teatro Colón | ✅ en producción | HTML: calendario mensual + ficha de cada producción | 29 descubiertos · 29 publicados · 69 funciones · 33 peticiones | 2 rondas de verificación adversarial y correcciones |
| Agenda de la Ciudad (Linda) | ✅ en producción, prioridad 10 | API JSON oficial, 1 petición | 286 descubiertos · 248 completos · 38 candidatos | verificación adversarial (2 lentes); defectos corregidos y cubiertos por tests |
| Complejo Teatral | ⏸ fuera del cron (`ready: false`) | HTML + agenda diaria | dry-run 13/15 publicables | la verificación encontró 2 defectos bloqueantes y 9 mayores; ver §8 |
| MNBA | ⛔ bloqueado | — | `403` con desafío Turnstile en todo el sitio | no se intentó eludir |
| Palacio Libertad | ⛔ bloqueado | — | `403` con desafío en todo el sitio, incluso `robots.txt` | no se intentó eludir |

Detalles por fuente, selectores y ejemplos literales: `docs/source-inventory.md` y
`docs/research/`.

**Cómo se actualizan.** `ingest.yml` corre cada 6 horas en GitHub Actions contra
Supabase. Hasta que se cargue el secreto `DATABASE_URL`, las corridas programadas se
saltean con un aviso en vez de fallar.

## 3. Catálogo real (15-oct-2026, verificado por la API pública)

| Medida | Valor |
|---|---|
| Eventos publicados | 266 |
| Funciones futuras visibles | 736 |
| Candidatos (no publicados) | 38 |
| Instituciones | 90 |
| Venues | 101 |
| Eventos unidos entre Colón y Linda | 8 |
| Publicados con imagen oficial | 266 |
| Publicados gratuitos según la fuente | 111 |

Motivos de los candidatos:
- **Sin disciplina cultural (29):** ferias tecnológicas, deporte y gastronomía de Linda.
- **Sin sede atribuible (6):** "Varias sedes" o sin ubicación.
- **Sin funciones (6):** el texto del propio ítem contradice las fechas u horas de Linda.

La segunda y la tercera corrida en vivo seguidas registraron **0 cambios**. Una corrida
idéntica no altera nada.

## 4. Qué se probó y cómo

- **Tests automáticos:** 95 (shared) + 157 (ingestión, incluidos 27 escenarios de
  integración sobre Postgres real) + 21 (app). `pnpm lint`, `pnpm typecheck` y
  `pnpm test` limpios.
- **Conectores:** tests con fixtures grabados el 14-oct y valores exactos verificados a
  mano contra el HTML o el JSON. Dry-runs con fixtures y en vivo.
- **Dedup entre fuentes:** un registro de Linda se une al evento del Colón si enlaza su
  ficha oficial o comparte la página de entradas oficiales de la Ciudad con id de evento.
  Dos ítems de la misma fuente nunca se unen así. Hay tests que fallan si se quita cada regla.
- **RLS en Supabase real:** la clave publicable ve 266 eventos publicados y 0
  candidatos. De `source_records` solo ve 6 columnas públicas de eventos publicados;
  `raw_payload`, `normalized` y el resto devuelven `42501`.
- **App:** export web contra Supabase y recorrido Playwright de 9 pantallas
  (`docs/screenshots/`), con capturas revisadas a ojo:
  - bienvenida, intereses y feed;
  - ficha con acciones Guardar y Asistiré;
  - Guardados, búsqueda "dictaduras", calendario y deep link en frío.

  Los usuarios anónimos de prueba se borraron después.
- **No probado aquí:** builds nativos, Expo Go en un teléfono, push, universal links en
  el dominio.

## 5. Comandos

```bash
pnpm install
pnpm db:start && pnpm db:reset && pnpm db:reset-test && pnpm db:check-rls
pnpm lint && pnpm typecheck && pnpm test
pnpm ingest list-sources
pnpm ingest run --source teatro-colon --from-fixture 2026-10-14 --dry-run
pnpm ingest run --source agenda-ba                   # en vivo
bash scripts/sync-catalog-to-supabase.sh --yes       # solo carga inicial (trunca el destino)
pnpm --filter @culturaba/mobile export:web && node scripts/serve-dist.mjs apps/mobile/dist 3000
node scripts/screenshot-web.cjs                      # con SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY
```

Detrás de un proxy, el `fetch` de Node necesita `NODE_USE_ENV_PROXY=1`; el CLI avisa.

## 6. Variables de entorno (sin secretos)

- **Raíz `.env`** (ver `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `INGEST_USER_AGENT`, `LOG_LEVEL`,
  `HTTP_TIMEOUT_MS`, `HTTP_MAX_RETRIES`. Para la carga inicial también
  `SUPABASE_ACCESS_TOKEN`; la app nunca lo usa.
- **App `apps/mobile/.env`:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `EXPO_PUBLIC_WEB_BASE_URL`.
- **GitHub Actions:** secreto `DATABASE_URL`, que es la URI del *session pooler* de
  Supabase.

## 7. Configuración pendiente

1. **GitHub:** cargar el secreto `DATABASE_URL` con la URI del session pooler. Con eso
   el cron empieza a actualizar Supabase cada 6 horas.
2. **Seguridad:** revocar el token personal de Supabase (`sbp_…`) y rotar la clave
   `sb_secret_…`, que pasaron por el chat.
3. **Dominio:** la web está en https://culturaba.vercel.app (Vercel). Para usar
   `culturaba.xn--lembodiseo-19a.com`, agregarlo como dominio del proyecto en Vercel.
4. **Expo:** bundle id definitivo, imágenes de respaldo propias y EAS en la Etapa 2.

## 8. Limitaciones conocidas

- **Complejo Teatral fuera del cron.** Su lectura de horarios en texto libre puede
  inventar horas o años en algunos patrones: listas de horas que absorben números de
  día, año de rangos tomado del inicio, avisos con día sin mes y "Hasta el X" con inicio
  inventado. Los defectos están documentados con evidencia y es lo primero de la Etapa 2.
- **Linda es un agregador con errores propios.** Cuando su texto y sus fechas
  estructuradas se contradicen, no se publican funciones. Invasiones I queda así aunque
  sus fechas estructuradas sean las correctas, y "Más de 100 piezas inéditas…" no se
  detecta.
- **Muestras en Linda.** Se publican como tramos de días que Linda lista, así que un
  museo cerrado los martes no aparece abierto. El inicio es el primer día que Linda
  todavía muestra, no la inauguración.
- **Dedup cruzado.** Linda enlaza al Complejo Teatral con URLs `/ver/…` que no
  coinciden con `/produccion/…`. Esos casos se unen por título, no por enlace.
- **MNBA y Palacio Libertad:** ver las opciones en `docs/source-inventory.md`. Son
  fixtures capturados por una persona, un equipo propio con IP residencial o cobertura
  parcial vía Linda.
- **Carga inicial.** El script de sincronización trunca el catálogo remoto y las
  acciones de usuarios. Es solo para la primera carga; después escribe el cron.
