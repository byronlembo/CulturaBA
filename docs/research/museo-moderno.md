# Relevamiento: Museo de Arte Moderno de Buenos Aires — `museo-moderno`

**Fecha:** 18-oct-2026 · **URL oficial:** https://museomoderno.org/ · **Fixtures:** `packages/ingestion/fixtures/museo-moderno/2026-10-18/` (16 entradas, 4,0 MB, grabadas con `pnpm ingest record --source museo-moderno --limit 25`) · **Peticiones de relevamiento:** ~25 con curl, ≥ 2 s entre peticiones, UA `CulturaBA-Ingest/0.1 (+https://culturaba.xn--lembodiseo-19a.com/bot)`.

## 1. Accesibilidad y robots

- Responde **200** a curl: `server: cloudflare`, `x-powered-by: PHP/8.3.24`, `x-litespeed-cache: hit`. Sin *managed challenge* ni CAPTCHA en ninguna URL usada (HTML, `/wp-json/`, sitemaps).
- `https://museomoderno.org/robots.txt`:
  ```
  User-agent: *
  Disallow: /wp-admin/
  Allow: /wp-admin/admin-ajax.php
  Sitemap: https://museomoderno.org/sitemap_index.xml
  ```
  Sin `Crawl-delay`. Todo lo que usa el conector está permitido. El conector usa 1 petición a la vez y ≥ 1,5 s entre peticiones.

## 2. CMS y APIs

- **WordPress** con tema `hello-elementor`, **Elementor Pro**, **JetEngine** (CPT, campos y listados), **JetTabs**, **WPML 5.1** (`es` por defecto, `en` en `/en/`) y **Rank Math** (sitemaps: `agenda-sitemap.xml`, `exposiciones-sitemap1.xml`, `exposiciones-sitemap2.xml`, …).
- `GET /wp-json/wp/v2/types` expone los CPT **`agenda`** (sin taxonomías) y **`exposiciones`** (taxonomías `anio` y `categoria-de-exposiciones`), además de `artistas-federal`, `videos`, `libros`, `productos-tienda`.
- `GET /wp-json/wp/v2/agenda?per_page=100` → `x-wp-total: 104`, `x-wp-totalpages: 2` (orden por fecha de publicación, descendente). Campos útiles: `id`, `slug`, `link`, `date`/`modified` (hora local del sitio, UTC−3), `title`, `excerpt`, `content` (HTML de Elementor), `featured_media`. **Ninguna fecha de la actividad está estructurada**: todo está en el texto del contenido.
- `GET /wp-json/wp/v2/exposiciones?per_page=100` → `x-wp-total: 161`. Las taxonomías **no indican vigencia**:
  - `anio` = año (ids 62 → `2013` … 54 → `2026`); la muestra nueva `historia-de-dos-mundos-2` (publicada el 15-oct-2026) está en `anio=2018`.
  - `categoria-de-exposiciones` = programas: `PROGRAMA DE EXPOSICIONES 2025: ARTE ES TEATRO` (52), `SUBPROGRAMA: MEMORIA Y FUTURO` (51).
  - Las fechas de las muestras son **campos de JetEngine que la REST no expone** (no hay `meta`/`acf`); solo aparecen en el HTML (§5).
- `_embed=wp:featuredmedia` funciona y trae la imagen destacada (`source_url`) en la misma petición. Los `caption` de las imágenes no sirven como crédito (p. ej. `<p>Screenshot</p>`).
- `_fields=id,slug,link,date,modified,title,excerpt,content,_links,_embedded` reduce la respuesta (página 1 de la agenda: 1,2 MB con la imagen embebida).

## 3. WPML (idiomas)

- La REST **sin prefijo** devuelve solo el idioma por defecto (español). El parámetro `lang=es`/`lang=en` se ignora (mismo resultado); el idioma lo da el prefijo de la URL:
  - `GET /en/wp-json/wp/v2/exposiciones` → posts **distintos** (otro `id`, mismo `slug`): `historia-de-dos-mundos-2` es `62886` en español y `62994` en inglés (`link` `https://museomoderno.org/en/exhibitions/historia-de-dos-mundos-2/`).
  - `GET /en/wp-json/wp/v2/agenda` → los **mismos** posts españoles (la agenda no está traducida; WPML los muestra como fallback) con `link` `https://museomoderno.org/en/agenda/<slug>/`.
- Las fichas declaran la traducción con `<link rel="alternate" hreflang="en" href="https://museomoderno.org/en/exhibitions/bosques-umbral/">`.
- Regla del conector: REST sin prefijo + `spanishOnly` (descarta cualquier `link` bajo `/en/` y duplicados por `id` o `slug`). La URL inglesa declarada por hreflang va a `sameAsUrls`.

## 4. Agenda (CPT `agenda`)

