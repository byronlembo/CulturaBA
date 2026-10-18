# Relevamiento: Teatro Nacional Cervantes — `teatro-cervantes`

**Fecha:** 18-oct-2026 · **URL oficial:** https://www.teatrocervantes.gob.ar/ · **Fixtures:** `packages/ingestion/fixtures/teatro-cervantes/2026-10-18/` (001–010 grabados con `ingest record`; 101–107 páginas del relevamiento manual) · **Peticiones del relevamiento:** ~30 con curl, ≥ 2 s entre peticiones, UA `CulturaBA-Research/0.1`.

Hasta este conector el catálogo no tenía **ningún** evento del Cervantes (Linda/agenda-ba no lo lista).

## 1. Accesibilidad y robots

- Responde **200** a curl en todas las URLs usadas. `server: cloudflare` (CDN, `cf-cache-status: HIT/DYNAMIC`), `x-powered-by: PHP/5.5.9`. **Sin challenge ni CAPTCHA.**
- `https://www.teatrocervantes.gob.ar/robots.txt`:
  ```
  User-agent: *
  Disallow: /wp-admin/
  Allow: /wp-admin/admin-ajax.php
  ```
  Sin `Crawl-delay` ni sitemap declarado. Todo lo que usa el conector está permitido.
- No seguir `/cdn-cgi/l/email-protection` (ofuscación de mails de Cloudflare en /contacto/).

## 2. CMS y APIs

- WordPress con tema propio **`tnc`** (`/wp-content/themes/tnc/`), Bootstrap 3, `link rel="https://api.w.org/"`.
- **REST del CPT `obra`**: `GET /wp-json/wp/v2/obra` → **1859 obras** (`x-wp-total`, 19 páginas de 100), histórico completo desde 2016. Campos útiles: `id`, `slug`, `link` (`/obra/<slug>/`), `date`, `modified` (hora local sin offset), `title.rendered`, `categories` (ids), `featured_media`, y dos campos propios en texto: **`fecha_estreno`** y **`ultima_funcion`** (`"29/10/2026"`, a veces sin ceros `"5/2/2026"`, vacíos `""` en ciclos/visitas abiertas y algún error de tipeo `"12/12/20225"`). **No expone el contenido** (sin `content`/`excerpt`): el detalle hay que leerlo en HTML.
  - Orden por defecto: `date` desc. El conector usa `orderby=modified&order=desc&_fields=id,slug,link,modified,title,fecha_estreno,ultima_funcion,categories` (33 KB por página): las 7 obras vigentes están entre las 11 modificadas más recientemente, y la página 1 llega hasta 2025-01-23.
  - `slug=a,b` funciona para pedir obras puntuales.
  - `categories_exclude=13` (Archivo) no sirve para filtrar: deja 103 obras, casi todas viejas (Cervantes Online 2020-2021, 2016-2018 sin categoría).
- `GET /wp-json/wp/v2/categories?per_page=100` → **28 categorías**. **No son géneros sino contextos** de programación: `en-el-teatro` (11, 813 obras), `archivo` (13, 1756), `en-el-pais` (27), `giras` (12, "En gira"), `cervantes-online` (34) y sus hijas `nuestro-teatro` (37), `nuestro-teatro-federal` (38), `dialogos` (39), `visita-guiada` (17), `ciclos` (10), `ciclos-de-musica` (9, vacía), `ciclo-de-cine` (8, vacía), `en-la-ribera` (36), `en-otros-espacios` (42), `en-el-centro-cultural-borges` (40), `en-el-centro-cultural-de-la-ciencia` (41), `internacional` (35), `verano` (20), `escuelas` (5), `laboratorios` (28), `extension-cultural` (7), `sindicatos` (6), `tecnopolis` (31), `noticias` (1), `programacion`, `proximamente`, `temporada-2018/2019`.
- Otros CPT: `ciclo`, `noticias` (no usados).
- La **home** muestra la cartelera (7 tarjetas `div.info-unit > a[href*="/obra/"]`), las mismas 7 que dan `ultima_funcion ≥ hoy` + las dos abiertas.

## 3. Calendario mensual — `/calendario/?mes=MM&a=AAAA`

Server-side, una tabla por mes (`/calendario/` sin parámetros = mes corriente; los enlaces del sitio usan `?mes=09&a=2026`).

