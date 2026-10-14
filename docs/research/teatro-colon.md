# Relevamiento: Teatro Colón (`teatro-colon`)

- **Fecha:** 2026-10-14 (16:21–16:45 UTC). **Peticiones totales:** 38 con curl + 14 reales con Playwright (imágenes/fuentes/CSS/trackers abortados). Sin challenges, sin 403, sin rate limit.
- **UA usado:** `Mozilla/5.0 (X11; Linux x86_64) CulturaBA-Research/0.1 (+https://culturaba.xn--lembodiseo-19a.com/bot)`.
- **Fixtures:** `packages/ingestion/fixtures/teatro-colon/2026-10-14/` (37 entradas, 2,4 MB, ninguna > 2 MB). Scripts de apoyo en `/tmp/claude-0/-home-user-CulturaBA/0428519c-9bcd-5cd7-aaef-d1ac3902d803/scratchpad/teatro-colon/scripts/` (`fetch.sh`, `parse_listing.py`, `parse_days.py`, `pw-calendar.cjs`, `build_fixtures.py`).

## 1. Accesibilidad, robots y sitemaps

- `https://teatrocolon.org.ar/robots.txt` → 200. `User-agent: *` → `Disallow:` (vacío, todo permitido); solo `AdsBot` está bloqueado. Sin `Crawl-delay`. Declara `Sitemap: https://teatrocolon.org.ar/sitemap_index.xml`. Cabeceras: `server: cloudflare`, `x-powered-by: PleskLin`, `cf-cache-status: HIT/DYNAMIC` — Cloudflare en modo CDN, **sin managed challenge** en ninguna URL probada.
- `sitemap_index.xml` (Yoast) enumera sitemaps por tipo: `post`, `page`, **`production`** (595 URLs, con `lastmod`), `cronologia`, `concurso`, `audition`, `llamados`, `artist` (x2), `festival`, `category`, **`season`**, **`production-category`**, **`places`**.
- `production-sitemap.xml`: 595 `<url>` de `https://teatrocolon.org.ar/produccion/<slug>/` con `<lastmod>` → útil para detectar cambios, pero incluye todo el histórico (no distingue vigentes).

## 2. CMS y APIs

- **WordPress** (Yoast SEO, tema propio `tc` v1.0.240, jQuery 3.7.1, jQuery UI datepicker, Swiper, ScrollMagic). `body.class` del calendario: `page-template-calendario page-id-130`. Detalle: `single-production postid-10462`.
- CPT `production` (archivo `/produccion/`), taxonomías `production-category` (`/categoria-produccion/<slug>/`), `season` (`/temporada/<slug>/`), `places` (`/ubicacion/<slug>/`), más `festival`, `artist`, `cronologia`.
- **REST:** `GET /wp-json/wp/v2/types` → el tipo `production` tiene `rest_base: "productions"`. `GET /wp-json/wp/v2/production` → 404 `rest_no_route`. **`GET /wp-json/wp/v2/productions?per_page=100&_fields=id,slug,link,modified,title,class_list`** → 200, `x-wp-total: 598`, `x-wp-totalpages: 6`. Cada ítem: `id`, `slug`, `link`, `modified` (p. ej. `"2026-10-14T12:14:26"`, hora local sin offset; también `modified_gmt`), `title.rendered`, `featured_media`, `class_list` con `season-temporada-2026`, `production-category-<slug>`, `places-<slug>` (p. ej. `places-salon-dorado`). **`acf: []`** (vacío): las funciones NO están en el JSON. Sin campos de fechas. Las taxonomías no están expuestas (`taxonomies: []`).
- **admin-ajax:** `GET /wp-admin/admin-ajax.php?action=mobile-calendar&nonce=<nonce>&year=2026&month=11` (nonce inyectado en la página como `var ajax_var = {"url":".../admin-ajax.php","nonce":"f507a89540","action":"mobile-calendar"}`; caduca). Respuesta JSON `{"calendar":"<table>…</table>"}` servida como `text/html`. Solo trae la grilla de días con `<td class="has_event"><a href="…/calendario/?a=2026&mes=11#day-1-11" data-anchor="#day-1-11">1</a>` o `past_day`/`blank_day`. **No contiene eventos.** Es el único XHR de datos que hace la página (verificado con Playwright: 14 respuestas reales; XHR = ese admin-ajax + beacon `cdn-cgi/rum`).
- `/feed/` → RSS de noticias (10 ítems, ninguno `/produccion/`). No sirve.
- No hay JSON-LD `Event`: el JSON-LD de Yoast es `WebPage`/`BreadcrumbList`/`WebSite`/`ImageObject`. Sí hay **microdatos** `schema.org/TheaterEvent` en el detalle (ver §4).

