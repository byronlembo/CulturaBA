import type { DisciplineSlug } from '@culturaba/shared';
import { normalizeLine } from './dates';

/**
 * Disciplinas del Museo Moderno. El CPT `agenda` no tiene taxonomía: el tipo de actividad
 * se lee del título y de la bajada (excerpt), que el sitio usa como tipo ("Ciclo de cine y
 * video experimental", "Taller a cargo de…", "Concierto y charla…", "Recorrido por…").
 *
 * | Palabras (título + bajada, sin acentos)                         | Disciplina           |
 * |-----------------------------------------------------------------|----------------------|
 * | ciclo de cine, cine, film(e)s, película, proyección, cortometraje, documental, video experimental, videoarte | cine |
 * | danza, ballet                                                    | danza                |
 * | performance (→ danza si el texto habla de danza/coreografía/bailarines) | teatro_escenicas |
 * | obra de teatro, función de teatro, teatro leído                   | teatro_escenicas     |
 * | concierto, recital, DJ set, música en vivo                        | musica_vivo_jazz     |
 * | charla, conversación, conversatorio, conferencia, presentación de la publicación / del libro, entrevista pública, mesa redonda, seminario, jornada(s), lectura, poesía, revista(s), encuentro de pensamiento | literatura_charlas |
 * | recorrido(s), visita(s)                                          | museos_exposiciones  |
 * | taller(es), laboratorio, curso, clase, espacio de exploración     | otros (sin aviso)    |
 * | (nada de lo anterior)                                            | otros + aviso        |
 *
 * "teatro" a secas NO cuenta: el sitio nombra así exposiciones ("Esto es Teatro") y programas
 * ("Arte es teatro"). Exposiciones (CPT `exposiciones`): museos_exposiciones, más
 * fotografia_artes_visuales si el título, la bajada o el primer párrafo hablan
 * explícitamente de fotografía o artes visuales.
 */

interface Rule {
  label: string;
  re: RegExp;
  discipline: DisciplineSlug;
}

export const AGENDA_RULES: readonly Rule[] = [
  {
    label: 'cine',
    re: /\b(?:ciclo de cine|cine|filmes?|films?|peliculas?|proyecci(?:on|ones)|cortometrajes?|largometrajes?|documentales?|video experimental|videoarte)\b/,
    discipline: 'cine',
  },
  { label: 'danza', re: /\b(?:danza|ballet)\b/, discipline: 'danza' },
  { label: 'performance', re: /\bperformances?\b/, discipline: 'teatro_escenicas' },
  {
    label: 'teatro',
    re: /\b(?:obra de teatro|funcion de teatro|teatro leido)\b/,
    discipline: 'teatro_escenicas',
  },
  {
    label: 'musica',
    re: /\b(?:conciertos?|recital(?:es)?|dj set|musica en vivo)\b/,
    discipline: 'musica_vivo_jazz',
  },
  {
    label: 'charla',
    re: /\b(?:charlas?|conversacion|conversatorio|conferencias?|presentacion de la publicacion|presentacion del libro|presentamos la reedicion|entrevista publica|mesa redonda|seminario|jornadas?|lecturas?|poesia|revistas?|encuentro de pensamiento)\b/,
    discipline: 'literatura_charlas',
  },
  {
    label: 'recorrido',
    re: /\b(?:recorridos?|visitas?)\b/,
    discipline: 'museos_exposiciones',
  },
  {
    label: 'taller',
    re: /\b(?:talleres|taller|laboratorios?|curso|clases?|espacio de exploracion)\b/,
    discipline: 'otros',
  },
];

/** Una performance es danza cuando el propio texto lo dice. */
const DANCE_TEXT_RE = /\b(?:danza|coreografi[a-z]*|coreografic[a-z]*|bailarin[a-z]*)\b/;

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  /** Reglas que se aplicaron (para depurar y para los tests). */
  matched: string[];
  warnings: string[];
}

export function mapAgendaDisciplines(input: {
  title: string;
  excerpt: string;
  description: string;
}): DisciplineMapping {
  const lead = normalizeLine(`${input.title} · ${input.excerpt}`);
  const body = normalizeLine(input.description);
  const out: DisciplineSlug[] = [];
  const matched: string[] = [];
  for (const rule of AGENDA_RULES) {
    if (!rule.re.test(lead)) continue;
    matched.push(rule.label);
    if (rule.label === 'performance' && DANCE_TEXT_RE.test(`${lead} ${body}`)) out.push('danza');
    else out.push(rule.discipline);
  }
  const real = [...new Set(out.filter((d) => d !== 'otros'))];
  if (real.length > 0) return { disciplines: real, matched, warnings: [] };
  if (matched.length > 0) return { disciplines: ['otros'], matched, warnings: [] };
  return {
    disciplines: ['otros'],
    matched,
    warnings: [`tipo de actividad sin mapeo ("${input.excerpt || input.title}") → otros`],
  };
}

const VISUAL_ARTS_RE = /\b(?:fotografias?|fotografic[oa]s?|fotografos?|artes visuales)\b/;

export function mapExhibitionDisciplines(input: {
  title: string;
  excerpt: string;
  lead: string;
}): DisciplineSlug[] {
  const text = normalizeLine(`${input.title} · ${input.excerpt} · ${input.lead}`);
  return VISUAL_ARTS_RE.test(text)
    ? ['museos_exposiciones', 'fotografia_artes_visuales']
    : ['museos_exposiciones'];
}
