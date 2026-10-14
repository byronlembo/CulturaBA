import { type DisciplineSlug, stripDiacriticsLower } from '@culturaba/shared';

/**
 * Categorías del sitio (taxonomía `production-category` del CMS, 51 términos, y su
 * etiqueta visible en `.category`) → disciplinas de CulturaBA.
 *
 *  · Clave = slug de la taxonomía o etiqueta "slugificada" ("Música de Cámara" → musica-de-camara).
 *  · Categoría conocida pero sin disciplina clara → ['otros'].
 *  · `temporada-YYYY` es una temporada, no una disciplina. Si es la ÚNICA categoría
 *    publicada (visitas "Historias secretas" y "Atardecer", fixtures 020 y 039), se
 *    usan señales deterministas de la propia fuente (ver `disciplinesFromSignals`);
 *    sin señales, es actividad cultural no mapeable → ['otros'].
 *  · Sin ninguna categoría ni señal → [] (el evento queda candidato por disciplina).
 */

const OPERA_CLASICA: DisciplineSlug[] = ['opera_clasica'];

const BY_KEY: Record<string, DisciplineSlug[]> = {
  // Ópera
  opera: OPERA_CLASICA,
  'opera-de-camara': OPERA_CLASICA,
  'opera-studio': OPERA_CLASICA,
  'la-opera-de-los-tres-centavos': OPERA_CLASICA,
  // Ballet
  ballet: ['danza'],
  // Conciertos y ciclos de música clásica
  conciertos: OPERA_CLASICA,
  'conciertos-extraordinarios': OPERA_CLASICA,
  'conciertos-de-camara': OPERA_CLASICA,
  'musica-de-camara': OPERA_CLASICA,
  'cancion-de-camara': OPERA_CLASICA,
  'buenos-aires-camara': OPERA_CLASICA,
  ofba: OPERA_CLASICA,
  'filarmonica-de-buenos-aires': OPERA_CLASICA,
  oetc: OPERA_CLASICA,
  'orquesta-estable-del-teatro-colon': OPERA_CLASICA,
  'orquesta-estable-del-teatro-colon-oetc-2': OPERA_CLASICA,
  oatc: OPERA_CLASICA,
  'orquesta-academica-del-teatro-colon': OPERA_CLASICA,
  'coro-estable-del-teatro-colon': OPERA_CLASICA,
  corales: OPERA_CLASICA,
  mozarteum: OPERA_CLASICA,
  aura: OPERA_CLASICA,
  gi: OPERA_CLASICA,
  'grandes-interpretes': OPERA_CLASICA,
  'grandes-interpretes-gi': OPERA_CLASICA,
  'clasica-joven': OPERA_CLASICA,
  pianissimo: OPERA_CLASICA,
  'recitales-en-el-dorado': OPERA_CLASICA,
  'salon-dorado': OPERA_CLASICA,
  barroco: OPERA_CLASICA,
  'ciclo-barroco': OPERA_CLASICA,
  'musica-antigua': OPERA_CLASICA,
  abonos: OPERA_CLASICA,
  'abono-contemporaneo': OPERA_CLASICA,
  'clasicos-argentinos': OPERA_CLASICA,
  // Centro de Experimentación: artes escénico-musicales (ópera, danza, teatro musical, performance)
  cetc: ['teatro_escenicas', 'opera_clasica'],
  // Programación infantil (ópera, ballet y conciertos adaptados)
  'colon-para-ninos': OPERA_CLASICA,
  'vacaciones-de-invierno': OPERA_CLASICA,
  'vacaciones-de-invierno-colon-para-ninos': OPERA_CLASICA,
  disney: OPERA_CLASICA,
  // Otras músicas
  jazz: ['musica_vivo_jazz'],
  tango: ['musica_vivo_jazz'],
  // Cine
  'cine-documental': ['cine'],
  'musica-y-cine': ['cine'],
  // Actividades sin disciplina clara
  talleres: ['otros'],
  escuelas: ['otros'],
  isatc: ['otros'],
  otra: ['otros'],
  legados: ['otros'],
  'fuera-de-ciclo': ['otros'],
  'colon-inmersivo': ['otros'],
  'colon-en-la-ciudad': ['otros'],
};

