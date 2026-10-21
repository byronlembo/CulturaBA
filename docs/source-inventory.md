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
| `teatro-colon` | Teatro Colón | https://teatrocolon.org.ar/calendario/ | 200 (Cloudflare CDN, sin challenge) | HTML server-side (`cheerio`) | ~3 listados mensuales + ~30 detalles | 100 | **en producción** |
| `complejo-teatral` | Complejo Teatral de Buenos Aires | https://complejoteatral.gob.ar/ | 200 (Cloudflare CDN, sin challenge) | HTML server-side + agenda diaria `/agenda/?fecha=` | 1 home + 28 días + ~33 detalles ≈ 62 | 100 | ⏸ corregido el 16-oct; fuera del cron: el sitio responde 403 a los runners de GitHub (desde otras IPs funciona) |
| `agenda-ba` | Agregador oficial de la Ciudad (**Linda**) | https://linda.buenosaires.gob.ar/ | 200 (sin Cloudflare) | **API JSON** `/api/frontend/events/filter?limit=200` | 1–2 | 10 | **en producción** |
| `usina-del-arte` | Usina del Arte (Ciudad) | https://usinadelarte.ar/ | 200 (Hostinger, sin challenge; `robots.txt` vacío) | **REST WordPress** `wp/v2/actividad` + taxonomías; detalle HTML para fecha y hora de cada función | 4 páginas REST + 6 de taxonomías + ~20 detalles ≈ 30 | 100 | **en producción** (18-oct) |
| `teatro-cervantes` | Teatro Nacional Cervantes (Nación) | https://www.teatrocervantes.gob.ar/ | 200 (sin challenge) | **REST WordPress** `wp/v2/obra` + calendario mensual `/calendario/?mes=` + detalle HTML | 1 REST + 3 meses + ~5 detalles ≈ 10 | 100 | **en producción** (18-oct) |
| `museo-moderno` | Museo de Arte Moderno de Buenos Aires (Ciudad) | https://museomoderno.org/ | 200 (Cloudflare CDN, sin challenge; `robots.txt` sin `Crawl-delay`) | **REST WordPress** `wp/v2/agenda` (fechas en el texto) + listado y detalle de exposiciones | ~5 de descubrimiento + ~11 detalles ≈ 16 | 100 | **en producción** (18-oct) |
| `planetario` | Planetario Galileo Galilei (Ciudad) | https://planetario.buenosaires.gob.ar | 200 (Apache + F5, sin challenge; `robots.txt` Drupal por defecto, sin `Crawl-delay`) | HTML server-side (Drupal, sin API): listados `/encuentros-de-ciencia`, `/otras-actividades`, `/cursos`, `/agenda`, `/espectaculos-publico-general` + ficha | 5 listados + 6 fichas de espectáculos + ~5 fichas ≈ 17 | 100 | **en producción** (21-oct) |
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
- Regla del conector: **fechas enumeradas ⇒ funciones con la hora que las sigue; patrón
  semanal ⇒ solo dentro de una temporada publicada (inicio y fin, o "Hasta el X" como fin)
  y en los días que confirma la agenda diaria; sin temporada o sin hora para ese día ⇒ no
  se emite la función.** Grillas de cine en `.details` (día en negrita + "A las HH horas")
  ⇒ una función por línea. Avisos en rojo con fecha anulan solo las funciones de ese día
  (si dan otra hora, se retira la función por posible cambio de horario). Muestras ⇒
  `range`. Si fallan más de 2 días de la agenda, la corrida falla (no marca ausencias).
  Sin dirección publicada ⇒ queda candidato (correcto).

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

### Usina del Arte — `usina-del-arte` (`docs/research/usina-del-arte.md`)
- WordPress + Elementor en Hostinger; `robots.txt` vacío (todo permitido). REST
  `wp/v2/actividad` (356 actividades, `content` vacío) con taxonomías `funcion-fecha`
  ("25/10/2026"), `funcion-hora` (solo 7 actividades), `sala`, `estado`
  (`Pasadas`/`Programadas`, cargado a mano) y `tipo-de-actividad` (64 términos, mapeados
  a disciplinas con una tabla explícita).
