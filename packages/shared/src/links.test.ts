import {
  buildEventDeepLink,
  buildEventUrl,
  buildMapUrl,
  buildShareMessage,
  canonicalUrl,
  isPageKey,
} from './links';

describe('event links', () => {
  it('builds stable web and deep links', () => {
    expect(buildEventUrl('https://culturaba.xn--lembodiseo-19a.com/', 'la-traviata-3f2504')).toBe(
      'https://culturaba.xn--lembodiseo-19a.com/event/la-traviata-3f2504',
    );
    expect(buildEventDeepLink('la-traviata-3f2504')).toBe('culturaba://event/la-traviata-3f2504');
  });
});

describe('buildMapUrl', () => {
  it('returns null without address or coordinates', () => {
    expect(buildMapUrl({ name: 'Teatro Colón' }, 'ios')).toBeNull();
  });

  it('uses the address when there are no coordinates', () => {
    expect(buildMapUrl({ name: 'Teatro Colón', address: 'Cerrito 628' }, 'android')).toBe(
      'geo:0,0?q=Teatro%20Col%C3%B3n%2C%20Cerrito%20628',
    );
    expect(buildMapUrl({ address: 'Cerrito 628' }, 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Cerrito%20628',
    );
    expect(buildMapUrl({ address: 'Cerrito 628' }, 'ios')).toBe('maps:0,0?q=Cerrito%20628');
  });

  it('prefers coordinates when present', () => {
    const target = { name: 'Teatro Colón', lat: -34.6011, lng: -58.3833 };
    expect(buildMapUrl(target, 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=-34.6011,-58.3833',
    );
    expect(buildMapUrl(target, 'ios')).toBe('maps:0,0?q=Teatro%20Col%C3%B3n&ll=-34.6011,-58.3833');
    expect(buildMapUrl(target, 'android')).toBe(
      'geo:-34.6011,-58.3833?q=-34.6011,-58.3833(Teatro%20Col%C3%B3n)',
    );
  });
});

describe('buildShareMessage', () => {
  it('includes title, details, app link and the official source', () => {
    expect(
      buildShareMessage({
        title: 'La Traviata',
        whenText: 'dom 18 oct · 20:00',
        venueName: 'Teatro Colón',
        eventUrl: 'https://culturaba.xn--lembodiseo-19a.com/event/la-traviata-3f2504',
        officialUrl: 'https://teatrocolon.org.ar/x',
      }),
    ).toBe(
      [
        'La Traviata',
        'dom 18 oct · 20:00 · Teatro Colón',
        'https://culturaba.xn--lembodiseo-19a.com/event/la-traviata-3f2504',
        'Fuente oficial: https://teatrocolon.org.ar/x',
      ].join('\n'),
    );
  });

  it('omits empty parts', () => {
    expect(buildShareMessage({ title: 'X', eventUrl: 'https://a/b' })).toBe('X\nhttps://a/b');
  });
});

describe('canonicalUrl', () => {
  it('ignores scheme, www, query, fragment, trailing slash and case', () => {
    const key = 'teatrocolon.org.ar/produccion/les-contes-dhoffmann';
    expect(canonicalUrl('https://teatrocolon.org.ar/produccion/les-contes-dhoffmann/')).toBe(key);
    expect(canonicalUrl('http://www.TeatroColon.org.ar/produccion/les-contes-dhoffmann')).toBe(key);
    expect(
      canonicalUrl(
        'https://teatrocolon.org.ar/produccion/les-contes-dhoffmann/?utm_source=x#fechas',
      ),
    ).toBe(key);
  });

  it('keeps distinct pages distinct', () => {
    expect(canonicalUrl('https://teatrocolon.org.ar/produccion/el-cascanueces/')).not.toBe(
      canonicalUrl('https://teatrocolon.org.ar/produccion/el-cascanueces-2/'),
    );
  });

  it('only treats keys with a path as pages', () => {
    expect(isPageKey(canonicalUrl('https://teatrocolon.org.ar/'))).toBe(false);
    expect(isPageKey(canonicalUrl('https://www.teatrocolon.org.ar'))).toBe(false);
    expect(isPageKey(canonicalUrl('https://teatrocolon.org.ar/produccion/x/'))).toBe(true);
  });
});
