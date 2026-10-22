# Validación de Rutina

La app es solo web. La interfaz es Vite + React con TanStack Router, Query y Form. La pasada de septiembre de 2026 en el emulador Android quedó obsoleta cuando se retiró el cliente nativo.

## Web y Worker — 22 de octubre de 2026

- Vitest de la app: 35 pruebas, 11 archivos. Cubren el cliente HTTP, el temporizador, el dominio y las utilidades.
- `tsc --noEmit` en la raíz y en `worker/`.
- Vitest del Worker: 12 pruebas sobre D1 (contrato del repositorio, checks y la API) y 4 de Access con llaves locales.
- `vite build`: el JS de entrada pesa 321 kB (105 kB gzip) y el JS de `dist/` suma 438 kB, más 13 kB de CSS. El bundle no arrastra `expo-sqlite`, `expo-notifications`, `expo-splash-screen`, `expo-router` ni `react-native`.
- `wrangler deploy --dry-run`, sin publicar. El Worker de la raíz no usa `--env`.
- Playwright contra el Worker local con ese build: entrenar, corregir el historial y archivar pasó en 1440×900 (1,9 s) y en 390×844 (1,7 s).
