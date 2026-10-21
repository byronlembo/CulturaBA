# Relevamiento: Planetario Galileo Galilei — `planetario`

**Fecha:** 21-oct-2026 · **URL oficial:** https://planetario.buenosaires.gob.ar · **Fixtures:**
`packages/ingestion/fixtures/planetario/2026-10-21/` (16 entradas, grabadas con
`pnpm ingest record --source planetario`) · **Peticiones de relevamiento:** ~30 con curl, ≥ 2 s entre
peticiones, una a la vez, UA `CulturaBA-Ingest/0.1 (+https://culturaba.xn--lembodiseo-19a.com/bot)`.

Primera fuente de divulgación científica: todo lo que emite va a la disciplina `ciencia`
("Ciencia y divulgación").

## 1. Accesibilidad y robots

- Responde **200** a curl: `Server: Apache`, cookie `BIGipServerPool_planetario-PRD` (balanceador
  F5 de la Ciudad). Sin Cloudflare, sin challenge ni CAPTCHA.
- `robots.txt` es el de Drupal por defecto (última modificación 14-may-2019): solo prohíbe `/core/`,
  `/profiles/`, `/admin/`, `/comment/reply/`, `/filter/tips/`, `/node/add/`, `/search/`,
  `/user/register|password|login|logout/` (y sus variantes `/index.php/…`). **Sin `Crawl-delay`.**
  Todo lo que usa el conector está permitido; lo verifica el cliente HTTP en cada corrida.
- Cortesía del conector: 1 petición en vuelo, ≥ 1,5 s entre peticiones, timeout 30 s.

## 2. CMS y APIs

- **Drupal 8+** (tema propio `planetario`, "Versión V2-RC1" en el pie), HTML server-side.
- **No hay API JSON**: `/jsonapi` → 404, `/wp-json/` → 404, `/sitemap.xml` → 404. `/rss.xml` (feed
  por defecto de Drupal) responde 200 pero solo tiene 3 nodos promovidos de 2018–2021: inútil.
- Cada actividad es un nodo `evento` con campos fijos (clases `field--name-…`):
  `title`, `field_evento_imagen`, `body`, `field_evento_cuando` ("¿Cuándo?", texto libre),
  `field_evento_precio`, `field_evento_cupo`, `field_evento_lugar`, `field_evento_destinatarios`,
  `field_evento_docente`, `field_evento_link_entrada` (Eventbrite / EntradasBA).
  `link[rel=canonical]` = `/<alias>` y `link[rel=shortlink]` = `/node/<id>` (id estable). Sin JSON-LD,
  sin `og:*`, sin `article:published_time`.
- `/index.php/<alias>` sirve la misma ficha (el listado de espectáculos enlaza así).

## 3. Secciones y granularidad

| Página | Qué tiene | Uso |
|---|---|---|
| `/encuentros-de-ciencia` | Grilla `#grilla .item` con **129 tarjetas** que acumulan años (2018 → hoy, la más nueva primero, sin paginado). Cada tarjeta: `h3 a` (título + ficha), `.datos` con `h4 "¿Cuándo?"` + texto y `h4 "Precio"` + texto, fondo `.bk-cuadricula` con la imagen. | 1 evento por charla vigente |
| `/otras-actividades` | Misma grilla, **250 tarjetas** (2019 → hoy): especiales (Madre Noche, MUTEK, A cielo abierto, eclipses, vacaciones), cursos cortos. | 1 evento por actividad vigente |
| `/cursos` | `#cursos .evento` (2 cursos): `h4 a`, `.cuando h4 "Cuándo"` + `.dato` con **temporada publicada** ("Inicio…", "Horario…", "Última clase…"). | 1 evento por curso, ocurrencia `range` |
| `/agenda` | Nodo con el programa de la semana en el `body`: líneas fechadas con enlace ("Sábados 24 y 31 de octubre 10:00 h – El universo que no vemos") y grillas **semanales** del domo, el museo y los telescopios. | solo las líneas fechadas |
| `/espectaculos-publico-general` | `#multi-eventos .evento` (6 espectáculos del domo, sin fechas en la tarjeta). | se lee la ficha; hoy ninguno se emite |
| `/encontranos` | Dirección y cómo llegar. | dirección del venue |
| `/tickets` | Explica tarifas y gratuidades (menores de 4, jubilados, personas con discapacidad). | no se usa |
| `/observa-el-cielo` | Mapas celestes y guías; "Telescopios: Sábados y domingos al ocultarse el sol". | no se usa (sin fechas) |