const CHILDREN_KEYS = new Set([
  'colon-para-ninos',
  'vacaciones-de-invierno',
  'vacaciones-de-invierno-colon-para-ninos',
  'disney',
]);

const SEASON_RE = /^temporada-\d{4}$/;

/** Entradas de visitas guiadas en la ticketera de la Ciudad: /visitas/115, /visitas/120. */
const VISIT_TICKETS_RE = /^https?:\/\/entradasba\.buenosaires\.gob\.ar\/visitas\/\d+/i;
/** Sobre texto sin tildes y en minúsculas (stripDiacriticsLower). */
const VISIT_TEXT_RE = /\bvisitas? guiadas?\b/;
const THEATRE_TEXT_RE = /\bexperiencia teatral\b/;
const CLASSICAL_TEXT_RE = /\bmusica clasica\b/;

export interface DisciplineSignals {
  /** URLs de entradas publicadas por la fuente (funciones, listado). */
  ticketUrls?: readonly (string | null | undefined)[];
  /** Texto propio de la fuente: título, resumen, sinopsis. */
  text?: string;
}

export type DisciplineBasis = 'categories' | 'signals' | 'season-only' | 'none';

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  tags: string[];
  /** De dónde salió la disciplina (para avisos y trazabilidad). */
  basis: DisciplineBasis;
}

/** "Música de Cámara" → "musica-de-camara"; "production-category-ofba" → "ofba". */
export function categoryKey(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/^production-category-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Señales deterministas que la fuente publica cuando no hay categoría informativa:
 *  · entradas en entradasba `/visitas/<n>` o texto "visita(s) guiada(s)" → historia_patrimonio
 *    ("visita guiada privada … para apreciar su historia y valor patrimonial", fixture 039);
 *  · "experiencia teatral" → teatro_escenicas (fixture 020);
 *  · "música clásica" → opera_clasica (fixture 039).
 * Solo frases literales: nada de inferencias sobre texto libre.
 */
export function disciplinesFromSignals(signals: DisciplineSignals): DisciplineSlug[] {
  const text = stripDiacriticsLower(signals.text ?? '').replace(/\s+/g, ' ');
  const out: DisciplineSlug[] = [];
  const visit =
    (signals.ticketUrls ?? []).some((u) => VISIT_TICKETS_RE.test(u ?? '')) ||
    VISIT_TEXT_RE.test(text);
  if (visit) out.push('historia_patrimonio');
  if (THEATRE_TEXT_RE.test(text)) out.push('teatro_escenicas');
  if (CLASSICAL_TEXT_RE.test(text)) out.push('opera_clasica');
  return out;
}

/**
 * Mapea una o más categorías (etiquetas visibles y/o slugs de la taxonomía) a
 * disciplinas, en orden: la primera es la primaria. Las señales solo se miran
 * cuando ninguna categoría es informativa (p. ej. solo "Temporada 2026").
 */
export function disciplinesFor(
  categories: readonly (string | null | undefined)[],
  signals: DisciplineSignals = {},
): DisciplineMapping {
  const disciplines: DisciplineSlug[] = [];
  const tags: string[] = [];
  let informative = 0;
  let seasons = 0;

  for (const raw of categories) {
    const key = categoryKey(raw ?? '');
    if (!key) continue;
    if (SEASON_RE.test(key)) {
      seasons += 1;
      continue;
    }
    informative += 1;
    const mapped = BY_KEY[key];
    if (mapped) {
      for (const d of mapped) if (!disciplines.includes(d)) disciplines.push(d);
    }
    if (CHILDREN_KEYS.has(key) && !tags.includes('infantil')) tags.push('infantil');
  }

  if (informative > 0) {
    if (disciplines.length === 0) disciplines.push('otros');
    return { disciplines, tags, basis: 'categories' };
  }

  const fromSignals = disciplinesFromSignals(signals);
  if (fromSignals.length > 0) return { disciplines: fromSignals, tags, basis: 'signals' };
  // Solo temporada: la fuente la publica en su programación pero sin disciplina mapeable.
  if (seasons > 0) return { disciplines: ['otros'], tags, basis: 'season-only' };
  return { disciplines: [], tags, basis: 'none' };
}
