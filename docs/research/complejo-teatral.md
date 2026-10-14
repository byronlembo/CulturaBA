# Relevamiento: Complejo Teatral de Buenos Aires — `complejo-teatral`

**Fecha:** 14-oct-2026 · **URL oficial:** https://complejoteatral.gob.ar/ · **Fixtures:** `packages/ingestion/fixtures/complejo-teatral/2026-10-14/` (43 entradas, 2,08 MB) · **Peticiones usadas:** 44 con curl + 10 al host desde Chromium (Playwright), ≥ 1,5 s entre peticiones, UA `CulturaBA-Research/0.1`.

## 1. Accesibilidad y robots

- Responde **200** a curl y a Chromium real. `server: cloudflare`, `x-powered-by: PHP/8.5.11` / `PleskLin`. No hubo *managed challenge* ni CAPTCHA en ninguna URL. En el navegador se carga el script pasivo de Cloudflare (`/cdn-cgi/challenge-platform/.../jsd`) y el beacon RUM; no bloquearon nada.
- `https://complejoteatral.gob.ar/robots.txt`:
  ```
  User-agent: *
  Disallow: /wp-admin/
  Allow: /wp-admin/admin-ajax.php
  Sitemap: https://complejoteatral.gob.ar/wp-sitemap.xml
  ```
  Sin `Crawl-delay`. Todo lo que usa el conector (home, `/agenda/`, `/produccion/*`, `admin-ajax.php`) está permitido.

## 2. CMS y APIs

- **WordPress 7.1.3** (`<meta name="generator">`), tema propio **`ctba`** (`/wp-content/themes/ctba/`), plugin Wordfence. El HTML conserva comentarios de plantillas Blade sin renderizar (`@if ( $actividad->fecha_unica )`, `data-url="{{URL::to('buscar')}}"`): es una migración reciente desde un sitio Laravel; todos los `lastmod` del sitemap de producciones están entre el 05 y el 13-oct-2026.
- `https://complejoteatral.gob.ar/wp-json/` existe (namespaces `wp/v2`, `oembed/1.0`, `wordfence/v1`…), pero **el CPT `produccion` no está expuesto**: `https://complejoteatral.gob.ar/wp-json/wp/v2/types` solo lista post/page/media…, y `https://complejoteatral.gob.ar/wp-json/wp/v2/produccion` → `404 rest_no_route`. No hay `tribe/events`, ni `/jsonapi`.
- RSS: `https://complejoteatral.gob.ar/feed/?post_type=produccion` → RSS 2.0 con las 10 producciones publicadas más recientes (título, link, pubDate, descripción); **sin fechas de funciones**. Útil solo como señal de altas.
- Sitemaps (`wp-sitemap.xml` índice): `wp-sitemap-posts-produccion-1.xml` (**907 URLs** `/produccion/<slug>/`, incluye histórico: las archivadas redirigen **302 a la home**, p. ej. `/produccion/parias/`), `posts-nota`, `posts-ciclo`, `posts-cuerpo-estable`, `posts-programa` (PDFs de programas, p. ej. `/programa/cinema-kabuki/` devuelve `application/octet-stream` %PDF), y taxonomías `genero`, `teatro`, `sala`, `category`.
- **Endpoint dinámico real** (leído en `/wp-content/themes/ctba/js/scripts.js?ver=0.0.8`, líneas 7-30 y 481-500):
  `POST https://complejoteatral.gob.ar/wp-admin/admin-ajax.php` (form-urlencoded) con `action=filtrar_producciones` y opcionalmente `query`, `teatros[]`, `generos[]`, `ciclos[]`, `proximos_estrenos=1`, `programacion_accesible=1`, `fecha=YYYY-MM-DD`.
  Respuesta `application/json`: `{"success":true,"data":{"html":"<div class=\"list-item …","count":33}}`. `html` es exactamente el mismo markup server-side de la home; sin resultados devuelve `<p class="no-results">No se encontraron resultados para la búsqueda</p>` y `count:0` (p. ej. `teatros[]=38`, Teatro de la Ribera, hoy vacío). No hay paginación (`count` = total; `data-offset` es solo de la animación de scroll).
