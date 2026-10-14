# Inventario de fuentes

> **Estado de verificación (14-oct-2026, relevamiento en vivo).** Cuatro agentes
> relevaron las fuentes con el protocolo de abajo, respetando robots.txt, con un
> User-Agent identificable, ≥ 1,5 s entre peticiones y sin eludir ninguna protección.
> Los informes completos, con selectores y ejemplos literales, están en
> `docs/research/*.md`; las capturas crudas, en `packages/ingestion/fixtures/<slug>/2026-10-14/`.
> Lo que sigue son **hechos comprobados** salvo donde se marca *hipótesis*.

## Tabla resumen

| Fuente (`slug`) | Institución | URL oficial | Acceso | Método | Peticiones/corrida | Prioridad | Conector |
|---|---|---|---|---|---|---|---|
| `teatro-colon` | Teatro Colón | https://teatrocolon.org.ar/calendario/ | 200 (Cloudflare CDN, sin challenge) | HTML server-side (`cheerio`) | ~3 listados mensuales + ~30 detalles | 100 | en implementación |
| `complejo-teatral` | Complejo Teatral de Buenos Aires | https://complejoteatral.gob.ar/ | 200 (Cloudflare CDN, sin challenge) | HTML server-side + agenda diaria `/agenda/?fecha=` | 1 home + 28 días + ~33 detalles ≈ 62 | 100 | en implementación |
| `agenda-ba` | Agregador oficial de la Ciudad (**Linda**) | https://linda.buenosaires.gob.ar/ | 200 (sin Cloudflare) | **API JSON** `/api/frontend/events/filter?limit=200` | 1–2 | 10 | en implementación |
| `mnba` | Museo Nacional de Bellas Artes | https://bellasartes.gob.ar/agenda/ | **403 Cloudflare managed challenge (Turnstile interactivo) en toda la zona** | — | — | 100 | **bloqueado** |
| `palacio-libertad` | Palacio Libertad | https://palaciolibertad.gob.ar/agenda/ | **403 challenge en toda la zona (incluso robots.txt)** | — | — | 100 | **bloqueado** |
| `cultura-gob-ar` | Agenda Cultural Federal | https://www.cultura.gob.ar/agenda/filtro/ | **403 challenge**; `datos.cultura.gob.ar` también | — | — | complementaria | bloqueado |
| (futuro) `argentina-gob-ar-agenda` | Secretaría de Cultura de la Nación (serie semanal "Agenda de Cultura para el fin de semana") | https://www.argentina.gob.ar/cultura/noticias | 200 (Drupal 7, `Crawl-delay: 10`, honeypots `/cdn-cgi/content` que no hay que seguir) | HTML editorial | 1–2 listados + ~1 noticia/semana | 10 | no iniciado |

`priority` decide el merge editorial cuando dos fuentes describen el mismo evento:
institución (100) sobrescribe; agregador (10) solo rellena vacíos y aporta funciones.

## Hechos clave por fuente

### Teatro Colón — `teatro-colon` (`docs/research/teatro-colon.md`)
- WordPress (CPT `production`), Yoast sitemaps (`production-sitemap.xml` con `lastmod`,
  595 producciones históricas). `robots.txt`: todo permitido, sin `Crawl-delay`.
- REST `/wp-json/wp/v2/productions` existe (598 ítems, `class_list` con `places-*` y
  `production-category-*`) pero **sin funciones** (`acf: []`). El único XHR del
  calendario (`admin-ajax.php?action=mobile-calendar`) devuelve solo la grilla de días.
- **Listado**: `/calendario/?a=YYYY&mes=M`, una fila por función (`div.calendar-item`:
  `.day-number` "14.", `.day-hour` "mié_17.30 hs", título, categoría —que *no* es la
  sala—, botón `+ info` con la URL de detalle). El mes corriente solo lista desde hoy.
