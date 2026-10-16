# Voz y textos de CulturaBA

Guía corta para escribir cualquier texto de la app (botones, errores, estados vacíos,
avisos). Revisada con la skill `design:ux-copy` el 16-oct-2026.

## Cómo hablamos

- **Rioplatense, con voseo:** "Elegí", "Probá", "Tenés". Nunca "elige" ni "usted".
- **Cercano y claro, no gracioso:** como alguien de la ciudad que sabe de cultura y te
  ahorra tiempo. Sin signos de exclamación salvo en un logro ("¡Ahora son amigos!").
- **Honesto con los datos:** nunca prometemos lo que no tenemos ("todas las salas",
  "en tiempo real"). Si un dato falta, no se muestra y no se disimula.
- **Corto:** la menor cantidad de palabras que dicen todo. Una idea por frase.

## Palabras que usamos siempre igual

| Usamos | No usamos | Qué es |
|---|---|---|
| evento | show, actividad | La obra, muestra, ciclo o charla. |
| función | fecha, sesión | Una fecha y hora concreta de un evento. |
| sala | lugar, venue, espacio | Donde ocurre la función. |
| Guardar / Asistiré / Recomiendo | "voy", "me gusta" | Las tres acciones de la ficha, con esos nombres. |
| check-in | registrarse, marcar presencia | Confirmar en la sala que fuiste. |
| diario | historial | Las funciones que anotaste. |
| puntos | créditos, monedas | Lo que sumás con cada check-in. |
| @usuario | nick, alias | Tu nombre público para amigos y ranking. |
| cuenta / invitado | registro, perfil anónimo | Con email o sin él. |
| agenda oficial | fuente, API | De dónde vienen los eventos. |

## Patrones

- **Botones:** verbo + objeto, con el resultado que el usuario espera: "Enviar
  solicitud", "Anotar en mi diario", "Ver lo que está cerca". Nunca "OK" ni "Enviar" solo.
- **Errores:** qué pasó + cómo seguir, sin culpar ni mostrar mensajes técnicos.
  "No pudimos obtener tu ubicación. Revisá que esté activada e intentá de nuevo."
  Las pantallas que fallan dicen qué no cargó: "No pudimos cargar tu diario".
- **Estados vacíos:** qué es + por qué está vacío + cómo empezar.
  "Tu diario está vacío" + "En la ficha de un evento al que fuiste, tocá «¿Fuiste?
  Anotalo en tu diario»."
- **Permisos (ubicación):** antes de pedirlo, decir para qué y que no se guarda:
  "Usamos tu ubicación solo para ordenar las salas por cercanía. No se guarda."
- **Cuenta e invitado:** decir siempre qué pasa con lo guardado ("Lo que guardaste
  queda en tu cuenta" / "no se suma a esa cuenta").
- **Tiempo verbal:** lo que todavía no pasó va en futuro ("Te vamos a mandar un email");
  lo que ya pasó, en pasado ("Te escribimos a…").
- **Fechas y horas:** siempre en hora de Buenos Aires, como "sáb 18 oct · 20:00" o
  "Del 12 oct al 30 nov". Distancias: "450 m", "1,2 km".

## Dónde viven los textos

Casi todos están en el componente que los muestra. Los mensajes de error que vienen de la
base están juntos en `apps/mobile/src/features/points/points.ts` (puntos, amigos) y
`apps/mobile/src/features/account/account.ts` (cuenta), para que se lean de una vez.