Una ficha que aparece en varios listados (p. ej. *El universo que no vemos* en `/otras-actividades`
y en `/agenda`) es **un solo registro** (`externalId` = alias sin la barra).

## 4. Fechas: ejemplos literales

El "¿Cuándo?" es texto libre, el mismo en la tarjeta y en la ficha, casi siempre **sin año**:

| Texto literal | Resultado (hoy = 21-oct-2026) |
|---|---|
| `Domingo 18 de octubre 18 h` | timed 2026-10-18 18:00 (dentro de los 7 días de gracia) |
| `Viernes 9 de octubre 19 h` | 2026-10-09: anterior a hoy − 7 días → no se emite |
| `Viernes 28 de noviembre 19:30h` · `Viernes 4 de julio 19.30 h` · `Viernes 9 de mayo , inicio 19 h` · `Viernes 7 junio 19h.` | charlas de 2024–2025 (pasadas) |
| `Sábados 17, 24 y 31 de octubre de 2026` + `Horario: de 10 a 11:30 h` | 3 timed 10:00–11:30 |
| `Sábados 24 y 31 de octubre 10:00 h` (en `/agenda`) | 2 timed 10:00 |
| `Las funciones serán el viernes 2, sábado 3, viernes 16 y sábado 17 de octubre, de 19 a 20.30 h.` | 16 y 17 timed 19:00–20:30 (2 y 3, pasadas) |
| `Cupo completo` / `Inicio del curso: miércoles 2 de septiembre de 2026` / `Horario: miércoles 19 h a 21.45 h.` / `Última clase: miércoles 18 de noviembre de 2026` | range 2026-09-02 → 2026-11-18, `scheduleText` = "Horario: miércoles 19 h a 21.45 h.", `sold_out` |
| `Desde el sábado 18 de julio al domingo 2 de agosto` · `La noche del jueves 27 al viernes 28 de agosto` | range con el texto literal |
| `12; 13 ; 14 ; 19 ; 20 y 21 de julio en la Sala de Espectáculos del Planetario.` · `25 de marzo 19h` · `11 de octubre 17 a 21h` · `26/8 19 hs.` | sin año ni día de semana: ambigua → se omite con aviso |
| `Funciones inmersivas en el domo sábados, domingos y lunes 12 de octubre` · `MARTES A VIERNES` · `De martes a viernes 12.30 h` · `Viernes 11.00 h Odisea espacial` | patrón semanal sin temporada → nunca funciones |
| `Horarios y localidades disponibles en web de compra LINK` | sin fechas (espectáculos) |
| `Estreno viernes 12/8 a las 19 hs. por @PlanetarioBA Youtube` · `Transmisión en vivo` | virtual → no se emite |
| `Reprogramado: Sábado 8 de agosto 15 h` | se publica la fecha indicada, con aviso |
| `ACTIVIDAD SUSPENDIDA` | `cancelled` para las fechas del ítem |
| `Sábado 19 de septiembre 19 a 21 h Se suspende por lluvia o cielo nublado.` | `scheduled` (es una condición, no una cancelación) |
| `Reservá tu vacante a partir del miércoles 7 de octubre` (en Precio) | fecha de inscripción, no función |

**Reglas (`dates.ts`):**

1. **Año.** Con año → ese año (el día de semana, si viene, tiene que coincidir). Sin año → el día de
   semana decide: el único año en que ese día y mes caen en ese día de semana dentro de la ventana
   **[hoy − 7 días, hoy + 12 meses]**. Si ningún año coincide, o hay más de uno, se omite con aviso.
   Sin año ni día de semana → ambigua, se omite con aviso. Lo anterior a hoy − 7 días no se emite.
2. **Archivo de varios años.** Los listados acumulan desde 2019 y el día de semana se repite cada
   5–6 años: *"Jueves 18 de marzo 19 hs"* (2021) vuelve a ser jueves el 18-mar-2027 y *"Jueves 10 de
   diciembre 19 hs"* (2020) el 10-dic-2026. Solo con el día de semana, esas charlas se publicarían
   como próximas. Drupal guarda cada imagen en `/sites/default/files/AAAA-MM/` (mes de carga): para
   las tarjetas de `/encuentros-de-ciencia` y `/otras-actividades`, la fecha inferida además tiene que
   caer en la **ventana de publicación** [mes de carga − 3 meses, mes de carga + 12 meses]. Ese mes
   **nunca produce una fecha**: solo descarta inferencias y deja reconocer lo archivado como pasado
   (sin aviso). `/agenda`, `/cursos` y los espectáculos no lo usan (son programación vigente).
