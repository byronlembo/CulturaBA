/**
 * API de desarrollo: expone las MISMAS vistas públicas que la app consume vía
 * PostgREST en Supabase, pero contra el Postgres local (sin Docker ni Supabase).
 * Solo lectura, solo para desarrollo. Las filas tienen exactamente las columnas
 * de las vistas, así el cliente usa un único mapeo.
 *
 *   pnpm dev:api            → http://localhost:8787
 *
 * Endpoints:
 *   GET /health
 *   GET /events?disciplines=a,b&q=texto&from=YYYY-MM-DD&to=YYYY-MM-DD&free=1&limit=20&offset=0
 *   GET /events/:slugOrId
 *   GET /events/:id/occurrences
 *   GET /events/:id/sources
 *   GET /events/by-ids?ids=a,b,c
 *   GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&disciplines=a,b
 *   GET /stats/:eventId
 *   GET /sources
 */
import { createServer } from 'node:http';
import postgres from 'postgres';

const PORT = Number(process.env.DEV_API_PORT ?? 8787);
const url = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/culturaba';
const sql = postgres(url, {
  max: 4,
  prepare: false,
  onnotice: () => {},
  // Igual que PostgREST: las columnas `date` viajan como 'YYYY-MM-DD', no como Date.
  types: {
    date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function list(param: string | null): string[] {
  return (param ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function handle(method: string, u: URL): Promise<{ status: number; body: unknown }> {
  if (method !== 'GET') return { status: 405, body: { error: 'method not allowed' } };
  const parts = u.pathname.split('/').filter(Boolean);

  if (parts[0] === 'health') return { status: 200, body: { ok: true } };

  if (parts[0] === 'sources' && parts.length === 1) {
    const rows =
      await sql`select id, slug, name, institution_id, base_url, kind, enabled from public.sources where enabled order by name`;
    return { status: 200, body: rows };
  }

  if (parts[0] === 'stats' && parts[1]) {
    const rows = await sql`select * from public.event_stats where event_id = ${parts[1]}`;
    return {
      status: 200,
      body: rows[0] ?? {
        event_id: parts[1],
        attending_count: 0,
        recommend_count: 0,
        save_count: 0,
      },
    };
  }

  if (parts[0] === 'calendar') {
    const from = u.searchParams.get('from');
    const to = u.searchParams.get('to');
    if (!from || !to) return { status: 400, body: { error: 'from y to son obligatorios' } };
    const disciplines = list(u.searchParams.get('disciplines'));
    const rows = await sql`
      select * from public.v_occurrences_public
      where start_date <= ${to}::date and end_date >= ${from}::date
        and status <> 'cancelled'
        ${disciplines.length ? sql`and disciplines && ${disciplines}::text[]` : sql``}
      order by starts_at, event_title limit 500`;
    return { status: 200, body: rows };
  }

  if (parts[0] === 'events') {
    if (parts[1] === 'by-ids') {
      const ids = list(u.searchParams.get('ids')).filter((id) => UUID_RE.test(id));
      if (ids.length === 0) return { status: 200, body: [] };
      const rows = await sql`select * from public.v_events_public where id = any(${ids}::uuid[])`;
      return { status: 200, body: rows };
    }
    if (parts[1] && parts[2] === 'occurrences') {
      const rows =
        await sql`select * from public.v_occurrences_public where event_id = ${parts[1]} order by starts_at`;
      return { status: 200, body: rows };
    }
    if (parts[1] && parts[2] === 'sources') {
      const rows =
        await sql`select * from public.v_event_sources_public where event_id = ${parts[1]} order by last_seen_at desc`;
      return { status: 200, body: rows };
    }
    if (parts[1]) {
      const key = parts[1];
      const rows = UUID_RE.test(key)
        ? await sql`select * from public.v_events_public where id = ${key}`
        : await sql`select * from public.v_events_public where slug = ${key}`;
      return rows[0]
        ? { status: 200, body: rows[0] }
        : { status: 404, body: { error: 'not found' } };
    }

    const disciplines = list(u.searchParams.get('disciplines'));
    const q = (u.searchParams.get('q') ?? '').trim();
    const from = u.searchParams.get('from');
    const to = u.searchParams.get('to');
    const free = u.searchParams.get('free') === '1';
    const limit = Math.min(Number(u.searchParams.get('limit') ?? 20), 100);
    const offset = Math.max(Number(u.searchParams.get('offset') ?? 0), 0);
    const rows = await sql`
      select * from public.v_events_public
      where next_starts_at is not null
        ${disciplines.length ? sql`and disciplines && ${disciplines}::text[]` : sql``}
        ${q ? sql`and search_tsv @@ websearch_to_tsquery('spanish', ${stripDiacritics(q)})` : sql``}
        ${from ? sql`and last_ends_at >= ${from}::date` : sql``}
        ${to ? sql`and next_starts_at < (${to}::date + 1)` : sql``}
        ${free ? sql`and is_free = true` : sql``}
      order by next_starts_at, id
      limit ${limit} offset ${offset}`;
    return { status: 200, body: rows };
  }

  return { status: 404, body: { error: 'not found' } };
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const { status, body } = await handle(req.method ?? 'GET', u);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`devapi: http://localhost:${PORT} → ${url.replace(/:[^:@/]+@/, ':***@')}`);
});

process.on('SIGINT', () => {
  server.close();
  void sql.end();
  process.exit(0);
});
