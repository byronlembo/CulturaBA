import { type DisciplineSlug, htmlToText } from '@culturaba/shared';

/**
 * Taxonomía `tipo-de-actividad` de usinadelarte.ar (64 términos al 18-oct-2026) →
 * disciplinas de CulturaBA. Tabla EXPLÍCITA por slug del término; los títulos de
 * ejemplo están en docs/research/usina-del-arte.md.
 *
 *  · Disciplina: el término nombra la disciplina o todas sus actividades son de ella.
 *  · `otros`: actividad cultural sin disciplina clara (talleres infantiles, juegos,
 *    experiencias mixtas, "Show" y "Experiencia inmersiva" con música y circo mezclados).
 *  · `label`: etiqueta de temporada u ocasión ("Vacaciones de invierno", "Día del niño"):
 *    no aporta disciplina; si es lo único, el evento queda en `otros`.
 *  · `non_cultural`: gastronomía. No aporta disciplina; si es lo único → [] (candidato).
 *  · Término desconocido → `otros` + aviso (hay que sumarlo a la tabla).
 *
 * Resultado: las disciplinas reales sin `otros`; si no hay ninguna pero sí algún término
 * cultural → ['otros']; sin términos (o solo gastronomía) → [] (missing:discipline).
 */

type Rule = DisciplineSlug | 'label' | 'non_cultural';

interface TipoRule {
  rule: Rule;
  /** Etiquetas extra (p. ej. público infantil). */
  tags?: string[];
}

const D = (rule: Rule, tags?: string[]): TipoRule => (tags ? { rule, tags } : { rule });

export const TIPO_RULES: Readonly<Record<string, TipoRule>> = {
  // Música
  concierto: D('musica_vivo_jazz'),
  conciertos: D('musica_vivo_jazz'),
  'concierto-internacional': D('musica_vivo_jazz'),
  'concierto-para-toda-la-familia': D('musica_vivo_jazz', ['infantil']),
  'jazz-en-la-usina': D('musica_vivo_jazz'),
  microconcierto: D('musica_vivo_jazz'),
  'mini-recital': D('musica_vivo_jazz'),
  musica: D('musica_vivo_jazz'),
  'musica-en-vivo': D('musica_vivo_jazz'),
  'show-musical': D('musica_vivo_jazz'),
  pena: D('musica_vivo_jazz'),
  'pena-en-el-salon-mayor': D('musica_vivo_jazz'),
  tango: D('musica_vivo_jazz'),
  dj: D('musica_vivo_jazz'),
  'dj-set': D('musica_vivo_jazz'),
  // "Conservatorios en concierto": orquestas de tango, latinoamericana, electroacústica…
  'ciclo-dgeart': D('musica_vivo_jazz'),
  // Clásica
  'ciclo-musica-de-camara': D('opera_clasica'),
  'ciclo-duos-en-usina': D('opera_clasica'),
  // Escénicas
  espectaculo: D('teatro_escenicas'),
  'shambala-circo': D('teatro_escenicas'),
  'show-para-ninos': D('teatro_escenicas', ['infantil']),
  'show-para-toda-la-familia': D('teatro_escenicas', ['infantil']),
  // Danza
  danza: D('danza'),
  'clases-de-baile': D('danza'),
  'mundial-de-baile': D('danza'),
  'usina-milonguera': D('danza'),
  // Cine
  cine: D('cine'),
  // Charlas y lectura
  charla: D('literatura_charlas'),
  qa: D('literatura_charlas'),
  'encuentro-de-ciencia': D('literatura_charlas'),
  'sala-de-lectura': D('literatura_charlas'),
  // Exposiciones y artes visuales
  exposicion: D('museos_exposiciones'),
  muestra: D('museos_exposiciones'),
  'artes-visuales': D('fotografia_artes_visuales'),
  instalacion: D('fotografia_artes_visuales'),
  'talleres-de-artes-visuales': D('fotografia_artes_visuales', ['taller']),
  // Visitas guiadas al edificio histórico (ex usina eléctrica de la CIAE)
  'visita-guiada': D('historia_patrimonio'),
  'visita-guiada-para-adultos': D('historia_patrimonio'),
  'visita-guiada-para-ninos': D('historia_patrimonio', ['infantil']),
  // Culturales sin disciplina clara
  show: D('otros'),
  experiencia: D('otros'),
  'experiencia-inmersiva': D('otros'),
  evento: D('otros'),
  concurso: D('otros'),
  'espacio-ludico': D('otros', ['infantil']),
  'sala-de-escape': D('otros'),
  photowall: D('otros'),
  'pre-escucha-del-disco': D('otros'),
  'producion-especial': D('otros'),
  workshop: D('otros', ['taller']),
  'talleres-artisticos': D('otros', ['taller']),
  'talleres-creativos': D('otros', ['taller']),
  'talleres-de-artesanias': D('otros', ['taller']),
  'talleres-de-artesanias-coreanas': D('otros', ['taller']),
  'taller-de-juegologia': D('otros', ['taller', 'infantil']),
  'taller-para-bebes': D('otros', ['taller', 'infantil']),
  'raices-en-movimiento-clase-abierta': D('otros'),
  'raices-en-movimiento-muestra': D('otros'),
  'raices-en-movimiento-seminario': D('otros'),
  'raices-en-movimiento-taller': D('otros', ['taller']),
  // Etiquetas de temporada u ocasión
  'vacaciones-de-invierno': D('label'),
  'dia-del-nino-en-usina': D('label', ['infantil']),
  // No culturales
  'feria-gastronomica': D('non_cultural'),
  'patio-gastronomico': D('non_cultural'),
};

export interface TipoTerm {
  slug: string;
  name: string;
}

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  tags: string[];
  warnings: string[];
}

export function disciplinesFor(tipos: readonly TipoTerm[]): DisciplineMapping {
  const disciplines: DisciplineSlug[] = [];
  const tags: string[] = [];
  const warnings: string[] = [];
  let cultural = false;

  for (const tipo of tipos) {
    const name = htmlToText(tipo.name).trim();
    if (name) tags.push(name);
    const rule = TIPO_RULES[tipo.slug];
    if (!rule) {
      warnings.push(`tipo de actividad sin mapeo: '${name}' (${tipo.slug}) → otros`);
      disciplines.push('otros');
      cultural = true;
      continue;
    }
    if (rule.tags) tags.push(...rule.tags);
    if (rule.rule === 'non_cultural') continue;
    cultural = true;
    if (rule.rule !== 'label') disciplines.push(rule.rule);
  }

  const real = disciplines.filter((d) => d !== 'otros');
  const result: DisciplineSlug[] = real.length > 0 ? real : cultural ? ['otros'] : [];
  if (tipos.length === 0) warnings.push('sin tipo de actividad: el evento queda candidato');
  else if (result.length === 0) warnings.push('solo tipos no culturales: sin disciplina');
  return { disciplines: [...new Set(result)], tags: [...new Set(tags)], warnings };
}
