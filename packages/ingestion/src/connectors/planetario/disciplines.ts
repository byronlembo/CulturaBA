import type { DisciplineSlug } from '@culturaba/shared';
import { normalizeText } from './dates';

/**
 * Disciplinas del Planetario. Todo lo que publica es divulgación científica: `ciencia` siempre,
 * primera. Una segunda disciplina SOLO con una señal literal en el título o el subtítulo (la
 * primera línea destacada del cuerpo), nunca del resto del texto: una charla sobre Freddie
 * Mercury sigue siendo una charla de astronomía.
 *
 * | Palabras (título + subtítulo, sin acentos)                         | Disciplina         |
 * |-------------------------------------------------------------------|--------------------|
 * | cine, película(s), film(s), documental, cortometraje               | cine               |
 * | concierto, recital, música en vivo, "música y ciencia"             | musica_vivo_jazz   |
 * | obra de teatro, teatro                                             | teatro_escenicas   |
 */

interface Rule {
  re: RegExp;
  discipline: DisciplineSlug;
}

export const SECOND_DISCIPLINE_RULES: readonly Rule[] = [
  {
    re: /\b(?:cine|peliculas?|films?|filmes?|documental(?:es)?|cortometrajes?)\b/,
    discipline: 'cine',
  },
  {
    re: /\b(?:conciertos?|recital(?:es)?|musica en vivo|musica y ciencia)\b/,
    discipline: 'musica_vivo_jazz',
  },
  { re: /\b(?:obra de teatro|teatro)\b/, discipline: 'teatro_escenicas' },
];

export function mapDisciplines(input: {
  title: string;
  subtitle?: string | null;
}): DisciplineSlug[] {
  const text = normalizeText(`${input.title}\n${input.subtitle ?? ''}`);
  const out: DisciplineSlug[] = ['ciencia'];
  for (const rule of SECOND_DISCIPLINE_RULES) {
    if (rule.re.test(text) && !out.includes(rule.discipline)) out.push(rule.discipline);
  }
  return out;
}
