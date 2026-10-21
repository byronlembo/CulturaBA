import { type DisciplineSlug, stripDiacriticsLower } from '@culturaba/shared';

/**
 * Disciplinas CulturaBA a partir de los datos estructurados de Linda.
 *
 * Tabla `etiquetas[]` (14 valores; tres traen U+200B, que se quita antes de comparar):
 *
 * | Etiqueta Linda                | Disciplina                                              |
 * |-------------------------------|---------------------------------------------------------|
 * | Teatro y artes escénicas      | teatro_escenicas                                        |
 * | Música y Shows                | musica_vivo_jazz                                        |
 * | Cine                          | cine                                                    |
 * | Literatura                    | literatura_charlas                                      |
 * | Charlas y encuentros          | literatura_charlas                                      |
 * | Recorridos y visitas guiadas  | historia_patrimonio                                     |
 * | Ferias y exposiciones         | museos_exposiciones si es muestra (dates.ts); si no otros |
 * | Arte y cultura                | museos_exposiciones si lugar = museos_y; si no otros     |
 * | Entretenimiento, Festivales, Industrias Creativas | otros                               |
 * | Gastronomía, Deporte, Tecweek | — (no culturales: no aportan disciplina)                |
 * | (etiqueta desconocida)        | otros + aviso                                           |
 *
 * `tipoEvento`: descubrir_la_ciudad → historia_patrimonio; arte_y_cultura y
 * ferias_y_exposiciones → como la etiqueta homónima; entretenimiento → otros;
 * gastronomia → —.
 *
 * Ajustes explícitos (en este orden):
 *  1. Muestra/exposición (dates.ts isExhibition) → + museos_exposiciones.
 *  2. Institución teatro-colon: musica_vivo_jazz y teatro_escenicas → opera_clasica, o → danza
 *     si el título o el resumen hablan de ballet/coreógrafo/danza (Manon, Las ruinas)
 *     (Linda etiqueta las óperas del Colón como "Teatro" y sus conciertos como "Música").
 *  3. Título con "filarmónica", "philharmoni…", "recital de piano", "conservatorio" u
 *     "ópera" (no "Teatro Ópera") → musica_vivo_jazz pasa a opera_clasica (o se agrega).
 *  4. Título con "danza", "ballet" o "coreográfico/a" → teatro_escenicas pasa a danza (o se agrega).
 *  5. Título con "fotografía"/"fotográfico/a" → + fotografia_artes_visuales.
 *  6. Institución de ciencia (Planetario, Museo Participativo de Ciencias, C3) → ciencia
 *     primero; título con palabras inequívocas de ciencia (ciencia —no "ciencia ficción"—,
 *     científico, neurociencia, astronomía, paleontología, dinosaurios…) → + ciencia.
 *
 * Resultado: las disciplinas reales sin `otros`; si no hay ninguna pero sí una etiqueta
 * cultural no mapeable → ['otros']; si solo hay etiquetas no culturales o ninguna → []
 * (el evento queda candidato por missing:discipline).
 */

type Rule = DisciplineSlug | 'exhibition' | 'arte_y_cultura' | 'none';

export const ETIQUETA_RULES: Readonly<Record<string, Rule>> = {
  'teatro y artes escenicas': 'teatro_escenicas',
  'musica y shows': 'musica_vivo_jazz',
  cine: 'cine',
  literatura: 'literatura_charlas',
  'charlas y encuentros': 'literatura_charlas',
  'recorridos y visitas guiadas': 'historia_patrimonio',
  'ferias y exposiciones': 'exhibition',
  'arte y cultura': 'arte_y_cultura',
  entretenimiento: 'otros',
  festivales: 'otros',
  'industrias creativas': 'otros',
  gastronomia: 'none',
  deporte: 'none',
  tecweek: 'none',
};

export const TIPO_EVENTO_RULES: Readonly<Record<string, Rule>> = {
  descubrir_la_ciudad: 'historia_patrimonio',
  arte_y_cultura: 'arte_y_cultura',
  ferias_y_exposiciones: 'exhibition',
  entretenimiento: 'otros',
  gastronomia: 'none',
};

/** Etiquetas de artes en vivo: un ítem con estas etiquetas no se trata como muestra. */
export const PERFORMING_ETIQUETAS = new Set(['teatro y artes escenicas', 'musica y shows', 'cine']);

// Se aplican sobre el título sin acentos y en minúsculas (\b de JS no reconoce "ó" como letra).
const CLASSICAL_TITLE_RE =
  /\b(?:filarmonica|philharmoni[a-z]*|recital de piano|conservatorio)\b|(?<!teatro )\bopera\b/;