## 3. Listado: `/calendario/` (HTML server-side)

- URL por mes: `https://teatrocolon.org.ar/calendario/?a=2026&mes=11` (`a`=año, `mes`=1..12 sin cero). Sin parámetro = mes actual. El `month-selector` solo enlaza ±1 mes, pero cualquier `a/mes` responde (probado 10, 11 y 12 de 2026). Mes sin funciones: no probado.
- **El mes corriente solo lista funciones desde hoy** (14-oct listó del 14 al 31; los `li` de los días 1–13 llevan `class="inactive"`). Meses futuros listan el mes completo.
- Contenedor: `main.site-main.full-calendar > section.calendar-columns .calendar-column`. `h1.c-gold.month` = `"octubre"`; `h4.class-toggle[data-target=month-selector]` = `"octubre/26"`.
- **Una fila por función:** `div.calendar-item` (32 en oct, 19 en nov, 20 en dic = 71 filas; 30 producciones distintas). La primera función de cada día lleva `id="day-14-10"` (`day-<D>-<M>`); las siguientes del mismo día llevan `class="calendar-item same-day"` sin id.
  - `.head .day-number` → `"14."`
  - `.head .day-hour` → `"mié_17.30 hs"` (`<dow abreviado>_<HH.MM> hs`)
  - `figure.hide-desktop img.wp-post-image[src]` (640x360, con `srcset`)
  - `.event-content .category` → texto de la categoría primaria (**mezcla sala, disciplina, ciclo y temporada**: "Salón Dorado", "CETC", "Ópera", "Ballet", "Colón para niños", "Filarmónica de Buenos Aires", "Grandes Intérpretes", "Aura", "Mozarteum", "Clásica Joven", "Música de Cámara", "Canción de Cámara", "Conciertos extraordinarios", "Orquesta Académica del Teatro Colón", "Orquesta Estable del Teatro Colón", "Temporada 2026"). No es la sala.
  - `.event-content h1.colon-serif-regular` → título (puede traer `<i>`). Ojo: "Concierto entre almohadones<br>Cartas que cantan…" concatena título y subtítulo sin espacio al quitar tags.
  - `.event-content .data p` → compositor/abono/nota: `"Jacques Offenbach"`, `"Abono 15"`, `"Funciones del 21, 22 y 23 de octubre de 2026"`, `"Preventa Santander Select: Del 17 al 20 de octubre Venta general: Del 21 de octubre al 2 de noviembre"`.
  - `.buttons a.button.red` → entradas (texto `"Comprar"`, `"Obtener entradas"`); ausente si no está a la venta. `.buttons a.button.grey[title="+ info"]` → **URL de detalle** `https://teatrocolon.org.ar/produccion/<slug>/` (siempre presente).
- Paginación: no hay; un mes por página. Sin filtros.

## 4. Detalle: `/produccion/<slug>/`