Contenido Elementor: párrafos descriptivos y, después, el bloque práctico **una línea por dato** (fecha/hora, público, lugar, precio/inscripción, botón). Ejemplo literal (`/agenda/el-agua-en-la-naturaleza-y-el-arte/`, id 62873):

```
Miércoles 28 de octubre, a las 17 h
Orientado al público general
Auditorio – Av. San Juan 350 (CABA)
Actividad gratuita con inscripción previa AQUÍ
¡INSCRIBITE!                       (botón elementor-button → Google Forms)
```

Formas de fecha observadas (todas al **comienzo** de la línea; sin año salvo excepciones):

| Texto literal | Ítem | Resultado |
|---|---|---|
| `Miércoles 28 de octubre, a las 17 h` | 62873 | timed 17:00 |
| `Sábado 31 de octubre, de 16.30 a 18.30 h` | 62239 | timed 16:30–18:30 |
| `Sábado 3, 17 y 24  y domingo 4, 11, 18 y 25  de octubre, de 15 a 17 h` | 62189 | 7 funciones (día de semana verificado por número) |
| `Domingos 04 y 18 de octubre, de 16 a 18 h` | 62087 | 2 funciones |
| `Sábados 24 y 31 de octubre y 7 de noviembre, de 11.30 a 13 h` | 58065 | 3 funciones (dos meses en una línea) |
| `Viernes 23 y sábado 24 de octubre, 19 h` + `Domingo 25 de octubre, 18 h`, y luego por función `Viernes 23 de octubre de 2026` / `19 h` | 62820 (ciclo de cine) | 3 funciones (las cabeceras por día no duplican) |
| `Sábado 10 de octubre` / `16.30 h – Performance` / `18 h – Entrevista pública…` | 62357 | timed 16:30 (la primera hora de la línea siguiente) |
| `Sábado 27 de septiembre, a las 17 y 19 h` (exposiciones 2025) | 56381 | 2 funciones el mismo día |
| `16 a 19 de abril` / `17 de abril` / `19 h \| Noche de Colección…` | 57592 | funciones del 17 y 18; el rango se descarta |
| `Todos los Miércoles  de 16 a 18 h`, `Encuentros semanales, los viernes a las 12 h`, `Dos sábados o domingos por mes, de 11.30 a 13.30 h` | 57273, 56849, 50528 | **sin funciones** (patrón sin temporada publicada) |
| `Inicio del curso: martes 15 de septiembre` / `MÓDULO 5 … – 10 de noviembre` (curso asincrónico) | 52580 | sin funciones (no es línea de fecha) |

Reglas del conector (`dates.ts`):
- Línea de fecha = empieza con [día de semana] día [, día y día] de mes [de año]; el resto de la línea es la hora. Franja `de 16 a 18 h` ⇒ inicio y fin; lista `a las 17 y 19 h` ⇒ una función por hora. Sin hora en la línea ⇒ la **primera** hora de la línea siguiente si esa línea empieza con una hora; si no, **all_day** (nunca se inventa la hora). Un día que ya tiene función por una línea con hora propia no toma horas de cabeceras de programa.
- **Año:** con día de semana, el único año (anterior, actual o siguiente) en que la fecha cae ese día y a ≤ 12 meses (así `Sábados 16 y 23 de mayo` es 2026 —pasado— y no 2027; `Sábado 10 de mayo` de una entrada vieja es 2025). Sin día de semana, `inferYear` de shared anclado en la **publicación** del ítem (no en hoy: `semana-aniversario`, publicada el 13-mar, dice `17 de abril` y anclada en octubre daría 2027) y solo hasta ~6 meses adelante. Día de semana incoherente ⇒ se descarta con aviso.
- **Entradas reutilizadas:** el sitio actualiza posts viejos (`caja-de-sorpresas`, publicado el 21-feb-2025, anuncia `Domingo 25 de octubre, de 11.30 a 12.30 h` de 2026; `moderno-bailable`, de 2025, tiene los módulos de 2026). Por eso se leen las 2 páginas completas y se filtra por fecha, no por publicación.
- **Bloques:** lugar, precio e inscripción se toman del bloque que sigue a cada línea de fecha (hasta el botón, la próxima fecha o 8 líneas). `spaa-2026` mezcla un módulo en el Auditorio, uno en `Sala PAyS, Parque de la Memoria – … – Av. Costanera Rafael Obligado 6745 (CABA)` y tres virtuales (`Actividad virtual – Plataforma Google Meet`): los virtuales no se emiten.
- Discover solo emite ítems con alguna función de hoy en adelante: el 18-oct, 15 de 104 (78 solo con fechas pasadas, 11 sin fechas reconocibles).

## 5. Exposiciones (CPT `exposiciones`)