const DANCE_TITLE_RE = /\b(?:danza|ballet|coreografic[oa]s?)\b/;
const DANCE_TEXT_RE = /\b(?:danza|ballet|coreograf[a-z]*|bailarin[a-z]*)\b/;
const PHOTO_TITLE_RE = /\bfotograf(?:ic[oa]s?|ia)\b/;
const SCIENCE_TITLE_RE =
  /\b(?:ciencias?(?! ficcion)|cientific[oa]s?|neurociencias?|astronomi[a-z]*|astrofisic[a-z]*|astrobiolog[a-z]*|cosmolog[a-z]*|paleontolog[a-z]*|dinosaurios?|divulgacion)\b/;

/** Instituciones cuya agenda entera es divulgación científica. */
export const SCIENCE_INSTITUTIONS = new Set([
  'planetario-galileo-galilei',
  'museo-participativo-de-ciencias',
  'centro-cultural-de-la-ciencia',
]);

/** "Teatro\u200B y artes escénicas" (con U+200B) → "teatro y artes escenicas". */
export function etiquetaKey(raw: string): string {
  return stripDiacriticsLower(raw.replace(/[\u200B-\u200D\uFEFF]/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Etiqueta tal como se publica, sin caracteres de ancho cero (para `tags`). */
export function cleanEtiqueta(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DisciplineInput {
  etiquetas: readonly string[];
  tipoEvento?: string | null;
  lugar?: string | null;
  title: string;
  /** Descripción corta (texto plano), para señales inequívocas como "coreógrafo". */
  summary?: string;
  institutionSlug: string;
  isExhibition: boolean;
}

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  warnings: string[];
}

export function mapDisciplines(input: DisciplineInput): DisciplineMapping {
  const warnings: string[] = [];
  const out: DisciplineSlug[] = [];
  let cultural = false;

  const apply = (rule: Rule, label: string) => {
    switch (rule) {
      case 'none':
        return;
      case 'exhibition':
        cultural = true;
        out.push(input.isExhibition ? 'museos_exposiciones' : 'otros');
        return;
      case 'arte_y_cultura':
        cultural = true;
        out.push(input.lugar === 'museos_y' ? 'museos_exposiciones' : 'otros');
        return;
      default:
        cultural = true;
        out.push(rule);
        if (rule === 'otros' && !ETIQUETA_RULES[label] && !TIPO_EVENTO_RULES[label]) {
          warnings.push(`categoría sin mapeo: "${label}" → otros`);
        }
    }
  };

  for (const raw of input.etiquetas) {
    const key = etiquetaKey(raw);
    if (!key) continue;
    apply(ETIQUETA_RULES[key] ?? 'otros', key);
  }
  if (input.tipoEvento) apply(TIPO_EVENTO_RULES[input.tipoEvento] ?? 'otros', input.tipoEvento);

  // 1. Muestra.
  if (input.isExhibition) out.push('museos_exposiciones');
  // 2. Colón.
  const replace = (from: DisciplineSlug, to: DisciplineSlug) => {
    for (let i = 0; i < out.length; i += 1) if (out[i] === from) out[i] = to;
  };
  if (input.institutionSlug === 'teatro-colon') {
    // Linda rotula "Teatro" o "Música y Shows" a óperas, conciertos y ballets del Colón: es
    // danza si el título o el resumen lo dicen (ballet, coreógrafo…); si no, ópera/clásica.
    const danceText = DANCE_TEXT_RE.test(
      stripDiacriticsLower(`${input.title} ${input.summary ?? ''}`),
    );
    replace('musica_vivo_jazz', danceText ? 'danza' : 'opera_clasica');
    replace('teatro_escenicas', danceText ? 'danza' : 'opera_clasica');
  }
  // 3–5. Título (solo palabras inequívocas).
  const title = stripDiacriticsLower(input.title);
  if (CLASSICAL_TITLE_RE.test(title)) {
    replace('musica_vivo_jazz', 'opera_clasica');
    out.push('opera_clasica');
  }
  if (DANCE_TITLE_RE.test(title)) {
    replace('teatro_escenicas', 'danza');
    out.push('danza');
  }
  if (PHOTO_TITLE_RE.test(title)) out.push('fotografia_artes_visuales');
  // 6. Ciencia: primera en sus instituciones; sumada por título en el resto.
  if (SCIENCE_INSTITUTIONS.has(input.institutionSlug)) out.unshift('ciencia');
  else if (SCIENCE_TITLE_RE.test(title)) out.push('ciencia');

  const real = [...new Set(out.filter((d) => d !== 'otros'))];
  if (real.length > 0) return { disciplines: real, warnings };
  if (cultural) return { disciplines: ['otros'], warnings };
  warnings.push(
    `sin disciplina cultural: etiquetas [${input.etiquetas.map(cleanEtiqueta).join(', ')}]`,
  );
  return { disciplines: [], warnings };
}