- Las taxonomías son **conjuntos** por actividad: no dicen qué hora va con qué fecha. La
  verdad está en el detalle (`.function-item`, una fila por función con fecha y hora);
  sin filas, se combinan solo si no hay ambigüedad. Fecha sin hora → `range` de un día.
- Dirección publicada en `/contacto/` y en cada detalle (Agustín R. Caffarena 1); sin
  barrio ni coordenadas. La sala va como `room`.
- Linda enlaza la ficha de algunas actividades ("Entradas") → `sameAsUrls` y misma
  institución. A veces enlaza un slug viejo que redirige: ahí solo funde por título y fecha.

### Teatro Nacional Cervantes — `teatro-cervantes` (`docs/research/teatro-cervantes.md`)
- WordPress. REST `wp/v2/obra` con `fecha_estreno` / `ultima_funcion` ("29/10/2026") y
  categorías de contexto (no de género). Giras ("En el país"), Tecnópolis y Cervantes
  Online quedan fuera (el catálogo es CABA).
- **Calendario mensual** `/calendario/?mes=MM&a=AAAA`: una fila por función con día y
  hora; respeta feriados. Es la fuente principal; se leen el mes actual y los dos
  siguientes (si falla un mes, falla la corrida). Puede estar incompleto (*El
  movimiento* no figura).
- Si una obra no está en el calendario, se lee el texto del detalle: fechas enumeradas
  con su hora, o patrón semanal **solo dentro de la temporada publicada**. Cualquier
  frase dudosa ("Excepto…", "luego de vacaciones") anula las funciones del texto y queda
  un `range` con el texto literal.
- Dirección Libertad 815 (publicada en `/contacto/`); las salas María Guerrero, Orestes
  Caviglia y Luisa Vehil van como `room`. Precio solo donde lo dice ("$15.000",
  "Entradas gratuitas"). Linda no publicaba eventos del Cervantes al 18-oct.

