# Especificación de producto — Etapa 1

## Propuesta de valor

CulturaBA no es una agenda: es un catálogo cultural **centralizado, verificable y
actualizado solo**, personalizado por intereses, para decidir a qué ir en Buenos Aires
y compartirlo. Primer mercado: CABA (Teatro Colón, Museo Nacional de Bellas Artes,
Palacio Libertad, luego Complejo Teatral y agendas de la Ciudad).

## Principios

1. **Nunca inventar.** Sin horario confirmado no hay función; sin imagen autorizada,
   respaldo visual por disciplina; sin precio verificado, no se muestra precio.
2. **Procedencia visible.** Toda ficha enlaza a la fuente oficial y dice cuándo se
   comprobó por última vez.
3. **Evento ≠ función.** Una obra con diez funciones es un evento con diez fechas.
4. **Cambios honestos.** Cancelaciones y reprogramaciones se muestran como tales,
   nunca desaparecen en silencio.
5. **Valor antes que registro.** Se explora como invitado; la cuenta llega cuando
   aporta algo (sincronizar, notificaciones).

## Taxonomía de intereses (9 + `otros` interno)

Ópera y música clásica · Teatro y artes escénicas · Museos y exposiciones · Música en
vivo y jazz · Cine · Danza · Literatura y charlas · Fotografía y artes visuales ·
Historia y patrimonio. Un evento puede tener varias disciplinas (una primaria).

## Flujos

### Onboarding (invitado)
Bienvenida (3 argumentos de valor) → elegir **2 a 3 intereses** → "Ver mi agenda".
Después, en Perfil, ≥ 1 sin tope. Sin registro. La sesión anónima de Supabase se crea
en segundo plano; si no hay red, todo sigue en el dispositivo.

### Para vos
Feed de eventos publicados con alguna disciplina en los intereses, ordenado por
"próximo momento asistible" (una muestra en curso cuenta como ahora). Chips de
intereses + "Editar". Vacío: invita a Explorar o sumar intereses.

### Explorar
Búsqueda full-text en español sin acentos (título, subtítulo, descripción) +
filtros: Hoy / Fin de semana / 7 días / 30 días, Gratis, disciplinas. "Limpiar filtros".
Estados: carga (skeleton), error con reintento, vacío contextual.

### Calendario
Próximos 30 días agrupados por día local (hora de Buenos Aires; aviso si el
dispositivo está en otra zona). Las muestras (`range`) aparecen cada día del rango al
final del día. Toggle "Mis intereses / Todo".

### Ficha de evento (`/event/<slug>`; destino de deep link)
Orden: imagen (o respaldo) → disciplina + institución → título/subtítulo (+ crédito de
foto) → **Asistiré · Recomiendo · Guardar · Compartir** con conteos públicos →
**Fechas** (cada función con sala, precio verificado y badges *Cancelada / Postergada /
Agotada / Reprogramada (antes: …)*) → venue con dirección y **Cómo llegar** (solo si hay
dirección o coordenadas) → Entradas (solo precio verificado o "Entrada gratuita"
explícita) → "Qué esperar" (solo si existe `ai_summary`, rotulado como generado) o
"En breve" (primer párrafo del texto oficial) → "Sobre el evento" (texto original +
atribución) → duración/idioma/edad si existen → botones **Entradas** y **Sitio
oficial** (navegador in-app) → pie de procedencia ("Fuente: … · Verificado hace N h")
→ "Agregar al calendario" (deshabilitado hasta Etapa 2).

### Guardados
Segmentos Guardados / Asistiré / Recomendados, en orden de acción más reciente.

### Perfil
Editar intereses, estado de la cuenta (invitado / solo dispositivo), fuentes
oficiales con enlace, versión y origen de datos, volver a ver la bienvenida.

## Acciones sociales y privacidad

- `attending`, `recommend`, `save`: persistentes, **idempotentes** (`unique(user,
  evento, acción)`) y **reversibles** (toggle). Actualización optimista con rollback.
- Público: solo totales (`event_stats`: "3 van", "5 recomiendan"). Nunca identidades
  ni listas de planes de otra persona. "Guardar" no se cuenta públicamente.
- Sin comentarios ni foro en Etapa 1 (ver roadmap: requiere moderación, denuncias y
  controles de privacidad).

## Compartir y deep links

- `culturaba://event/<slug>` y `https://<EXPO_PUBLIC_WEB_BASE_URL>/event/<slug>`
  (universal/app links configurados en `app.config.ts`; dominio a confirmar).
- El mensaje compartido incluye título, próxima fecha, lugar, enlace CulturaBA y la
  **URL oficial**, útil aunque el receptor no tenga la app.
- `slug` = título + 6 hex del id; nunca cambia aunque cambie el título.

## Reglas de visualización de datos

| Dato | Regla |
|---|---|
| Fecha/hora | Siempre hora de Buenos Aires; `timed` "dom 18 oct · 20:00", `range` "Del 16 oct al 13 dic" + horario de apertura, `all_day` "todo el día". |
| Precio | Solo si `price_verified`; gratuidad solo explícita. Nunca "consultar". |
| Imagen | Original con crédito si hay; si falta o falla la carga, respaldo por disciplina. |
| Texto | Original del organizador con atribución; resumen IA separado y rotulado. |
| Estado | Badges por función; eventos suspendidos/candidatos no se muestran. |

## Fuera de alcance en Etapa 1
Push, resumen diario, recordatorios, exportación .ics, cuentas con email, panel de
revisión/admin, comentarios, resúmenes IA generados, caché de imágenes.
