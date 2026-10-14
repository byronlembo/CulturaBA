import type { NormalizedEvent } from '@culturaba/shared';
import type { DateTime } from 'luxon';
import type { HttpClient } from '../http/client';
import type { Logger } from '../logger';

export type SourceKind = 'html' | 'json_api' | 'jsonld' | 'rss' | 'browser';

/** Un ítem tal como lo entrega la fuente, antes de parsear. */
export interface RawRecord {
  /** Id estable dentro de la fuente (slug, id numérico o URL canónica). */
  externalId: string;
  /** URL pública canónica del ítem. */
  url: string;
  fetchedAt: string;
  contentType: 'html' | 'json';
  /** HTML de la página de detalle o JSON del ítem (como texto). */
  body: string;
  /** Datos ya disponibles en el listado (tarjeta, JSON del índice). */
  listing?: unknown;
}

export interface FetchContext {
  http: HttpClient;
  logger: Logger;
  /** Reloj inyectable (inferencia de año, "futuro"). */
  now: () => DateTime;
  /** Limitar la cantidad de ítems (desarrollo). */
  limit?: number;
}

export type ParseContext = Pick<FetchContext, 'now' | 'logger'>;

export type ParseResult =
  | { ok: true; event: NormalizedEvent; warnings: string[] }
  | { ok: false; errors: string[]; partial?: Partial<NormalizedEvent> };

export interface ConnectorPoliteness {
  concurrency: number;
  minDelayMs: number;
  timeoutMs: number;
}

export interface ConnectorMeta {
  name: string;
  baseUrl: string;
  institutionSlug: string;
  kind: SourceKind;
  needsBrowser?: boolean;
  politeness: ConnectorPoliteness;
}

/**
 * Un conector por fuente. `discover` y `enrich` hacen IO; `parse` es PURO y
 * síncrono para poder probarlo con fixtures sin red ni base de datos.
 */
export interface SourceConnector {
  readonly slug: string;
  readonly meta: ConnectorMeta;
  discover(ctx: FetchContext): Promise<RawRecord[]>;
  enrich?(raw: RawRecord, ctx: FetchContext): Promise<RawRecord>;
  parse(raw: RawRecord, ctx: ParseContext): ParseResult;
}

export function ok(event: NormalizedEvent, warnings: string[] = []): ParseResult {
  return { ok: true, event, warnings };
}

export function fail(errors: string[], partial?: Partial<NormalizedEvent>): ParseResult {
  return partial ? { ok: false, errors, partial } : { ok: false, errors };
}
