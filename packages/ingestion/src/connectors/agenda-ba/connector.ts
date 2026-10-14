import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Conector agenda-ba (Linda, agenda oficial de la Ciudad — agregador multi-institución):
 * STUB registrado. Implementación pendiente: ver docs/research/agenda-ba.md.
 */
export const agendaBaConnector: SourceConnector = {
  slug: 'agenda-ba',
  meta: {
    name: 'Agenda oficial de la Ciudad (Linda)',
    baseUrl: 'https://linda.buenosaires.gob.ar/',
    // Agregador: la institución real sale de cada evento (institutionSlug por ítem).
    institutionSlug: 'agenda-ba',
    kind: 'json_api',
    ready: false,
    politeness: { concurrency: 1, minDelayMs: 1600, timeoutMs: 30_000 },
  },
  async discover(_ctx: FetchContext): Promise<RawRecord[]> {
    throw new Error('Conector agenda-ba: no implementado todavía');
  },
  parse(_raw: RawRecord, _ctx: ParseContext): ParseResult {
    return fail(['Conector agenda-ba: no implementado todavía']);
  },
};
