import {
  allRecordsMissing,
  bumpRecordMiss,
  type ChangeInput,
  countVisibleFutureOccurrences,
  getEventById,
  listUnseenRecords,
  markRecordOccurrencesMissing,
  updateEventFields,
} from '../db/repo';
import type { Queryable } from '../db/sql';

export const RECORD_MISS_THRESHOLD = 2;
/** Mínimo de ítems de la corrida anterior para que la guardia tenga sentido. */
export const GUARD_MIN_PREVIOUS = 10;
/** Si esta corrida descubrió menos de este porcentaje de la anterior, no se cuentan ausencias. */
export const GUARD_MIN_RATIO = 0.5;

export interface MissingPolicyResult {
  skipped: boolean;
  reason?: string;
  recordsCounted: number;
  recordsMissing: number;
  occurrencesMissing: number;
  eventsSuspended: number;
  changes: ChangeInput[];
}

/**
 * Registros de la fuente que no aparecieron en esta corrida. Nunca se borra nada:
 * a la segunda ausencia consecutiva las funciones futuras pasan a `missing` y,
 * si el evento no tiene nada visible en ninguna fuente, queda `suspended`.
 */
export async function applyMissingPolicy(
  db: Queryable,
  args: {
    sourceId: string;
    runId: string;
    discovered: number;
    previousDiscovered: number | null;
    /** Ausencias consecutivas necesarias (por fuente; default RECORD_MISS_THRESHOLD). */
    missThreshold?: number;
  },
): Promise<MissingPolicyResult> {
  const result: MissingPolicyResult = {
    skipped: false,
    recordsCounted: 0,
    recordsMissing: 0,
    occurrencesMissing: 0,
    eventsSuspended: 0,
    changes: [],
  };

  const prev = args.previousDiscovered;
  if (prev !== null && prev >= GUARD_MIN_PREVIOUS && args.discovered < prev * GUARD_MIN_RATIO) {
    result.skipped = true;
    result.reason = `guardia: se descubrieron ${args.discovered} ítems frente a ${prev} en la corrida anterior; no se marcan ausencias`;
    return result;
  }

  const unseen = await listUnseenRecords(db, args.sourceId, args.runId);
  for (const record of unseen) {
    result.recordsCounted += 1;
    const outcome = await bumpRecordMiss(
      db,
      record.id,
      args.missThreshold ?? RECORD_MISS_THRESHOLD,
    );
    if (outcome !== 'missing') continue;
    result.recordsMissing += 1;

    const occurrences = await markRecordOccurrencesMissing(db, record.id);
    result.occurrencesMissing += occurrences.length;
    if (!record.event_id) continue;
    for (const o of occurrences) {
      result.changes.push({
        eventId: record.event_id,
        occurrenceId: o.id,
        type: 'occurrence_missing',
        severity: 'major',
        oldValue: o.starts_at,
      });
    }

    const event = await getEventById(db, record.event_id);
    if (event?.status !== 'published') continue;
    const visible = await countVisibleFutureOccurrences(db, event.id);
    if (visible === 0 && (await allRecordsMissing(db, event.id))) {
      await updateEventFields(db, event.id, { status: 'suspended' });
      result.eventsSuspended += 1;
      result.changes.push({ eventId: event.id, type: 'event_suspended', severity: 'major' });
    }
  }

  return result;
}
