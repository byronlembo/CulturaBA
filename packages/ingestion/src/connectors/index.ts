import type { SourceConnector } from '../core/connector';
import { sampleConnector } from './sample/connector';

/** Registro de conectores disponibles. Agregar uno nuevo = una línea acá. */
export const CONNECTORS: readonly SourceConnector[] = [sampleConnector];

export function getConnector(slug: string): SourceConnector {
  const c = CONNECTORS.find((x) => x.slug === slug);
  if (!c) {
    throw new Error(
      `Conector desconocido: '${slug}'. Disponibles: ${CONNECTORS.map((x) => x.slug).join(', ')}`,
    );
  }
  return c;
}

/** Conectores que representan fuentes reales (excluye los sintéticos de prueba). */
export function productionConnectors(): SourceConnector[] {
  return CONNECTORS.filter((c) => c.slug !== 'sample');
}
