import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Conector palacio-libertad: STUB registrado para que `list-sources` muestre su estado.
 * Implementación pendiente: ver docs/source-inventory.md (protocolo de relevamiento).
 */
export const palacioLibertadConnector: SourceConnector = {
  slug: 'palacio-libertad',
  meta: {
    name: 'Agenda Palacio Libertad',
    baseUrl: 'https://palaciolibertad.gob.ar/agenda/',
    institutionSlug: 'palacio-libertad',
    kind: 'html',
    ready: false,
    blockedReason:
      'Cloudflare managed challenge bloquea el acceso automatizado; no se elude. Alternativas: fixtures guardados desde un navegador o una fuente oficial sin challenge.',
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: 30_000 },
  },
  async discover(_ctx: FetchContext): Promise<RawRecord[]> {
    throw new Error('Conector palacio-libertad: no implementado todavía');
  },
  parse(_raw: RawRecord, _ctx: ParseContext): ParseResult {
    return fail(['Conector palacio-libertad: no implementado todavía']);
  },
};
