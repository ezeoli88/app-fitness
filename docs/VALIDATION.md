# Validación de Rutina

La app es solo web. La pasada del 26 de septiembre de 2026 en el emulador Android quedó obsoleta cuando se retiró el cliente nativo.

## Web y Worker — octubre de 2026

- Jest de la app: 35 pruebas, 11 suites. Cubren el cliente HTTP, el temporizador, el dominio y las utilidades.
- `tsc --noEmit` en la raíz y en `worker/`.
- Vitest del Worker: 12 pruebas sobre D1 (contrato del repositorio, checks y la API) y 4 de Access con llaves locales.
- `expo export -p web` y revisión de que el bundle no arrastra `expo-sqlite`, `expo-notifications` ni `expo-splash-screen`.
- `wrangler deploy --dry-run --env=""`, sin publicar.
- Playwright contra el Worker local: entrenar, corregir el historial y archivar pasó en 1440×900 y en 390×844.
