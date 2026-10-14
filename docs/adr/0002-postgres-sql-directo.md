# ADR 0002 — SQL explícito con postgres.js; migraciones SQL como única fuente de verdad

**Contexto.** El worker necesita transacciones por registro, `ON CONFLICT`, savepoints
(dry-run), índices trigram y vistas con `security_invoker`. La app necesita tipos.

**Decisión.** Esquema en `supabase/migrations/*.sql` (formato CLI, aplicable sin
cambios en local y en Supabase). El worker usa `postgres` (postgres.js) con SQL a mano
y `prepare: false` (compatible con los poolers). Los tipos se generan con
`supabase gen types --db-url` desde la base local y se comparten en `@culturaba/shared`.

**Alternativas.** Drizzle/Prisma duplicarían la definición del esquema; supabase-js
desde el worker carece de transacciones.

**Consecuencias.** Un solo lugar define el esquema; regenerar tipos tras cada
migración (`pnpm db:types`).
