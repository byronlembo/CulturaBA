import type { Database } from '@culturaba/shared';
import type { PendingQuery, Row } from 'postgres';
import type { RunStats } from '../core/metrics';
import type { Queryable } from './sql';

type Tables = Database['public']['Tables'];
export type SourceRow = Tables['sources']['Row'];
export type InstitutionRow = Tables['institutions']['Row'];
export type VenueRow = Tables['venues']['Row'];
export type EventRow = Tables['events']['Row'];
export type OccurrenceRow = Tables['occurrences']['Row'];
export type SourceRecordRow = Tables['source_records']['Row'];
export type IngestionRunRow = Tables['ingestion_runs']['Row'];
export type EventChangeInsert = Tables['event_changes']['Insert'];
export type ChangeType = Database['public']['Enums']['change_type'];
export type ChangeSeverity = Database['public']['Enums']['change_severity'];
export type EventStatus = Database['public']['Enums']['event_status'];
export type OccurrenceStatus = Database['public']['Enums']['occurrence_status'];
export type ParseStatus = Database['public']['Enums']['parse_status'];
export type RunTrigger = Database['public']['Enums']['run_trigger'];
export type RunStatus = Database['public']['Enums']['run_status'];

// ── Sources / institutions / venues ─────────────────────────────────────────

export async function getSourceBySlug(db: Queryable, slug: string): Promise<SourceRow | null> {
  const rows = await db<SourceRow[]>`select * from public.sources where slug = ${slug}`;
  return rows[0] ?? null;
}

export async function listSources(db: Queryable): Promise<SourceRow[]> {
  return db<SourceRow[]>`select * from public.sources order by slug`;
}

export async function getSourcePriorities(db: Queryable): Promise<Map<string, number>> {
  const rows = await db<
    { id: string; priority: number }[]
  >`select id, priority from public.sources`;
  return new Map(rows.map((r) => [r.id, r.priority]));
}

export async function getInstitutionBySlug(
  db: Queryable,
  slug: string,
): Promise<InstitutionRow | null> {
  const rows = await db<InstitutionRow[]>`select * from public.institutions where slug = ${slug}`;
  return rows[0] ?? null;
}

export async function insertInstitution(
  db: Queryable,
  inst: { slug: string; name: string; websiteUrl: string | null },
): Promise<InstitutionRow> {
  const rows = await db<InstitutionRow[]>`
    insert into public.institutions (slug, name, website_url)
    values (${inst.slug}, ${inst.name}, ${inst.websiteUrl})
    on conflict (slug) do update set name = public.institutions.name
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('insertInstitution: sin fila');
  return row;
}

export async function listVenues(db: Queryable): Promise<VenueRow[]> {
  return db<VenueRow[]>`select * from public.venues`;
}

export async function insertVenue(
  db: Queryable,
  venue: {
    slug: string;
    institutionId: string | null;
    name: string;
    address: string | null;
    addressSourceUrl: string | null;
    lat: number | null;
    lng: number | null;
  },
): Promise<VenueRow> {
  const rows = await db<VenueRow[]>`
    insert into public.venues (slug, institution_id, name, address, address_source_url, lat, lng)
    values (${venue.slug}, ${venue.institutionId}, ${venue.name}, ${venue.address},
      ${venue.addressSourceUrl}, ${venue.lat}, ${venue.lng})
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('insertVenue: sin fila');
  return row;
}

/** Completa coordenadas que faltan; nunca pisa las existentes. */
export async function fillVenueCoords(
  db: Queryable,
  id: string,
  coords: { lat: number; lng: number },
): Promise<void> {
  await db`update public.venues set lat = ${coords.lat}, lng = ${coords.lng}
    where id = ${id} and lat is null`;
}

// ── Runs ────────────────────────────────────────────────────────────────────

export async function findOverlappingRun(
  db: Queryable,
  sourceId: string,
  withinMinutes = 120,
): Promise<IngestionRunRow | null> {
  const rows = await db<IngestionRunRow[]>`
    select * from public.ingestion_runs
    where source_id = ${sourceId} and status = 'running'
      and started_at > now() - make_interval(mins => ${withinMinutes})
    order by started_at desc limit 1`;
  return rows[0] ?? null;
}

export async function lastSuccessfulRun(
  db: Queryable,
  sourceId: string,
): Promise<IngestionRunRow | null> {
  const rows = await db<IngestionRunRow[]>`
    select * from public.ingestion_runs
    where source_id = ${sourceId} and status in ('succeeded', 'partial')
    order by started_at desc limit 1`;
  return rows[0] ?? null;
}