- `<main … itemscope itemtype="https://schema.org/TheaterEvent">` con `<meta itemprop="startDate" content="09/10/2026"/>` y `<meta itemprop="endDate" content="19/10/2026 12:00 am"/>` (formato `dd/mm/yyyy[ h:mm am]`; `endDate` a veces vacío; en "Historias secretas" `startDate=09/11/2025`, `endDate=28/09/2026` aunque hay funciones en oct-2026 → **no fiable**, usar solo como respaldo).
- `section.card-ballet .content .category` → categoría primaria (igual que listado). `h1[itemprop=name]` → título. `.credits p` → compositor ("Jacques Offenbach", "Richard Wagner"; vacío en conciertos). `.media-container img[itemprop=image]` → imagen principal (= `og:image`, 1920x1080 en `srcset`); `.thumbnail-caption` siempre vacío en las 13 páginas (sin crédito fotográfico).
- `meta[name=description]`/`og:description` → resumen editorial. `article:modified_time` → `2026-10-09T18:27:54+00:00`.
- `.production-info-switch .data.hide-mobile p` → rango legible: `"9 al 16 de octubre"`, `"5 al 15 de noviembre"`, `"29 de noviembre al 6 de diciembre"`, `"Funciones del 21, 22 y 23 de octubre de 2026"`, o `"Abono 15"`. También en `.buttons .hide-mobile p` como `"9 al 16 de octubre<br />Sala principal"`.
- **Sala:** `section#sinopsis h4#the_place` → `"Sala principal"`, `"Salón Dorado"`, `"CETC"`, `"Plaza Vaticano y Teatro Colón"`, o **vacío** (Berliner Philharmoniker). Equivalente al texto tras `<br />` en `.buttons .hide-mobile p`. Los enlaces `/ubicacion/salon-dorado/` que aparecen en todas las páginas son del menú, no del evento. Alternativa: `class_list` en REST o `article.event-card` de archivos (`places-sala-principal`).
- Microdato `itemprop=location` (PerformingArtsTheater) fijo en todas las páginas: name "Teatro Colón", `streetAddress` "Tucumán 1171", `addressLocality` "Ciudad autónoma de Buenos Aires", `postalCode` "1049" (es la boletería; el footer dice "Cerrito 628, Ciudad Autónoma de Buenos Aires"). No cambia según la sala.
- **Funciones:** `section.dates#calendar[itemprop=offers]` → `.months` → bloques `div.head > h4` (mes: "octubre", "noviembre", "diciembre", "septiembre") seguidos de `.month-days > div.day`:
  - `div.day` con `data-abono="gran-abono|funcion-extraordinaria|abono-vespertino|abono-nocturno|abono-nocturno-tradicional|abono-nocturno-nuevo|abono-ofba|funcion-distendida|"` (tipo de entrada; también en `select` de `.dates-filter`).
  - Dentro: `span.hide-mobile .day-container` con `p.day-number` `"09"`, `p.day-name` `"vie"`, `p.day-hour` `"20:00 hs"`, `p.performance-type` `"Gran abono"`, `p.featured-detail` `"SUB30"` / `"24h de duración"` / vacío; `span.hide-desktop p` → `"viernes 09/10, 20:00 hs"` (**el más cómodo para parsear: `<dow> dd/mm, HH:MM hs`**, sin año: tomarlo de `h4` + contexto/startDate).
  - Estado por clase/botón: `div.day.inactive` + `button.inactive` `"-"` = pasada; `div.day.inactive.coming_soon` + `button` `"Próximamente"` = aún no a la venta (sin link); activa = `a[itemprop=url][href=<ticketera>][data-tooltip="SUB30"]` + `button.button.c-red` `"Comprar"` o **`"Gratuita"`** (La intimidad de la voz, 15/10 13:00). **Agotada:** no se observó hoy; el CSS define `.month-days .day.sold_out` (`:after{content:"Agotadas"}`, botón `button.sold_out`) y `.button.is_sold_out` para el botón general. **Cancelada/reprogramada:** sin clase ni texto en CSS ni en ninguna página vista.