| Campo | Selector | Ejemplo |
|---|---|---|
| mes | `#calendar .header span.title` | `OCTUBRE 2026` |
| día | `table#calendario td#li-YYYY-MM-DD` (relleno: `id="li-"`) | `li-2026-10-18` |
| bloque de categoría | `ul.eventos > li > a.category-calendario` | `En el teatro` |
| función | `ul.eventos > li` siguiente: `div.calendar-hora` + `a[href="/obra/<slug>/"] strong` | `18:00hs.` · `Lo mucho que te amé` |

Hoy: octubre 38 funciones, noviembre 22, diciembre 8. Hallazgos:
- Lista **cada función** con día y hora, incluidos los días pasados del mes corriente.
- **Respeta excepciones**: la visita guiada de los lunes no figura el 12/10 ni el 23/11 (feriados).
- Da horas que el detalle no tiene: el concierto del Ciclo de música del 18/11 figura a las **20:30** (el detalle dice solo "18 de noviembre – Música Contemporánea, Concierto V").
- **Puede estar incompleto**: *El movimiento* (estreno 29/10, "De jueves a domingo a las 21 h") **no figura** en ningún mes. Las giras ("En el país") tampoco.

## 4. Página de detalle `/obra/<slug>/`

Sin JSON-LD ni microdatos útiles. `og:title` (título con mayúsculas normales), `og:image` (= imagen destacada), `link[rel=canonical]`, shortlink `?p=<id>`.

| Campo | Selector | Ejemplo literal |
|---|---|---|
| título (mayúsculas) | `h3.obra-title` | `EL MOVIMIENTO` |
| subtítulo / créditos | `h3.obra-title + p span` (en mayúsculas en el HTML) | `EL PASADO NO SE DETIENE` · `ESCRITA Y DIRIGIDA POR JAVIER DAULTE` |
| etiqueta de contexto | `p.is-sala-single` | `EN EL TEATRO`, `EN EL PAÍS`, `VISITA GUIADA` (en visitas aunque su categoría REST sea `en-el-teatro`) |
| sala / sede | `p.sala-single b` | `SALA ORESTES CAVIGLIA`, `SALA MARÍA GUERRERO`, `SALA LUISA VEHIL`, `LUISA VEHIL`, `FOYER DEL TEATRO`, `SALA PISO 11`, vacío (visitas), `GENERAL ROCA, RÍO NEGRO` (gira) |
| entradas | `p.comprar-entradas a[href]` | `https://ventas.teatrocervantes.gob.ar/landing/santos-vega?idEspectaculoCartel=17284&cHashValidacion=…`; genérico `https://ventas.teatrocervantes.gob.ar/` (Ciclo de música); `https://survivo.com.ar/` (gira) |
| imagen | `meta[property=og:image]` (`img#banner` = versión 1500×500) | `…/uploads/2026/10/El-movimiento_WEB_2.png` |
| sinopsis | `#obra > div` (col-sm-8); si está vacía, `#informacion > div` (con un reproductor de audio a quitar) | |
| ficha | `#ficha > div` (elenco, equipo) | |
| **funciones (texto)** | **`.sidebar-block > b`** (el bloque se repite en cada pestaña; tomar el primero) | `De jueves a domingo a las 21 h` |
| temporada | `.sidebar-block p` "Fecha estreno `<b>`" / "Última función `<b>`" (= campos del REST) | `29/10/2026` · `13/12/2026` |
| precio | `.sidebar-block p` "Localidades: `<b>`" (pocas páginas) | `$15.000`, `GRATIS`, `$10.000 Descuento jubilados, personas con CUD, grupos estudiantiles` |

No hay duración estructurada, ni crédito de foto, ni marcadores de estado (0 apariciones de "agotad", "suspendid", "cancelad", "reprogramad" en 15 páginas).

## 5. Fechas: cómo publican las funciones

Textos **literales** del bloque lateral relevados (vigentes y archivados de 2026):

