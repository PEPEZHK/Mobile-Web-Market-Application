Offline Stock App
=================

Overview
--------
The Offline Stock App is a Vite + React web application that provides offline-first inventory, sales, and shopping list management. The app persists its data in the browser using sql.js and localStorage so it can run entirely on-device without a dedicated backend.

Prerequisites
-------------
- Node.js 18 or later
- npm 9+ (or another package manager compatible with the provided lockfiles)

Project Setup
-------------
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The development server listens on all network interfaces (`0.0.0.0`/`::`) at port 8080.

Running on Mobile Devices
-------------------------
1. Ensure your development machine and mobile device are on the same Wi‑Fi network.
2. Start the dev server as shown above.
3. On your development machine, find its local IP address (for example, `192.168.1.10`).
4. On the mobile device, open a modern browser (Chrome, Safari, Firefox) and navigate to:
   ```
   http://<your-ip-address>:8080
   ```
   Replace `<your-ip-address>` with the value found in step 3.
5. Add the app to the mobile home screen or install it as a PWA (Progressive Web App) using the browser's "Add to Home Screen" or "Install" option for an app-like experience.

Installing the App on Mobile
----------------------------
To make the Offline Stock App behave like a native mobile application:

1. Open the app in Chrome (Android) or Safari (iOS) using the steps above.
2. Use the browser menu:
   - **Android (Chrome):** tap the three-dot menu → **Add to Home screen** → **Install**.
   - **iOS (Safari):** tap the Share icon → **Add to Home Screen** → **Add**.
3. Launch the icon that appears on the home screen. The app now runs full-screen and can cache assets and data for offline use.
4. When new versions are deployed, reopen the app while online to pick up the latest assets and database migrations.

Building for Production
-----------------------
To generate an optimized production build:
```bash
npm run build
```
Serve the contents of the `dist/` directory with any static file server. You can preview the production build locally with:
```bash
npm run preview
```

Default Credentials
-------------------
A single administrator account is created the first time the database is initialized:
- **Username:** `admin`
- **Password:** `admin123`

Data Reset and Sample Content
-----------------------------
All operational data starts empty. If you want to experiment with the historical mock data that used to seed the application automatically, call the helper from the browser console after logging in:
```js
import("@/lib/sampleData").then(async ({ seedSampleData }) => {
  const { getDatabase, saveDatabase } = await import("@/lib/db");
  const database = getDatabase();
  if (seedSampleData(database)) {
    saveDatabase();
    window.location.reload();
  }
});
```
This will insert the sample products, customers, transactions, and shopping lists defined in `src/lib/sampleData.ts`.

Support & Notes
---------------
- Application data is stored in browser localStorage. Clearing the browser storage or using private browsing sessions will reset the database.
- For stable offline usage on mobile, add the app to the home screen so it can run in standalone mode.
- For bug reports or enhancements, track issues in your chosen project management tool.

Detailed Offline Mobile Guide
-----------------------------
If you are new to the ecosystem, follow one of the two tracks below. They both let users run the app offline on a phone; the React Native/Expo path produces a true installable binary, while the PWA path keeps the existing Vite codebase.

### Option A: React Native / Expo (native binary, no browser required)
1. **Install tooling**
   - Install Node.js 18+, then install Expo CLI globally: `npm install --global expo-cli`.
   - Install Android Studio (with an emulator) or Xcode (for iOS) if you want to test in simulators. Physical devices only need the Expo Go app initially.
2. **Create the mobile project**
   - Run `npx create-expo-app offline-stock-mobile --template blank-typescript`.
   - `cd offline-stock-mobile` and start the dev server with `npx expo start`. Scan the QR code using Expo Go to make sure the starter works.
3. **Move shared logic over**
   - Copy non-UI code (state, helpers, data models) from this repo’s `src/` folder into the Expo project (e.g., under `app/lib/`).
   - Replace browser-specific APIs (such as `window.localStorage`) with React Native equivalents (AsyncStorage, filesystem, SQLite).
