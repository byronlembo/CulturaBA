# Inventario de fuentes

> **Estado de verificación (14-oct-2026):** la política de red del entorno de desarrollo
> bloqueó el acceso a todos los dominios culturales (`403` en el túnel del proxy) y a
> `*.supabase.co`. Nada de lo que sigue sobre el *contenido* de cada sitio pudo
> comprobarse desde aquí: lo marcado como **hipótesis** son suposiciones razonables
> basadas en cómo suelen publicarse estas agendas, y debe confirmarse con el
> protocolo de relevamiento de abajo antes de escribir un conector. Las URLs
> oficiales son las que entregó el encargo.

## Protocolo de relevamiento (por fuente)

Ejecutar en orden, registrar el resultado en la ficha de la fuente y guardar
fixtures con `pnpm ingest record --source <slug>` apenas haya un conector mínimo:

1. `GET /robots.txt` — rutas prohibidas, `Crawl-delay`. El cliente HTTP lo respeta solo.
2. `GET /sitemap.xml` (y sitemaps anidados) — ¿lista páginas de eventos con `lastmod`?
3. Detectar CMS: cabeceras, `/wp-json/` (WordPress), `/wp-json/tribe/events/v1/events`
   (plugin *The Events Calendar*), `/jsonapi` (Drupal), `/feed/` o `/rss` (RSS).
4. En una página de detalle: `<script type="application/ld+json">` con `@type: Event`
   (startDate, endDate, location, offers, image) — la vía más fiable si existe.
5. Si el listado se arma por JavaScript (calendario interactivo): abrir con
   Playwright (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) y capturar las peticiones
   XHR/fetch (`page.on('request')`) para encontrar el JSON que alimenta el calendario.
6. Anotar: patrón de URL de detalle, identificador estable (slug/id), campos
   disponibles, formato crudo de las fechas (ejemplos literales), salas/espacios,
   términos de uso e indicaciones sobre imágenes.
7. Elegir el método en este orden: API/JSON oficial → JSON-LD → RSS → HTML con
   `cheerio` → navegador automatizado (último recurso).

## Tabla resumen

| Fuente | Institución | URL oficial | Disciplinas (hipótesis) | Método probable | Frecuencia sugerida | Prioridad | Conector |
|---|---|---|---|---|---|---|---|
| `teatro-colon` | Teatro Colón | https://teatrocolon.org.ar/calendario/ | ópera, clásica, ballet/danza, conciertos | calendario JS → JSON (XHR) o HTML | cada 6 h | máxima | **pendiente** (bloqueado por red) |
| `mnba` | Museo Nacional de Bellas Artes | https://bellasartes.gob.ar/agenda/ | exposiciones, visitas guiadas, talleres, charlas, cine | HTML (posible WordPress) | cada 6 h | máxima | **pendiente** |
| `palacio-libertad` | Palacio Libertad | https://palaciolibertad.gob.ar/agenda/ | música, teatro, artes visuales, cine, literatura, infantil | HTML/JSON (posible WordPress) | cada 6 h | máxima | **pendiente** |
| `complejo-teatral` | Complejo Teatral de Buenos Aires (San Martín, Alvear, Regio, Sarmiento, De la Ribera) | https://complejoteatral.gob.ar/ | teatro, danza, música | HTML | cada 12 h | alta | no iniciado |
| `agenda-ba` | Turismo Buenos Aires | https://turismo.buenosaires.gob.ar/es/article/que-hacer-esta-semana | agregador multi-institución | HTML editorial | diaria | alta (dedup cross-institución) | no iniciado |
| `cultura-gob-ar` | Agenda Cultural Federal | https://www.cultura.gob.ar/agenda/filtro/ | agregador nacional | HTML con filtros | diaria | complementaria | no iniciado |
| `sample` | (sintética) | — | todas | JSON | — | — | **operativo** (solo tests/desarrollo) |

Prioridad = valor para el usuario × facilidad estimada. `priority` en la tabla
`sources` decide quién gana cuando dos fuentes describen el mismo evento:
institución (100) > agregador de la Ciudad (10).

## Fichas

### Teatro Colón — `teatro-colon`
- **Institución / venue seed:** Teatro Colón, Cerrito 628, CABA (dirección ampliamente
  publicada; `address_verified_at` queda nulo hasta confirmarla en el sitio).
- **Espacios conocidos (hipótesis a mapear):** Sala Principal, Salón Dorado, Centro de
  Experimentación (CETC), Colón Fábrica (Av. Pedro de Mendoza, Barracas — *otra
  dirección*: nunca heredar la del teatro). Regla: sala desconocida → venue de la
  institución + `room` textual, sin inventar dirección.
