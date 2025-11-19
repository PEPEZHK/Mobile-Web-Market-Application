# Offline Stock App

## Getting started locally

1. Install dependencies with `npm install`.
2. Run the development server with `npm run dev`.
3. Open the printed URL (defaults to http://localhost:5173) in your browser.
4. Use the bottom navigation bar to open the **Sales / POS** screen to try the sales workflow.

> **Tip:** The app persists data in your browser's `localStorage`. If you are coming from an older build and don't see the new sales options, clear the `magazin-proekt-db` key from DevTools (or run the **Reset Data** action inside Settings) and refresh the page to reload the latest schema and sample data.

## Project commands

```bash
npm run dev     # start the Vite dev server
npm run build   # create a production build
npm run lint    # run the configured linters
```

## Tech stack

- Vite
- React + TypeScript
- Tailwind CSS
- shadcn/ui
- sql.js (in-browser SQLite)
