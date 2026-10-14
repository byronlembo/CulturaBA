# ADR 0003 — Invitado con sesión anónima de Supabase y fallback local

**Contexto.** Las acciones sociales y los conteos públicos requieren un `auth.uid()`
real para RLS, pero el producto no debe exigir registro antes de mostrar valor.

**Decisión.** Al primer arranque la app hace `signInAnonymously()`; intereses y
acciones son filas reales del usuario anónimo. Si no hay red o la sesión falla, la
misma interfaz `UserApi` funciona contra `AsyncStorage` y se reconcilia cuando hay
sesión. Más adelante la identidad anónima se convierte en cuenta con email sin migrar
datos.

**Consecuencias.** Reinstalar la app pierde los guardados hasta que exista cuenta
(se avisa en Perfil). Requiere `enable_anonymous_sign_ins` y límites de Auth;
limpieza de usuarios anónimos inactivos en Etapa 2.