- **Detalle** `/produccion/<slug>/`: todas las funciones en `section.dates .day`
  (`"viernes 09/10, 20:00 hs"`, sin año → tomarlo del listado/secuencia de meses),
  estado por clases (`inactive` pasada, `coming_soon` aún no a la venta, `sold_out`
  agotada definida en CSS), botón "Gratuita" ⇒ gratis, sala en `h4#the_place`
  (`Sala principal`, `Salón Dorado`, `CETC`, `Plaza Vaticano y Teatro Colón`, o vacío),
  imagen `img[itemprop=image]` sin crédito. Microdatos `startDate/endDate` **no fiables**.
- **Sin precios** en ninguna página. Cancelación/reprogramación: sin marcador (solo
  desaparición). Direcciones publicadas: Cerrito 628 (footer), CETC Viamonte 1168,
  Colón Fábrica Av. Pedro de Mendoza 2163 (La Boca).
- Categorías del sitio (51) → `opera_clasica` (ópera, conciertos, cámara, OFBA/OETC,
  Mozarteum, Aura, GI, Clásica Joven…), `danza` (ballet), `musica_vivo_jazz` (jazz,
  tango), `cine` (cine-documental, música y cine), `otros` (talleres, escuelas…),
  "Colón para niños" como etiqueta infantil.

### Complejo Teatral de Buenos Aires — `complejo-teatral` (`docs/research/complejo-teatral.md`)
- WordPress 7.1 tema propio (migrado de Laravel); CPT `produccion` **no expuesto** en
  REST; RSS `/feed/?post_type=produccion` sin fechas; `robots.txt` permite todo lo usado.
- **Listado**: home `div.list-item[id=<postId>]` (33 producciones vigentes) con texto
  de funciones, `sala / teatro`, entradas y URL de detalle. **`/agenda/?fecha=DD-MM-YYYY`**
  (equivalente GET del `admin-ajax` `filtrar_producciones`) devuelve qué producciones
  tienen función ese día: es la única forma estructurada de obtener los *días*.
- **Detalle** `/produccion/<slug>/`: `.info` con `Funciones:`, `Duración:`, `Valor de las
  localidades:` ("Entrada gratuita" o importes), `Dónde:` (teatro + sala) y
  **`li.address` con la dirección publicada** (p. ej. Av. Corrientes 1530); crédito de
  foto a veces (`.cover_credits`); avisos en rojo ("no habrá funciones" ciertos días).
