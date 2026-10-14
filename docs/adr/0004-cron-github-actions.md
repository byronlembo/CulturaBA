# ADR 0004 — Ingestión programada con GitHub Actions

**Contexto.** El recolector no puede depender del teléfono ni de un servidor propio;
el desarrollador es una sola persona.

**Decisión.** Workflow con `schedule` cada 6 h + `workflow_dispatch`, `concurrency`
para evitar solapamientos, secreto `DATABASE_URL` apuntando al *session pooler* de
Supabase (IPv4). El mismo comando (`pnpm ingest run --all`) corre local y en CI.

**Alternativas.** Supabase Edge Functions (Deno, límites de tiempo, sin Playwright,
difícil de probar en local); VPS (costo y mantenimiento).

**Consecuencias.** Cron con posibles retrasos, auto-desactivación a los 60 días sin
actividad, IPs de datacenter que algunos WAF bloquean. Fallback documentado: el
mismo CLI en un VPS mínimo.
