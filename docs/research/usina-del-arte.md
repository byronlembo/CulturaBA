# Relevamiento: Usina del Arte (`usina-del-arte`)

- **Fecha:** 2026-10-18 (16:28–16:50 UTC). **Peticiones:** ~39 con curl (robots, REST, taxonomías, 20 detalles —3 con slug mal tipeado: 301/404—, contacto, historia, home, una página de espacio y una comprobación de redirección), ≥ 2 s entre peticiones, 1 en vuelo. Después, `ingest record` (30 peticiones) y dos `run --dry-run --limit 15` en vivo (26 cada una). Sin challenges, sin 403, sin rate limit.
- **UA:** `CulturaBA-Ingest/0.1 (+https://culturaba.xn--lembodiseo-19a.com/bot)`.
- **Fixtures:** `packages/ingestion/fixtures/usina-del-arte/2026-10-18/` (29 entradas, 1,9 MB: 4 páginas de actividades, 6 de taxonomías, 19 detalles de ~90 KB).

## 1. Acceso y robots

- `https://usinadelarte.ar/robots.txt` → **200 con cuerpo vacío** (`content-length: 0`): todo permitido, sin `Crawl-delay`. Hosting Hostinger (`server: hcdn`, `platform: hostinger`); sin Cloudflare ni challenge.
- WordPress + Elementor (plantillas `single-post`, widgets `jkit-*`); sin Yoast: **sin JSON-LD, sin `og:*` ni `meta description`** en los detalles.

## 2. REST de WordPress

| Endpoint | Qué trae | Ejemplo / conteo (18-oct) |
|---|---|---|
| `GET /wp-json/wp/v2/actividad?per_page=100&page=N` | CPT `actividad`: `id`, `slug`, `link`, `title.rendered` (HTML con `<br>` y entidades), `modified`, `featured_media`, ids de términos. **`content.rendered` vacío** y `acf: []`: el contenido lo arma Elementor en el detalle. | `X-WP-Total: 356`, `X-WP-TotalPages: 4`; con `_fields=…` cada página pesa ~40 KB (sin `_fields`, ~225 KB) |
| `/wp-json/wp/v2/funcion-fecha` | Términos "dd/mm/aaaa" | 188 términos (2 páginas); `"25/10/2026"` (slug `25-10-2026`), irregulares: `"19/06"` (sin año), `"05/4/2026"` |
| `/wp-json/wp/v2/funcion-hora` | Términos de hora | 31; `"18 h"`, `"11:30"`, `"14 a 18:30 h"`, `"18"`, `"18.30"`, `"14:00:30"`, `"undefined"`. **Solo 7 de 356 actividades tienen alguno** |
| `/wp-json/wp/v2/sala` | Espacios | 17: Auditorio, Sala de Cámara, Salón Mayor, Foyer, Hall Central, Patio Central, Sala Laberinto, Aula Visuales, Espacio Creativo (2do. piso), Ludo-Espacio (2do. piso), Plaza Usina / La Plaza de la Usina, Iupiiii / iUpiiiii, Sala de escape, 2do. piso, Todos los espacios |
| `/wp-json/wp/v2/estado` | Agenda, no estado | 3: `Pasadas` (344), `Programadas` (12), `programado` (0). Se actualiza a mano (el 16/10 un cambio masivo tocó `modified` de 350 actividades) |
| `/wp-json/wp/v2/tipo-de-actividad` | Categoría | 64 términos (ver §5) |
| `/wp-json/wp/v2/espacio` | **El CPT `espacio`** (6 páginas de salas), no la taxonomía: ambos usan `rest_base: espacio` y gana el CPT. Los ids de la taxonomía `espacio` no se pueden resolver por REST; no hace falta (repite `sala`). | `/espacio/auditorio/` publica "Cómo llegar: Agustín R. Caffarena 1, C1157…" |

`orderby=id&order=asc` funciona en actividades y términos (paginación estable: lo nuevo cae al final). Los `funcion-fecha`/`funcion-hora` son **conjuntos** por actividad: no dicen qué hora va con qué fecha.

## 3. Detalle `/actividad/<slug>/`

Plantilla Elementor `[data-elementor-type="single-post"]` (con las clases de taxonomía: `funcion-fecha-25-10-2026 sala-auditorio …`):

- `h2.elementor-heading-title a[rel=tag]` → tipo ("Show para toda la familia", href `/tipo-de-actividad/<slug>/`); el otro `h2` → título (`José Luis Juri<br>Recital de piano`).
- Widgets de texto antes de "Información de la actividad": descripción; los últimos renglones suelen ser edad y acceso: `ATP`, `Mayores de 18`, `a partir de 6 años`, `Entrada libre y gratuita. Capacidad limitada`, `Entrada libre y gratuita, hasta agotar capacidad. Se retiran desde las 11 h en la Usina.`, `Con reserva`.
- **"Días y horarios"**: shortcode `.function-items > .function-item`, **una fila por función con fecha y hora emparejadas**: `.date` `25/10/2026`, `.notes` (`""` o `Con reserva`), `.time` `18 h` / `11.30 h` / `12:45 h` / `de 16 a 20 h` / `14:30 a 19 h`, y `a.button_entradas` → `https://www.formulariosgcba.gob.ar/<id>/canal/web` ("Conseguir entradas", reserva de la Ciudad). Un script del tema reescribe `.date` en el navegador ("Dom, 25/10/26"); el HTML del servidor trae `dd/mm/aaaa`. Lista también funciones pasadas.
  - Ejemplo: "Entre el Sonido y el Tiempo" tiene taxonomía {16, 17, 18/10} sin horas; el detalle trae 12 filas (16/10 14, 15, 16, 18 y 19 h; 17/10 ídem; 18/10 12:45 y 17:30 h). Su versión en inglés, con la misma taxonomía, trae 3 (17 h, 17 h, 16.30 h).
