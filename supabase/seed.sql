-- Reference data. Idempotent: safe to re-run.
--
-- Venue addresses: Teatro Colón's was verified on 2026-10-14 against the footer of
-- teatrocolon.org.ar ("Cerrito 628, Ciudad Autónoma de Buenos Aires"). MNBA and
-- Palacio Libertad sit behind an interactive Cloudflare challenge, so their widely
-- published addresses stay with address_verified_at NULL until someone confirms them.

insert into public.disciplines (slug, label_es, short_label_es, selectable, sort_order, fallback_image_key) values
  ('opera_clasica',             'Ópera y música clásica',      'Ópera y clásica', true,  10,  'opera_clasica'),
  ('teatro_escenicas',          'Teatro y artes escénicas',    'Teatro',          true,  20,  'teatro_escenicas'),
  ('museos_exposiciones',       'Museos y exposiciones',       'Museos',          true,  30,  'museos_exposiciones'),
  ('musica_vivo_jazz',          'Música en vivo y jazz',       'Música en vivo',  true,  40,  'musica_vivo_jazz'),
  ('cine',                      'Cine',                        'Cine',            true,  50,  'cine'),
  ('danza',                     'Danza',                       'Danza',           true,  60,  'danza'),
  ('literatura_charlas',        'Literatura y charlas',        'Literatura',      true,  70,  'literatura_charlas'),
  ('fotografia_artes_visuales', 'Fotografía y artes visuales', 'Artes visuales',  true,  80,  'fotografia_artes_visuales'),
  ('historia_patrimonio',       'Historia y patrimonio',       'Patrimonio',      true,  90,  'historia_patrimonio'),
  ('otros',                     'Otros',                       'Otros',           false, 999, 'otros')
on conflict (slug) do update set
  label_es = excluded.label_es,
  short_label_es = excluded.short_label_es,
  selectable = excluded.selectable,
  sort_order = excluded.sort_order,
  fallback_image_key = excluded.fallback_image_key;

insert into public.institutions (slug, name, website_url) values
  ('teatro-colon',     'Teatro Colón',                    'https://teatrocolon.org.ar'),
  ('mnba',             'Museo Nacional de Bellas Artes',  'https://bellasartes.gob.ar'),
  ('palacio-libertad', 'Palacio Libertad',                'https://palaciolibertad.gob.ar'),
  ('complejo-teatral', 'Complejo Teatral de Buenos Aires', 'https://complejoteatral.gob.ar')
on conflict (slug) do update set name = excluded.name, website_url = excluded.website_url;

insert into public.venues (slug, institution_id, name, address, neighborhood, city, address_source_url, address_verified_at) values
  ('teatro-colon',
    (select id from public.institutions where slug = 'teatro-colon'),
    'Teatro Colón', 'Cerrito 628', 'San Nicolás', 'CABA', 'https://teatrocolon.org.ar/', '2026-10-14T12:00:00-03:00'),
  ('mnba',
    (select id from public.institutions where slug = 'mnba'),
    'Museo Nacional de Bellas Artes', 'Av. del Libertador 1473', 'Recoleta', 'CABA', 'https://bellasartes.gob.ar', null),
  ('palacio-libertad',
    (select id from public.institutions where slug = 'palacio-libertad'),
    'Palacio Libertad', 'Sarmiento 151', 'San Nicolás', 'CABA', 'https://palaciolibertad.gob.ar', null)
on conflict (slug) do update set
  institution_id = excluded.institution_id,
  name = excluded.name,
  address = excluded.address,
  neighborhood = excluded.neighborhood,
  address_source_url = excluded.address_source_url,
  address_verified_at = excluded.address_verified_at;

-- `kind` is the working hypothesis until the source research confirms the best
-- extraction method; the connector reports the real one on each run.
insert into public.sources (slug, name, institution_id, base_url, kind, priority) values
  ('teatro-colon',     'Agenda Teatro Colón',
    (select id from public.institutions where slug = 'teatro-colon'),
    'https://teatrocolon.org.ar/calendario/', 'html', 100),
  ('mnba',             'Agenda Museo Nacional de Bellas Artes',
    (select id from public.institutions where slug = 'mnba'),
    'https://bellasartes.gob.ar/agenda/', 'html', 100),
  ('palacio-libertad', 'Agenda Palacio Libertad',
    (select id from public.institutions where slug = 'palacio-libertad'),
    'https://palaciolibertad.gob.ar/agenda/', 'html', 100),
  ('complejo-teatral', 'Programación Complejo Teatral de Buenos Aires',
    (select id from public.institutions where slug = 'complejo-teatral'),
    'https://complejoteatral.gob.ar/', 'html', 100),
  -- Agregador oficial de la Ciudad (Linda): prioridad baja, la institución sale de cada evento.
  ('agenda-ba', 'Agenda oficial de la Ciudad (Linda)', null,
    'https://linda.buenosaires.gob.ar/', 'json_api', 10)
on conflict (slug) do update set
  name = excluded.name,
  institution_id = excluded.institution_id,
  base_url = excluded.base_url,
  priority = excluded.priority;

-- La API de Linda devuelve conjuntos algo distintos entre llamadas: exigir 3 ausencias.
update public.sources set config = config || '{"missThreshold": 3}'::jsonb where slug = 'agenda-ba';

-- Usina del Arte (docs/research/usina-del-arte.md). Dirección verificada el 18-oct-2026 en
-- usinadelarte.ar/contacto/ y en el bloque "Dirección" de cada actividad: "Agustín R.
-- Caffarena 1, C1157 Cdad. Autónoma de Buenos Aires". El sitio no publica barrio ni
-- coordenadas: quedan en NULL. Si Linda ya creó la sede con su slug derivado, se la adopta.
insert into public.institutions (slug, name, website_url) values
  ('usina-del-arte', 'Usina del Arte', 'https://usinadelarte.ar')
on conflict (slug) do update set name = excluded.name, website_url = excluded.website_url;
update public.venues set slug = 'usina-del-arte'
  where slug = 'usina-del-arte-usina-del-arte'
    and not exists (select 1 from public.venues where slug = 'usina-del-arte');
insert into public.venues (slug, institution_id, name, address, neighborhood, city, address_source_url, address_verified_at) values
  ('usina-del-arte',
    (select id from public.institutions where slug = 'usina-del-arte'),
    'Usina del Arte', 'Agustín R. Caffarena 1', null, 'CABA', 'https://usinadelarte.ar/contacto/', '2026-10-18T12:00:00-03:00')
on conflict (slug) do update set
  institution_id = excluded.institution_id,
  name = excluded.name,
  address = excluded.address,
  address_source_url = excluded.address_source_url,
  address_verified_at = excluded.address_verified_at;
insert into public.sources (slug, name, institution_id, base_url, kind, priority) values
  ('usina-del-arte', 'Programación Usina del Arte',
    (select id from public.institutions where slug = 'usina-del-arte'),
    'https://usinadelarte.ar/', 'json_api', 100)
on conflict (slug) do update set
  name = excluded.name,
  institution_id = excluded.institution_id,
  base_url = excluded.base_url,
  priority = excluded.priority;
