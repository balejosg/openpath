<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# OpenPath Web UI (React SPA)

This package is the OpenPath dashboard single-page app (Vite + React).

In development, the Vite dev server proxies `/trpc` and `/api` to the OpenPath API.

## Local Development

Prerequisites:

- Node.js >= 20

From the OpenPath repo root:

```bash
npm install

# Terminal 1: API (http://localhost:3000)
npm run dev --workspace=@openpath/api

# Terminal 2: SPA (http://localhost:3001)
npm run dev --workspace=@openpath/react-spa
```

## Common Scripts

```bash
npm run build --workspace=@openpath/react-spa
npm test --workspace=@openpath/react-spa
npm run test:e2e --workspace=@openpath/react-spa
npm run test:e2e:ui --workspace=@openpath/react-spa
```
