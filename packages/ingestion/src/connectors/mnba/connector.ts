import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Conector mnba: STUB registrado para que `list-sources` muestre su estado.
 * Implementación pendiente: ver docs/source-inventory.md (protocolo de relevamiento).
 */
export const mnbaConnector: SourceConnector = {
  slug: 'mnba',
  meta: {
    name: 'Agenda Museo Nacional de Bellas Artes',
    baseUrl: 'https://bellasartes.gob.ar/agenda/',
    institutionSlug: 'mnba',
    kind: 'html',
    ready: false,
    blockedReason:
      'Cloudflare managed challenge ("Verificación de seguridad en curso") bloquea el acceso automatizado; no se elude. Alternativas: fixtures guardados desde un navegador o una fuente oficial sin challenge.',
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: 30_000 },
  },
  async discover(_ctx: FetchContext): Promise<RawRecord[]> {
    throw new Error('Conector mnba: no implementado todavía');
  },
  parse(_raw: RawRecord, _ctx: ParseContext): ParseResult {
    return fail(['Conector mnba: no implementado todavía']);
  },
};