### Museo Moderno — `museo-moderno` (`docs/research/museo-moderno.md`)
- WordPress + Elementor/JetEngine + WPML (se descartan los duplicados en inglés).
  `wp/v2/agenda` (104 ítems) **no tiene fechas estructuradas**: se leen las líneas que
  empiezan con fecha ("Miércoles 28 de octubre, a las 17 h", "Sábado 3, 17 y 24 y
  domingo 4… de octubre, de 15 a 17 h") y el lugar, precio e inscripción del bloque que
  sigue. Año: lo fija el día de la semana; si no hay, la fecha de publicación (≤ 6 meses
  adelante). Fecha sin hora → `range` de un día con el texto literal. Módulos virtuales,
  fuera.
- Exposiciones: la REST no expone sus fechas (campos de JetEngine); salen de
  "Inicio/Fin" del detalle y "Hasta el …" del listado "Presentes". 9 de 11 publican solo
  el mes de inicio: el rango arranca hoy (no se inventa el día de apertura).
- Talleres publicados solo como patrón ("Todos los miércoles…") no dan fechas: los
  cubre Linda. Disciplinas por palabras clave del título y resumen (sin categorías).
- Dirección Av. San Juan 350, San Telmo (`/planea-tu-visita/`). Linda enlaza la ficha de
  algunas actividades ("Inscribite acá") → misma institución y `sameAsUrls`; el resto se
  funde por título.

### Planetario Galileo Galilei — `planetario` (`docs/research/planetario.md`)
- Drupal sin API (`/jsonapi` y `/wp-json` 404; `/rss.xml` con 3 nodos viejos). Cada actividad es un
  nodo `evento` con campos fijos: "¿Cuándo?" (texto libre), Precio, Lugar, Destinatarios, enlace de
  entradas; `rel=shortlink` = `/node/<id>`. Primera fuente de la disciplina `ciencia`.
- `/encuentros-de-ciencia` (129 tarjetas desde 2018) y `/otras-actividades` (250) **acumulan años**:
  una tarjeta se emite solo si alguna fecha cae desde hoy − 7 días. Las fechas casi nunca traen año: lo
  decide el día de semana dentro de [hoy − 7 días, hoy + 12 meses], y como el día de semana se repite
  cada 5–6 años ("Jueves 18 de marzo" de 2021 vuelve a ser jueves en 2027) la fecha inferida además
  tiene que caer cerca del mes de carga de la imagen (`/sites/default/files/AAAA-MM/`). Sin año ni
  día de semana → ambigua, se omite con aviso.
- `/cursos` publica temporada ("Inicio…" / "Última clase…") → un `range` con el horario literal.
  `/agenda` → solo las líneas fechadas con enlace; las funciones del domo, el museo y los telescopios
  son patrones semanales sin temporada (no se emiten; Linda trae las del domo).
- Dirección "Av. Sarmiento s/n, 1425 CABA" (pie y `/encontranos`, Palermo), sin coordenadas; la sala
  ("Sala de Espectáculos", "Domo") va como `room`. Precio solo del campo Precio ("Gratis", "Sin costo",
  "Libre y por orden de llegada", "$ 1.500.-", "Actividad arancelada").

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

## Relevamiento del 18-oct-2026 (fuentes nuevas)

Sondeo HTTP desde el entorno de desarrollo (sin challenge salvo donde se indica):

| Sitio | Resultado | Decisión |
|---|---|---|
| usinadelarte.ar (Usina del Arte, Ciudad) | WordPress; REST `wp/v2/actividad` con taxonomías `funcion-fecha`, `funcion-hora`, `sala`, `estado`, `tipo-de-actividad` | conector `usina-del-arte` |
| teatrocervantes.gob.ar (Teatro Nacional Cervantes) | WordPress; REST `wp/v2/obra` con `fecha_estreno` / `ultima_funcion`; horarios en el detalle | conector `teatro-cervantes` |
| museomoderno.org (Museo Moderno, Ciudad) | WordPress + WPML; REST `wp/v2/agenda` y `wp/v2/exposiciones`; fechas en el texto | conector `museo-moderno` |
| elculturalsanmartin.org | El dominio sirve spam de apuestas en turco: **no es el sitio oficial** del Centro Cultural San Martín | descartado (lo cubre Linda) |
| malba.org.ar | WordPress con REST cerrada (401) | pendiente: relevar HTML |
| proa.org | Sin API (HTML propio) | pendiente: relevar HTML |
| planetario.buenosaires.gob.ar (Planetario, Ciudad) | Drupal sin API (HTML propio) | conector `planetario` (21-oct) |
| cckonex.org, teatrocoliseo.org.ar, museoevita.org.ar | WordPress sin tipo de evento expuesto | pendiente |
| centroculturalrecoleta.org, bn.gob.ar, centroculturalborges.org.ar | Sin respuesta desde el entorno (bloqueo de red) | pendiente; Recoleta llega por Linda |

## Relevamiento del 21-oct-2026 (divulgación científica)

Nueva disciplina elegible `ciencia` ("Ciencia y divulgación"). Linda la asigna a todo lo
del Planetario, el Museo Participativo de Ciencias y el C3, y la suma por título con
palabras inequívocas (ciencia —no "ciencia ficción"—, científico, neurociencia,
astronomía, paleontología, dinosaurios, divulgación). Al 21-oct: 9 eventos publicados.

| Sitio | Resultado | Decisión |
|---|---|---|
| planetario.buenosaires.gob.ar (Planetario Galileo Galilei, Ciudad) | Drupal, HTML server-side; `/encuentros-de-ciencia` con charlas fechadas (sin año: lo fija el día de la semana) y `/agenda` con especiales fechados y funciones del domo semanales **sin temporada** | conector `planetario` (las funciones semanales sin temporada no se emiten) |
| macnconicet.gob.ar (Museo Argentino de Ciencias Naturales, CONICET) | **Sitio secuestrado**: sirve spam de apuestas en indonesio ("KENZO188 … Link Slot Gacor") en la home y en `/wp-json/` | descartado; avisar al museo |
| ccciencia.gob.ar (Centro Cultural de la Ciencia, C3, Nación) | Sin respuesta desde el entorno de desarrollo | pendiente: probar desde los runners de GitHub |
| exactas.uba.ar/popularizacion | Programas (Semanas de las Ciencias, Ciencia en Marcha) sin agenda fechada; la REST solo tiene noticias | no por ahora |
| mpc.org.ar (Museo Participativo de Ciencias) | WordPress con salas y kits, sin eventos | no (horario fijo; Linda lo cubre si publica algo) |
| conicet.gov.ar | REST cerrada (401); agenda nacional | no |

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