- Playwright sobre `/agenda/` confirmó que la carga **no dispara ningún XHR propio**: el listado viene renderizado. El datepicker (`daterangepicker`, `minDate: moment()`) llama al mismo `filtrar_producciones` con `fecha` y hace `history.replaceState("?fecha=DD-MM-YYYY")`; la misma vista se obtiene con **GET `/agenda/?fecha=DD-MM-YYYY`**, que es la ruta que conviene al `HttpClient` del repo (solo `get`).

## 3. Listado de programación

### 3a. Home `https://complejoteatral.gob.ar/` (sección "programación")
Server-side, **33 ítems hoy**. Selectores (cheerio):

| Campo | Selector | Ejemplo |
|---|---|---|
| contenedor | `div.search_results > div.list-item` | `id="7701"` (= ID de post WP; coincide con `body.postid-7701` del detalle y `?p=7701` del shortlink) |
| género | `span.category` | `teatro`, `cine`, `actividades especiales \| música` |
| título | `h2.mango-grotesque` | `OXITOCINA` |
| subtítulo | `h3.subtitle` | `(INÉS Y LOS PERROS)`; en "El tren fluvial" trae el texto libre `Estreno` |
| bajada (HTML) | `span.bajada` | `<p>Autoría y dirección <strong>Dennis Smith</strong></p>` |
| fechas (texto) | `.list-data span.date` | `Desde el 17/10 hasta el 1°/11\n\nJueves a domingos, 19.30 horas` |
| sala / teatro | `.list-data span.place` | `Sala Cunill Cabanellas / Teatro San Martín`, `/ Teatro Regio` (sala vacía) |
| entradas | `.buttons a.button.buy[href]` | `https://entradasba.buenosaires.gob.ar/evento/d76b3de0-…` |
| detalle | `.buttons a.button[title="Más información"][href]` | `https://complejoteatral.gob.ar/produccion/oxitocina/` |
| imagen | `.background.lozad[data-background-image]` | `…/wp-content/uploads/2026/09/OO0tN1AVg6mVIqFLsMoJ.png` |
| accesibilidad | `.accessibility_icons i.i-ad`, `i.i-subtitles` | aria-label "Programación con audio descriptivo" / "…con subtitulos" |

### 3b. Agenda `https://complejoteatral.gob.ar/agenda/` ("Agenda > Hoy en el CTBA")
Mismo contenido en tarjetas chicas: `div.search_results > div.small_item` (31 ítems sin `fecha`; cabecera `h1#full_date` = `octubre 2026`). Campos: `span.category`, `span.place`, `h2.mango-grotesque`, `span.bajada`, `.data span.date`, `.buttons a.button.buy`, `a.button[title="Más información"]`, `.background[data-background-image]`. No trae el `id` del post (usar la URL de detalle).
Con `?fecha=DD-MM-YYYY` el backend filtra **por día y por día de la semana** (lo comprobé):

| URL / body | ítems | observación |
|---|---|---|
| `/agenda/?fecha=17-10-2026` (sáb) | 14 | incluye Oxitocina (jue–dom), excluye Paraíso perdido (empieza 22/10) |
| ajax `fecha=2026-10-18` (dom) | 14 | incluye "Cinema Kabuki · Domingo 18 de octubre"; excluye LA ISLA (lunes a sábados) |
| ajax `fecha=2026-10-19` (lun) | 1 | solo LA ISLA |
| ajax `fecha=2026-10-20` (mar) | 8 | Melissa Aldana + Jazz Buenos Aires (el ciclo) + Riesgo y refugio + muestras |
| `/agenda/?fecha=15-11-2026` | 6 | aparece "Jorge Lavelli" aunque su texto dice "hasta el domingo 1° de noviembre" |

Es decir: el sitio tiene internamente rango + días de semana (o fechas enumeradas) por producción, pero **no los expone**; el día-a-día de la agenda es la única forma estructurada de obtener los días de función. Los **horarios** solo están en el texto.

