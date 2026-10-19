/**
 * Normalización de texto para dedup y slugs. Sin dependencias, determinista,
 * válida en Node y en Hermes.
 */

export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const LEADING_ARTICLES = /^(?:el|la|los|las|un|una|unos|unas|the)\s+/;
const TRAILING_EDITION =
  /\s+(?:temporada|edicion|ed\.?|ciclo|version|vol\.?|volumen)\s*(?:n[°º.]?\s*)?\d+\s*$/;
const TRAILING_YEAR = /\s+(?:19|20)\d{2}\s*$/;

/**
 * "¡La Traviata! (Temporada 2026)" → "traviata"
 * Minúsculas, sin acentos ni puntuación, sin artículo inicial, sin sufijo de
 * temporada/edición/año. Base del `dedup_key`.
 */
export function normalizeTitle(title: string): string {
  let t = stripDiacritics(title).toLowerCase();
  t = t
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(LEADING_ARTICLES, '');
  let previous = '';
  while (previous !== t) {
    previous = t;
    t = t.replace(TRAILING_EDITION, '').replace(TRAILING_YEAR, '').trim();
  }
  return t;
}

/** Clave de dedup dentro de una institución. */
export function dedupKey(title: string, institutionSlug: string): string {
  return `${normalizeTitle(title)}|${institutionSlug}`;
}

export function slugify(text: string, maxLength = 60): string {
  const base = stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= maxLength) return base || 'evento';
  const cut = base.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut) || 'evento';
}

/** Slug estable de evento: slugify(título) + 6 hex del uuid. Nunca se rota. */
export function eventSlug(title: string, id: string): string {
  const suffix = id.replace(/-/g, '').slice(0, 6).toLowerCase();
  return `${slugify(title)}-${suffix}`;
}

function bigrams(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const s = text.replace(/\s+/g, ' ');
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/**
 * Coeficiente de Sørensen–Dice sobre bigramas de los títulos normalizados.
 * 1 = idénticos, 0 = nada en común. Usado por el matcher fuzzy.
 */
export function diceCoefficient(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const [g, n] of ga) {
    totalA += n;
    const m = gb.get(g);
    if (m) overlap += Math.min(n, m);
  }
  for (const n of gb.values()) totalB += n;
  return (2 * overlap) / (totalA + totalB);
}

const TITLE_STOPWORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'que',
  'se',
  'su',
  'sus',
  'un',
  'una',
  'unas',
  'unos',
  'y',
]);

/** Palabras con contenido de un título normalizado: sin artículos, preposiciones ni letras sueltas. */
export function titleWords(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w));
}

/**
 * Qué parte de las palabras del título más corto está en el otro (coeficiente de
 * solapamiento): "Ludo-Espacio" y "Un plan para jugar en familia: llega el Ludo-Espacio"
 * dan 1. Da 0 si el más corto tiene menos de 2 palabras: una sola no identifica un evento.
 */
export function titleOverlap(a: string, b: string): number {
  const wa = new Set(titleWords(a));
  const wb = new Set(titleWords(b));
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (small.size < 2) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared += 1;
  return shared / small.size;
}

/** Texto plano desde HTML simple: quita etiquetas, decodifica entidades comunes, colapsa espacios. */
export function htmlToText(html: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ntilde;': 'ñ',
    '&Ntilde;': 'Ñ',
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Oacute;': 'Ó',
    '&Uacute;': 'Ú',
    '&uuml;': 'ü',
  };
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&[a-zA-Z]+;/g, (m) => entities[m] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Clave para comparar textos: sin acentos, minúsculas y solo letras y números. */
function textKey(text: string): string {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Saca del texto de una fuente lo que se repite, sin cambiar ninguna palabra:
 *  · líneas iniciales iguales al título o al subtítulo (ya se muestran arriba);
 *  · la entrada (primer párrafo, o primera línea si no hay párrafos) cuando el resto del
 *    texto la vuelve a decir entera: Linda publica la bajada y después el cuerpo, que
 *    arranca con la misma bajada o la repite más abajo.
 * El resto queda igual: en los programas se repiten a propósito direcciones y horarios.
 */
export function cleanDescription(
  text: string,
  headings: (string | null | undefined)[] = [],
): string {
  const skip = new Set(headings.filter((h): h is string => Boolean(h)).map(textKey));
  let body = text.trim();
  // Después de sacar la entrada puede quedar el título arriba (y al revés): hasta que no cambie.
  for (let previous = ''; previous !== body; ) {
    previous = body;
    const lines = body.split('\n');
    while (lines.length > 1 && skip.has(textKey(lines[0] ?? ''))) lines.shift();
    body = lines.join('\n').trim();
    for (const cut of [body.search(/\n\s*\n/), body.indexOf('\n')]) {
      const lead = cut > 0 ? textKey(body.slice(0, cut)) : '';
      if (lead.length >= 20 && textKey(body.slice(cut)).includes(lead)) {
        body = body.slice(cut).trim();
        break;
      }
    }
  }
  return body;
}

/**
 * Comienzo de una descripción larga para mostrar con "Leer más": líneas enteras hasta pasar
 * `min` caracteres. `more` es false si el texto ya es corto y no hace falta cortar.
 */
export function descriptionPreview(text: string, min = 200): { text: string; more: boolean } {
  const lines = text.trim().split('\n');
  let end = 0;
  let length = 0;
  while (end < lines.length && length < min) length += (lines[end++] ?? '').length + 1;
  const rest = lines.slice(end).join('\n').trim();
  // Si lo que queda es poco, se muestra todo de una.
  if (rest.length < min / 2) return { text: text.trim(), more: false };
  return { text: lines.slice(0, end).join('\n').trim(), more: true };
}

/** Primer párrafo (hasta ~N caracteres) para usar como descripción breve. */
export function firstParagraph(text: string, maxLength = 280): string {
  const para =
    text
      .split(/\n+/)
      .map((p) => p.trim())
      .find((p) => p.length > 0) ?? '';
  if (para.length <= maxLength) return para;
  const cut = para.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