3. **Hora.** De la misma línea ("18 h", "19:30h", "19.30 h", "inicio 19 h", "a las 19 hs", "⋅19:00",
   "de 19 a 20.30 h", "17 a 21h", "a las 13 y 14 h") o de la línea siguiente si es solo un horario
   ("Horario: de 10 a 11:30 h"). Una franja que cruza la medianoche conserva solo el inicio (aviso).
4. **Fecha sin hora** → `range` de un día con el texto literal en `scheduleText` (nunca `all_day`, que
   la app muestra como "todo el día").
5. **Patrón semanal** → funciones solo dentro de una temporada publicada con inicio y fin. Los cursos
   de `/cursos` la publican, pero se emiten como **un `range`** (inicio → última clase) con el horario
   literal: son 12 clases con una sola inscripción, no funciones sueltas. Los espectáculos del domo,
   el museo y los telescopios no publican temporada: no se emiten.
6. **Estado.** "ACTIVIDAD SUSPENDIDA"/"cancelada" → `cancelled`; "Cupo completo"/"agotado" →
   `sold_out`; "postergada" → `postponed`. Una línea de estado sin fecha vale para todo el ítem.

## 5. Precio (`priceOf`)

Solo el campo **Precio** de la ficha. Gratis cuando lo dice: "Gratis", "¡Gratis!", "GRATIS",
"Actividad gratuita…", "Ingreso gratuito…", "Sin costo…", "Libre y por orden de llegada" (campo
Precio que empieza con "Libre"). Importes: "$ 1.500.-", "$6000.-", "$48.000.-" → `min`/`max`.
"Actividad arancelada" sin importe → `isFree: false` sin montos. Se copian solo las líneas con
precio (y "Este es el valor por la totalidad del curso (12 clases)"); "Únicamente venta online." o
"DESCARGÁ TUS ENTRADAS…" no. Sin nada de eso → sin precio. `priceVerified: true` siempre que hay
precio (es el campo de la propia actividad). "Ingreso por orden de llegada" solo no dice precio.

## 6. Dirección, venue y salas

- Pie de todas las páginas y `/encontranos`: **"Av. Sarmiento s/n, 1425 CABA"** (enlace a
  `g.page/planetarioba`); `/encontranos`: "en la intersección de Avenida Sarmiento y Avenida Figueroa
  Alcorta, Parque Tres de Febrero, en el barrio de Palermo". **Sin coordenadas publicadas.**
- Venue seed `planetario-galileo-galilei` ("Planetario Galileo Galilei", `Av. Sarmiento s/n`, Palermo,
  `address_source_url` = `/encontranos`). El `VenueRef` del conector lleva la dirección literal y
  `addressSourceUrl`. Si el pie de una ficha publica otra dirección, queda un aviso.
- Campo **Lugar** → `room`: "Sala de espectáculos del Planetario Bs. As." → `Sala de Espectáculos`;
  "Domo del Planetario de Buenos Aires" → `Domo`; "Sala de espectáculos/ Domo" → `Sala de Espectáculos
  / Domo`; "Planetario de Buenos Aires" / "Planetario Galileo Galilei" → sin sala. Otro lugar
  ("Centro Cultural 25 de Mayo") → `{ name }` sin dirección (candidato). Sin "Lugar" → sin venue
  (candidato): no se asume la sede.

## 7. Disciplinas, etiquetas y otros campos

