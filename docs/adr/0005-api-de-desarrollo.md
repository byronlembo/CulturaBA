# ADR 0005 — `CatalogApi`/`UserApi` con dos implementaciones

**Contexto.** En producción la app lee PostgREST de Supabase. En el entorno de
desarrollo solo había Postgres (sin Docker ni acceso a Supabase), y hacía falta
verificar la app con datos reales.

**Decisión.** La app depende de dos interfaces pequeñas. `CatalogApi` tiene una
implementación Supabase y otra contra `packages/devapi`, un servidor HTTP mínimo que
devuelve **las mismas filas de las mismas vistas**, de modo que el mapeo de datos es
único. `UserApi` tiene implementación Supabase (filas propias bajo RLS) y local
(`AsyncStorage`). El modo se decide por variables `EXPO_PUBLIC_*`.

**Consecuencias.** La app se puede desarrollar y probar end-to-end sin Supabase y los
tests de componentes usan datos tipados sin red. Hay que mantener `devapi` alineado
con los filtros de PostgREST (búsqueda, rangos de fechas); está cubierto por el
recorrido de Playwright.
