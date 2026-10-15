# CulturaBA

Descubrimiento cultural personalizado para Buenos Aires: un catálogo de eventos
que se actualiza solo desde las agendas oficiales, con intereses, fichas verificables,
acciones sociales y compartir. Monorepo con el worker de ingestión, el esquema de
base de datos (Supabase/Postgres) y la app móvil (Expo).

**Estado (15-oct-2026):** fuentes en producción: Teatro Colón y la agenda oficial de la
Ciudad (Linda); 266 eventos publicados en Supabase. Complejo Teatral implementado pero
fuera del cron; MNBA y Palacio Libertad bloqueados por Cloudflare. Detalle en
[`docs/informe-etapa-1.md`](docs/informe-etapa-1.md).

Documentación: [`docs/product-spec.md`](docs/product-spec.md) ·
[`docs/architecture.md`](docs/architecture.md) ·
[`docs/source-inventory.md`](docs/source-inventory.md) ·
[`docs/roadmap.md`](docs/roadmap.md) · [`docs/adr/`](docs/adr/README.md) ·
[`docs/informe-etapa-1.md`](docs/informe-etapa-1.md).

## Probar la app

- **En el navegador (o el navegador del teléfono):** Vercel. Importar el repo en
  https://vercel.com/new con la configuración por defecto: `vercel.json` define install,
  build (web export contra el Supabase real, solo con la clave publicable), salida y
  reescrituras para que los deep links abran en frío. Cada push publica de nuevo.
- **En el teléfono con Expo Go:** clonar el repo, crear `apps/mobile/.env` a partir de
  `apps/mobile/.env.example` con la URL y la clave publicable de Supabase, y correr
  `pnpm install && pnpm mobile`; escanear el QR con Expo Go (misma red Wi-Fi, o
  `pnpm --filter @culturaba/mobile exec expo start --tunnel`).

## Estructura

```
apps/mobile          app Expo (Expo Router, TanStack Query, supabase-js)
packages/shared      contrato NormalizedEvent (zod), fechas en español, dedup, tipos de la base
packages/ingestion   worker: cliente HTTP cortés, fixtures, pipeline, conectores, CLI
packages/devapi      API local de solo lectura para desarrollar la app sin Supabase
supabase/            migraciones (formato Supabase CLI), seed, stub auth local, smoke test RLS
scripts/             Postgres local sin Docker, servidor estático y recorrido Playwright
.github/workflows    ci.yml (lint/typecheck/tests/export) · ingest.yml (cron cada 6 h)
```

## Requisitos

Node 22, pnpm 10 (`corepack enable`), PostgreSQL 16 (binarios locales; no hace falta
Docker). Para Supabase: un proyecto con *Anonymous sign-ins* habilitado.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env                 # completar si vas a usar Supabase
pnpm db:reset                        # crea el cluster local (puerto 54329) + migraciones + seed
pnpm db:check-rls                    # smoke test de RLS (anon / usuarios)
pnpm db:reset-test                   # base para los tests de integración
pnpm lint && pnpm typecheck && pnpm test
```

### Ingestión

```bash
pnpm ingest list-sources                                   # conectores, fuentes y últimas corridas
pnpm ingest run --source sample --from-fixture latest --dry-run
pnpm ingest run --source <slug>                            # en vivo (respeta robots.txt y límites)
pnpm ingest record --source <slug>                         # graba fixtures para tests
pnpm ingest run --all --json                               # lo que corre el cron
pnpm ingest mark-archived                                  # archiva eventos ya pasados
```

Cómo agregar un conector: `docs/source-inventory.md` (plantilla:
`packages/ingestion/src/connectors/sample`).

Detrás de un proxy HTTP (por ejemplo, el sandbox de Claude Code en la nube), el `fetch`
de Node ignora `HTTPS_PROXY` salvo que se active al arrancar. El CLI avisa si falta:

```bash
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/ruta/al/ca.crt pnpm ingest run --source teatro-colon
```

En GitHub Actions no hace falta: los runners salen directo.

### App

```bash
# Opción A: contra Supabase
cat > apps/mobile/.env <<EOF
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
EXPO_PUBLIC_WEB_BASE_URL=https://culturaba.xn--lembodiseo-19a.com
EOF

# Opción B: contra el Postgres local (sin Supabase)
pnpm dev:api                         # http://localhost:8787
cat > apps/mobile/.env <<EOF
EXPO_PUBLIC_API_MODE=dev
EXPO_PUBLIC_DEV_API_URL=http://localhost:8787
EOF

pnpm mobile                          # expo start → Expo Go (iOS/Android) o web
pnpm --filter @culturaba/mobile export:web   # bundle web estático en apps/mobile/dist
```

Recorrido visual automatizado (web export + API local):

```bash
node scripts/serve-dist.mjs apps/mobile/dist 3000
node scripts/screenshot-web.cjs http://localhost:3000 docs/screenshots   # requiere `playwright`
```

### Supabase (producción)

```bash
pnpm exec supabase db push --db-url "$DATABASE_URL"      # aplica supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql                # disciplinas, instituciones, venues, fuentes
pnpm db:types                                            # regenerar tipos tras cambiar migraciones
```

Secretos del repositorio para `ingest.yml`: `DATABASE_URL` (URI del **session
pooler**, IPv4). Variable opcional `INGEST_USER_AGENT`.

## Scripts raíz

| Script | Qué hace |
|---|---|
| `pnpm lint` / `pnpm format` | Biome (lint + formato) |
| `pnpm typecheck` | `tsc --noEmit` en todos los paquetes |
| `pnpm test` | vitest (shared, ingestion) + jest (mobile) |
| `pnpm db:*` | `init`, `start`, `stop`, `status`, `reset`, `reset-test`, `types`, `check-rls`, `url` |
| `pnpm ingest …` | CLI del worker |
| `pnpm dev:api` | API local para la app |
| `pnpm mobile` | `expo start` |

## Principios de datos

Nunca se inventan fechas, precios, direcciones ni imágenes; un evento es distinto de
sus funciones; cada registro conserva su fuente, URL y última comprobación; los
cambios y cancelaciones se detectan y nada se borra por un fallo aislado; RLS en todo
y las credenciales privilegiadas nunca llegan al cliente.
