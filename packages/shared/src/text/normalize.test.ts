import {
  dedupKey,
  diceCoefficient,
  eventSlug,
  firstParagraph,
  htmlToText,
  normalizeTitle,
  slugify,
  stripDiacritics,
} from './normalize';

describe('normalizeTitle', () => {
  it.each([
    ['¡La Traviata! (Temporada 2026)', 'traviata'],
    ['Les Contes d’Hoffmann', 'les contes d hoffmann'],
    ['El Lago de los Cisnes', 'lago de los cisnes'],
    ['Festival Chopiniana 2026', 'festival chopiniana'],
    ['Hoy Viñetas 2026', 'hoy vinetas'],
    ['Muestra: GOYA — Edición 12', 'muestra goya'],
    ['  Esenciales:   Charly sinfónico coral ', 'esenciales charly sinfonico coral'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it('keeps a year that is part of the title, not a trailing suffix', () => {
    expect(normalizeTitle('2001: Odisea del espacio')).toBe('2001 odisea del espacio');
  });
});

describe('dedupKey', () => {
  it('scopes by institution', () => {
    expect(dedupKey('La Traviata', 'teatro-colon')).toBe('traviata|teatro-colon');
    expect(dedupKey('la traviata', 'teatro-colon')).toBe(dedupKey('LA TRAVIATA', 'teatro-colon'));
    expect(dedupKey('La Traviata', 'teatro-colon')).not.toBe(dedupKey('La Traviata', 'mnba'));
  });
});

describe('slugify / eventSlug', () => {
  it('creates url-safe slugs', () => {
    expect(slugify('Les Contes d’Hoffmann')).toBe('les-contes-d-hoffmann');
    expect(slugify('¡Ñandú & Cía!')).toBe('nandu-cia');
    expect(slugify('')).toBe('evento');
  });

  it('truncates on a word boundary', () => {
    const long =
      'una obra con un título extraordinariamente largo que no cabe en sesenta caracteres de ninguna manera';
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });

  it('appends six hex chars of the id', () => {
    expect(eventSlug('La Traviata', '3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      'la-traviata-3f2504',
    );
  });
});

describe('diceCoefficient', () => {
  it('is 1 for equivalent titles and lower for different ones', () => {
    expect(diceCoefficient('La Traviata', 'la traviata (Temporada 2026)')).toBe(1);
    expect(diceCoefficient('La Traviata', 'Traviata, La')).toBeGreaterThan(0.6);
    expect(diceCoefficient('La Traviata', 'El Lago de los Cisnes')).toBeLessThan(0.3);
    expect(diceCoefficient('Goya', 'Rodin')).toBeLessThan(0.3);
  });

  it('separates near-duplicates from distinct programmes', () => {
    expect(diceCoefficient('Concierto Sinfónico N° 5', 'Concierto Sinfónico N° 6')).toBeGreaterThan(
      0.85,
    );
    expect(diceCoefficient('Visita guiada: Goya', 'Visita guiada: Rodin')).toBeLessThan(0.85);
  });
});

describe('htmlToText / firstParagraph', () => {
  it('strips tags and decodes entities', () => {
    const html =
      '<p>Ópera en <b>tres</b> actos.</p><p>Direcci&oacute;n: &quot;X&quot; &amp; Y &#8211; Z</p>';
    expect(htmlToText(html)).toBe('Ópera en tres actos.\nDirección: "X" & Y – Z');
  });

  it('returns the first paragraph, truncated on a word', () => {
    expect(firstParagraph('Primero.\n\nSegundo.')).toBe('Primero.');
    const long = 'palabra '.repeat(60).trim();
    const out = firstParagraph(long, 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
  });

  it('stripDiacritics folds ñ to n (NFD), consistently with normalizeTitle', () => {
    expect(stripDiacritics('Ñandú')).toBe('Nandu');
  });
});
