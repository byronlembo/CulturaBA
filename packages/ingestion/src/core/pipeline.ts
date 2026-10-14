import { randomUUID } from 'node:crypto';
import {
  assessPublishability,
  BA_TZ,
  dedupKey,
  eventSlug,
  type NormalizedEvent,
  NormalizedEventSchema,
} from '@culturaba/shared';
import { DateTime } from 'luxon';
import {
  type ChangeInput,
  type EventRow,
  findOverlappingRun,
  finishRun,
  getEventById,
  getInstitutionBySlug,
  getSourceBySlug,
  getSourcePriorities,
  getSourceRecord,
  type InstitutionRow,
  insertChanges,
  insertDuplicateCandidate,
  insertEvent,
  insertInstitution,
  insertRun,
  lastSuccessfulRun,
  linkSourceRecordToEvent,
  type ParseStatus,
  type RunStatus,
  type RunTrigger,
  restoreRecordOccurrences,
  type SourceRow,
  setEventDisciplines,
  updateEventFields,
  upsertSourceRecord,
} from '../db/repo';
import type { Db, Queryable } from '../db/sql';
import type { HttpClient } from '../http/client';
import type { Logger } from '../logger';
import { diffEventFields, eventFieldsFromNormalized } from './changes';
import type { FetchContext, RawRecord, SourceConnector } from './connector';
import { contentHash } from './hash';
import { findMatchingEvent } from './matcher';
import { newRunStats, type RunStats } from './metrics';
import { applyMissingPolicy } from './missing';
import { reconcileOccurrences } from './occurrences';
import { VenueResolver } from './venues';

export interface RunOptions {
  trigger: RunTrigger;
  fixtureSet?: string | null;
  dryRun?: boolean;
  limit?: number;
  now?: () => DateTime;
  gitSha?: string | null;
  /** Ejecutar aunque la fuente esté deshabilitada en la base. */
  force?: boolean;
}

export interface RunDeps {
  sql: Db;
  http: HttpClient;
  logger: Logger;
}

export interface RecordOutcome {
  externalId: string;
  url: string;
  parseStatus: ParseStatus | 'fetch_failed' | 'error';
  eventId?: string;
  eventSlug?: string;
  eventStatus?: string;
  created?: boolean;
  reasons?: string[];
  errors?: string[];
  changes: number;
}

export interface RunSummary {
  runId: string;
  source: string;
  status: RunStatus;
  dryRun: boolean;
  stats: RunStats;
  warnings: string[];
  errorMessage: string | null;
  records: RecordOutcome[];
}

class DryRunRollback extends Error {
  constructor(public readonly summary: RunSummary) {
    super('dry-run rollback');
  }
}