export async function insertRun(
  db: Queryable,
  run: { sourceId: string; trigger: RunTrigger; gitSha: string | null; fixtureSet: string | null },
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    insert into public.ingestion_runs (source_id, trigger, git_sha, fixture_set)
    values (${run.sourceId}, ${run.trigger}, ${run.gitSha}, ${run.fixtureSet})
    returning id`;
  const row = rows[0];
  if (!row) throw new Error('insertRun: sin id');
  return row.id;
}

export async function finishRun(
  db: Queryable,
  runId: string,
  result: { status: RunStatus; stats: RunStats; warnings: string[]; errorMessage: string | null },
): Promise<void> {
  await db`
    update public.ingestion_runs
    set status = ${result.status}, finished_at = now(), stats = ${db.json(result.stats as never)},
        warnings = ${result.warnings}, error_message = ${result.errorMessage}
    where id = ${runId}`;
}

export async function listRecentRuns(
  db: Queryable,
  limit = 20,
): Promise<(IngestionRunRow & { source_slug: string })[]> {
  return db<(IngestionRunRow & { source_slug: string })[]>`
    select r.*, s.slug as source_slug
    from public.ingestion_runs r join public.sources s on s.id = r.source_id
    order by r.started_at desc limit ${limit}`;
}

// ── Source records ──────────────────────────────────────────────────────────

export async function getSourceRecord(
  db: Queryable,
  sourceId: string,
  externalId: string,
): Promise<SourceRecordRow | null> {
  const rows = await db<SourceRecordRow[]>`
    select * from public.source_records where source_id = ${sourceId} and external_id = ${externalId}`;
  return rows[0] ?? null;
}

export interface UpsertSourceRecordInput {
  sourceId: string;
  externalId: string;
  url: string;
  parseStatus: ParseStatus;
  validationErrors: unknown | null;
  missingFields: string[];
  rawPayload: unknown | null;
  contentHash: string | null;
  normalized: unknown | null;
  capturedAt: string;
  runId: string;
  /** Solo se reescriben raw/normalized/hash cuando cambió el contenido. */
  contentChanged: boolean;
}

export async function upsertSourceRecord(
  db: Queryable,
  input: UpsertSourceRecordInput,
): Promise<SourceRecordRow> {
  const rows = input.contentChanged
    ? await db<SourceRecordRow[]>`
        insert into public.source_records
          (source_id, external_id, url, parse_status, validation_errors, missing_fields,
           raw_payload, content_hash, normalized, captured_at, last_seen_at, last_changed_at, last_run_id)
        values
          (${input.sourceId}, ${input.externalId}, ${input.url}, ${input.parseStatus},
           ${input.validationErrors === null ? null : db.json(input.validationErrors as never)}, ${input.missingFields},
           ${input.rawPayload === null ? null : db.json(input.rawPayload as never)}, ${input.contentHash},
           ${input.normalized === null ? null : db.json(input.normalized as never)},
           ${input.capturedAt}, now(), now(), ${input.runId})
        on conflict (source_id, external_id) do update set
          url = excluded.url,
          parse_status = excluded.parse_status,
          validation_errors = excluded.validation_errors,
          missing_fields = excluded.missing_fields,
          raw_payload = excluded.raw_payload,
          content_hash = excluded.content_hash,
          normalized = excluded.normalized,
          captured_at = excluded.captured_at,
          last_seen_at = now(),
          last_changed_at = now(),
          last_run_id = excluded.last_run_id,
          consecutive_misses = 0,
          missing_since = null
        returning *`
    : await db<SourceRecordRow[]>`
        update public.source_records set
          url = ${input.url},
          parse_status = ${input.parseStatus},
          validation_errors = ${input.validationErrors === null ? null : db.json(input.validationErrors as never)},
          missing_fields = ${input.missingFields},
          captured_at = ${input.capturedAt},
          last_seen_at = now(),
          last_run_id = ${input.runId},
          consecutive_misses = 0,
          missing_since = null
        where source_id = ${input.sourceId} and external_id = ${input.externalId}
        returning *`;
  const row = rows[0];
  if (!row) throw new Error('upsertSourceRecord: sin fila');
  return row;
}

export async function linkSourceRecordToEvent(
  db: Queryable,
  recordId: string,
  eventId: string,
): Promise<void> {
  await db`update public.source_records set event_id = ${eventId} where id = ${recordId}`;
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function getEventById(db: Queryable, id: string): Promise<EventRow | null> {
  const rows = await db<EventRow[]>`select * from public.events where id = ${id}`;
  return rows[0] ?? null;
}

export async function getEventBySlug(db: Queryable, slug: string): Promise<EventRow | null> {
  const rows = await db<EventRow[]>`select * from public.events where slug = ${slug}`;
  return rows[0] ?? null;
}

export async function findEventsByDedupKey(
  db: Queryable,
  dedupKey: string,
  institutionId: string,
): Promise<EventRow[]> {
  return db<EventRow[]>`
    select * from public.events
    where dedup_key = ${dedupKey} and institution_id = ${institutionId}
      and status <> 'rejected' and merged_into_event_id is null
    order by last_verified_at desc nulls last`;
}

/**
 * Misma expresión que `canonicalUrl()` de @culturaba/shared, en SQL: sin fragmento ni
 * query, sin esquema ni `www.`, sin `/` final, en minúsculas.
 */
function canonicalUrlSql(db: Queryable, expr: PendingQuery<Row[]>) {
  return db`lower(regexp_replace(regexp_replace(
    split_part(split_part(${expr}, '#', 1), '?', 1),
    '^https?://(www\\.)?', '', 'i'), '/+$', ''))`;
}

/**
 * Eventos de la institución que OTRA fuente ya describe con la misma página: la URL de
 * uno de sus registros, la oficial que normalizó, alguna `sameAsUrls` que declaró o una
 * URL de entradas (del evento o de una función) coincide con alguna de las claves
 * canónicas dadas (el matcher solo manda claves de páginas y de entradas oficiales). Funciona en los dos sentidos (un
 * agregador que enlaza a la ficha institucional, o la institución que llega después).
 * Los registros de la misma fuente no cuentan: dos ítems de un agregador que enlazan
 * a la misma página de un ciclo no son por eso el mismo evento.
 */
export async function findEventsBySameAsUrls(
  db: Queryable,
  institutionId: string,
  sourceId: string,
  keys: string[],
): Promise<EventRow[]> {
  if (keys.length === 0) return [];
  return db<EventRow[]>`
    select e.* from public.events e
    where e.institution_id = ${institutionId} and e.status <> 'rejected'
      and e.merged_into_event_id is null
      and exists (
        select 1 from public.source_records r
        where r.event_id = e.id and r.source_id <> ${sourceId}
          and (
            ${canonicalUrlSql(db, db`r.url`)} = any(${keys})
            or ${canonicalUrlSql(db, db`r.normalized ->> 'officialUrl'`)} = any(${keys})
            or ${canonicalUrlSql(db, db`r.normalized ->> 'ticketsUrl'`)} = any(${keys})
            or exists (
              select 1
              from jsonb_array_elements_text(
                case when jsonb_typeof(r.normalized -> 'sameAsUrls') = 'array'
                     then r.normalized -> 'sameAsUrls' else '[]'::jsonb end
              ) as s(u)
              where ${canonicalUrlSql(db, db`s.u`)} = any(${keys})
            )
            or exists (
              select 1
              from jsonb_array_elements(
                case when jsonb_typeof(r.normalized -> 'occurrences') = 'array'
                     then r.normalized -> 'occurrences' else '[]'::jsonb end
              ) as o(v)
              where ${canonicalUrlSql(db, db`o.v ->> 'ticketsUrl'`)} = any(${keys})
            )
          )
      )
    order by e.last_verified_at desc nulls last`;
}

/**
 * Registro de la fuente que alimenta el evento desde antes (el primero en verlo). Cuando dos
 * ítems de la misma fuente terminan en el mismo evento, solo ese manda en los campos.
 */
export async function leadingRecordOfSource(
  db: Queryable,
  eventId: string,
  sourceId: string,
): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    select id from public.source_records
    where event_id = ${eventId} and source_id = ${sourceId}
    order by first_seen_at, id limit 1`;
  return rows[0]?.id ?? null;
}