- "Espacio" (`<span>Auditorio</span>`, falta si no hay sala) y **"Dirección"** (`Agustín R. Caffarena 1, C1157 Cdad. Autónoma de Buenos Aires`, enlace `maps.app.goo.gl/…`).
- Imagen: `.elementor-widget-image img.wp-image-<featured_media>` (tamaño large). **Media 258** es una captura de un documento de Google ("…Historia-de-la-Usina-del-Arte-Documentos-de-Google.png") usada de relleno en 6 actividades → se omite.

Dirección publicada también en la cabecera de todas las páginas y en `/contacto/` (teléfono +54 11 49092076, horarios "Sábados 14 a 20 h / Domingos 11 a 20 h / Lunes a viernes cerrado"). **No publica barrio ni coordenadas.**

## 4. Reglas del conector

1. **Descubrimiento** (10 peticiones): 4 páginas de actividades + 6 de taxonomías, todo o nada (página que falla, que no es JSON o total distinto de `X-WP-Total` ⇒ discover lanza). Vigentes = alguna `funcion-fecha` desde hace 7 días, o estado `Programadas`, o sin fecha legible y sin `Pasadas` (hoy 19 de 356). Orden: con fecha desde hoy primero, después la última semana. Luego un GET de detalle por actividad vigente.
2. **Fecha ↔ hora:** las filas `.function-item` del detalle son la lista autoritativa (hora legible → `timed`; franja "de 16 a 20 h" → `timed` con `endsAt` y `scheduleText` literal). Sin filas, respaldo por taxonomías **solo si no es ambiguo**: una hora → todas las fechas; una fecha → una función por hora; varias y varias → solo fechas. Fecha sin hora → `range` de un día (no `all_day`, que la app muestra como "todo el día"). Las taxonomías nunca agregan funciones si hay filas (solo avisos).
3. **Venue:** seed `usina-del-arte` (dirección del sitio, `address_source_url` `/contacto/`), `room` = término `sala` (respaldo: bloque "Espacio"); "Todos los espacios" ⇒ sin room. Otra dirección en el detalle ⇒ venue propio con esa dirección; sin dirección ni sala ⇒ sin venue (candidato).
4. **Estado:** `Pasadas`/`Programadas` no cambian nada. Un término de `estado` claro (Suspendido/Cancelado/Agotado/Postergado, vía `detectStatusEs`) se aplica a todas las funciones; una `.notes` clara, solo a su fila.
5. **Precio:** solo el renglón literal: importes con `$` ⇒ `priceText` sin afirmar gratuidad; "Entrada libre y gratuita…" ⇒ `isFree`. "Con reserva" no dice nada (el enlace de reserva va como entradas).
6. **Dedup con Linda:** `officialUrl` = `link` y `sameAsUrls: [link]`. Linda enlaza `usinadelarte.ar/actividad/<slug>/` en `botonesSidebar` (p. ej. Misty Soul Choir, igual); pero a veces con un **slug viejo** (`…-sasa-avsenik/` → 301 a `…-sasa-avsenika/`): ahí cruza por título (Dice) y fechas. La institución derivada por Linda (`slugify("Usina del Arte")`) es `usina-del-arte`, la misma del seed; el seed adopta el venue `usina-del-arte-usina-del-arte` si Linda ya lo había creado.

## 5. Disciplinas (`tipo-de-actividad`, tabla explícita en `disciplines.ts`)

| Términos | Disciplina |
|---|---|
| Concierto(s), Concierto internacional / para toda la familia, Jazz en la Usina, Microconcierto, Mini-Recital, Música, Música en vivo, Show musical, Peña (+ en el Salón Mayor), Tango, DJ, Dj set, Ciclo DGEART | `musica_vivo_jazz` |
| Ciclo Música de Cámara, Ciclo Dúos en Usina | `opera_clasica` |
| Espectáculo, Shambala Circo, Show para niños / para toda la familia (+ `infantil`) | `teatro_escenicas` |
| Danza, Clases de baile, Mundial de baile, Usina Milonguera | `danza` |
| Cine | `cine` |
| Charla, Q&A, Encuentro de ciencia, Sala de lectura | `literatura_charlas` |
| Exposición, Muestra | `museos_exposiciones` |
| Artes Visuales, Instalación, Talleres de Artes Visuales | `fotografia_artes_visuales` |
| Visita Guiada (adultos / niños) | `historia_patrimonio` |
| Show, Experiencia, Experiencia inmersiva, Evento, Concurso, Espacio lúdico, Sala de escape, Photowall, Pre-escucha, Producción especial, Workshop, otros talleres, Raíces en Movimiento | `otros` |
| Vacaciones de invierno, Día del niño | etiqueta (sin disciplina; sola ⇒ `otros`) |
| Feria / Patio gastronómico | no cultural (sola ⇒ sin disciplina, candidato) |
| desconocido | `otros` + aviso |

## 6. Límites conocidos

- La vigencia se decide con la taxonomía `funcion-fecha`/`estado`: una actividad cuyo detalle liste fechas nuevas sin actualizar la taxonomía ni pasarla a "Programadas" no se descubre.
- Fixtures sin cabeceras `X-WP-*`: en la reproducción se corta en la primera página corta (si el total fuera múltiplo de 100 faltaría una página grabada).
- `otros` no deja candidato en `assessPublishability` (solo `[]` lo hace): "Ludo-Espacio" se publica como `otros`.
- Sin precios publicados hoy (todo gratis o "Con reserva"); sin marcas de agotado/suspendido observadas: la lógica de estado está probada con variantes sintéticas.