/** Abstrae "transacción" para que el dry-run use savepoints dentro de una tx que se revierte. */
interface Scope {
  db: Queryable;
  begin<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export async function runSource(
  connector: SourceConnector,
  deps: RunDeps,
  options: RunOptions,
): Promise<RunSummary> {
  if (options.dryRun) {
    try {
      await deps.sql.begin(async (tx) => {
        const scope: Scope = {
          db: tx,
          begin: <T>(fn: (q: Queryable) => Promise<T>) =>
            tx.savepoint((sp) => fn(sp)) as Promise<T>,
        };
        const summary = await execute(connector, deps, options, scope);
        throw new DryRunRollback(summary);
      });
    } catch (err) {
      if (err instanceof DryRunRollback) return err.summary;
      throw err;
    }
    throw new Error('unreachable');
  }
  const scope: Scope = {
    db: deps.sql,
    begin: <T>(fn: (q: Queryable) => Promise<T>) => deps.sql.begin((tx) => fn(tx)) as Promise<T>,
  };
  return execute(connector, deps, options, scope);
}

async function execute(
  connector: SourceConnector,
  deps: RunDeps,
  options: RunOptions,
  scope: Scope,
): Promise<RunSummary> {
  const startedAt = Date.now();
  const now = options.now ?? (() => DateTime.now().setZone(BA_TZ));
  const logger = deps.logger.child({ source: connector.slug });
  const stats = newRunStats();
  const warnings: string[] = [];
  const records: RecordOutcome[] = [];
  const httpBefore = { ...deps.http.stats };

  const source = await getSourceBySlug(scope.db, connector.slug);
  if (!source)
    throw new Error(`La fuente '${connector.slug}' no existe en la tabla sources (ver seed.sql)`);
  if (!source.enabled && !options.force) {
    throw new Error(
      `La fuente '${connector.slug}' está deshabilitada (usar --force para correr igual)`,
    );
  }
  // Institución por defecto del conector. Un agregador (sin institución propia) la
  // resuelve evento por evento a partir de NormalizedEvent.institutionSlug.
  const defaultInstitution = await getInstitutionBySlug(scope.db, connector.meta.institutionSlug);
  const institutions = new Map<string, InstitutionRow>();
  if (defaultInstitution) institutions.set(defaultInstitution.slug, defaultInstitution);

  const overlapping = await findOverlappingRun(scope.db, source.id);
  if (overlapping) {
    throw new Error(
      `Ya hay una corrida en curso para '${connector.slug}' (run ${overlapping.id}, iniciada ${overlapping.started_at})`,
    );
  }

  const previous = await lastSuccessfulRun(scope.db, source.id);
  const previousDiscovered =
    previous && typeof (previous.stats as { discovered?: unknown })?.discovered === 'number'
      ? ((previous.stats as { discovered: number }).discovered as number)
      : null;

  const runId = await insertRun(scope.db, {
    sourceId: source.id,
    trigger: options.trigger,
    gitSha: options.gitSha ?? null,
    fixtureSet: options.fixtureSet ?? null,
  });
  logger.info(
    { runId, trigger: options.trigger, fixtureSet: options.fixtureSet ?? null },
    'inicio de corrida',
  );

  const venues = await VenueResolver.load(scope.db);
  const priorities = await getSourcePriorities(scope.db);
  const ctx: FetchContext = {
    http: deps.http,
    logger,
    now,
    ...(options.limit ? { limit: options.limit } : {}),
  };

  let status: RunStatus = 'succeeded';
  let errorMessage: string | null = null;
  let discoverFailed = false;

  let raws: RawRecord[] = [];
  try {
    raws = await connector.discover(ctx);
    if (options.limit) raws = raws.slice(0, options.limit);
    stats.discovered = raws.length;
    logger.info({ discovered: raws.length }, 'descubrimiento');
  } catch (err) {
    discoverFailed = true;
    status = 'failed';
    errorMessage = `discover: ${(err as Error).message}`;
    logger.error({ err }, 'falló el descubrimiento');
  }

  for (const raw0 of raws) {
    let raw = raw0;
    if (connector.enrich) {
      try {
        raw = await connector.enrich(raw0, ctx);
        stats.fetched += 1;
      } catch (err) {
        stats.fetch_failed += 1;
        records.push({
          externalId: raw0.externalId,
          url: raw0.url,
          parseStatus: 'fetch_failed',
          errors: [(err as Error).message],
          changes: 0,
        });
        logger.warn(
          { externalId: raw0.externalId, err: (err as Error).message },
          'no se pudo obtener el detalle',
        );
        continue;
      }
    } else {
      stats.fetched += 1;
    }

    try {
      const outcome = await scope.begin((tx) =>
        processRecord(tx, connector, raw, {
          source,
          defaultInstitution,
          institutions,
          runId,
          now,
          venues,
          priorities,
          stats,
          logger,
        }),
      );
      records.push(outcome);
    } catch (err) {
      stats.records_failed += 1;
      records.push({
        externalId: raw.externalId,
        url: raw.url,
        parseStatus: 'error',
        errors: [(err as Error).message],
        changes: 0,
      });
      logger.error({ externalId: raw.externalId, err }, 'error procesando el registro');
    }
  }

  if (!discoverFailed) {
    const missing = await scope.begin((tx) =>
      applyMissingPolicy(tx, {
        sourceId: source.id,
        runId,
        discovered: stats.discovered,
        previousDiscovered,
        missThreshold: missThresholdOf(source),
      }),
    );
    if (missing.skipped && missing.reason) {
      warnings.push(missing.reason);
    }
    stats.missing_marked += missing.recordsMissing + missing.occurrencesMissing;
    countChanges(stats, missing.changes);
    if (missing.changes.length) {
      await scope.begin((tx) => insertChanges(tx, runId, missing.changes));
    }
    if (missing.eventsSuspended)
      logger.warn({ suspended: missing.eventsSuspended }, 'eventos suspendidos por ausencia');
  }

  if (
    status !== 'failed' &&
    (stats.fetch_failed > 0 || stats.records_failed > 0 || warnings.length > 0)
  ) {
    status = 'partial';
  }
  if (stats.fetch_failed > 0)
    warnings.push(`${stats.fetch_failed} ítems sin detalle (fallo de descarga)`);
  if (stats.records_failed > 0)
    warnings.push(`${stats.records_failed} registros con error de procesamiento`);

  stats.http_requests = deps.http.stats.requests - httpBefore.requests;
  stats.http_retries = deps.http.stats.retries - httpBefore.retries;
  stats.duration_ms = Date.now() - startedAt;

  await finishRun(scope.db, runId, { status, stats, warnings, errorMessage });
  logger.info({ runId, status, ...stats }, 'fin de corrida');

  return {
    runId,
    source: connector.slug,
    status,
    dryRun: Boolean(options.dryRun),
    stats,
    warnings,
    errorMessage,
    records,
  };
}

interface RecordContext {
  source: SourceRow;
  /** Institución del conector (null en agregadores). */
  defaultInstitution: InstitutionRow | null;
  /** Caché por corrida: slug → fila (incluye las creadas desde la fuente). */
  institutions: Map<string, InstitutionRow>;
  runId: string;
  now: () => DateTime;
  venues: VenueResolver;
  priorities: Map<string, number>;
  stats: RunStats;
  logger: Logger;
}

async function processRecord(
  tx: Queryable,
  connector: SourceConnector,
  raw: RawRecord,
  ctx: RecordContext,
): Promise<RecordOutcome> {
  const parsed = connector.parse(raw, { now: ctx.now, logger: ctx.logger });
  const existingRecord = await getSourceRecord(tx, ctx.source.id, raw.externalId);

  // ── Validación ──────────────────────────────────────────────────────────
  let normalized: NormalizedEvent | null = null;
  let parseStatus: ParseStatus;
  let validationErrors: unknown = null;
  let missingFields: string[] = [];
  const nowMs = ctx.now().toMillis();

  if (!parsed.ok) {
    parseStatus = 'invalid';
    validationErrors = parsed.errors;
  } else {
    const validated = NormalizedEventSchema.safeParse(parsed.event);
    if (!validated.success) {
      parseStatus = 'invalid';
      validationErrors = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    } else {
      normalized = validated.data;
      const pub = assessPublishability(normalized, {
        now: nowMs,
        knownVenueSlugs: ctx.venues.knownSlugs,
      });
      parseStatus = pub.publishable ? 'ok' : 'incomplete';
      missingFields = pub.reasons;
      if (parsed.warnings.length)
        ctx.logger.debug(
          { externalId: raw.externalId, warnings: parsed.warnings },
          'avisos del parser',
        );
    }
  }

  if (parseStatus === 'ok') ctx.stats.parsed_ok += 1;
  else if (parseStatus === 'incomplete') ctx.stats.parsed_incomplete += 1;
  else ctx.stats.parsed_invalid += 1;

  // ── source_records ──────────────────────────────────────────────────────
  const hash = normalized
    ? contentHash(normalized as unknown as Record<string, unknown>)
    : contentHash({ invalid: validationErrors });
  const contentChanged = !existingRecord || existingRecord.content_hash !== hash;
  const wasMissing = Boolean(existingRecord?.missing_since);

  const record = await upsertSourceRecord(tx, {
    sourceId: ctx.source.id,
    externalId: raw.externalId,
    url: raw.url,
    parseStatus,
    validationErrors,
    missingFields,
    rawPayload: contentChanged ? rawPayloadOf(raw, normalized) : null,
    contentHash: hash,
    normalized: contentChanged ? normalized : null,
    capturedAt: raw.fetchedAt,
    runId: ctx.runId,
    contentChanged,
  });

  if (!normalized) {
    return {
      externalId: raw.externalId,
      url: raw.url,
      parseStatus,
      errors: validationErrors as string[],
      changes: 0,
    };
  }

  // ── Institución del evento: por ítem (agregadores) o la del conector ────
  const institution = await resolveInstitution(tx, normalized, ctx);
  if (!institution) {
    throw new Error(
      `Institución '${normalized.institutionSlug}' desconocida y sin institutionName para crearla`,
    );
  }

  // ── Evento: existente (por external id / match) o nuevo ─────────────────
  const changes: ChangeInput[] = [];
  const key = dedupKey(normalized.title, normalized.institutionSlug);
  const fields = eventFieldsFromNormalized(normalized, key);
  const publishable = missingFields.length === 0;

  let event: EventRow | null = null;
  let created = false;
  if (record.event_id) {
    event = await getEventById(tx, record.event_id);
    if (event?.merged_into_event_id) event = await getEventById(tx, event.merged_into_event_id);
  }
  let reviewCandidate: { event: EventRow; score: number } | undefined;
  if (!event) {
    const match = await findMatchingEvent(tx, normalized, institution.id, ctx.source.id);
    event = match.event;
    reviewCandidate = match.reviewCandidate;
  }

  if (!event) {
    const id = randomUUID();
    event = await insertEvent(tx, {
      ...fields,
      id,
      slug: eventSlug(normalized.title, id),
      status: publishable ? 'published' : 'candidate',
      candidateReasons: missingFields,
      institutionId: institution.id,
      defaultVenueId: null,
      primarySourceId: ctx.source.id,
    });
    created = true;
    ctx.stats.events_created += 1;
    changes.push({ eventId: event.id, type: 'event_created', severity: 'minor' });
    if (publishable) {
      ctx.stats.events_published += 1;
      changes.push({ eventId: event.id, type: 'event_published', severity: 'major' });
    }
    if (reviewCandidate) {
      await insertDuplicateCandidate(tx, event.id, reviewCandidate.event.id, reviewCandidate.score);
      ctx.stats.duplicates_flagged += 1;
    }
    await setEventDisciplines(tx, event.id, normalized.disciplines);
  } else {
    const primaryPriority = event.primary_source_id
      ? (ctx.priorities.get(event.primary_source_id) ?? 0)
      : -1;
    const isPrimary =
      !event.primary_source_id ||
      event.primary_source_id === ctx.source.id ||
      ctx.source.priority > primaryPriority;
    const diff = diffEventFields(event, fields, isPrimary);
    const patch: Parameters<typeof updateEventFields>[2] = { ...diff.patch };
    if (isPrimary && event.primary_source_id !== ctx.source.id)
      patch.primary_source_id = ctx.source.id;
    if (isPrimary && normalized.disciplines.length) {
      await setEventDisciplines(tx, event.id, normalized.disciplines);
    }
    await updateEventFields(tx, event.id, patch);
    changes.push(...diff.changes);
    if (Object.keys(diff.patch).length > 0) ctx.stats.events_updated += 1;
    else ctx.stats.events_unchanged += 1;
  }

  if (record.event_id !== event.id) await linkSourceRecordToEvent(tx, record.id, event.id);

  // ── Reaparición ─────────────────────────────────────────────────────────
  if (wasMissing) {
    const restored = await restoreRecordOccurrences(tx, record.id);
    for (const o of restored) {
      changes.push({
        eventId: event.id,
        occurrenceId: o.id,
        type: 'occurrence_reappeared',
        severity: 'major',
      });
    }
  }

  // ── Ocurrencias ─────────────────────────────────────────────────────────
  const rec = await reconcileOccurrences(tx, normalized, {
    eventId: event.id,
    sourceId: ctx.source.id,
    sourceRecordId: record.id,
    institutionId: institution.id,
    institutionSlug: institution.slug,
    sourceUrl: raw.url,
    nowMs,
    venues: ctx.venues,
  });
  ctx.stats.occurrences_created += rec.created;
  ctx.stats.occurrences_updated += rec.updated;
  ctx.stats.missing_marked += rec.missing;
  changes.push(...rec.changes);

  // ── Estado del evento ───────────────────────────────────────────────────
  const statusPatch: Parameters<typeof updateEventFields>[2] = {};
  if (!created) {
    if (event.status === 'candidate' && publishable) {
      statusPatch.status = 'published';
      statusPatch.candidate_reasons = [];
      statusPatch.first_published_at = 'now';
      ctx.stats.events_published += 1;
      changes.push({ eventId: event.id, type: 'event_published', severity: 'major' });
    } else if (event.status === 'candidate') {
      statusPatch.candidate_reasons = missingFields;
    } else if (event.status === 'suspended' && (publishable || wasMissing)) {
      statusPatch.status = 'published';
      changes.push({ eventId: event.id, type: 'event_reappeared', severity: 'major' });
    }
  }
  if (!event.default_venue_id && rec.firstVenueId) statusPatch.default_venue_id = rec.firstVenueId;
  if (Object.keys(statusPatch).length) await updateEventFields(tx, event.id, statusPatch);

  countChanges(ctx.stats, changes);
  await insertChanges(tx, ctx.runId, changes);

  return {
    externalId: raw.externalId,
    url: raw.url,
    parseStatus,
    eventId: event.id,
    eventSlug: event.slug,
    eventStatus: statusPatch.status ?? event.status,
    created,
    reasons: missingFields,
    changes: changes.length,
  };
}

function rawPayloadOf(raw: RawRecord, normalized: NormalizedEvent | null): unknown {
  const fragment = normalized?.rawFragment ?? raw.body.slice(0, 200_000);
  return { contentType: raw.contentType, fragment, listing: raw.listing ?? null };
}

function countChanges(stats: RunStats, changes: ChangeInput[]): void {
  for (const c of changes) {
    if (c.severity === 'major') stats.changes_major += 1;
    else stats.changes_minor += 1;
  }
}

/**
 * Resuelve la institución de un evento normalizado: caché → base → creación (solo si
 * la fuente aporta institutionName) → institución por defecto del conector.
 */
async function resolveInstitution(
  tx: Queryable,
  normalized: NormalizedEvent,
  ctx: RecordContext,
): Promise<InstitutionRow | null> {
  const slug = normalized.institutionSlug;
  const cached = ctx.institutions.get(slug);
  if (cached) return cached;
  const existing = await getInstitutionBySlug(tx, slug);
  if (existing) {
    ctx.institutions.set(slug, existing);
    return existing;
  }
  if (normalized.institutionName) {
    const created = await insertInstitution(tx, {
      slug,
      name: normalized.institutionName,
      websiteUrl: normalized.institutionUrl ?? null,
    });
    ctx.institutions.set(slug, created);
    ctx.logger.info(
      { institution: slug, name: created.name },
      'institución creada desde la fuente',
    );
    return created;
  }
  return ctx.defaultInstitution;
}

/** Fuentes con listados inestables pueden pedir más ausencias consecutivas vía sources.config. */
function missThresholdOf(source: SourceRow): number | undefined {
  const cfg = source.config as { missThreshold?: unknown } | null;
  const v = cfg?.missThreshold;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : undefined;
}
