# Prueba de usabilidad con 5 personas — guion

**Objetivo.** Saber si la gente puede, sin ayuda:
- encontrar algo para ver cerca;
- hacer check-in en la sala;
- anotar una función en el diario;
- sumar un amigo y entender el ranking.

También queremos ver si la identidad "Telón" se lee bien de noche y en la calle.

**Método.** Prueba moderada, una persona por vez, de 45 minutos, en su propio teléfono y con
`https://culturaba.lembodiseño.com`. Piensan en voz alta. Una persona facilita y otra toma
notas. Con 5 personas aparecen la mayoría de los problemas graves de un flujo; si cambian las
tareas, se hace otra ronda.

## Participantes

| Perfil | Cuántas | Por qué |
|---|---|---|
| Va a teatro, ópera o museos al menos una vez por mes | 2 | Público central: ¿reemplaza a cómo se enteran hoy? |
| Sale poco, pero le interesa "si me lo ponen fácil" | 2 | Descubrimiento: ¿el mapa y Para vos alcanzan? |
| Más de 60 años o usa letra grande en el teléfono | 1 | Legibilidad de Bodoni sobre bordó, tamaños táctiles |

Requisitos:
- Viven o se mueven por CABA y usan el teléfono a diario.
- No trabajan en el proyecto.
- Al menos una persona usa un lector de pantalla o el zoom del sistema; si no se consigue, queda anotado como hueco.

**Antes de la sesión:**
- Crear una cuenta de prueba por persona (con un email propio de ella o uno del equipo) y anotar el `@usuario`.
- Crear una cuenta "amiga" del equipo, con algunos check-ins hechos en una función real, para que el ranking no esté vacío.
- No usar datos inventados: todo evento que se vea tiene que venir del catálogo real.

## Guion

### 1. Bienvenida (5 min)

> "Gracias por venir. Estamos probando la app, no a vos: si algo no se entiende, es un
> problema nuestro. Contanos en voz alta lo que pensás mientras la usás. No podemos
> ayudarte durante las tareas, pero al final respondemos todo."

- Pedir permiso para grabar la pantalla y el audio.
- "¿Cómo te enterás hoy de qué ver en Buenos Aires? ¿Cuándo fue la última vez que fuiste a algo?"

### 2. Primera impresión (3 min)

Abrir la app recién instalada (onboarding).
- "Sin tocar nada: ¿qué es esto? ¿para quién te parece que es?"
- Observar si leen "Una sola agenda / Datos verificables" y qué esperan al tocar "Empezar".

### 3. Tareas (30 min)

| # | Tarea (se lee tal cual) | Éxito | Qué observar |
|---|---|---|---|
| T1 | "Elegí lo que te interesa y buscá algo para ver este fin de semana." | Llega a una ficha con fecha dentro del fin de semana | ¿Usan Para vos, Explorar o Calendario? ¿Entienden el talón (día, número y mes a la izquierda, hora en dorado)? |
| T2 | "Estás en Corrientes y Callao. Buscá qué hay cerca para hoy." | Usa "Ver lo que está cerca" o el mapa y abre una sala | El aviso de ubicación antes del permiso: ¿lo leen? ¿Dan permiso? ¿Entienden los círculos dorados? Si no dan ubicación, ¿llegan igual? |
| T3 | "Te gustó una obra: guardala y agregala a tu calendario." | Guardar activo y .ics descargado o abierto | ¿Encuentran el ícono de calendario en la fila de la función? ¿Distinguen Asistiré de Guardar? |
| T4 | "Imaginá que estás en la sala, empieza la función: sumá tus puntos." | Entiende dónde está el check-in y qué pide | En laboratorio no se puede cumplir la regla (estar a menos de 300 m, desde 1 h antes hasta 30 min después del inicio). Se evalúa si lo encuentran y si el mensaje de error explica qué falta. Si se puede, una persona lo hace en una función real (sesión de campo aparte). |
| T5 | "Fuiste a esta obra la semana pasada: anotala con puntaje y una reseña." | Entrada en el diario con fecha y estrellas | ¿Entienden "Fui" y la elección de fecha? ¿Esperan que la reseña sea pública? (es privada) |
| T6 | "Elegí tu @usuario y mandale una solicitud a @[usuario de prueba]." | Solicitud enviada | ¿Encuentran Amigos desde Perfil? ¿Se entiende el estado "pendiente"? |
| T7 | "¿En qué puesto estás este mes entre tus amigos? ¿Cómo subirías?" | Responde el puesto y menciona el check-in | ¿Entienden que canjear no baja el puntaje? ¿Les interesa competir? |

Después de cada tarea:
- Escala de facilidad del 1 al 7 (SEQ): "¿Qué tan fácil o difícil fue?"
- Sondeos neutros: "¿Qué esperabas que pasara?", "¿Qué te hizo dudar?". Nunca preguntar "¿Te gustó?" ni sugerir la respuesta.

### 4. Identidad y legibilidad (5 min)

- Mostrar la ficha y el ranking. "¿Qué palabras usarías para describir cómo se ve?"
- "¿Leés todo cómodo? ¿Hay algo que te cueste leer?"
  - Probar con el brillo bajo y, si se puede, en la calle.
  - Vigilar los textos `muted` y las letras finas de Bodoni en tamaños chicos.

### 5. Cierre (2 min)

- "¿La usarías la próxima vez que quieras salir? ¿Qué te falta para que sí?"
- Agradecer y responder las preguntas que quedaron.

## Qué se mide

| Métrica | Cómo |
|---|---|
| Éxito por tarea | Sí / con ayuda / no |
| Tiempo por tarea | Desde que se lee la consigna hasta el éxito o hasta rendirse |
| Facilidad (SEQ 1–7) | Después de cada tarea |
| Errores críticos | Acción que impide terminar o que hace algo no deseado (p. ej. compartir la ubicación sin saberlo) |
| Citas textuales | Para el informe |

## Síntesis

1. Dentro de las 24 h: notas por persona y por tarea en una tabla (observación, cita, tarea, gravedad).
2. Agrupar por afinidad. Un problema vale para el informe si lo tuvieron 2 o más personas, o 1 si es crítico.
3. Ordenar por impacto (bloquea, confunde, molesta) contra esfuerzo, y proponer un arreglo concreto por problema.
4. Informe corto con:
   - éxito y facilidad por tarea;
   - los 5 problemas principales, con su cita y su captura;
   - lo que funcionó;
   - preguntas abiertas para la próxima ronda.
   Usar la skill `design:research-synthesis`.

## Hipótesis a confirmar o descartar

- El talón (fecha a la izquierda) se lee más rápido que una línea de texto con la fecha.
- "Ver lo que está cerca" se entiende sin explicar el mapa.
- La gente no se da cuenta de que el check-in exige estar en la sala hasta que lo intenta.
- La reseña del diario se percibe como pública (no lo es) y eso frena a escribirla.
- El ranking entre amigos motiva más que el global.