- `ciencia` siempre, primera. Segunda solo por señal literal en el **título o subtítulo**: cine
  (cine, película, documental…), `musica_vivo_jazz` (concierto, recital, "música en vivo", "música y
  ciencia" → *Madre Noche*), `teatro_escenicas` (obra de teatro, teatro).
- Subtítulo = primer encabezado del cuerpo si es corto y no es "Contenidos"/"Programa".
- `ageRating` = "Destinatarios" si menciona una edad ("Público general a partir de los 15 años",
  "ATP"); `infantil` si habla de niños/infancias/familias. `durationMinutes` solo si dice "Duración
  aproximada de N minutos".
- `sameAsUrls` = URL canónica + `/node/<id>` (ambas declaradas por la propia ficha). `ticketsUrl` =
  `field_evento_link_entrada` (Eventbrite para inscripciones, EntradasBA para localidades).

## 8. Duplicados con Linda (`agenda-ba`)

- Linda nombra el espacio "Planetario Galileo Galilei" → institución derivada
  `planetario-galileo-galilei` (la misma del conector) y venue del mismo nombre (el `VenueResolver`
  reutiliza el seed por institución + nombre; el seed además adopta un venue que Linda haya creado
  antes). Linda publica dos direcciones distintas ("Av. Sarmiento s/n, C1425" y "… C1425 Cdad. Autónoma
  de Buenos Aires") y dos pares de coordenadas distintos: no se usan.
- Al 21-oct Linda enlaza las funciones del domo y *Madre Noche* a **EntradasBA** (`/evento/<uuid>`,
  clave compartida del matcher: *Madre Noche* se funde por entrada y por título) y *El universo que no
  vemos* a Eventbrite (se funde por título + fecha). Se mapeó `planetario.buenosaires.gob.ar` en
  `SEED_INSTITUTION_HOSTS` de Linda: si Linda enlaza una ficha del Planetario, esa URL pasa a
  `sameAsUrls` y coincide con la canónica que declara el conector.
- Los Encuentros de Ciencia **no** se funden solos: Linda los titula distinto ("Encuentros de Ciencia:
  Lucas Paganini (NASA)" vs. "El telescopio espacial Roman") y no enlaza la ficha. Quedan dos eventos
  hasta que un revisor los una o Linda enlace la página.
- Las funciones del domo (Agujeros negros, Alerta espacial, Veo Veo, Top 5, Te quiero…, Vuelta por el
  Universo) solo llegan por Linda, con sus instantes.

## 9. Conector y límites

- **Peticiones por corrida:** 5 listados + 6 fichas de espectáculos + 1 ficha por actividad vigente
  (5 hoy) + robots.txt ≈ 17. Todo o nada: un listado que falla o cambia de markup hace fallar la
  corrida (no se marcan ausencias falsas); una ficha de espectáculo con 404 se omite.
- **Corrida del 21-oct-2026** (fixture y en vivo, `--dry-run`): 5 descubiertos, 3 publicables
  (*El universo que no vemos*, *Astronomía General*, *Descubrir, Observar y Disfrutar el Cielo*),
  2 candidatos por `missing:future_occurrence` (*El telescopio espacial Roman* 18-oct y *Madre Noche*
  16/17-oct, dentro de los 7 días de gracia); 8 funciones: 6 `timed` y 2 `range`.
- **Avisos de descubrimiento:** un solo aviso por listado con las tarjetas cuyas fechas no se pueden
  ubicar (hoy 15 en `/otras-actividades`: MUTEK "11 de octubre 17 a 21h", "Primavera Planetaria 21 de
  septiembre 14 a 18h"…, y algunas viejas con el día de semana mal publicado).

**Huecos conocidos**

- Funciones del domo, visitas guiadas del museo ("Odisea espacial", "Visitas guiadas") y telescopios
  se publican como patrón semanal sin temporada: no se emiten (las del domo llegan por Linda).
- Fechas sin año ni día de semana (MUTEK 2026 "11 de octubre", "Primavera Planetaria 21 de
  septiembre") se omiten aunque el título diga el año: la regla no infiere años del título.
- Si una tarjeta reutiliza una imagen vieja (más de 12 meses antes de la fecha) y la fecha no trae
  año, la inferencia se descarta como ambigua (aviso): falso negativo, nunca una fecha inventada.
- Un día de semana mal escrito en una tarjeta archivada puede quedar como "ambigua" en el aviso del
  listado para siempre (p. ej. "Miércoles 7, 14 y 21 de febrero", imagen de 2023-01).
- Cursos: "Cupo completo" en el "¿Cuándo?" manda aunque el cuerpo diga "Inscripciones: ABIERTAS"
  (*Descubrir, Observar y Disfrutar el Cielo*).
- `/espectaculos-para-estudiantes`, `/plaza-astronomica` (museo), `/telescopios` y `/planetario-itinerante`
  no se leen (público escolar o sin fechas). `/club-del-cosmos-1` y
  `/propuestas-para-conocernos-y-compartir` (adolescentes) quedan pendientes de relevar.
