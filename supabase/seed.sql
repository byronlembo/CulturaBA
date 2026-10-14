-- Reference data. Idempotent: safe to re-run.
--
-- Addresses are widely published facts for these institutions but have NOT been
-- re-verified from this environment (network to the official sites was blocked
-- at seed time): address_verified_at stays NULL until step 0 of the roadmap
-- confirms them against address_source_url.

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

insert into public.venues (slug, institution_id, name, address, neighborhood, city, address_source_url) values
  ('teatro-colon',
    (select id from public.institutions where slug = 'teatro-colon'),
    'Teatro Colón', 'Cerrito 628', 'San Nicolás', 'CABA', 'https://teatrocolon.org.ar'),
  ('mnba',
    (select id from public.institutions where slug = 'mnba'),
    'Museo Nacional de Bellas Artes', 'Av. del Libertador 1473', 'Recoleta', 'CABA', 'https://bellasartes.gob.ar'),
  ('palacio-libertad',
    (select id from public.institutions where slug = 'palacio-libertad'),
    'Palacio Libertad', 'Sarmiento 151', 'San Nicolás', 'CABA', 'https://palaciolibertad.gob.ar')
on conflict (slug) do update set
  institution_id = excluded.institution_id,
  name = excluded.name,
  address = excluded.address,
  neighborhood = excluded.neighborhood,
  address_source_url = excluded.address_source_url;

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
    'https://complejoteatral.gob.ar/', 'html', 100)
on conflict (slug) do update set
  name = excluded.name,
  institution_id = excluded.institution_id,
  base_url = excluded.base_url,
  priority = excluded.priority;
