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
| Conector Complejo Teatral | ⏸ implementado, fuera del cron hasta corregir la lectura de horarios |
| Conectores MNBA y Palacio Libertad | ⛔ bloqueados por desafío de Cloudflare (no se elude) |
| Catálogo real en Supabase | ✅ 266 eventos publicados, 736 funciones futuras (15-oct) |
| App: onboarding, Para vos, Explorar, Calendario, Guardados, Perfil, ficha, acciones sociales, compartir, deep links | ✅ 21 tests Jest + recorrido Playwright contra Supabase |
| Automatización: `ingest.yml` (cron cada 6 h), `ci.yml` | ✅ el cron espera el secreto `DATABASE_URL` |

### Siguientes pasos inmediatos
1. Cargar `DATABASE_URL` (session pooler) como secreto y lanzar `ingest.yml` a mano una vez.
2. Corregir el conector del Complejo Teatral con los defectos documentados y volver a
   activarlo (`ready: true`).
3. Decidir el camino para MNBA y Palacio Libertad (fixtures manuales, equipo propio o
   cobertura vía Linda).
4. Probar en Expo Go: deep link en frío, compartir, acciones con sesión anónima.

## Etapa 2 — Notificaciones y calendario
- Registro de dispositivos (`user_devices`) con Expo Notifications; pedir permiso
  después de mostrar valor.
- Worker de notificaciones: resumen diario por intereses (por defecto) con
  `dedupe_key`; avisos inmediatos opcionales; cambios relevantes (`event_changes`
  `major`) a quienes guardaron/van; recordatorios (`reminders`) 1 semana / 1 día / 2 h;
  horarios silenciosos y límites; nunca duplicar; abrir la ficha correcta.
- "Agregar al calendario": .ics por función (+ `expo-calendar` opcional).
- Cuentas con email convirtiendo la identidad anónima (`updateUser`) sin migrar datos.
- EAS build/submit; universal links verificados en el dominio definitivo.

## Etapa 3 — Operación y expansión
- Panel mínimo de revisión: fuentes y última corrida, errores, candidatos
  (`candidate_reasons`), duplicados (`event_duplicates`), corregir fechas, desactivar
  fuente, auditar procedencia. Acceso restringido (rol admin), separado de la app.
- Más fuentes propias: MALBA, Proa, Moderno, Recoleta, Usina del Arte (hoy llegan vía
  Linda con prioridad baja).
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
