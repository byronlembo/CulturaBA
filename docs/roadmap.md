# Roadmap

## Etapa 1 — Datos confiables y app básica (esta entrega)

| Entregable | Estado |
|---|---|
| Monorepo, lint/typecheck/tests, CI | ✅ |
| Modelo de datos con Evento/Función, procedencia, RLS, vistas públicas | ✅ (smoke test de RLS y tests de integración) |
| Dominio compartido: fechas en español, dedup, publicabilidad | ✅ 92 tests |
| Worker de ingestión: HTTP cortés, fixtures, pipeline, dedup, cambios, ausencias, CLI | ✅ 31 tests (17 escenarios de integración sobre Postgres real) |
| Conectores Teatro Colón, MNBA, Palacio Libertad | ⛔ **bloqueado**: la red del entorno de desarrollo denegó el acceso a los sitios; ver `docs/source-inventory.md` para el protocolo y la plantilla (`sample`) |
| App: onboarding, Para vos, Explorar, Calendario, Guardados, Perfil, ficha, acciones sociales, compartir, deep links | ✅ 21 tests Jest + recorrido Playwright sobre la web export |
| Automatización: `ingest.yml` (cron), `ci.yml` | ✅ (el cron queda en espera hasta registrar el primer conector real y cargar `DATABASE_URL`) |
| Despliegue a Supabase (`db push`) | ⏳ pendiente de red + cadena de conexión del *session pooler* |

### Siguientes pasos inmediatos (en una sesión con red)
1. Relevar las tres fuentes con el protocolo; grabar fixtures; implementar y probar
   los conectores; correr en vivo y revisar candidatos.
2. `supabase db push --db-url …` + activar *Anonymous sign-ins* en Auth; cargar
   `DATABASE_URL` (pooler) como secreto del repo; primera corrida por `workflow_dispatch`.
3. Apuntar la app al proyecto (`apps/mobile/.env`) y probar en Expo Go: deep link en
   frío, compartir, acciones sociales con sesión anónima.
4. Confirmar direcciones de venues (`address_verified_at`) desde las páginas oficiales.

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
- Más fuentes: Complejo Teatral, agendas de la Ciudad (dedup cross-institución),
  MALBA, Proa, Moderno, Recoleta, Usina del Arte.
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
