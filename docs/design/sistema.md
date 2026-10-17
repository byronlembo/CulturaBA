# Sistema de diseño "Telón" — especificación para desarrollo

Identidad elegida el 17-oct-2026 entre dos direcciones (lienzo de diseño con las pantallas
Para vos, ficha, mapa y ranking). **Telón** es una sala oscura color bordó, con dorado de
bronce y tipografía de programa de mano. La app es **siempre oscura**: no hay variante clara
(decisión de producto), así que hay una sola paleta.

La fuente de verdad es el código; este documento explica el porqué y lo que el código no
dice (estados, bordes, accesibilidad), para la web y para la futura app nativa.

Referencia visual navegable (tokens, tipografía y componentes): artifact Design System
"Telón", https://claude.ai/artifact/MV9E8QFGTQD6LbEmjPtPe9 (privado; se comparte desde su menú).

| Dónde | Qué |
|---|---|
| `apps/mobile/src/theme/tokens.ts` | Colores, fuentes, escala tipográfica, espacios, radios |
| `apps/mobile/src/components/ui/Primitives.tsx` | Screen, Txt, Button, Field, Card, Section, Chip, Badge, StatTile, Skeleton, EmptyState, ErrorState, Loading |
| `apps/mobile/src/components/ui/EventCard.tsx` | Tarjeta "talón de entrada" |
| `apps/mobile/src/components/ui/OccurrenceRow.tsx` | Fila de función (fecha, hora, estado, calendario) |
| `apps/mobile/app/_layout.tsx`, `app/(tabs)/_layout.tsx` | Carga de fuentes, tema de navegación, barra de pestañas |
| `apps/mobile/public/index.html` | Fondo, anillo de foco y suavizado de fuentes en la web |
| `apps/mobile/src/features/map/map.css` | Mapa (Leaflet) en la paleta |
| `docs/design/voz.md` | Voz y textos |

## Tokens

### Color

| Token | Valor | Uso | Contraste medido |
|---|---|---|---|
| `bg` | `#1C0F15` | Fondo de pantalla, muescas del talón | — |
| `surface` | `#2A1720` | Tarjetas, campos | — |
| `surfaceAlt` | `#3A2029` | Botón secundario, StatTile, imagen cargando | — |
| `tabBar` | `#24131A` | Barra de pestañas | — |
| `text` | `#F6EEE8` | Texto principal | 16,2:1 sobre `bg` · 14,8:1 sobre `surface` |
| `muted` | `#CBB8B8` | Texto secundario, íconos de acción | 9,8:1 sobre `bg` · 7,8:1 sobre `surfaceAlt` |
| `accent` | `#E0B055` | Botón principal, chip seleccionado, hora, pestaña activa, foco | 9,3:1 sobre `bg` · 8,5:1 sobre `surface` |
| `onAccent` | `#1C0F15` | Texto sobre `accent` | 9,3:1 |
| `border` | `#4A2A35` | Separadores (decorativo) | — |
| `borderStrong` | `#5A3441` | Borde de chips y botones sin relleno; línea de corte del talón | Decorativo: el texto identifica el control |
| `outline` | `#8C6672` | Borde de campos de texto | 3,4:1 sobre `surface` (WCAG 1.4.11) |
| `success` / `warning` / `danger` | `#6FCF97` / `#F59E6B` / `#FF8A80` | Estados de funciones y movimientos de puntos | ≥ 6,4:1 sobre todas las superficies |
| `overlay` | `rgba(28,15,21,0.78)` | Fondos sobre imagen | — |

Reglas:
- `accent` es para **una** acción o estado por zona; no se usa para texto largo.
- `warning` es coral, no dorado, para que no se confunda con `accent`.
- Los estados nunca van solo por color: los `Badge` siempre llevan texto ("Cancelada", "Reprogramada").

### Tipografía

Dos familias de Google Fonts, cargadas con `expo-font` (`@expo-google-fonts/*`). Hay una
familia por peso, porque en nativo `fontWeight` no elige archivo. **Nunca** se combina
`fontFamily` propia con `fontWeight`: en la web el navegador sintetiza una negrita falsa.

