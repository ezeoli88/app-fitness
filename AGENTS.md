# Rutina

The UI is Vite + React + TypeScript. Routes use TanStack Router. Server data uses TanStack Query against the Hono API (`/api/*`). The routine editor uses TanStack Form.

The Worker in `worker/` serves the Vite build as Static Assets and handles `/api/*`. Shared domain types live in `src/domain` and `src/db` and must not import React, Vite, or TanStack.

Do not add Expo, React Native, or a second host for the API.
