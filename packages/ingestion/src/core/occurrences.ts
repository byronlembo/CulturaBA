import type { NormalizedEvent, NormalizedOccurrence } from '@culturaba/shared';
import {
  bumpOccurrenceMiss,
  type ChangeInput,
  insertOccurrence,
  listOccurrencesForRecord,
  type OccurrenceInsert,
  type OccurrenceRow,
  type OccurrenceStatus,
  updateOccurrence,
} from '../db/repo';
import type { Queryable } from '../db/sql';
import type { VenueResolver } from './venues';

export const OCCURRENCE_MISS_THRESHOLD = 2;
const RESCHEDULE_WINDOW_DAYS = 90;

export interface ReconcileContext {
  eventId: string;
  sourceId: string;
  sourceRecordId: string;
  institutionId: string;
  institutionSlug: string;
  sourceUrl: string;
  nowMs: number;
  venues: VenueResolver;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  missing: number;
  changes: ChangeInput[];
  /** Venue del primer occurrence resuelto (para default_venue_id del evento). */
  firstVenueId: string | null;
}

interface IncomingResolved {
  occ: NormalizedOccurrence;
  venueId: string | null;
  room: string | null;
  key: string;
}

/**
 * Concilia las ocurrencias publicadas por ESTE registro de fuente con las que ya
 * tenemos de él. Otras fuentes del mismo evento no se tocan.
 */
export async function reconcileOccurrences(
  db: Queryable,
  normalized: NormalizedEvent,
  ctx: ReconcileContext,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    created: 0,
    updated: 0,
    missing: 0,
    changes: [],
    firstVenueId: null,
  };
  const existing = await listOccurrencesForRecord(db, ctx.sourceRecordId);

  const incoming: IncomingResolved[] = [];
  for (const occ of normalized.occurrences) {
    const { venueId, room } = await ctx.venues.resolve(db, occ.venue, ctx);
    if (result.firstVenueId === null && venueId) result.firstVenueId = venueId;
    incoming.push({
      occ,
      venueId,
      room,
      key: keyOf(occ.externalId ?? null, venueId, occ.startsAt),
    });
  }

  const existingByKey = new Map<string, OccurrenceRow>();
  for (const row of existing) {
    existingByKey.set(keyOf(row.external_id, row.venue_id, row.starts_at), row);
  }

  const matched = new Map<string, OccurrenceRow>(); // incoming key → existing row
  const unmatchedIncoming: IncomingResolved[] = [];
  for (const inc of incoming) {
    const row = existingByKey.get(inc.key);
    if (row) {
      matched.set(inc.key, row);
      existingByKey.delete(inc.key);
    } else {
      unmatchedIncoming.push(inc);
    }
  }
  // Las funciones que ya terminaron y salen del listado simplemente pasaron: no son
  // ausencias ni reprogramaciones (las fuentes que listan "desde hoy" las sueltan a diario).
  let unmatchedExisting = [...existingByKey.values()].filter(
    (old) => Date.parse(old.ends_at ?? old.starts_at) >= ctx.nowMs,
  );

  // Heurística de reprogramación: exactamente una desapareció y una apareció,
  // mismo venue, a menos de 90 días.
  if (unmatchedIncoming.length === 1 && unmatchedExisting.length === 1) {
    const inc = unmatchedIncoming[0];
    const old = unmatchedExisting[0];
    if (inc && old && inc.venueId === old.venue_id && old.status !== 'missing') {
      const deltaDays =
        Math.abs(Date.parse(inc.occ.startsAt) - Date.parse(old.starts_at)) / 86_400_000;
      if (deltaDays <= RESCHEDULE_WINDOW_DAYS) {
        await updateOccurrence(db, old.id, {
          ...occurrencePatch(inc, ctx),
          status: 'rescheduled',
          previous_starts_at: old.starts_at,
        });
        result.updated += 1;
        result.changes.push({
          eventId: ctx.eventId,
          occurrenceId: old.id,
          type: 'occurrence_rescheduled',
          severity: 'major',
          field: 'starts_at',
          oldValue: old.starts_at,
          newValue: inc.occ.startsAt,
        });
        unmatchedIncoming.length = 0;
        unmatchedExisting = [];
      }
    }
  }

  // Coincidencias: refrescar y detectar cambios de estado/venue.
  for (const inc of incoming) {
    const row = matched.get(inc.key);
    if (!row) continue;
    const patch = occurrencePatch(inc, ctx);
    const changes = statusAndVenueChanges(row, inc, ctx.eventId);
    // No pisar un estado "rescheduled" informativo con "scheduled".
    if (row.status === 'rescheduled' && inc.occ.status === 'scheduled') {
      delete (patch as Record<string, unknown>).status;
    }
    if (row.status === 'missing') {
      result.changes.push({
        eventId: ctx.eventId,
        occurrenceId: row.id,
        type: 'occurrence_reappeared',
        severity: 'major',
      });
    }
    await updateOccurrence(db, row.id, patch);
    result.updated += 1;
    result.changes.push(...changes);
  }

  // Nuevas.
  for (const inc of unmatchedIncoming) {
    const { row, inserted } = await insertOccurrence(db, toInsert(inc, ctx));
    if (inserted) {
      result.created += 1;
      result.changes.push({
        eventId: ctx.eventId,
        occurrenceId: row.id,
        type: 'occurrence_added',
        severity: 'minor',
        newValue: inc.occ.startsAt,
      });
    } else {
      result.updated += 1;
    }
  }

  // Desaparecidas de este registro (ya filtradas a futuras; nunca se borran).
  for (const old of unmatchedExisting) {
    if (old.status === 'missing') continue;
    const outcome = await bumpOccurrenceMiss(db, old.id, OCCURRENCE_MISS_THRESHOLD);
    if (outcome === 'missing') {
      result.missing += 1;
      result.changes.push({
        eventId: ctx.eventId,
        occurrenceId: old.id,
        type: 'occurrence_missing',
        severity: 'major',
        oldValue: old.starts_at,
      });
    }
  }

  return result;
}

