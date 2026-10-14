# ADR 0001 — Monorepo con pnpm workspaces (hoisted), sin Turborepo

**Contexto.** Tres paquetes (`shared`, `ingestion`, `mobile`) más uno de desarrollo
(`devapi`) comparten tipos y utilidades. Expo/Metro funcionan mejor con un
`node_modules` plano.

**Decisión.** pnpm workspaces con `node-linker=hoisted`; `@culturaba/shared` publica
TypeScript sin paso de build (`main: src/index.ts`) y no usa APIs de Node para poder
correr en Hermes. Sin Turborepo: `pnpm -r run <script>` basta para cuatro paquetes.

**Consecuencias.** Instalación simple y compatible con Expo; si crecen los paquetes o
el tiempo de CI, agregar Turborepo para caché. Las versiones de los paquetes Expo se
pinean a `node_modules/expo/bundledNativeModules.json` porque `expo install --fix`
necesita red hacia `api.expo.dev`.
