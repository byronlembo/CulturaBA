import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Conector teatro-colon: STUB registrado para que `list-sources` muestre su estado.
 * Implementación pendiente: ver docs/source-inventory.md (protocolo de relevamiento).
 */
export const teatroColonConnector: SourceConnector = {
  slug: 'teatro-colon',
  meta: {
    name: 'Agenda Teatro Colón',
    baseUrl: 'https://teatrocolon.org.ar/calendario/',
    institutionSlug: 'teatro-colon',
    kind: 'html',
    ready: false,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: 30_000 },
  },
  async discover(_ctx: FetchContext): Promise<RawRecord[]> {
    throw new Error('Conector teatro-colon: no implementado todavía');
  },
  parse(_raw: RawRecord, _ctx: ParseContext): ParseResult {
    return fail(['Conector teatro-colon: no implementado todavía']);
  },
};