function keyOf(externalId: string | null, venueId: string | null, startsAt: string): string {
  if (externalId) return `ext:${externalId}`;
  return `slot:${venueId ?? ''}|${Date.parse(startsAt)}`;
}

function toInsert(inc: IncomingResolved, ctx: ReconcileContext): OccurrenceInsert {
  const o = inc.occ;
  return {
    eventId: ctx.eventId,
    venueId: inc.venueId,
    room: inc.room,
    kind: o.kind,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    startDate: o.startDate,
    endDate: o.endDate,
    isAllDay: o.kind === 'all_day',
    scheduleText: o.scheduleText,
    recurrenceRule: o.recurrenceRule,
    status: o.status,
    statusReason: o.statusReason ?? null,
    ticketsUrl: o.ticketsUrl,
    priceText: o.price?.text ?? null,
    priceMin: o.price?.min ?? null,
    priceMax: o.price?.max ?? null,
    priceVerified: o.price?.verified ?? false,
    isFree: o.price?.isFree ?? null,
    sourceId: ctx.sourceId,
    sourceRecordId: ctx.sourceRecordId,
    externalId: o.externalId ?? null,
  };
}

function occurrencePatch(inc: IncomingResolved, ctx: ReconcileContext): Record<string, unknown> {
  const i = toInsert(inc, ctx);
  return {
    venue_id: i.venueId,
    room: i.room,
    kind: i.kind,
    starts_at: i.startsAt,
    ends_at: i.endsAt,
    start_date: i.startDate,
    end_date: i.endDate,
    is_all_day: i.isAllDay,
    schedule_text: i.scheduleText,
    recurrence_rule: i.recurrenceRule,
    status: i.status,
    status_reason: i.statusReason,
    tickets_url: i.ticketsUrl,
    price_text: i.priceText,
    price_min: i.priceMin,
    price_max: i.priceMax,
    price_verified: i.priceVerified,
    is_free: i.isFree,
    external_id: i.externalId,
  };
}

function statusAndVenueChanges(
  row: OccurrenceRow,
  inc: IncomingResolved,
  eventId: string,
): ChangeInput[] {
  const changes: ChangeInput[] = [];
  const before: OccurrenceStatus = row.status;
  const after = inc.occ.status;

  if (
    before !== 'missing' &&
    before !== after &&
    !(before === 'rescheduled' && after === 'scheduled')
  ) {
    if (after === 'cancelled') {
      changes.push({
        eventId,
        occurrenceId: row.id,
        type: 'occurrence_cancelled',
        severity: 'major',
        oldValue: before,
        newValue: after,
      });
    } else {
      changes.push({
        eventId,
        occurrenceId: row.id,
        type: 'occurrence_status_changed',
        severity: after === 'postponed' ? 'major' : 'minor',
        oldValue: before,
        newValue: after,
      });
    }
  }

  if (row.venue_id !== inc.venueId && inc.venueId !== null) {
    changes.push({
      eventId,
      occurrenceId: row.id,
      type: 'occurrence_venue_changed',
      severity: 'major',
      field: 'venue_id',
      oldValue: row.venue_id,
      newValue: inc.venueId,
    });
  }
  return changes;
}
