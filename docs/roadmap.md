# Roadmap

## Etapa 1 — Datos confiables y app básica (esta entrega)

| Entregable | Estado |
|---|---|
| Monorepo, lint/typecheck/tests, CI | ✅ |
| Modelo de datos con Evento/Función, procedencia, RLS, vistas públicas | ✅ aplicado en Supabase y verificado por REST |
| Dominio compartido: fechas en español, dedup, publicabilidad | ✅ 95 tests |
| Worker de ingestión: HTTP cortés, fixtures, pipeline, dedup entre fuentes, cambios, ausencias, CLI | ✅ 157 tests (27 de integración sobre Postgres real) |
| Conector Teatro Colón | ✅ en producción |
| Conector agenda de la Ciudad (Linda) | ✅ en producción (agregador, prioridad 10) |
| Conectores Usina del Arte, Teatro Nacional Cervantes y Museo Moderno | ✅ en producción desde el 18-oct (REST de WordPress + detalle; Linda se fusiona por enlace o por las palabras del título) |
| Conector Complejo Teatral | ⏸ corregido el 16-oct; fuera del cron porque el sitio responde 403 a los runners de GitHub |
| Conectores MNBA y Palacio Libertad | ⛔ bloqueados por desafío de Cloudflare (no se elude) |
| Catálogo real en Supabase | ✅ 266 eventos publicados, 736 funciones futuras (15-oct) |
| App: onboarding, Para vos, Explorar, Calendario, Guardados, Perfil, ficha, acciones sociales, compartir, deep links | ✅ 21 tests Jest + recorrido Playwright contra Supabase |
| Automatización: `ingest.yml` (cron cada 6 h), `ci.yml` | ✅ cron activo contra Supabase |

### Siguientes pasos inmediatos
1. ~~Cargar `DATABASE_URL` como secreto~~ (hecho; el cron corre cada 6 h).
2. ~~Corregir el conector del Complejo Teatral~~ (hecho el 16-oct). Falta dónde correrlo:
   el sitio responde 403 a los runners de GitHub Actions. Opciones: un equipo propio con
   IP residencial (`pnpm ingest run --source complejo-teatral`) o pedirle al Complejo que
   habilite el user agent. Mientras tanto, sus producciones llegan por Linda.
3. Decidir el camino para MNBA y Palacio Libertad (fixtures manuales, equipo propio o
   cobertura vía Linda).
4. Probar en Expo Go: deep link en frío, compartir, acciones con sesión anónima.

## Etapa 2 — Notificaciones y calendario

**Hecho (15-oct):** "Agregar al calendario" por función (.ics con avisos 1 día y 2 h antes;
en el teléfono, enlace a Google Calendar hasta tener builds nativos), calendario por mes con
filtro "Mis planes" (guardados + Asistiré) y aviso "Cambios en tus planes" en Guardados
cuando una función próxima se cancela, se posterga o se reprograma.

- Registro de dispositivos (`user_devices`) con Expo Notifications; pedir permiso
  después de mostrar valor.
- Worker de notificaciones: resumen diario por intereses (por defecto) con
  `dedupe_key`; avisos inmediatos opcionales; cambios relevantes (`event_changes`
  `major`) a quienes guardaron/van; recordatorios (`reminders`) 1 semana / 1 día / 2 h;
  horarios silenciosos y límites; nunca duplicar; abrir la ficha correcta.
- `expo-calendar` en los builds nativos (hoy el teléfono abre Google Calendar).
- EAS build/submit; universal links verificados en el dominio definitivo. Camino completo
  y lo que falta en el teléfono (Apple, mapa nativo, avisos): `docs/publicar-en-tiendas.md`.

## Etapa 2b — Cuenta, diario y puntos

**19-oct (mapa):** mapa nativo con `react-native-maps` (Apple Maps oscuro en iPhone,
Google Maps con estilo Telón en Android), mismos puntos y hoja que la web; "cerca de mí"
con `expo-location`. Explorar abre en el mapa también en el teléfono. Falta probarlo en
dispositivos reales y la clave de Maps SDK para Android.

