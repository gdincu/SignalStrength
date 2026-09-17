# SignalStrength — Cell Tower & Signal Strength Mapper

A React + Capacitor Android app that maps cellular signal strength (LTE/5G/NR/GSM) using the phone's GPS and Android's `TelephonyManager`. Data is stored locally in IndexedDB and can be exported as GeoJSON.

## Features

- **Real-time cell metrics** — Reads RSRP, RSRQ, PCI, TAC, MCC/MNC, CI, ASU, and more from Android's `TelephonyManager.getAllCellInfo()`.
- **GPS tracking** — Records Lat/Lng alongside signal data every second while tracking.
- **Offline storage** — Uses Dexie.js/IndexedDB to store readings on the device.
- **Interactive map** — Leaflet map with colored markers (green/yellow/red by RSRP) and a route polyline.
- **GeoJSON export** — Download your captured data as a GeoJSON file.
- **CI/CD APK distribution** — GitHub Actions builds a debug APK and hosts a download page on GitHub Pages.

## Architecture

- **Frontend:** React + Vite
- **Native bridge:** Capacitor
- **Custom native plugin:** `TelephonyPlugin.java` (bridges to Android `TelephonyManager`)
- **Map:** Leaflet + React-Leaflet
- **Local database:** Dexie.js
- **CI/CD:** GitHub Actions → GitHub Pages

## Project structure

```
SignalStrength/
├── src/
│   ├── App.jsx           # Main UI and tracking loop
│   ├── db.js             # Dexie.js database and GeoJSON export
│   ├── telephony.js      # Capacitor bridge to TelephonyPlugin
│   └── ...
├── android/
│   └── app/src/main/java/com/yourname/cellmapper/
│       └── TelephonyPlugin.java
├── .github/workflows/
│   └── deploy.yml        # Build & deploy APK to gh-pages
└── capacitor.config.json
```

## Required Android permissions

The app requests these permissions at runtime:

- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `READ_PHONE_STATE`

Location permission is required because cell tower data can infer device location.

## Local development

```bash
npm install
npm run dev       # Start the Vite dev server
```

To preview the production web build:

```bash
npm run build
npm run preview
```

## Build the Android app

Make sure you have:

- Android Studio
- JDK 21 or newer
- Android SDK

```bash
npm run build
npx cap sync android
npx cap open android
```

In Android Studio, build the debug APK with **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## CI/CD (GitHub Actions)

The workflow in `.github/workflows/deploy.yml` runs on every push to `main`:

1. Installs Node.js 22 and dependencies
2. Builds the React app
3. Syncs Capacitor with the Android project
4. Installs Java 21
5. Builds a debug APK with Gradle
6. Copies the APK to `public_pages/SignalStrength.apk`
7. Generates a download page
8. Publishes to the `gh-pages` branch

To enable the download page:

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Set source to **Deploy from a branch** and select **`gh-pages`**.
4. Visit `https://yourusername.github.io/SignalStrength`.

> ⚠️ **Important:** Do not select **GitHub Actions** as the Pages source, and do not serve the `main` branch. The workflow publishes only the generated download page + APK to the `gh-pages` branch.

## Customization

- Change the app ID from `com.yourname.cellmapper` to your own reverse-domain identifier in:
  - `capacitor.config.json`
  - `android/app/build.gradle`
- The CI builds an unsigned debug APK. For Play Store release, configure a signing keystore and use `assembleRelease`.

## Notes

- The web preview shows the map and UI, but cell signal metrics are only available inside the Android app via the native plugin.
- OpenStreetMap tiles require an internet connection.
- Signal strength color coding:
  - Green: RSRP ≥ -80 dBm
  - Lime: -95 dBm ≤ RSRP < -80 dBm
  - Yellow: -110 dBm ≤ RSRP < -95 dBm
  - Red: RSRP < -110 dBm

## Troubleshooting

### `main.jsx` 404 on GitHub Pages

This happens when Pages is serving the `main` branch instead of `gh-pages`. The source `index.html` references `/src/main.jsx`, which only exists during local development.

**Fix:** In **Settings → Pages**, set the source to **Deploy from a branch → `gh-pages`**.

## License

MIT