/** ¿Hay registros de OTRAS fuentes enlazados al evento? */
export async function hasOtherSourceRecords(
  db: Queryable,
  eventId: string,
  sourceId: string,
): Promise<boolean> {
  const rows = await db<{ n: number }[]>`
    select count(*)::int as n from public.source_records
    where event_id = ${eventId} and source_id <> ${sourceId}`;
  return (rows[0]?.n ?? 0) > 0;
}

/** Eventos de la institución con alguna ocurrencia (visible) que toque las fechas dadas. */
export async function findEventsOnDates(
  db: Queryable,
  institutionId: string,
  dateRanges: { start: string; end: string }[],
): Promise<EventRow[]> {
  if (dateRanges.length === 0) return [];
  const starts = dateRanges.map((r) => r.start);
  const ends = dateRanges.map((r) => r.end);
  return db<EventRow[]>`
    select distinct e.* from public.events e
    join public.occurrences o on o.event_id = e.id and o.status <> 'missing'
    join unnest(${starts}::date[], ${ends}::date[]) as r(s, e2) on o.start_date <= r.e2 and o.end_date >= r.s
    where e.institution_id = ${institutionId} and e.status <> 'rejected' and e.merged_into_event_id is null`;
}

export async function eventHasRecordFrom(
  db: Queryable,
  eventId: string,
  sourceId: string,
): Promise<boolean> {
  const rows = await db<{ n: number }[]>`
    select count(*)::int as n from public.source_records
    where event_id = ${eventId} and source_id = ${sourceId}`;
  return (rows[0]?.n ?? 0) > 0;
}