- **Listado** `https://museomoderno.org/exposiciones/`: JetTabs con tres pestañas, `Pasadas` / `Presentes` / `Futuras` (`.jet-tabs__control[aria-controls]` → `#jet-tabs-content-*`). Cada pestaña tiene grillas JetEngine con `.jet-listing-grid__item[data-post-id]` (= id del post), título en `h2 a[href]` y fecha en `.jet-listing-dynamic-field__content`:
  - Presentes: `Hasta el 30 de Abril de 2027` (Bosques Umbral), `Hasta el 1 de Febrero de 2027` (Habitando el futuro), `Hasta el 18 de Octubre de 2026` (La memoria de la colección)… 11 ítems hoy.
  - Pasadas: mes de la muestra/función (`Octubre 2026` Joanna Pawlik: Spinalonga, `Junio 2026` El borde de sí mismo).
  - Futuras: vacía hoy (`jet-listing-not-found`).
- **Ficha** `https://museomoderno.org/exposiciones/<slug>/` (`body.single-exposiciones.postid-<id>`): bloque "Fecha" con dos campos JetEngine:
  - exactos: `Inicio: 20 de Agosto de 2026` / `Fin: 30 de Abril de 2027` (Bosques Umbral), `Inicio: 13 de Junio de 2026` / `Fin: 18 de Octubre de 2026` (La memoria de la colección);
  - **solo mes**: `Inicio: Abril de 2026` / `Fin: Febrero de 2027` (Océano interior, Naturaleza arquitecta, Moderno y MetaModerno, Ariel Cusnir, Ana Gallardo), `Inicio: Enero de 2026` (Habitando el futuro), `Inicio: Septiembre de 2026` (Vestir mundos), `Inicio: Agosto de 2026` (Luis Camnitzer), `Inicio: Mayo de 2026` / `Fin: Noviembre de 2026` (Darkness Visible).
- **Ubicación:** en la bajada de la REST, `<p><b>Ubicación:</b> Segundo piso (Sala G)</p>`; otras: `Primer piso (Salas C, E y F)`, `Segundo subsuelo (Sala I)`, `Espacios de circulación común en planta baja`, `Café Moderno`, `Parque de la Memoria – Monumento a las Víctimas del Terrorismo de Estado, Av. Costanera Rafael Obligado 6745, CABA`, `Spazio Punch – Fondamenta S. Biagio, 800/o, Venecia, Italia`.
- Regla del conector (`exhibitionRange`): `range` con fin = día exacto de `Fin:` o de `Hasta el …` (si ambos son exactos deben coincidir; si `Fin:` da solo el mes, `Hasta el …` debe caer en ese mes). Inicio = día exacto de `Inicio:`; si solo publica el mes y la muestra está en **Presentes**, el rango empieza **hoy** (misma semántica que `hasta el X` en `parseDateRangeEs`; el texto literal queda en `sourceDateText`). Muestra futura sin día de inicio ⇒ sin ocurrencia. El `externalId` de la ocurrencia no incluye el inicio (`exposiciones/<id>|range`).
- **Horario** (`scheduleText`), solo para muestras en la sede: `/planea-tu-visita/`, bloque "HORARIO": `Lunes, miércoles, jueves y viernes: 11:00 a 19:00 h · Sábados, domingos y feriados: 11:00 a 20:00 h · (Martes cerrado excepto feriados)` (se omite la línea `Recorridos Públicos: 16:00 h`).
- El CPT `exposiciones` también contiene ciclos de artes escénicas con funciones en el texto (`El borde de sí mismo`: `SEMANA 7 - Jueves 23 al domingo 26 de julio de 2026` / `Jueves 23 de julio, 19 h`); hoy están en "Pasadas" y el conector los trataría como muestra (rango). Ver §10.

## 6. Dirección y venues

- Dirección publicada en el footer de todas las páginas: `Av. San Juan 350. San Telmo. Buenos Aires. C1147AAO.` y en `https://museomoderno.org/planea-tu-visita/` ("UBICACIÓN"): `Av. San Juan 350, San Telmo. Buenos Aires, Argentina`. Seed: venue `museo-moderno` (`Av. San Juan 350`, San Telmo, `address_source_url` = `/planea-tu-visita/`, verificada el 18-oct-2026).
- Salas como `room`: `Auditorio`, `Sala Yapeyú`, `Sala Supervielle`, `Hall principal`, `Biblioteca`, `Segundo piso (Sala G)`…
- Lugares fuera de la sede: solo con dirección si el texto la ubica en la Ciudad (`(CABA)`, `CABA`, `Buenos Aires`): `Punto de encuentro: CeSAC Nº 15, Balcarce 1170 (CABA)` ⇒ nombre `CeSAC Nº 15`, dirección `Balcarce 1170 (CABA)`; `Acceso Sur – Camino de los Plumerillos (CABA)` ⇒ literal. `Av. Dorrego 4019 (Servicio Meteorológico Nacional)` o la muestra en Venecia ⇒ solo nombre (candidato). `Café Moderno` no se atribuye a la sede (el sitio no publica dónde está el café; `/cafe-del-moderno/` solo dice "CAFÉ CERRADO POR REFACCIONES").

