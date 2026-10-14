import { type DisciplineSlug, stripDiacriticsLower } from '@culturaba/shared';

/**
 * Categorías del sitio (taxonomía `production-category` del CMS, 51 términos, y su
 * etiqueta visible en `.category`) → disciplinas de CulturaBA.
 *
 *  · Clave = slug de la taxonomía o etiqueta "slugificada" ("Música de Cámara" → musica-de-camara).
 *  · `temporada-YYYY` es una temporada, no una categoría: no aporta información.
 *  · Categoría conocida pero sin disciplina clara → ['otros'].
 *  · Sin ninguna categoría → [] (el evento queda candidato por disciplina).
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

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  tags: string[];
}

/** "Música de Cámara" → "musica-de-camara"; "production-category-ofba" → "ofba". */
export function categoryKey(text: string): string {
  return stripDiacriticsLower(text)
    .replace(/^production-category-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Mapea una o más categorías (etiquetas visibles y/o slugs de la taxonomía) a
 * disciplinas, en orden: la primera es la primaria.
 */
export function disciplinesFor(
  categories: readonly (string | null | undefined)[],
): DisciplineMapping {
  const disciplines: DisciplineSlug[] = [];
  const tags: string[] = [];
  let informative = 0;

  for (const raw of categories) {
    const key = categoryKey(raw ?? '');
    if (!key || SEASON_RE.test(key)) continue;
    informative += 1;
    const mapped = BY_KEY[key];
    if (mapped) {
      for (const d of mapped) if (!disciplines.includes(d)) disciplines.push(d);
    }
    if (CHILDREN_KEYS.has(key) && !tags.includes('infantil')) tags.push('infantil');
  }

  if (disciplines.length === 0 && informative > 0) disciplines.push('otros');
  return { disciplines, tags };
}