- **Horarios solo en texto libre**, en tres formas: patrón semanal ("Jueves a domingos,
  20 horas", "Miércoles a sábados, 20.30 horas. Domingos, 19.30 horas"), fechas
  enumeradas ("Viernes 16, sábado 17 y domingo 18 de octubre, 20 horas", "Jueves 29 de
  octubre, 16.30 y 20.30 horas") y rangos de muestras/ciclos ("Del 15 de septiembre al
  28 de noviembre, de lunes a sábados de 11 a 20 horas", "Marzo a noviembre").
- Regla del conector: **los días salen de la agenda diaria del sitio; la hora, del
  texto para ese día de semana; sin hora para ese día ⇒ no se emite la función.**
  Muestras ⇒ `range`. Sin dirección publicada ⇒ queda candidato (correcto).

### Agenda oficial de la Ciudad (Linda) — `agenda-ba` (`docs/research/agenda-ba.md`)
- `buenosaires.gob.ar/agenda` redirige a **Linda** (Next.js sobre Drupal), sin Cloudflare,
  sin `robots.txt`. `GET /api/frontend/events/filter?limit=200` → ~268 eventos de decenas
  de instituciones: `id` UUID estable, `slug`, título, descripción (HTML), imagen,
  `acceso` (`sin_costo`), `botonesSidebar` (enlaces a ticketeras e **URLs institucionales**,
  p. ej. `teatrocolon.org.ar/produccion/<slug>/`, útiles para dedup), `ubicacion`
  (título, dirección, lat/lng), `fechasDelEvento` (instantes; incluye pasadas; muestras
  con decenas de instantes y horas mezcladas), `etiquetas`, `tipoEvento` (nulo en 45 %).
- Limitaciones: `limit/page` no paginan de verdad y el conjunto varía entre llamadas
  (⇒ `missThreshold = 3`), sin estado estructurado, textos a veces desactualizados,
  disciplinas requieren heurísticas (`otros` de escape), direcciones inconsistentes.
- `turismo.buenosaires.gob.ar` ("Qué hacer esta semana", `/es/eventos`): JSON inline
  editorial, sin ids; `Crawl-delay: 10`. `data.buenosaires.gob.ar`: su `robots.txt`
  prohíbe `/api/` (no se usa). Complementario, no prioritario.

### MNBA, Palacio Libertad y cultura.gob.ar (`docs/research/gob-ar-alternatives.md`)
- Los tres hosts devuelven **`cf-mitigated: challenge`** en HTML y no-HTML (`/feed/`,
  `/wp-json/`, `/sitemap.xml`, `/api`); con Chromium real y 12 s de espera el challenge
  **no se resuelve solo** (Turnstile interactivo). `www.bellasartes.gob.ar`: igual;
  `mnba.gob.ar`: redirige; `datos.cultura.gob.ar`: challenge; `datos.gob.ar`: sin
  datasets de agenda. **No hay espejo oficial sin challenge.** No se intentó eludirlo.
- El challenge es de zona completa y probablemente dependa de la IP de egreso
  (datacenter); un VPS puede recibir lo mismo; una IP residencial podría pasar, sin garantía.
- Caminos operativos: (a) fixtures capturados por una persona desde su navegador
  (manifest + HTML en `fixtures/<slug>/<fecha>/`) y parser sobre ellos; (b) correr el
  conector desde un equipo propio; (c) cobertura parcial vía la serie semanal oficial
  de `www.argentina.gob.ar/cultura/noticias` ("Agenda de Cultura para el fin de
  semana": ítems con día, horario, venue y dirección; selección editorial nacional,
  formato frágil) y vía **Linda**, que incluye eventos de estas instituciones.

## Protocolo de relevamiento (para fuentes nuevas)

1. `robots.txt` y sitemaps; respetar `Crawl-delay` y rutas prohibidas.
2. Detectar CMS/API: cabeceras, `/wp-json/`, `/wp-json/tribe/events/v1/events`,
   `/jsonapi`, `/feed/`, `/api/...`.
3. ¿Listado server-side o por JS? Si es JS, Playwright capturando XHR/fetch para hallar
   el JSON real.
4. Detalle: JSON-LD `Event`, microdatos, `og:*`, selectores de título/fechas/sala/
   precio/entradas/descripción/imagen/estado.
5. Ejemplos literales de fechas, ids estables, paginación, salas, categorías, términos
   de uso e imágenes.
6. Preferencia: API/JSON oficial → JSON-LD → RSS → HTML con `cheerio` → navegador
   (último recurso). Nunca eludir challenges, CAPTCHAs ni logins.
7. `pnpm ingest record --source <slug>` graba fixtures; tests con `FixtureHttpClient`.

## Cómo agregar un conector

1. `packages/ingestion/src/connectors/<slug>/connector.ts` implementando
   `SourceConnector` (`discover`/`enrich` con IO; `parse` puro). Plantilla: `sample/`.
2. Mapeos propios de salas → `VenueRef` y categorías → disciplinas; fechas con los
   helpers de `@culturaba/shared` (`parseDateEs`, `parseDateRangeEs`, `parseTimeEs`,
   `detectStatusEs`, `detectFreeEs`, `baDateTime`, `rangeBounds`).
3. Para agregadores: `institutionSlug` por evento (+ `institutionName`/`institutionUrl`
   para que el pipeline cree la institución) y `priority` baja en `sources`.
4. Registrar en `connectors/index.ts` (`meta.ready: true`) y la fila en `supabase/seed.sql`.
5. Tests sobre fixtures con aserciones exactas; `run --from-fixture --dry-run`; una
   corrida en vivo `--dry-run --limit`.