| Obra | Texto | Forma |
|---|---|---|
| El movimiento, Santos Vega, Alberdi, La revista del Cervantes | `De jueves a domingo a las 21 h` / `… a las 20 h` | semanal |
| Lenguajes del adiós | `De jueves a domingos a las 18 h` | semanal |
| Ciclo Teatro del país | `De viernes a domingo a las 21 h` + `Las entradas son GRATUITAS.` + `Pueden reservarse a partir de las 10 h del día de la función…` | semanal + entradas |
| Borges, el eco infinito | `Miércoles 17 y 24 de junio a las 20 h` | enumerada |
| Sanctum Quixote | `Sábado 25 y domingo 26 de abril y sábado 2 y domingo 3 de mayo a las 15 h` | enumerada en dos meses |
| Cervantes Electroacústico | `28, 29 y 30 de agosto de 2026` (sin hora) + `La entrada a los conciertos es gratuita, … a partir de las 10 h.` | fechas sin hora |
| El Mago de Oz | `Vacaciones de invierno del jueves 16 de julio al 2 de agosto de miércoles a domingo a las 14:30 h.` / `Para público general luego de vacaciones de invierno: sábados y domingos a las 14:30 h.` | subrango + "luego de" |
| Visitas guiadas | `Público general: lunes 11 h` / `Entradas por Alternativa Teatral o en boletería de miércoles a domingo de 10 a 22 h` / `Grupos de instituciones educativas …, a partir de los 16 años: lunes 14 h` / `Entradas con inscripción previa.` | semanal, sin última función |
| Ciclo de música | `Entradas gratuitas. Para los conciertos en el TNC, se pueden retirar … a partir de las 10 h. Capacidad limitada.` / `Los conciertos en otras sedes son con entrada libre y gratuita.` | sin funciones (fechas en la pestaña Información, sin hora salvo excepciones) |
| Villa California (gira) | `Funciones en octubre` / `Viernes 20:30 h y sábados 20 h` / `Funciones en noviembre` / `Jueves a las 20:30 h` / `Casa de la Cultura (9 de julio 1043, General Roca)` | semanal por mes |
| Y los perros, ¿se reirán? (gira) | `Funciones viernes y sábados a las 21 h` / `(Excepto viernes 25/9, 2 y 9/10 a las 20 h)` / `Entradas en la boletería de la sala, de 9 a 14 h de lunes a viernes.` | semanal con excepciones |

### Regla del conector (misma que `complejo-teatral`)

1. **Calendario primero.** Si `/calendario/` lista la obra en la ventana leída (mes corriente + 2), las funciones son **solo** esas filas (día + hora literales), desde hoy y dentro de estreno…última función (fuera ⇒ no se emite, con aviso). Si el patrón del texto da otra hora para ese día, se publica la del calendario y se avisa.
2. **Si el calendario no la lista**, se lee el texto lateral:
   - **Fechas enumeradas** ⇒ una función por fecha con la hora que la sigue (el año se resuelve dentro de la temporada publicada; el día de semana publicado tiene que coincidir).
   - **Patrón semanal** ⇒ solo dentro de una **temporada publicada** (estreno Y última función, o un "del … al …" de la misma frase) y solo los días/horas que el texto afirma (`"Viernes 20:30 h y sábados 20 h"` ⇒ viernes 20.30, sábados 20; `"Funciones en octubre"` acota al mes). Sin temporada completa ⇒ no se emiten funciones (visitas guiadas sin calendario). Se expande como mucho 366 días.
   - Frases de **entradas/boletería/reservas** y de **grupos con inscripción** no son funciones ("a partir de las 10 h", "de 10 a 22 h").
   - **Cualquier frase con datos de funciones no legible con certeza** ("Excepto…", "luego de…", "desde/hasta" sueltos, horario de apertura "de 14 a 20 h", día sin mes, día de semana incoherente) ⇒ **no se deriva ninguna función del texto** (nunca a medias).
3. **Sin funciones con hora pero con temporada completa vigente** ⇒ una ocurrencia `range` (estreno…última función) con `scheduleText` = texto lateral literal y `sourceDateText` = `Fecha estreno … · Última función …`.
4. **Estados** solo por texto explícito del bloque lateral (`detectStatusEs`): con fecha ⇒ esa función `cancelled`/`postponed`/`sold_out` con `statusReason` literal; `reprogramada` ⇒ se retira; sin fecha atribuible ⇒ una suspensión/reprogramación retira todas las funciones y un "agotado" se ignora.

## 6. Salas, sedes y direcciones