**19-oct:** Perfil ordenado por importancia (identidad, números, intereses, lo último que
viste, ajustes). Cuentas con Google o email y contraseña (sin enlaces), olvidé mi
contraseña por código y eliminar cuenta. **20-oct:** emails por Resend desde
`hola@info.lembodiseño.com` con plantillas de código (probado con la dirección de prueba de
Resend). Pendiente: credenciales de Google en Supabase y "Iniciar sesión con Apple" al
publicar en la App Store.

**Hecho (16-oct):**
- **Cuenta:** el invitado confirma un email y su sesión pasa a ser cuenta (conserva lo
  guardado); entrar desde otro dispositivo con el email; cerrar sesión.
- **Diario ("Fui"):** desde la ficha, funciones ya empezadas (o la muestra abierta hoy)
  con puntaje 1–5 y reseña; pantalla "Tu diario" con estadísticas. Privado. Guarda título,
  disciplina y sala al anotar, así sobrevive al archivado del evento.
- **Puntos** (reemplazado el 17-oct por "Fui", de buena fe): check-in en la sala durante la función (cuenta con email; coordenadas
  publicadas por la fuente; GPS a menos de 300 m y precisión < 150 m; una vez por función;
  máximo 3 por día) → 10 puntos en un libro contable que solo escriben las funciones de la
  base.
- **Recompensas:** catálogo cargado por el equipo, canje atómico con código de un solo uso.
  El catálogo arranca vacío: depende de acuerdos con instituciones.
- **Coordenadas de salas:** las publica Linda (103 de 106 salas); se descartan las que caen
  fuera de CABA.

**Hecho (16-oct, tarde):**
- **Mapa:** Explorar abre en un mapa de la ciudad (Leaflet + teselas de OpenStreetMap) con
  los mismos filtros; un punto por sala; "Ver lo que está cerca" pide la ubicación solo al
  tocarlo, centra el mapa y ordena las salas por distancia (no se guarda). La lista de salas
  debajo es la versión accesible del mapa. En el teléfono, la lista hasta tener mapa nativo.
- **Amigos:** @usuario público y único; solicitudes por @usuario (aceptar, rechazar,
  cancelar, quitar). Solo cuentas con email; la tabla no tiene permisos directos: todo pasa
  por funciones de la base.
- **Ranking:** global o entre amigos, del mes o histórico, con los puntos de check-in (canjear
  no resta).

**Hecho (17-oct):**
- **Mapa independiente:**
  - En la web, Explorar en modo mapa ocupa la pantalla debajo de los filtros.
  - Tocar un punto (o elegirlo con Tab y Enter) abre una hoja con las funciones de esa sala, con enlace a cada ficha. El botón de ubicación muestra la sala más cercana.
  - El modo Lista sigue siendo la alternativa completa; en el teléfono, Explorar es la lista.
- **Asistencia de buena fe ("Fui"):**
  - Desde la ficha se anota una función ya empezada: queda en el diario y suma 10 puntos si fue en los últimos 7 días.
  - Sin GPS, también para invitados (conservan los puntos al crear la cuenta; en el ranking solo aparecen cuentas con @usuario).
  - Una vez por función, máximo 3 por día de función.
  - Se quitó el check-in con ubicación, porque no hay canjes reales. Las recompensas se ocultan mientras el catálogo esté vacío.

**Hecho (18-oct):**
- **Fechas agrupadas en la ficha:** las repetidas (misma sala, hora, horario y precio) se ven como un rango con días de la semana, cantidad y próxima función, y se despliegan a pedido. Las pasadas ya no se listan.
- **Perfiles faltantes:** había sesiones sin fila en `profiles`, así que guardar, Asistiré y "Fui" fallaban por clave foránea.
  - Se completaron los perfiles que faltaban.
  - La app llama a `ensure_profile()` en cada sesión. Si el usuario ya no existe, arranca un invitado nuevo.

**Pendiente:**
- Mapa nativo (`react-native-maps`) y proveedor de teselas con plan si crece el tráfico.
- Link de invitación para sumar amigos; bloquear o denunciar usuarios.
- Entrar con Google (requiere credenciales de Google Cloud; los emails ya salen por Resend).
- Verificación de asistencia cuando haya canjes reales: código QR en la sala con
  instituciones asociadas (hoy los puntos son de buena fe).