### 3c. Archivos de taxonomía
`https://complejoteatral.gob.ar/genero/teatro/` (11 `list-item`), `/sala/sala-leopoldo-lugones/` (10), `/teatro/teatro-de-la-ribera/` (0 hoy): mismo markup `list-item`, sin dirección. Filtros equivalentes al form.

## 4. Página de detalle `https://complejoteatral.gob.ar/produccion/<slug>/`

- **Sin JSON-LD ni microdatos.** Solo `og:title`, `og:description` (= bajada en texto), `og:image`, `og:type=article`, `link[rel=canonical]`, `link[rel=shortlink]` (`?p=<id>`), `body.single-produccion.postid-<id>`.
- Markup (`main#primary section.post`):

| Campo | Selector | Ejemplo literal (URL) |
|---|---|---|
| imagen | `.cover[style*="background-image"]` (misma URL que `og:image`) | `…/uploads/2026/09/OO0tN1AVg6mVIqFLsMoJ.png` |
| crédito foto | `.cover .cover_credits p` (a veces) | `Foto: Carlos Furman` (`/produccion/remigio_verdiales_un_carpincho/`) |
| género | `ul.breadcrumbs li.category` | `danza` |
| título | `h1.mango-grotesque` | `PAISAJES COREOGRÁFICOS` |
| subtítulo | `h2.subtitle` | `TEATRO DEL BARRIO (ESPAÑA)` |
| bajada | `.data` (HTML) | `Autoría y dirección <strong>Dennis Smith</strong>` |
| entradas / programa | `.buttons a.button.buy[href]`; `a.button[href$=".pdf"]` "Descargar programa"; `a[href="#fotos"]`, `a[href="#en_off"]` | `https://www.ticketek.com.ar/esperando-godot/teatro-presidente-alvear` |
| sinopsis | `.description` (`h2` "sinopsis" + `<p>`); avisos de fechas en **`span[style="color: #ff0000"]`** | `Desde el jueves 22 de octubre hasta el domingo 1° de noviembre` (`/produccion/paraiso-perdido/`); `Viernes 16, sábado 17 y domingo 18 de octubre no habrá funciones` (`/produccion/a-cielo-abierto/`) |
| ficha | `.details` (`h2` elenco / equipo artístico-técnico / equipo CTBA); en ciclos de cine, la grilla por película: `h2` título + `h4` fechas (`/produccion/el-joven-frankenstein/`: `Sábado 31 de octubre, 21 horas<br>Domingo 1° de noviembre, 18 horas…`) o `<p><strong>Jueves 15</strong></p><p>A las 15 horas</p>` (`/produccion/seis-tardes-con-mae-west/`) | |
| **info** | `.info ul li` con prefijo textual + `span.bold`: `Funciones:`, `Duración:`, `Valor de las localidades:`, `Dónde:` (`a > span.bold` = teatro, resto = sala y notas), `li.address a[href*="google"] span.bold` = dirección | `Funciones: Viernes 16 y 23, y sábado 17 y 24 de octubre, 18 horas. Domingos 18 y 25 de octubre, 16.30 horas.` / `Duración: 60 minutos` / `Valor de las localidades: Entrada gratuita` / `Dónde: Teatro San Martín, Hall Alfredo Alcón` / `Dirección: Av. Corrientes 1530` |
| aviso | `.info .special_message` | boilerplate de devoluciones/descuentos en páginas de la Sala Lugones; vacío en el resto |
| galería / notas | `section#fotos .grid article .photo[style]`, `section.en_off article a[href^="https://complejoteatral.gob.ar/notas/"]` | |

## 5. Fechas: cómo publican las funciones

Conviven **tres formas**, siempre en texto libre (`.list-data .date` en listado = `Funciones:` en detalle), a veces mezcladas con una nota en rojo en la sinopsis:

1. **Patrón semanal** (temporadas): `Jueves a domingos, 20 horas` · `Miércoles a sábados, 20.30 horas. Domingos, 19.30 horas` · `Miércoles a domingos, 20 horas` · `Sábados y domingos, 15 horas`. El rango de la temporada a veces va en la misma cadena (`Desde el 17/10 hasta el 1°/11\n\nJueves a domingos, 19.30 horas`), a veces en la sinopsis en rojo (`Desde el 24 de octubre`, Godot; `Desde el jueves 22 de octubre hasta el domingo 1° de noviembre`, Paraíso perdido) y a veces **no está** (La lluvia de fuego, Invasiones I, Ricardo III).
2. **Fechas enumeradas**: `Viernes 16, sábado 17 y domingo 18 de octubre, 20 horas` · `Sábados 10 y 17, y domingos 11 y 18 de octubre, 18 horas\nSábado 24 y domingo 25 de octubre, 17 horas` · `Sábado 31 octubre y domingo 1º de noviembre, 18 horas` (ojo: `1º` vs `1°`, falta "de") · `Jueves 22, viernes 23, sábado 24 y domingo 25 de octubre, 20 horas` · `Martes 20 de octubre, 20 horas` · `martes 20 de octubre, 18.30 horas` (minúscula) · `Jueves 29 de octubre, 16.30 y 20.30 horas` (dos funciones) · `Domingo 18 de octubre. 18 horas` (punto en vez de coma) · `Miércoles 28 de octubre` (sin hora) · `Viernes 23 y 30 de octubre, 19 horas`.
3. **Rangos** (muestras, ciclos de cine): `Del 15 de septiembre al 28 de noviembre, de lunes a sábados de 11 a 20 horas` · `Martes a viernes, 14 a 21 horas\nSábados y domingos, 13 a 20 horas` (horario de la FotoGalería, sin rango) · `Desde el martes 6 de octubre hasta el domingo 1° de noviembre` · `Del 11 de septiembre al 14 de octubre` · `Del 1° al 14 de octubre` · `Del 23 de octubre al 6 de noviembre` · `A partir del 8 de octubre` · `A partir del sábado 31 de octubre` · `Marzo a noviembre` (ciclo Jazz Buenos Aires; cada concierto es además una producción propia, p. ej. Melissa Aldana) · cadena **vacía** (`LAS ALAS DE LOS AUSENTES`).

Funciones por evento hoy: de 1 (Melissa Aldana) a ~8-12 por temporada (jue–dom durante 2-6 semanas); ciclos de cine con decenas de proyecciones detalladas por película en `.details`.

## 6. Salas, teatros y direcciones

Direcciones publicadas en `https://complejoteatral.gob.ar/nuestros-teatros/` (`section.teatro#<id> .data p`), y repetidas en cada detalle (`li.address span.bold`):

| `span.place` (sufijo) | id sección | Dirección publicada | En detalle |
|---|---|---|---|
| Teatro San Martín | `#teatro-san-martin` | `Avda. Corrientes 1530 (C1042 AAC) CABA, Argentina` | `Av. Corrientes 1530` |
| Teatro Presidente Alvear | `#teatro-presidente-alvear` | `Avda. Corrientes 1659 (C1042AAC) CABA, Argentina` | `Av. Corrientes 1659` |
| Teatro Regio | `#teatro-regio` | `Avda. Córdoba 6056 (C1427BZN) CABA, Argentina` | `Av. Córdoba 6056` |
| Teatro Sarmiento | `#teatro-sarmiento` | `Avda. Sarmiento 2715 (C1425FGB) CABA, Argentina` | `Av. Sarmiento 2715` |
| Teatro de la Ribera | `#teatro-de-la-ribera` | `Avda. Pedro de Mendoza 1821 (C1169AAC) CABA, Argentina` | (sin producciones hoy) |
| Cine Teatro El Plata | `#cine-teatro-el-plata` | `Av. Juan Bautista Alberdi 5765 (C1440AAI) CABA, Argentina` | `Avda. Juan Bautista Alberdi 5765` |
| Casa de la Cultura (externo) | — | **no publicada** (`Dirección:` vacío en `/produccion/la-isla-el-teatro-san-martin-en-dictaduras/`) | — |