- **Edificio:** `Libertad 815 / C1012AAQ · Ciudad de Buenos Aires / Argentina` en https://www.teatrocervantes.gob.ar/contacto/ (sección BOLETERÍA) y `Libertad 815 - C1012AAQ Ciudad Autónoma de Buenos Aires República Argentina` en el pie de todas las páginas. **No publica barrio.** (Administración: Av. Córdoba 1155 — no es sede de funciones.)
- **Salas** (https://www.teatrocervantes.gob.ar/salas/): Sala María Guerrero (principal, 860 localidades), Sala Orestes Caviglia (165), Sala Luisa Vehil ("también conocida como Salón Dorado", 67). En detalles aparecen además `FOYER DEL TEATRO` y `SALA PISO 11`.
- Mapeo: sala conocida ⇒ venue seed `teatro-cervantes` + `room` canónico; categoría/etiqueta "En el teatro" con otro espacio o sin sala ⇒ mismo edificio (room = texto publicado con mayúsculas normalizadas, o sin room); otra sede ⇒ `{ name }` sin dirección ⇒ **candidato** (no se infiere). La programación "En otros espacios", "En la Ribera", "Centro Cultural Borges/de la Ciencia" no tiene obras vigentes hoy.
- **Giras ("En el país", "En gira"), Tecnópolis (provincia) y Cervantes Online se excluyen** en discover (CulturaBA cubre CABA; online no es presencial) y parse las rechaza si llegan igual (también por la etiqueta `EN EL PAÍS`). Hoy: *Villa California* (General Roca, Río Negro) y *Y los perros, ¿se reirán?* (Lago Puelo, Chubut).

## 7. Disciplinas

El sitio no publica género. Tabla explícita (`disciplines.ts`): actividad no teatral nombrada por categoría, etiqueta o **comienzo literal del título** ⇒ exclusiva (`visita-guiada`/`VISITA GUIADA`/"Visitas guiadas…" ⇒ `historia_patrimonio`; `ciclos-de-musica`/"Ciclo de música…"/"Concierto…" ⇒ `musica_vivo_jazz`; `ciclo-de-cine`/"Ciclo de cine…" ⇒ `cine`); contextos escénicos del teatro nacional (`en-el-teatro`, `en-otros-espacios`, `en-la-ribera`, `en-el-centro-cultural-*`, `internacional`, `verano`) ⇒ `teatro_escenicas`; `escuelas`/`laboratorios`/`extension-cultural`/`sindicatos` ⇒ `otros`; sin señal ⇒ `[]` (candidato). El título solo cuenta por su comienzo: "La epidemia de la danza" sigue siendo teatro. `opera_clasica` no se asigna sin una categoría que lo diga (el Ciclo de música mezcla popular, lied y contemporánea).

## 8. Entradas y precios

- Venta propia `ventas.teatrocervantes.gob.ar/landing/<slug>?idEspectaculoCartel=…&cHashValidacion=…` (los parámetros son funcionales, no de tracking) y Alternativa Teatral (`alternativateatral.com/espacio509-teatro-cervantes`, genérico del pie).
- Precio **solo si la página lo dice**: `Localidades:` (`$15.000`, `GRATIS` ⇒ `isFree`) o una frase de gratuidad del bloque lateral (`Entradas gratuitas.`, `Las entradas son GRATUITAS.`). Las obras de la sala principal hoy **no publican precio** ⇒ sin `priceText`.

## 9. Identificadores, volumen y peticiones

- `externalId` = slug de `/obra/<slug>/` (igual que teatro-colon y complejo-teatral); ocurrencias `<slug>|YYYY-MM-DD|HH:mm` y `<slug>|range|<inicio>`. `sameAsUrls` = URL canónica de la ficha (para deduplicar si Linda la enlaza algún día).
- Hoy: **5 obras** en la Ciudad (El movimiento, Santos Vega, Lo mucho que te amé, Visitas guiadas, Ciclo de música) ⇒ 73 funciones con hora (45 del calendario, 28 del patrón de El movimiento), 0 rangos.
- Por corrida: categorías 1 + calendario 3 + REST 1 (+1 si el calendario lista una obra que no vino) + detalles ≈ **10 peticiones** (+ robots.txt), `minDelayMs` 1500.

## 10. Riesgos y límites

1. El calendario puede no tener cargada una obra (El movimiento): se cae al patrón del texto, que **no conoce feriados** ni funciones extra hasta que el calendario la liste.
2. Con calendario, solo se publican funciones de la ventana (≈ 2,5 meses); el resto aparece cuando la ventana avanza.
3. Obras abiertas (sin `ultima_funcion`) solo entran si el calendario las lista; sin calendario serían candidatas sin funciones.
4. Textos con excepciones o subperíodos ("Excepto…", "luego de vacaciones") caen a `range` honesto: menos precisión, nunca horarios inventados.
5. Subtítulos en mayúsculas tal como vienen en el HTML.
6. Sedes externas en CABA sin dirección publicada quedan candidatas.
7. PHP 5.5 / tema sin mantenimiento aparente (comentarios "pruebas.teatrocervantes.gob.ar", enlace oculto en el bloque lateral): el markup puede cambiar sin aviso; los tests fijan los selectores sobre fixtures.
