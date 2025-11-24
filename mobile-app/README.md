# Offline Stock App (Mobile)

This is a mobile-ready copy of the offline-first inventory and point-of-sale web app. It mirrors the web UI and logic, but SQL.js is bundled locally so the Android package can run fully offline without hitting the CDN.

## Table of Contents
- [Mobile specifics](#mobile-specifics)
- [Features](#features)
- [Stack](#stack)
- [Quick Start](#quick-start)
- [Available Scripts](#available-scripts)
- [Resetting Sample Data](#resetting-sample-data)
- [Project Structure](#project-structure)

## Mobile specifics
- Same React + Tailwind + shadcn/ui experience as the web app.
- SQL.js WASM ships from `src/assets/sql-wasm.wasm` via `locateFile` (no CDN).
- Vite `base` is `./` so assets resolve inside a packaged Android WebView/Capacitor shell.
- Default seed user: `admin` / `admin123` (hashed in the `users` table).

## Features
- Inventory (Depot) view with stock levels, minimum stock alerts, and product CRUD.
- Sales/POS workspace with cart management, multi-customer handling, paid vs debt tracking, and Excel export.
- Customers, History, and Shopping List pages powered by SQL joins and aggregates for instant insights.
- Offline-ready SQL.js database persisted to `localStorage`, so the app works without a backend service.
- Multi-language UI (via `LanguageContext`) and theming built with shadcn/ui primitives.
- Built-in authentication mock (sign up/login) to mimic real-world onboarding flows.

## Stack
- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui component system
- sql.js for the embedded database layer
- React Router, TanStack Query, React Hook Form, and Zod for routing, data fetching, and validation

## Quick Start
1. **Install dependencies**
   ```bash
   cd mobile-app
   npm install
   # or pnpm install / bun install
   ```
2. **Start the dev server**
   ```bash
   npm run dev
   ```
3. Open the printed URL (defaults to http://localhost:8080) and use the bottom nav to explore each module (Sales, Depot, Customers, etc.).

Production builds can be generated with `npm run build` and previewed locally via `npm run preview`.

## Available Scripts
```bash
npm run dev       # start the Vite dev server
npm run build     # create a production build
npm run build:dev # build using development mode (for profiling)
npm run preview   # run the production build locally
npm run lint      # run ESLint across the project
```

## Resetting Sample Data
The embedded database is stored under the `magazin-proekt-db` key in `localStorage`. If you switch branches or data schemas and see inconsistent results:
1. Open DevTools -> Application -> Local Storage and delete the `magazin-proekt-db` entry (or run the **Reset Data** action inside the in-app Settings page).
2. Refresh the app. The latest schema and sample data from `src/lib/sampleData.ts` will be reloaded automatically.

## Project Structure
```
mobile-app/
├─ src/
│  ├─ pages/          # Sales, Depot, Customers, Settings, etc.
│  ├─ components/     # shadcn/ui wrappers and shared UI
│  ├─ contexts/       # Language + app state providers
│  ├─ hooks/          # useAuth, useTranslation, etc.
│  ├─ lib/            # sql.js helpers, sample data, excel exporter
│  └─ types/          # Shared TypeScript types for DB entities
├─ public/            # Static assets and icons
├─ vite.config.ts     # Vite + mobile bundling configuration
├─ tailwind.config.ts # Tailwind + shadcn setup
└─ package.json
```

Feel free to adapt the copy, colors, or components—everything here is ready for theming and packaging into a mobile shell.
