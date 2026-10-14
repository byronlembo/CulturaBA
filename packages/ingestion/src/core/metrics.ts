/** Métricas de una corrida de conector; se guardan en ingestion_runs.stats. */
export interface RunStats {
  discovered: number;
  fetched: number;
  fetch_failed: number;
  parsed_ok: number;
  parsed_incomplete: number;
  parsed_invalid: number;
  records_failed: number;
  events_created: number;
  events_updated: number;
  events_unchanged: number;
  events_published: number;
  occurrences_created: number;
  occurrences_updated: number;
  changes_major: number;
  changes_minor: number;
  missing_marked: number;
  duplicates_flagged: number;
  http_requests: number;
  http_retries: number;
  duration_ms: number;
}

export function newRunStats(): RunStats {
  return {
    discovered: 0,
    fetched: 0,
    fetch_failed: 0,
    parsed_ok: 0,
    parsed_incomplete: 0,
    parsed_invalid: 0,
    records_failed: 0,
    events_created: 0,
    events_updated: 0,
    events_unchanged: 0,
    events_published: 0,
    occurrences_created: 0,
    occurrences_updated: 0,
    changes_major: 0,
    changes_minor: 0,
    missing_marked: 0,
    duplicates_flagged: 0,
    http_requests: 0,
    http_retries: 0,
    duration_ms: 0,
  };
}