Salas del San Martín vistas en `span.place` (prefijo antes de ` / `): Sala Martín Coronado, Sala Casacuberta, Sala Cunill Cabanellas, Sala Leopoldo Lugones, Hall Alfredo Alcón, Primer Piso Hall Alfredo Alcón, FotoGalería Sara Facio, CEDOC (Centro de Documentación); externo: Espacio Las Rotativas / Casa de la Cultura. Taxonomía `sala` (14 términos, `wp-sitemap-taxonomies-sala-1.xml`) y `teatro` (28 términos: los 6 propios + sedes externas como Timbre 4, Teatro Coliseo, CCK, Anfiteatro del Parque Centenario…). IDs del form: teatros 36 San Martín, 37 Regio, 38 Ribera, 39 Sarmiento, 40 Alvear, 45 Cine Teatro El Plata.

## 7. Categorías (taxonomía `genero`, 15 términos)

`teatro`(19), `danza`(20), `música`(21), `fotogalería`(22), `cine`(23), `actividades especiales`(24), `para grandes y chicos`(25), `Ciclo Hall Abierto`(26), `temporada internacional`(27), `Teatro musical`(28), `títeres`(31), `actividades pedagógicas`(32), `opera rock`(33), `performance`(34), `FIBA`(35). Hoy: teatro 11, cine 10, danza 2, música 2, actividades especiales 2 (+1 `actividades especiales | música`), fotogalería 2, para grandes y chicos 1, opera rock 1, FIBA 1. Mapeo sugerido: teatro/Teatro musical/opera rock/performance/temporada internacional/FIBA → `teatro_escenicas`; danza → `danza`; música → `musica_vivo_jazz`; cine → `cine`; fotogalería → `fotografia_artes_visuales`; para grandes y chicos/títeres → `teatro_escenicas` + tag `infantil`; actividades especiales/pedagógicas/Ciclo Hall Abierto → según texto, escape `otros`.

## 8. Entradas y precios

- Botón `a.button.buy` ("Comprar localidades") en 21 de 33 ítems: `entradasba.buenosaires.gob.ar/evento/<uuid>` (13), `ticketek.com.ar/<slug>/<teatro>` (6), `tuentrada.com` (2, uno con `_gl=` de tracking), y un `share.google/…` raro ("Todos los ángeles…"). Los gratuitos no tienen botón.
- Precio: texto libre en `Valor de las localidades:` — `Platea $26.000 Jueves $15.000` · `Platea $ 25.000 Pulman $ 16.000 Jueves $ 12.500` · `Platea $ 32.000 Pulman $ 26.000 Tertulia $ 23.000 Miércoles $ 23.000` · `Entrada general $ 12.000 Estudiantes y jubilados $7.000.-` · `Platea Filas 2 a 5 $ 85.000 … Venta presencial: Viamonte 560; en el Teatro únicamente en días de función` · `Entrada gratuita` · `entrada gratuita (hasta colmar la capacidad de la sala)`. `is_free` solo con "gratuita"/"gratuito" explícito; `priceVerified=true` cuando existe el `li`.

## 9. Estado (cancelada / agotada / reprogramada)

**No hay marcador estructurado.** En las 18 páginas de detalle y los 5 listados relevados hoy no aparece "agotad", "cancelad", "suspendid" ni "reprogramad". Lo más parecido: notas en rojo dentro de la sinopsis (`span[style="color: #ff0000"]`): `Viernes 16, sábado 17 y domingo 18 de octubre no habrá funciones` (`/produccion/a-cielo-abierto/`) — y la agenda por día **sigue listando** esa obra el 17 y el 18/10, así que el texto manda. `.special_message` es boilerplate ("Ante la eventualidad de la suspensión…"). "Estreno" va como texto en `h3.subtitle`; `proximos_estrenos=1` devuelve 19 ítems.

## 10. Imágenes y términos de uso

Imágenes en `https://complejoteatral.gob.ar/wp-content/uploads/AAAA/MM/<hash>.jpg|png` (`og:image` = `.cover` = `data-background-image` del listado). Crédito solo a veces (`.cover_credits p`: `Foto: Carlos Furman`). **No encontré página de términos de uso, política de imágenes ni prensa** en el header/footer (revisé los 80 enlaces internos de la home: ninguno con "términos", "privacidad", "legal", "prensa"). Sin permiso explícito → enlazar la URL original con crédito cuando exista (`image_source = source`) y revisar antes de redistribuir.

