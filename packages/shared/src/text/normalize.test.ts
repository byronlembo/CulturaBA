import {
  cleanDescription,
  dedupKey,
  descriptionPreview,
  diceCoefficient,
  eventSlug,
  firstParagraph,
  htmlToText,
  normalizeTitle,
  slugify,
  stripDiacritics,
  titleOverlap,
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

describe('titleOverlap', () => {
  it('is 1 when the shorter title is contained in the longer one', () => {
    expect(
      titleOverlap('Ludo-Espacio', 'Un plan para jugar en familia: llega el Ludo-Espacio'),
    ).toBe(1);
    expect(
      titleOverlap(
        'Día de la familia: taller de modelado',
        'Día de la familia: taller de modelado – Nos acompaña CHILAVERT',
      ),
    ).toBe(1);
  });

  it('counts content words only (Linda and the institution title the same show)', () => {
    expect(
      titleOverlap(
        'Mery Granados y Joaco Burgos le cantan a Charly',
        'Mery Granados y Joaco Burgos: una noche para Charly',
      ),
    ).toBeCloseTo(5 / 6);
  });

  it('stays low for different programmes and ignores one-word titles', () => {
    expect(titleOverlap("Les Contes d'Hoffmann", 'Los Cuentos de Hoffmann')).toBe(0.5);
    expect(titleOverlap('Clases de folklore', 'Clases de tango')).toBe(0.5);
    expect(titleOverlap('Pentagrama', 'Pentagrama: concierto de cierre')).toBe(0);
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

describe('cleanDescription', () => {
  it('saca la bajada de Linda cuando el cuerpo arranca con ella', () => {
    const lead = 'Seis largometrajes de la celebrada actriz neoyorquina.';
    expect(cleanDescription(`${lead}\n\n${lead}\nFunciones: Del 15 al 22 de octubre`)).toBe(
      `${lead}\nFunciones: Del 15 al 22 de octubre`,
    );
  });

  it('saca la entrada aunque el cuerpo la repita más abajo y con otras palabras alrededor', () => {
    expect(
      cleanDescription(
        'El Salón Dorado será escenario de Clics eternos.\n\nEl sábado 24, a las 19 h, el Salón Dorado será escenario de Clics eternos.',
      ),
    ).toBe('El sábado 24, a las 19 h, el Salón Dorado será escenario de Clics eternos.');
  });

  it('saca el título repetido arriba, también si aparece después de la entrada', () => {
    expect(
      cleanDescription('El cascanueces\nCoreografía: Silvia Bazilis', ['El Cascanueces']),
    ).toBe('Coreografía: Silvia Bazilis');
    expect(
      cleanDescription(
        'Un taller para mirar con atención.\n\nTrama\nUn taller para mirar con atención. Cupos limitados.',
        ['Trama'],
      ),
    ).toBe('Un taller para mirar con atención. Cupos limitados.');
  });

  it('deja las repeticiones de los programas y nunca deja el texto vacío', () => {
    const program =
      'Programación:\n17:30 h | Biblioteca\nDirección: Lavalleja 924, Ciudad Autónoma de Buenos Aires.\n19:00 h | Biblioteca\nDirección: Lavalleja 924, Ciudad Autónoma de Buenos Aires.';
    expect(cleanDescription(program, ['Festival'])).toBe(program);
    expect(cleanDescription('Trama', ['Trama'])).toBe('Trama');
  });
});

describe('descriptionPreview', () => {
  it('corta en líneas enteras pasado el mínimo y avisa que hay más', () => {
    const text = `${'a'.repeat(150)}\n${'b'.repeat(80)}\n${'c'.repeat(300)}`;
    expect(descriptionPreview(text)).toEqual({
      text: `${'a'.repeat(150)}\n${'b'.repeat(80)}`,
      more: true,
    });
  });

  it('muestra todo si el texto es corto o lo que sobra es poco', () => {
    expect(descriptionPreview('Una línea.')).toEqual({ text: 'Una línea.', more: false });
    const text = `${'a'.repeat(250)}\nCupos limitados.`;
    expect(descriptionPreview(text)).toEqual({ text, more: false });
  });
});
