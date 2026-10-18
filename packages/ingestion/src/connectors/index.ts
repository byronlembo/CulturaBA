import type { SourceConnector } from '../core/connector';
import { agendaBaConnector } from './agenda-ba/connector';
import { complejoTeatralConnector } from './complejo-teatral/connector';
import { mnbaConnector } from './mnba/connector';
import { palacioLibertadConnector } from './palacio-libertad/connector';
import { sampleConnector } from './sample/connector';
import { teatroColonConnector } from './teatro-colon/connector';
import { usinaDelArteConnector } from './usina-del-arte/connector';

/** Registro de conectores. Agregar uno nuevo = una línea acá. */
export const CONNECTORS: readonly SourceConnector[] = [
  sampleConnector,
  teatroColonConnector,
  complejoTeatralConnector,
  mnbaConnector,
  palacioLibertadConnector,
  agendaBaConnector,
  usinaDelArteConnector,
];

export function getConnector(slug: string): SourceConnector {
  const c = CONNECTORS.find((x) => x.slug === slug);
  if (!c) {
    throw new Error(
      `Conector desconocido: '${slug}'. Disponibles: ${CONNECTORS.map((x) => x.slug).join(', ')}`,
    );
  }
  return c;
}

/** Conectores de fuentes reales listos para correr (excluye stubs y el sintético). */
export function productionConnectors(): SourceConnector[] {
  return CONNECTORS.filter((c) => c.slug !== 'sample' && c.meta.ready);
}