export async function eventHasOccurrences(db: Queryable, eventId: string): Promise<boolean> {
  const rows = await db<{ n: number }[]>`
    select count(*)::int as n from public.occurrences where event_id = ${eventId} and status <> 'missing'`;
  return (rows[0]?.n ?? 0) > 0;
}

export async function eventOccurrenceDates(
  db: Queryable,
  eventId: string,
): Promise<{ start_date: string; end_date: string }[]> {
  return db<{ start_date: string; end_date: string }[]>`
    select start_date::text, end_date::text from public.occurrences
    where event_id = ${eventId} and status <> 'missing'`;
}

export interface EventFields {
  title: string;
  subtitle: string | null;
  description: string | null;
  description_html: string | null;
  description_attribution: string | null;
  primary_discipline: string | null;
  image_url: string | null;
  image_source: 'source' | 'fallback';
  image_credit: string | null;
  official_url: string | null;
  tickets_url: string | null;
  price_text: string | null;
  price_verified: boolean;
  is_free: boolean | null;
  language: string | null;
  duration_minutes: number | null;
  age_rating: string | null;
  tags: string[];
  dedup_key: string;
}

export async function insertEvent(
  db: Queryable,
  event: EventFields & {
    id: string;
    slug: string;
    status: EventStatus;
    candidateReasons: string[];
    institutionId: string;
    defaultVenueId: string | null;
    primarySourceId: string;
  },
): Promise<EventRow> {
  const rows = await db<EventRow[]>`
    insert into public.events
      (id, slug, status, candidate_reasons, institution_id, default_venue_id, primary_source_id,
       title, subtitle, description, description_html, description_attribution, primary_discipline,
       image_url, image_source, image_credit, official_url, tickets_url, price_text, price_verified,
       is_free, language, duration_minutes, age_rating, tags, dedup_key,
       first_published_at, last_verified_at)
    values
      (${event.id}, ${event.slug}, ${event.status}, ${event.candidateReasons}, ${event.institutionId},
       ${event.defaultVenueId}, ${event.primarySourceId},
       ${event.title}, ${event.subtitle}, ${event.description}, ${event.description_html},
       ${event.description_attribution}, ${event.primary_discipline},
       ${event.image_url}, ${event.image_source}, ${event.image_credit}, ${event.official_url},
       ${event.tickets_url}, ${event.price_text}, ${event.price_verified}, ${event.is_free},
       ${event.language}, ${event.duration_minutes}, ${event.age_rating}, ${event.tags}, ${event.dedup_key},
       ${event.status === 'published' ? db`now()` : null}, now())
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('insertEvent: sin fila');
  return row;
}

export async function updateEventFields(
  db: Queryable,
  eventId: string,
  patch: Partial<EventFields> & {
    primary_source_id?: string;
    default_venue_id?: string | null;
    status?: EventStatus;
    candidate_reasons?: string[];
    first_published_at?: 'now';
  },
): Promise<void> {
  const { first_published_at, ...rest } = patch;
  const columns = Object.keys(rest) as (keyof typeof rest)[];
  if (columns.length === 0 && !first_published_at) {
    await db`update public.events set last_verified_at = now() where id = ${eventId}`;
    return;
  }
  // postgres.js builds `set col = value, ...` from the object with the listed keys.
  if (first_published_at === 'now') {
    await db`
      update public.events
      set ${columns.length ? db(rest as Record<string, unknown>, ...(columns as string[])) : db({ last_verified_at: new Date() }, 'last_verified_at')},
          first_published_at = coalesce(first_published_at, now()),
          last_verified_at = now()
      where id = ${eventId}`;
    return;
  }
  await db`
    update public.events
    set ${db(rest as Record<string, unknown>, ...(columns as string[]))}, last_verified_at = now()
    where id = ${eventId}`;
}

export async function setEventDisciplines(
  db: Queryable,
  eventId: string,
  disciplines: string[],
): Promise<void> {
  await db`delete from public.event_disciplines where event_id = ${eventId}`;
  if (disciplines.length === 0) return;
  const rows = disciplines.map((d, i) => ({
    event_id: eventId,
    discipline: d,
    is_primary: i === 0,
  }));
  await db`insert into public.event_disciplines ${db(rows, 'event_id', 'discipline', 'is_primary')}`;
}

export async function getEventDisciplines(db: Queryable, eventId: string): Promise<string[]> {
  const rows = await db<{ discipline: string }[]>`
    select discipline from public.event_disciplines where event_id = ${eventId}
    order by is_primary desc, discipline`;
  return rows.map((r) => r.discipline);
}

export async function insertDuplicateCandidate(
  db: Queryable,
  eventId: string,
  candidateEventId: string,
  score: number,
): Promise<void> {
  await db`
    insert into public.event_duplicates (event_id, candidate_event_id, score)
    values (${eventId}, ${candidateEventId}, ${score.toFixed(3)})
    on conflict (event_id, candidate_event_id) do nothing`;
}

// ── Occurrences ─────────────────────────────────────────────────────────────

export async function listOccurrencesForRecord(
  db: Queryable,
  sourceRecordId: string,
): Promise<OccurrenceRow[]> {
  return db<OccurrenceRow[]>`
    select * from public.occurrences where source_record_id = ${sourceRecordId} order by starts_at`;
}

export interface OccurrenceInsert {
  eventId: string;
  venueId: string | null;
  room: string | null;
  kind: 'timed' | 'all_day' | 'range';
  startsAt: string;
  endsAt: string | null;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  scheduleText: string | null;
  recurrenceRule: string | null;
  status: OccurrenceStatus;
  statusReason: string | null;
  ticketsUrl: string | null;
  priceText: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceVerified: boolean;
  isFree: boolean | null;
  sourceId: string;
  sourceRecordId: string;
  externalId: string | null;
}

/** Inserta; si otra fuente ya creó la misma función (evento, venue, inicio) la reutiliza. */
export async function insertOccurrence(
  db: Queryable,
  o: OccurrenceInsert,
): Promise<{ row: OccurrenceRow; inserted: boolean }> {
  const rows = await db<(OccurrenceRow & { inserted: boolean })[]>`
    insert into public.occurrences
      (event_id, venue_id, room, kind, starts_at, ends_at, start_date, end_date, is_all_day,
       schedule_text, recurrence_rule, status, status_reason, tickets_url, price_text, price_min,
       price_max, price_verified, is_free, source_id, source_record_id, external_id)
    values
      (${o.eventId}, ${o.venueId}, ${o.room}, ${o.kind}, ${o.startsAt}, ${o.endsAt}, ${o.startDate},
       ${o.endDate}, ${o.isAllDay}, ${o.scheduleText}, ${o.recurrenceRule}, ${o.status}, ${o.statusReason},
       ${o.ticketsUrl}, ${o.priceText}, ${o.priceMin}, ${o.priceMax}, ${o.priceVerified}, ${o.isFree},
       ${o.sourceId}, ${o.sourceRecordId}, ${o.externalId})
    on conflict (event_id, venue_id, starts_at) do update set
      last_seen_at = now(),
      consecutive_misses = 0,
      missing_since = null,
      source_record_id = coalesce(public.occurrences.source_record_id, excluded.source_record_id)
    returning *, (xmax = 0) as inserted`;
  const row = rows[0];
  if (!row) throw new Error('insertOccurrence: sin fila');
  const { inserted, ...rest } = row;
  return { row: rest as OccurrenceRow, inserted };
}

export async function updateOccurrence(
  db: Queryable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(patch);
  if (columns.length === 0) {
    await db`update public.occurrences set last_seen_at = now(), consecutive_misses = 0, missing_since = null where id = ${id}`;
    return;
  }
  await db`
    update public.occurrences
    set ${db(patch, ...columns)}, last_seen_at = now(), consecutive_misses = 0, missing_since = null
    where id = ${id}`;
}

export async function bumpOccurrenceMiss(
  db: Queryable,
  id: string,
  threshold: number,
): Promise<'counted' | 'missing'> {
  const rows = await db<{ consecutive_misses: number }[]>`
    update public.occurrences
    set consecutive_misses = consecutive_misses + 1
    where id = ${id}
    returning consecutive_misses`;
  const misses = rows[0]?.consecutive_misses ?? 0;
  if (misses >= threshold) {
    await db`update public.occurrences set status = 'missing', missing_since = coalesce(missing_since, now()) where id = ${id}`;
    return 'missing';
  }
  return 'counted';
}

export async function countVisibleFutureOccurrences(
  db: Queryable,
  eventId: string,
): Promise<number> {
  const rows = await db<{ n: number }[]>`
    select count(*)::int as n from public.occurrences
    where event_id = ${eventId} and status not in ('missing', 'cancelled')
      and coalesce(ends_at, starts_at) >= now()`;
  return rows[0]?.n ?? 0;
}

// ── Changes ─────────────────────────────────────────────────────────────────

export interface ChangeInput {
  eventId: string;
  occurrenceId?: string | null;
  type: ChangeType;
  severity: ChangeSeverity;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function insertChanges(
  db: Queryable,
  runId: string | null,
  changes: ChangeInput[],
): Promise<void> {
  if (changes.length === 0) return;
  const rows = changes.map((c) => ({
    event_id: c.eventId,
    occurrence_id: c.occurrenceId ?? null,
    run_id: runId,
    type: c.type,
    severity: c.severity,
    field: c.field ?? null,
    old_value: c.oldValue === undefined ? null : db.json(c.oldValue as never),
    new_value: c.newValue === undefined ? null : db.json(c.newValue as never),
  }));
  await db`insert into public.event_changes ${db(rows, 'event_id', 'occurrence_id', 'run_id', 'type', 'severity', 'field', 'old_value', 'new_value')}`;
}

// ── Missing policy ──────────────────────────────────────────────────────────

export async function listUnseenRecords(
  db: Queryable,
  sourceId: string,
  runId: string,
): Promise<SourceRecordRow[]> {
  return db<SourceRecordRow[]>`
    select * from public.source_records
    where source_id = ${sourceId} and (last_run_id is distinct from ${runId}) and missing_since is null`;
}

export async function bumpRecordMiss(
  db: Queryable,
  recordId: string,
  threshold: number,
): Promise<'counted' | 'missing'> {
  const rows = await db<{ consecutive_misses: number }[]>`
    update public.source_records set consecutive_misses = consecutive_misses + 1
    where id = ${recordId} returning consecutive_misses`;
  const misses = rows[0]?.consecutive_misses ?? 0;
  if (misses >= threshold) {
    await db`update public.source_records set missing_since = now() where id = ${recordId}`;
    return 'missing';
  }
  return 'counted';
}

export async function markRecordOccurrencesMissing(
  db: Queryable,
  recordId: string,
): Promise<OccurrenceRow[]> {
  return db<OccurrenceRow[]>`
    update public.occurrences
    set status = 'missing', missing_since = coalesce(missing_since, now())
    where source_record_id = ${recordId} and status <> 'missing'
      and coalesce(ends_at, starts_at) >= now()
    returning *`;
}

export async function restoreRecordOccurrences(
  db: Queryable,
  recordId: string,
): Promise<OccurrenceRow[]> {
  return db<OccurrenceRow[]>`
    update public.occurrences
    set status = 'scheduled', missing_since = null, consecutive_misses = 0, last_seen_at = now()
    where source_record_id = ${recordId} and status = 'missing'
    returning *`;
}

export async function allRecordsMissing(db: Queryable, eventId: string): Promise<boolean> {
  const rows = await db<{ total: number; missing: number }[]>`
    select count(*)::int as total, count(missing_since)::int as missing
    from public.source_records where event_id = ${eventId}`;
  const r = rows[0];
  return !!r && r.total > 0 && r.total === r.missing;
}

export async function archivePastEvents(db: Queryable, graceDays = 7): Promise<number> {
  const rows = await db<{ id: string }[]>`
    update public.events e set status = 'archived'
    where e.status = 'published'
      and not exists (
        select 1 from public.occurrences o
        where o.event_id = e.id and o.status <> 'missing'
          and coalesce(o.ends_at, o.starts_at) >= now() - make_interval(days => ${graceDays}))
      and exists (select 1 from public.occurrences o where o.event_id = e.id)
    returning id`;
  return rows.length;
}