- Agrupar puntos del mapa (`leaflet.markercluster`) si la superposición en el Microcentro molesta.
- Recordatorio "¿Fuiste?" para lo marcado como Asistiré en la última semana.
- Herramienta para que una institución valide un código (hoy: SQL, ver README).
- Diario público opcional, perfiles, seguir a amigos, listas propias.
- Revisar salas cuyas coordenadas difieren entre publicaciones de Linda (gana la primera).
- Conflicto de sala entre fuentes para la misma función: hoy se muestran ambas; que gane
  la institución.

## Diseño — identidad "Telón" (17-oct)

**Hecho:**
- **Auditoría** con axe-core, las sondas de `ux-ui-audit` y las skills de accesibilidad,
  textos (`docs/design/voz.md`) y crítica. Se corrigió lo medible: contraste, etiquetas,
  áreas táctiles de 44 px, encabezados, idioma y foco visible.
- **Identidad elegida entre dos direcciones:**
  - Telón es la sala oscura bordó con dorado, en Bodoni Moda + Schibsted Grotesk.
  - La app es siempre oscura.
  - Las tarjetas son "talones de entrada" con la fecha a la izquierda.
- **Implementada en la app web:** tokens, primitivas, ficha, mapa oscuro, calendario,
  ranking y cifras del diario y de los puntos. Especificación en `docs/design/sistema.md`.
- **Verificado:** 0 problemas críticos o serios de accesibilidad y 0 fallas de contraste en
  lo medido.

**Pendiente:**
- Prueba de usabilidad con 5 personas (guion en `docs/design/investigacion.md`) y otra ronda
  de ajustes con lo que salga.
- Fuentes recortadas en woff2 para la primera carga web (hoy unos 400 KB de TTF).
- Borde punteado del talón en iOS; mapa nativo con la misma paleta.
- Capturas 12–16 de `docs/screenshots` (check-in, puntos, mapa cerca, amigos, ranking):
  muestran el estilo anterior porque requieren una cuenta de prueba.

## Etapa 3 — Operación y expansión
- Panel mínimo de revisión: fuentes y última corrida, errores, candidatos
  (`candidate_reasons`), duplicados (`event_duplicates`), corregir fechas, desactivar
  fuente, auditar procedencia. Acceso restringido (rol admin), separado de la app.
- Más fuentes propias: MALBA (REST cerrada), Proa, Planetario y Recoleta (hoy llegan vía
  Linda con prioridad baja o no llegan). Ver el relevamiento del 18-oct en
  `docs/source-inventory.md`.
- Herramienta para fusionar a mano duplicados que quedaron de antes de la regla de
  palabras del título (hoy: "Mery Granados y Joaco Burgos…", Usina, 24-oct).
- Resúmenes "Qué esperar" con IA, basados solo en el texto oficial, con
  `ai_summary_source_hash` para regenerar únicamente cuando cambia la fuente.
- Caché/redimensionado de imágenes en Storage con atribución.
- Web pública (`expo export -p web`) en el dominio para que los enlaces compartidos
  abran algo útil sin app.

## Etapa 4 — Comunidad
- Recomendaciones y señales de popularidad; perfiles; comentarios con moderación,
  denuncias y controles de privacidad; otras ciudades reutilizando conectores.

## Deuda técnica y riesgos conocidos
- Fechas sin año en las agendas: inferencia acotada a 12 meses; fuera de eso,
  candidato. Revisar casos reales al implementar conectores.
- `react-native-web`: no pasar `style` a un `Pressable` envuelto en `<Link asChild>`
  (reenvía el array al `<a>`); patrón documentado en el código.
- Hotlinking de imágenes de las fuentes: respaldo automático si falla; mover a
  Storage en Etapa 3.
- Usuarios anónimos ilimitados: límites de Auth y limpieza periódica en Etapa 2.
- Cron de GitHub: retrasos y auto-desactivación a los 60 días sin actividad.
