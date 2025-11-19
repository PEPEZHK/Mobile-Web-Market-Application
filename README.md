# Offline Stock App

Offline-first inventory and point-of-sale web application optimized for small shops that need fast sales workflows even without internet connectivity. The UI is built with shadcn/ui + Tailwind on top of a SQL.js database that persists entirely inside the browser.

## Table of Contents
- [Features](#features)
- [Stack](#stack)
- [Quick Start](#quick-start)
- [Available Scripts](#available-scripts)
- [Resetting Sample Data](#resetting-sample-data)
- [Project Structure](#project-structure)

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
   npm install
   # or pnpm install / bun install
   ```
2. **Start the dev server**
   ```bash
   npm run dev
   ```
3. Open the printed URL (defaults to http://localhost:5173) and use the bottom nav to explore each module (Sales, Depot, Customers, etc.).

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

1. Open DevTools → Application → Local Storage and delete the `magazin-proekt-db` entry (or run the **Reset Data** action inside the in-app Settings page).
2. Refresh the browser. The latest schema and sample data from `src/lib/sampleData.ts` will be reloaded automatically.

## Project Structure
```
offline-stock-app/
├─ src/
│  ├─ pages/          # Sales, Depot, Customers, Settings, etc.
│  ├─ components/     # shadcn/ui wrappers and shared UI
│  ├─ contexts/       # Language + app state providers
│  ├─ hooks/          # useAuth, useTranslation, etc.
│  ├─ lib/            # sql.js helpers, sample data, excel exporter
│  └─ types/          # Shared TypeScript types for DB entities
├─ public/            # Static assets and PWA manifest
├─ vite.config.ts     # Vite + PWA plugin configuration
└─ mobile-app/        # Experimental mobile shell (not wired into the web build)
```

Feel free to adapt the copy, colors, or components—everything in the repo is ready for theming and deployment on Netlify, Vercel, or any static hosting provider. Happy hacking!
