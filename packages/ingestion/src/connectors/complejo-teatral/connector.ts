import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Conector complejo-teatral: STUB registrado para que `list-sources` muestre su estado.
 * Implementación pendiente: ver docs/source-inventory.md (protocolo de relevamiento).
 */
export const complejoTeatralConnector: SourceConnector = {
  slug: 'complejo-teatral',
  meta: {
    name: 'Programación Complejo Teatral de Buenos Aires',
    baseUrl: 'https://complejoteatral.gob.ar/',
    institutionSlug: 'complejo-teatral',
    kind: 'html',
    ready: false,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: 30_000 },
  },
  async discover(_ctx: FetchContext): Promise<RawRecord[]> {
    throw new Error('Conector complejo-teatral: no implementado todavía');
  },
  parse(_raw: RawRecord, _ctx: ParseContext): ParseResult {
    return fail(['Conector complejo-teatral: no implementado todavía']);
  },
};