## 11. Identificadores y volumen

- `externalId` = **ID de post WP** (`div.list-item[id]`, `body.postid-N`, shortlink `?p=N`): estable; el slug de URL también, pero hay sufijos por reposiciones (`el-avaro`, `el-avaro-1`; `crimen-pasional-2`). Ocurrencias: `<postId>:<YYYY-MM-DD>:<HH:mm>`.
- Hoy: **33 producciones** en cartel (home / ajax `count:33`; 31 en `/agenda/`); 907 URLs históricas en el sitemap (no usar: redirigen).

## 12. Riesgos

1. Fechas 100 % textuales, con tres formas mezcladas y variantes tipográficas (`1°`/`1º`, `20 horas`/`19.30 horas`/`20 hs`, `, ` vs `. `, minúsculas, sin "de", sin hora, cadena vacía). Rango de temporada a veces ausente o solo en la sinopsis.
2. La agenda por día ignora excepciones textuales ("no habrá funciones") y puede exceder el rango anunciado (Lavelli el 15/11). Usarla como fuente de días, pero el texto en rojo tiene prioridad.
3. Ciclos vs. funciones: "Jazz Buenos Aires" (ciclo, `Marzo a noviembre`) y "Melissa Aldana" (su concierto del 20/10) coexisten → posible duplicado de ocurrencia.
4. Sitio en migración (restos Blade, `/buscar` 404, `data-url` sin renderizar, `lastmod` masivo): el markup puede cambiar sin aviso; fijar tests sobre fixtures.
5. Cloudflare con detección pasiva de bots; hoy sin challenge, pero puede bloquear IPs de datacenter (runners de GitHub).
6. Títulos con HTML interno (`LA ISLA. <br /> EL TEATRO…` llega así hasta el `<title>`); `h2` del listado puede traer `<br />`: limpiar tags y espacios.
7. Sin JSON-LD/REST: todo depende de selectores del tema `ctba`.
8. Dirección ausente para sedes externas (Casa de la Cultura): venue sin dirección, nunca inventar.

## 13. Recomendación de implementación

Método **`html`** (cheerio), frecuencia cada 12 h, ~35-80 peticiones por corrida:

1. `discover`: GET `https://complejoteatral.gob.ar/` → `div.search_results > div.list-item` (o POST `admin-ajax.php` `action=filtrar_producciones` si se agrega `post` al `HttpClient`). Por ítem: `id`, URL de detalle, género, título, subtítulo, bajada, texto de fechas, `place`, entradas, imagen, iconos de accesibilidad.
2. `enrich`: GET `/produccion/<slug>/` → `.info li` (Funciones, Duración, Valor, Dónde, Dirección), `.description` (sinopsis + `span[style="color: #ff0000"]`), `.details` (grillas de cine), `.cover_credits`, `og:*`.
3. Opcional pero recomendado para `timed` exactos: GET `/agenda/?fecha=DD-MM-YYYY` para los próximos 30-45 días (1 petición/día, ≥ 1,5 s) → conjunto de días por producción (vía URL de detalle); cruzar con el horario del texto (`parseTimeEs`) y descontar días con "no habrá funciones".
4. `parse`: fechas enumeradas → `timed`; patrón semanal → `range` + `recurrenceRule` (RRULE BYDAY) + `scheduleText`, con `startDate/endDate` del texto o de la sinopsis; sin rango → desde hoy hasta la última fecha vista en la agenda; muestras/ciclos → `range`. `venue`: teatro = sufijo de `place` (mapa de 6 slugs con dirección y `addressSourceUrl = https://complejoteatral.gob.ar/nuestros-teatros/`), `room` = prefijo. `price.text` = `Valor de las localidades`, `isFree` solo con "gratuit". `ticketsUrl` sin parámetros `_gl`. `externalId` = post ID.
5. Mapear géneros según §7; `tags` con la categoría original y los iconos de accesibilidad; `imageCredit` de `.cover_credits`.