4. **Set up an offline database**
   - Install SQLite bindings: `npx expo install expo-sqlite` (managed workflow) or `react-native-sqlite-storage` (bare).
   - Create a `database.ts` module that opens the DB on first launch, creates tables, seeds the default admin user, and exposes CRUD helpers.
5. **Build screens**
   - Install React Navigation: `npm install @react-navigation/native @react-navigation/native-stack` plus the Expo-managed dependencies.
   - Port each screen (`Login`, dashboard, inventory, etc.) into React Native components using `View`, `Text`, `FlatList`, and so on.
   - Replace any fetch calls with reads/writes against your SQLite helper so every flow works without a server.
6. **Handle syncing (optional)**
   - If you still want to talk to a backend when connectivity exists, queue unsent actions in SQLite and process them when `NetInfo` reports the device is online.
7. **Produce installable apps**
   - Run `npx expo prebuild` once you are ready for native builds.
   - Install EAS CLI: `npm install --global eas-cli`, then `eas build --platform android` (or ios) to create an `.aab`/`.ipa`.
   - Install the binary on your devices. Because the JS bundle, assets, and database are packaged inside, the app runs offline immediately after installation.

### Option B: Keep the Vite app and ship it as an offline PWA
1. **Add a web app manifest**
   - Create `public/manifest.webmanifest` describing the app name, icons, colors, and `display: "standalone"`.
   - Reference the manifest from `index.html` via `<link rel="manifest" href="/manifest.webmanifest" />`.
2. **Add a service worker**
   - Install `vite-plugin-pwa`: `npm install --save-dev vite-plugin-pwa`.
   - Update `vite.config.ts` to call `VitePWA({ registerType: "autoUpdate", workbox: { navigateFallback: "index.html" } })`.
   - The plugin precaches the build output so the shell loads instantly, even offline.
3. **Persist data in IndexedDB**
   - While sql.js + localStorage can work, IndexedDB is more robust. Add Dexie (`npm install dexie`) or localForage.
   - Move database setup into an async bootstrap (e.g., `await initDatabase()` before rendering `<App />`). Store inventory, sales, and shopping list tables in IndexedDB so offline writes never fail.
4. **Prompt installation on phones**
   - Listen for the `beforeinstallprompt` event inside `App.tsx` and show a custom “Install App” button that calls `promptEvent.prompt()`.
   - Document for users how to tap “Add to Home Screen” (already covered earlier in this file).
5. **Test the offline experience**
   - Run `npm run build && npm run preview` to host the production build locally.
   - Open Chrome DevTools (Mobile: `chrome://inspect`) or Safari Web Inspector, enable “Offline,” and walk through every flow (login, CRUD, search) to verify nothing hits the network.
6. **Deploy static files**
   - Upload the Vite `dist/` folder to any static host (Netlify, Vercel, S3, Nginx). Once a user installs the PWA, assets and data remain cached on-device and the app behaves like an installed program.

Pick whichever option matches your deployment target. Expo gives you App Store / Play Store binaries; the PWA path is faster if you stay purely on the web stack.

Expo Mobile Implementation
--------------------------
This repository now includes a working Expo-managed React Native app inside `mobile-app/` that follows option A.

1. Install the native toolchain you need (Xcode for iOS, Android Studio for Android) and the Expo CLI prerequisites listed earlier.
2. Install the mobile dependencies:
   ```bash
   cd mobile-app
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npm start
   ```
   Scan the QR code with Expo Go (iOS Camera or Android Expo Go) to load the native app on a device. The JS bundle, UI, and SQLite database are all packaged locally, so after the first install you can keep using the app offline.
4. Core functionality implemented in `mobile-app/`:
   - Secure local authentication with the default `admin` / `admin123` account plus support for registering new users.
   - Inventory management backed by Expo SQLite tables that mirror the web schema (products, shopping lists, shopping list items, users).
   - Shopping list creation, editing, and completion tracking that never hits a server.
   - Settings panel with connectivity status, local schema reruns, and a destructive “reset local data” control.
5. When you are ready to create binaries, run:
   ```bash
   npx expo prebuild
   eas build --platform android   # or ios
   ```
   The generated `.aab`/`.ipa` bundles include the database seeding logic so the mobile app works offline immediately after installation.