## 7. Precio

- Por actividad, literal: `Actividad gratuita con inscripción previa`, `Entrada libre y gratuita`, `Actividad gratuita, sin inscripción previa, sujeta a la capacidad de la sala` ⇒ gratis; `Actividad arancelada con inscripción previa` ⇒ `isFree: false` sin importe; `Actividad presencial sin inscripción previa` o `Entradas a la venta en boletería y EntradasBA` ⇒ sin precio.
- Regla general publicada en `/planea-tu-visita/` (no se usa para no atribuirla a cada muestra): `Entrada general (Extranjeros): $16.000`, `Entrada general (Residentes): $5.000`, `Miércoles y último domingo del mes: Sin cargo` + lista de gratuidades.
- Inscripción/entradas: botón Elementor (`¡INSCRIBITE!` → Google Forms; `¡Conseguí tus entradas!` → `entradasba.buenosaires.gob.ar/evento/<uuid>`), sin el parámetro `usp` de Google Forms.

## 8. Disciplinas (tabla explícita, `disciplines.ts`)

El CPT `agenda` no tiene taxonomía; la bajada escrita a mano funciona como tipo (`Ciclo de cine y video experimental`, `Taller a cargo de José Luis Espejo`, `Concierto y charla sobre música y braille`, `Recorrido por Bosques umbral`, `Presentación de la publicación`, `Seminario Permanente de Arte Argentino`). Título + bajada: cine/película/proyección/video experimental ⇒ `cine`; danza/ballet ⇒ `danza`; performance ⇒ `teatro_escenicas` (o `danza` si el texto habla de danza/coreografía); concierto/recital/DJ set ⇒ `musica_vivo_jazz`; charla/conversación/presentación de la publicación/seminario/jornadas/lecturas ⇒ `literatura_charlas`; recorrido/visita ⇒ `museos_exposiciones`; taller/laboratorio/curso ⇒ `otros`; nada ⇒ `otros` + aviso. "Teatro" a secas no cuenta (exposición "Esto es Teatro"). Exposiciones ⇒ `museos_exposiciones` (+ `fotografia_artes_visuales` si título, bajada o primer párrafo hablan de fotografía o artes visuales).

## 9. Duplicados con Linda (`agenda-ba`)

- Linda trae 13 actividades con `ubicacion.titulo = "Museo Moderno"` (+ "Las tres ecologías | Solaroid", sin ubicación, que enlaza al museo) en el fixture 2026-10-14: institución derivada `slugify("Museo Moderno")` = **`museo-moderno`** (la misma del conector) y venue por nombre "Museo Moderno" (= el venue seed: el VenueResolver lo reutiliza por institución + nombre).
- Algunos botones de Linda apuntan a la ficha del museo (`Inscribite acá` → `https://museomoderno.org/agenda/caja-de-sorpresas/`, `…/agenda/las-tres-ecologias-solaroid/`): Linda la guarda como `ticketsUrl`, y el matcher la cruza con la `officialUrl`/`sameAsUrls` del museo. El resto cruza por `dedup_key` (título normalizado | institución) con fechas compatibles: `Historias compartidas`, `Pentagrama`, `Miradas cruzadas`, `Movimiento invención: Tiempo de jugar`. Los talleres anuales que Linda trae con fechas ("Tercera Dimensión", "Trama", "Caleidoscopio") el museo los publica como patrón semanal: quedan solo de Linda.
- `museomoderno.org` no está en `SEED_INSTITUTION_HOSTS` de agenda-ba: cuando Linda llega DESPUÉS que el museo, el cruce es solo por título. Agregarlo haría que Linda exponga esas URLs como `sameAsUrls`.

## 10. Conector y límites

- `discover`: `/exposiciones/` → REST `exposiciones?include=<ids>` → `/planea-tu-visita/` (no crítico) → REST `agenda` páginas 1 y 2 = **5 peticiones**; `enrich`: 1 ficha por muestra (11 hoy). Total ≈ 17 peticiones por corrida (con robots.txt).
- Límites conocidos: inicio de muestra con solo el mes ⇒ el rango empieza "hoy" (no se inventa el día de apertura); patrones semanales sin temporada (talleres anuales "Todos los …") no generan funciones (Linda sí los trae con fechas); actividades virtuales no se emiten; los programas de artes escénicas del CPT `exposiciones` se tratarían como rango si vuelven a "Presentes"; el tipo de actividad se infiere de texto libre.
