# בדיקת רכב — Mobile (Expo)

Native scanner app for License-Check-IL. The camera + OCR run **on the device**
with **ML Kit on-device text recognition** — far stronger than the web
(Tesseract) build on the hard frames: angle, glare, small/distant plates, and
**non-yellow** (white / dealer / diplomatic) plates. When a plate locks, the app
opens the **existing website** in a WebView at `?plate=…`, and the site runs the
full lookup (details, history, renewal, recalls) exactly as it does today — so
nothing is rebuilt.

> **Why native:** the web scanner is color-first (find the yellow blob, then
> OCR) because a per-frame text detector is too heavy in WASM. ML Kit is
> text-first and runs on the NPU/GPU, so it reads plates the web build can't.
> See `../NATIVE-SCANNER-PLAN.md` for the full rationale and measurements.

---

## ⚠️ Verification status — read this first

This app was **written but not built or run on a device** in the environment
that generated it (Linux, no macOS/Xcode/iPhone). Treat it as a correct,
complete scaffold that **you must build and test on a real device**. Expect to
run `expo install` to align exact package versions for your installed Expo SDK,
and to verify the camera/OCR on-device against real Israeli plates (including the
awkward ones: angled, dusty, glare, dark, dealer/white, short historic).

It is **not** an Expo Go app — ML Kit is native code, so it needs a
**development build** (`expo prebuild` + `expo run:*` or an EAS dev build).

---

## What's here

```
mobile/
├── App.tsx                 state machine: Scanner ↔ Results(WebView)
├── src/
│   ├── ScannerScreen.tsx   expo-camera preview + interval capture + ML Kit OCR + vote
│   ├── ResultsScreen.tsx   WebView of the existing site at ?plate=…
│   ├── plate.ts            digits/validate/format + 2-of-3 voter (ported from the web scanner)
│   └── config.ts           SITE_URL + tuning constants  ← set SITE_URL
├── app.json                Expo config, camera permission strings (Hebrew)
├── eas.json                EAS build profiles (development / preview / production)
└── package.json
```

## Prerequisites

- Node 18+ and the Expo CLI (`npx expo`).
- **iOS**: a Mac with Xcode (for a local build) **or** an Apple Developer account
  for EAS Build + TestFlight.
- **Android**: Android Studio (local) **or** EAS Build.
- Optional: `npm i -g eas-cli` for cloud builds.

## Setup

```bash
cd mobile
npm install
# 1) point the app at your deployed site (default is the GitHub Pages URL):
#    edit src/config.ts -> SITE_URL
# 2) generate the native projects (ML Kit needs them):
npx expo prebuild --clean
```

## Run on a device

Local (device connected):

```bash
npx expo run:ios        # Mac + Xcode
npx expo run:android    # Android Studio + device/emulator
```

Or a cloud **development build** (no local native toolchain needed):

```bash
npx eas build --profile development --platform ios      # or android
# install the build on your device, then:
npx expo start --dev-client
```

## How it works

1. **Scan** (`ScannerScreen.tsx`): full-screen `expo-camera` preview with a soft
   dashed plate hint (not a hard box — the plate is read anywhere in frame). A
   loop captures a still every ~500 ms (`skipProcessing`, no shutter sound/anim)
   and runs `TextRecognition.recognize()` on-device.
2. **Parse + vote** (`plate.ts`): every OCR line is stripped to digits; 7–8-digit
   lines are candidates; a value locks only when it appears in **2 of the last 3**
   valid reads (the web scanner's anti-flicker rule, ported verbatim). Short
   historic numbers still go through manual entry on the site.
3. **Hand off** (`ResultsScreen.tsx`): on lock, the WebView loads
   `SITE_URL?plate=<digits>` and the existing site auto-runs the lookup. Manual
   entry opens the site with no plate.

Nothing leaves the device during scanning — ML Kit is fully on-device; only the
plate **number** is sent to the site (which queries data.gov.il, exactly as the
web app already does).

## Tuning

`src/config.ts`: `SITE_URL`, `SCAN_INTERVAL_MS` (capture cadence),
`SCAN_HELP_AFTER_MS` (when the "move closer / reduce glare" hint appears).

## Known limitations & upgrade path

- **Capture-loop vs frame processor.** This build captures stills on an interval
  (~2 fps) for maximum build-reliability with stable APIs. For buttery per-frame
  scanning, migrate the camera to **`react-native-vision-camera`** with a
  **frame-processor OCR plugin** (ML Kit under the hood) — same parse/vote logic,
  smoother preview, no per-frame file I/O. This is the recommended Phase-3
  polish once the capture-loop is validated on-device.
- **Temp files.** Each capture writes a JPEG that is deleted right after OCR
  (`expo-file-system`). If you see cache growth on some devices, confirm the
  delete path.
- **SITE_URL** must point at a reachable deploy; the lookup itself needs network
  (data.gov.il), same as the web app.