- Varias funciones del mismo título = varios `div.day` dentro de la misma producción (Les Contes d'Hoffmann: 7; Las ruinas: 9 entre oct y nov; Manon: 9; Die Walküre: 6 entre nov y dic). El listado mensual repite la producción una fila por función con el mismo `+ info`.
- **Entradas:** sin precios en ninguna página (ni `$`). Ticketeras vistas: `https://entradasba.buenosaires.gob.ar/evento/<uuid>` (misma URL para todas las funciones de la producción), `https://entradasba.buenosaires.gob.ar/ticketera/<uuid>` (una por función, abonos Filarmónica), `https://entradasba.buenosaires.gob.ar/visitas/115|120` (visitas), `https://www.tuentrada.com/grandes-interpretes-teatrocolon`, `https://www.tuentrada.com/filarmonica-de-berlin-tc?gad_source=…&gclid=…` (con tracking), `https://comprar.tuentrada.com/cicloaura2/select/2756656`, `http://tuentrada.com/egberto-gismonti-tc`, `https://www.ticketek.com.ar/maria-elena-walsh-sinfonico/teatro-colon`. Beneficio en texto: "Si sos jubilado o estudiante, podés adquirir tu entrada con un 50% de descuento…" (Las ruinas). Boletería: Tucumán 1171, "Entradas gratuitas para personas con discapacidad".
- Otros: `a[href$=.pdf]` "Programa digital"; `section#sinopsis` con `h2`/`h3` ("Sinopsis", "Reparto", "Programa", "CONCIERTO N.º 1" + `<p>OCTUBRE<br/>Miércoles 21 I 20h</p>`); "Duración estimada: 70 min" en prosa (Las ruinas); sin clasificación por edad.

## 5. Espacios / venues

- Taxonomía `places` (sitemap + `class_list` + `article.event-card` en archivos): `sala-principal`, `salon-dorado`, `cetc`, `sala-samsung`, `teatro-colon`, `teatro-colon-fabrica`, `colon-en-la-ciudad`, `usina-del-arte`, `usina-del-arte-colon-en-la-ciudad`, `palacio-libertad`, `centro-cultural-25-de-mayo`, `teatro-presidente-alvear`, `teatro-tronador`, `planetario-galileo-galilei`, `anfiteatro-del-parque-centenario`, `anfiteatro-eva-peron`, `anfiteatro-nini-marshall`.
- **Direcciones publicadas por el sitio:** Teatro Colón "Cerrito 628, Ciudad Autónoma de Buenos Aires" (footer de todas las páginas); boletería/microdato "Tucumán 1171, CABA 1049"; **CETC** "Dirección de ingreso para funciones del CETC: Viamonte 1168" (`/centro-de-experimentacion-del-teatro-colon/`, Sala Gerardo Gandini, subsuelo); **Teatro Colón Fábrica** "Av. Pedro de Mendoza 2163, La Boca" (`/colon-fabrica/`; el sitio dice La Boca, no Barracas), "Lunes a domingo (feriados incluídos) de 10h a 18h". El archivo `/ubicacion/teatro-colon-fabrica/` hoy está vacío ("No se encontraron posts"): las visitas a Colón Fábrica no son producciones del calendario. Salón Dorado y Sala Principal: sin dirección propia (dentro del teatro).
- Visitas guiadas: aside del calendario ("Lunes a domingos de 10 a 16.00H", 50 min, cupo 40) y `/visitas-guiadas/`; "Historias secretas del Teatro Colón" y "Atardecer en el Teatro Colón" sí aparecen en el calendario (categoría "Temporada 2026", lugar "Plaza Vaticano y Teatro Colón").

## 6. Categorías del sitio (`production-category`, 51 términos)

abonos, aura, ballet, barroco, buenos-aires-camara, cancion-de-camara, cetc, ciclo-barroco, cine-documental, clasica-joven, clasicos-argentinos, colon-en-la-ciudad, colon-inmersivo, colon-para-ninos, conciertos, conciertos-de-camara, conciertos-extraordinarios, abono-contemporaneo, corales, coro-estable-del-teatro-colon, disney, escuelas, ofba, fuera-de-ciclo, gi, grandes-interpretes-gi, isatc, jazz, la-opera-de-los-tres-centavos, legados, mozarteum, musica-antigua, musica-de-camara, musica-y-cine, oatc, oetc, opera, opera-de-camara, opera-studio, orquesta-academica-del-teatro-colon, orquesta-estable-del-teatro-colon-oetc-2, otra, pianissimo, recitales-en-el-dorado, talleres, tango, temporada-2024/2025/2026, vacaciones-de-invierno(-colon-para-ninos). Mapeo sugerido: `opera*`, `conciertos*`, `*camara*`, `ofba/oetc/oatc`, `mozarteum`, `aura`, `gi/grandes-interpretes-gi`, `clasica-joven`, `pianissimo`, `recitales-en-el-dorado`, `barroco`, `corales`, `coro-*` → `opera_clasica`; `ballet` → `danza`; `jazz` → `musica_vivo_jazz`; `tango` → `musica_vivo_jazz`/`otros`; `colon-para-ninos`, `vacaciones-de-invierno*`, `disney` → infantil (tag) + disciplina según contenido; `cetc` → `opera_clasica`/`teatro` (artes escénicas experimentales); `cine-documental`, `musica-y-cine` → `cine`; `talleres`, `escuelas`, `isatc`, `otra` → `otros`.

## 7. Archivos (categoría/temporada/ubicación)

`article.event-card.post-<id>.production.season-<s>.production-category-<c>.places-<p>` con `.event-card-image a[href]`, `.event-card-category .category`, **`.event-card-dates`** (`"Oct<ul><li>09</li>…</ul>Nov<ul>…"` — mes abreviado + días, sin horas), `.event-card-title h1`, `.event-card-text`. `/temporada/temporada-2026/` lista 14 producciones; `/categoria-produccion/opera/` 2. Útil para descubrir producciones con sala y categoría sin abrir cada detalle, pero sin horas.

## 8. Fechas: ejemplos literales

- Listado: `"14."` + `"mié_17.30 hs"`, `"dom_11.00 hs"`, `"sáb_20.30 hs"`; mes en `h1.month` `"octubre"` y `"octubre/26"`.
- Detalle: `"viernes 09/10, 20:00 hs"`, `"domingo 01/11, 18:00 hs"`, `"martes 22/12, 15:00 hs"`; columnas `"09"` / `"vie"` / `"20:00 hs"`; `h4` `"octubre"`.
- Rangos: `"9 al 16 de octubre"`, `"5 al 15 de noviembre"`, `"29 de noviembre al 6 de diciembre"`, `"Funciones del 21, 22 y 23 de octubre de 2026"`.
- Meta: `startDate="09/10/2026"`, `endDate="19/10/2026 12:00 am"`, `endDate="23/10/2026 2:00 am"`.
- Prosa: `"OCTUBRE<br/>Miércoles 21 I 20h"`, `"Lunes a domingos de 10 a 16.00H"`.

## 9. Imágenes y términos

- Imágenes en `wp-content/uploads/...` (PNG/JPG 1920x1080, variantes `-300x169`, `-768x432`, `-1536x864`, `-2048x1152`). Sin créditos (`.thumbnail-caption` vacío, sin `figcaption`). No hay página de términos de uso ni de política de imágenes enlazada (footer: "Libro de quejas", "Prensa y medios", "Accesibilidad"). Atribución recomendada: "Texto e imagen: Teatro Colón" con enlace, y `image_source = source` solo si el producto lo acepta; `/prensa/` no se relevó.

## 10. Recomendación de conector

1. `discover`: GET `/calendario/?a=YYYY&mes=M` para el mes actual y los 2–3 siguientes (3–4 peticiones). Parsear `div.calendar-item` → (fecha = `h1.month` + año de la URL + `.day-number`, hora `.day-hour`, categoría, título, `.data`, ticket URL, URL de detalle). Agrupar por URL de detalle (= `externalId` = slug). Cheerio, sin navegador.
2. `enrich`: GET detalle de cada producción con funciones (≈30 hoy). Parsear `section.dates .day` (fecha/hora de `span.hide-desktop p` + `h4` mes; año inferido: el mes `h4` ≥ mes de la primera función; o cruzar con el listado), `data-abono`, `.performance-type`, `.featured-detail`, estado (`inactive` → omitir pasadas; `coming_soon` → scheduled sin ticketsUrl; `sold_out` → `sold_out`; botón "Gratuita" → `isFree`), sala `h4#the_place`, descripción `meta[name=description]` + `#sinopsis`, imagen `img[itemprop=image]`, PDF.
3. Ocurrencias `timed` con `externalId = <slug>|<yyyy-mm-dd>|<HH:MM>` (no hay id por función; la URL de entradasba `/evento/<uuid>` es por producción, `/ticketera/<uuid>` por función). `ticketsUrl` por función desde `a[itemprop=url]`; limpiar `gclid/gad_*`.
4. Venue: `h4#the_place` → mapa {`Sala principal`,`Salón Dorado`,`CETC`} → venue Teatro Colón (Cerrito 628) + `room`; `CETC` puede llevar `address "Viamonte 1168"` con `addressSourceUrl=/centro-de-experimentacion-del-teatro-colon/`; `Plaza Vaticano y Teatro Colón` → room textual; vacío → venue institución sin room. `places-teatro-colon-fabrica` → Av. Pedro de Mendoza 2163 (`/colon-fabrica/`).
5. Opcional para detectar cambios: `wp-json/wp/v2/productions?per_page=100&_fields=id,slug,modified,class_list` (6 páginas) y `production-sitemap.xml` `lastmod`.
6. Precios: nunca (`priceVerified=false`); `isFree=true` solo con botón "Gratuita"/"Obtener entradas"+texto gratuito.

## 11. Riesgos

- `category` del listado no es la sala; "Temporada 2026" como categoría de visitas.
- Año no explícito en las funciones del detalle (solo `dd/mm`); meses que cruzan año (dic→ene).
- El mes corriente omite funciones pasadas (bien) pero el detalle las muestra como `inactive` (omitir).
- Título con `<i>`/`<br>` → normalizar espacios; subtítulos pegados.
- Sin estado cancelada/reprogramada en el markup: solo desaparición (política de ausencias) o texto en `.data`/`#sinopsis`.
- Nonce de admin-ajax caduca (no se necesita). Cloudflare podría activar challenge a IPs de datacenter; hoy no.
- `meta startDate/endDate` desactualizados; `og:locale es_ES`.
- Links de ticketeras con parámetros de campaña; `http://tuentrada.com/...` sin TLS.