| Variante (`Txt variant`) | Familia | Tamaño / interlínea | Uso |
|---|---|---|---|
| `display` | Bodoni Moda SemiBold | 36 / 38 | Título de la ficha |
| `title` | Bodoni Moda SemiBold | 23 / 26 | Título de tarjeta; sala (20) |
| `section` | Bodoni Moda Medium *Italic* | 22 / 28 | Encabezados de sección ("Fechas", "Tus puntos") |
| `numeral` | Bodoni Moda SemiBold | 34 / 36 | Número del día en el talón |
| `heading` | Schibsted Grotesk SemiBold | 17 / 22 | Rótulos fuertes, botones (15) |
| `body` | Schibsted Grotesk Regular | 15 / 22 | Texto |
| `small` | Schibsted Grotesk Medium | 13 / 18 | Metadatos |
| `caption` | Schibsted Grotesk Medium | 12 / 16 | Rótulos chicos, pestañas |

- Los títulos de pestaña van en Bodoni 28 y los del encabezado de pila en Bodoni 22.
- Las cifras destacadas (StatTile, saldo de puntos) van en **Schibsted SemiBold**, no en Bodoni (guía de dataviz).
- Los puntos del ranking usan cifras tabulares.

### Espacios y radios

`spacing`: xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32. El margen lateral de pantalla es
`lg`; entre secciones va `xl`.

`radius`: sm 8 · md 12 · lg 14 (tarjetas) · pill (botones y chips).

## Componentes

| Componente | Variantes / props | Notas |
|---|---|---|
| `Button` | `primary` (dorado), `secondary` (`surfaceAlt`), `ghost` (borde `borderStrong`); `icon`, `loading`, `disabled` | Pill, alto mínimo 48. Texto `heading` 15 |
| `Chip` | `selected`, `small`, `icon`, `onPress` | Seleccionado: dorado con texto oscuro en SemiBold. Sin seleccionar: transparente con borde `borderStrong`. Alto mínimo 44 si es tocable |
| `Card` | — | `surface`, radio 14, sin borde |
| `Section` | `title`, `right` | Título `section` con `role=heading` y `aria-level=2` |
| `Field` | props de `TextInput` | `surface` + borde `outline`, alto mínimo 44 |
| `StatTile` | `label`, `value` | `surfaceAlt`, rótulo `caption`, cifra Schibsted 28. Se lee como "rótulo: valor" |
| `EmptyState` / `ErrorState` | `title`, `body`, `action` / `title`, `onRetry` | El título va en Bodoni con `aria-level=2`. Los errores nunca muestran el mensaje técnico |
| `EventCard` | `compact` | Ver abajo |
| `OccurrenceRow` | `showVenue`, `onAddToCalendar`, `divider` | Ver abajo |

### Tarjeta "talón de entrada" (`EventCard`)

```
┌──────────────────────────────┐
│ imagen 2:1                   │
◖┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄◗   ← muescas de 20 px (color bg) + línea punteada borderStrong 2 px
│ sáb │ Teatro · Sala SinPiso  │
│ 17  │ Fuerza Bruta           │   ← numeral Bodoni / title Bodoni (máx. 2 líneas)
│ oct │ 21:00 · +9 fechas  Gratis │ ← hora en accent SemiBold; resto muted
└──────────────────────────────┘
```

- **Columna de fecha** (`ticketDate`): muestra el día de la semana, el número y el mes en hora de Buenos Aires.
  - Si la muestra está en curso: "hasta" + día y mes de cierre.
  - Sin fecha próxima: no hay columna.
- **Detalle** (`ticketDetail`): depende del tipo de fecha.

  | Caso | Texto |
  |---|---|
  | Función | Hora + "+N fecha(s)" |
  | Muestra futura | Rango "Del 16 oct al 13 dic" |
  | En curso | "En curso" |
  | Todo el día | "Todo el día" |
  | Sin fechas | "Sin fechas próximas" |