- **Disciplinas:** `opera_clasica` (ópera, sinfónicos, cámara, Chopiniana), `danza`
  (ballet), `musica_vivo_jazz` solo si la programación lo indica.
- **Hipótesis de extracción:** el calendario es una vista por mes alimentada por
  JavaScript; buscar el endpoint JSON con Playwright. Cada función es una fila
  propia (fecha + hora + sala) → ocurrencias `timed`, varias por título.
- **Riesgos:** títulos con temporada ("Temporada 2026"), funciones agotadas, cambios
  de elenco (no relevantes para dedup), WAF que bloquee IPs de datacenter.
- **Imágenes:** usar la URL original solo si los términos lo permiten; crédito
  fotográfico si aparece.

### Museo Nacional de Bellas Artes — `mnba`
- **Institución / venue seed:** Av. del Libertador 1473, Recoleta (a verificar).
- **Disciplinas:** `museos_exposiciones` (muestras → ocurrencia `range` con
  `schedule_text` = horario de apertura), `literatura_charlas` (charlas), `cine`
  (ciclos), `historia_patrimonio`/`fotografia_artes_visuales` según la actividad.
- **Hipótesis de extracción:** agenda HTML con tarjetas por actividad y página de
  detalle; probable WordPress (`/wp-json/wp/v2/`). Visitas guiadas recurrentes:
  si enumera fechas → una `timed` por fecha; si publica un patrón ("sábados 16 h")
  → `range` + `recurrence_rule`.
- **Gratuidad:** solo `is_free = true` cuando el texto lo dice ("entrada libre y gratuita").

### Palacio Libertad — `palacio-libertad`
- **Institución / venue seed:** Sarmiento 151, CABA (a verificar). Muchos espacios
  internos (Auditorio Nacional, salas por piso) → `room`.
- **Disciplinas:** amplio abanico; se necesita una tabla de mapeo
  categoría-del-sitio → disciplina CulturaBA, con `otros` como escape y meta ≥ 90 %
  de cobertura (el resto queda `candidate`).
- **Hipótesis de extracción:** agenda HTML con filtros; probable WordPress con
  JSON. Actividades de varios días (ferias, muestras) → `range`; conciertos → `timed`.

### Complejo Teatral de Buenos Aires — `complejo-teatral`
- Cinco salas con direcciones distintas → un venue por sala en `venues`.
- Obras en temporada con funciones semanales: enumerar fechas si el sitio las lista;
  si solo publica "jueves a domingos" → `range` + `recurrence_rule` + `schedule_text`.

### Agendas de la Ciudad — `agenda-ba` (turismo) y Cultura BA
- Agregadores: el mismo evento puede aparecer también en su institución. Entra con
  `priority` 10: solo rellena campos vacíos y aporta ocurrencias; dedup
  cross-institución con umbral alto (ver `docs/architecture.md`).

### Agenda Cultural Federal — `cultura-gob-ar`
- Cobertura nacional; filtrar a CABA. Verificar frecuencia de actualización antes de
  depender de ella. Complementaria.

### Fuentes futuras (no relevadas)
MALBA, Fundación Proa, Museo Moderno, Centro Cultural Recoleta, Usina del Arte,
Teatro Nacional Cervantes, Konex, salas de jazz (Thelonious, Bebop). Para geocodificar
venues sin inventar: datasets abiertos de BA Data (direcciones/geocoder oficial).

## Cómo agregar un conector

1. Crear `packages/ingestion/src/connectors/<slug>/connector.ts` implementando
   `SourceConnector` (ver `connectors/sample/connector.ts` como plantilla):
   `discover` (IO, listado) → `enrich` (IO, detalle, opcional) → `parse` (puro).
2. Mapear salas y categorías en archivos propios del conector (`venues.ts`,
   `disciplines.ts`); usar `parseDateEs`/`parseDateRangeEs`/`parseTimeEs` de
   `@culturaba/shared` y `detectStatusEs`/`detectFreeEs` para estados y gratuidad.
3. Registrarlo en `connectors/index.ts` y asegurar que exista la fila en `sources`
   (`supabase/seed.sql`).
4. `pnpm ingest record --source <slug>` guarda fixtures; escribir tests de parser
   con `FixtureHttpClient` y snapshots.
5. `pnpm ingest run --source <slug> --from-fixture latest --dry-run` y luego en vivo.