- **No se agregan textos que no estén en los datos.** No hay "Última función" ni precio sin verificar.
- **Conteos sociales:** "1 va / 3 van" y "1 recomienda / 2 recomiendan". Se omiten si son 0.
- **Compacta** (Guardados): imagen de 110 px a la izquierda, sin muescas ni columna de fecha, título en 19.
- **Etiqueta accesible única:** título, cuándo, sala, disciplina y "Gratis". La imagen lleva el título como etiqueta.
- **Nativo:** en iOS el borde punteado de un solo lado sale liso. Si molesta, dibujar los guiones como Views (anotado como `shortcut` en el código).

### Fila de función (`OccurrenceRow`)

- **Fecha y hora:** para una función, la fecha va en Bodoni 20 y la hora en `accent` SemiBold. Para rangos y días completos va el texto completo en Bodoni.
- **Estado:** `Badge` con texto ("Cancelada" en danger; "Reprogramada (antes: …)" y "Postergada" en warning; "Agotada" en muted).
  - Una función cancelada se ve tachada y al 60 %, y no tiene botón de calendario.
- **Calendario:** botón de 44×44 con ícono `muted` y etiqueta "Agregar al calendario: <fecha>".
- **Divisor:** `divider={false}` cuando la fila va dentro de una tarjeta (Calendario).

## Estados e interacción

| Elemento | Estado | Comportamiento |
|---|---|---|
| Button | presionado / deshabilitado / cargando | Opacidad 0,85 / 0,5 / spinner del color del texto |
| Chip, acciones de la ficha | presionado | Opacidad 0,8 |
| Acción de la ficha (Asistiré, Recomiendo, Guardar) | activa | Fondo y borde dorados, ícono y texto oscuros |
| Todo control en la web | foco de teclado | Anillo `2px solid accent`, separado 2 px (`:focus-visible` en `index.html`) |
| Pestaña | activa / inactiva | `accent` / `muted`; etiqueta Schibsted 12 |
| Pin del mapa | seleccionado | Relleno opaco y borde `text` de 3 px; los demás al 85 % con borde `bg` |
| "Estás acá" | — | Relleno `text` con borde dorado |

No hay animaciones propias; las transiciones son las de React Navigation.

## Bordes y casos límite

- **Títulos largos:** dos líneas en la tarjeta (con elipsis) y sin límite en la ficha. La línea "disciplina · sala" ocupa una línea con elipsis.
- **Imagen que falla:** se usa la imagen de respaldo por disciplina. Mientras carga se ve `surfaceAlt`.
- **Fuentes que no cargan:** la app sigue con las fuentes del sistema (no queda trabada en el splash).
- **Cargando / vacío / error:**
  - Cargando muestra `Loading`, con el spinner dorado.
  - Vacío y error usan `EmptyState` / `ErrorState` con un título según el contexto y "Reintentar".
- **Mapa:** las teselas de OpenStreetMap se oscurecen con un filtro CSS (`shortcut`; con más tráfico conviene un proveedor de teselas oscuras). La lista de salas debajo repite la información para lectores de pantalla.
- **Zona horaria:** las fechas siempre van en hora de Buenos Aires. Si el dispositivo está en otra zona, se avisa "Horarios en hora de Buenos Aires".

## Accesibilidad (verificado el 17-oct en la build web)

- **axe-core 4.10:** 0 problemas críticos o serios en 11 pantallas. Queda el moderado "region": la barra de pestañas está fuera de `main`.
- **Sondas de ux-ui-audit:**
  - Contraste: 0 fallas en 1.059 textos medidos (6 pantallas).
  - Áreas táctiles: todas ≥ 44 px, salvo los enlaces de atribución de Leaflet, que son texto en línea y están exentos.
  - Foco visible: 9,3:1 en todos los controles probados.
  - Encabezados: un `h1` por pantalla (en la ficha, también el título de la cabecera) y secciones en `h2`.
- Raíz de la web en `lang="es-AR"`.
- Las cifras van con su rótulo en la etiqueta accesible ("Tus puntos: 30").

## Responsive

La app se diseñó para teléfono (390 × 844). En pantallas anchas la web estira el mismo
diseño de una columna; no hay cortes de ancho todavía (pendiente si se suma una vista de
escritorio).
