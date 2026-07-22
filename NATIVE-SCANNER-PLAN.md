# Native / Expo Scanner — Migration Plan & Prototype Spec

Companion to the PWA scanner rework (branch `claude/license-plate-ocr-ux-9nuobc`).
The PWA fix makes live scanning **find the plate anywhere in frame** and ships to
every user instantly. This document is the deliberate next step: what a native
build buys, what it costs, and exactly how to prototype it — so the decision to
go native is made with eyes open, not on vibes.

---

## 1. Why consider native at all

The PWA fix removes the alignment box and reads standard yellow plates wherever
they are in frame. But measurement (see the OCR bench in the PR) shows a **hard
ceiling** for the on-device web stack (Tesseract.js `fast` model, WASM):

| Failure mode | PWA (Tesseract WASM) | Native (Vision / ML Kit) |
|---|---|---|
| Strong angle / perspective (≥~10–12°) | Refuses to lock, guides "straighten" | Handled natively (rectified text detection) |
| Strong glare / specular hotspot | Often no read | Much more robust |
| Small / distant plate (~40px digits) | Unreliable | Reliable to smaller sizes |
| Non-yellow (white/dealer/diplomatic/police) | No color region → no read | Read directly (text-first, not color-first) |
| Per-frame cost | ~40 ms recognize (server) / est. 150–250 ms phone | Runs on the Neural Engine / GPU, near-frame-rate |

The web stack is **color-first** (find the yellow blob, then OCR it) because a
generic per-frame text detector is too heavy in WASM. Native OCR is
**text-first**: Apple's Vision `VNRecognizeTextRequest` and Android's ML Kit
Text Recognition detect and recognise text regions directly, on-device, on the
NPU/GPU — so they don't depend on plate colour and tolerate angle/glare far
better. That is the real, measured reason to go native, and only for the hard
frames the PWA can't reach.

Everything else about the app (the data.gov.il lookup, vehicle details, history,
recalls, renewal fees, "my car", RTL, offline) does **not** benefit from native
and is a large amount of working code to preserve.

---

## 2. Recommended architecture — Hybrid (native scanner + WebView app)

Do **not** rewrite the whole app. Wrap the existing static web app in an Expo
shell and replace only the scanner with a native screen:

```
Expo (React Native) app
├── WebView  ──────────────►  the existing static site (bundled locally or hosted)
│                              — all lookup / details / history / RTL / offline UI, unchanged
└── Native "Scan" screen
    ├── react-native-vision-camera        (camera + frame processors)
    ├── on-device OCR frame processor
    │     iOS:     VNRecognizeTextRequest  (Vision framework)
    │     Android: ML Kit Text Recognition v2 (bundled model, on-device)
    └── returns the 7–8 digit string ──►  injected into the WebView's plate lookup
```

- The WebView loads the **same** `index.html` / `app.js` already in this repo
  (bundled as an app asset so it works fully offline). The native scanner calls
  a tiny JS bridge (`window.__setPlate(digits)`) that fills the input and submits
  — the identical `acceptPlate()` flow the PWA already uses.
- One native screen to build and maintain. The 2,800-line app is reused as-is.

Alternative (not recommended first): full React Native rewrite of the whole UI.
Highest effort, re-implements a lot of working, tested Hebrew/RTL logic, and
gains nothing outside the scanner.

---

## 3. Stack, licensing, offline, bundle

- **Expo** (managed) with a **development build** (config plugin) — `react-native-vision-camera`
  needs native modules, so plain Expo Go won't work; use `expo prebuild` + EAS.
- **react-native-vision-camera** (MIT) — frame processors run JS/native on each
  frame without round-tripping pixels to JS.
- **iOS OCR: Apple Vision** — first-party, no dependency, no model to bundle,
  free, fully offline, excellent Latin-digit accuracy. Access via a small Swift
  frame-processor plugin.
- **Android OCR: ML Kit Text Recognition v2** — on-device, free, model can be
  **bundled** (offline from first launch) or downloaded; bundle it to honour the
  100%-offline requirement. Apache-2.0 tooling.
- **No plate frame/photo ever leaves the device** — Vision/ML Kit are on-device;
  keep all processing local, exactly as the PWA constraint requires.
- **Bundle size**: ML Kit bundled model adds a few MB on Android; iOS Vision adds
  nothing. Both acceptable.
- **Licensing**: all of the above are permissive (MIT / Apache-2.0 / first-party
  Apple). No copyleft, no server component.

---

## 4. Distribution & the verification gap (important)

- Native means **App Store + TestFlight** (Apple Developer account, $99/yr, app
  review) and **Google Play** (one-time fee, review). This is a fundamental change
  from "open a URL / install the PWA" — plan for review timelines and update lag.
- **Build**: EAS Build compiles in the cloud (no local Mac strictly required),
  producing TestFlight / internal-track builds.
- **Verification honesty**: camera + frame-processor OCR can only be validated on
  a **real device**. It cannot be tested in this Linux/CI environment (no
  macOS/Xcode/iPhone). Whoever builds it must verify on-device with real Israeli
  plates — including the awkward set already collected for the PWA bench
  (angled, dusty, glare, dark, motion, dealer/white, short historic).

---

## 5. Scanner prototype spec (what to build first)

Goal of the prototype: prove native OCR clears the frames the PWA can't, before
committing to the full hybrid.

1. **Scaffold**: `npx create-expo-app`, add `react-native-vision-camera`, config
   plugin, `expo prebuild`, run a dev build on a device.
2. **Camera screen**: back camera, continuous autofocus, torch toggle, a soft
   centering hint (not a hard box — same UX principle as the PWA fix).
3. **Frame processor** (runs each frame, on-device):
   - iOS: Swift plugin wrapping `VNRecognizeTextRequest`
     (`recognitionLevel = .accurate`, `usesLanguageCorrection = false`,
     `recognitionLanguages = ["en"]`).
   - Android: ML Kit `TextRecognition.getClient(...).process(image)`.
4. **Plate parse & validate** (reuse the PWA's proven rules):
   - Strip non-digits; accept **7–8 digit** groups (short historic allowed only on
     manual entry, as today); format `NN-NNN-NN` / `NNN-NN-NNN`.
   - **Multi-frame vote**: lock only when the same number appears in ≥2 of the last
     3 valid reads (the PWA's anti-flicker rule — port it verbatim).
5. **Handoff**: on lock, haptic + fill the WebView input via the JS bridge and run
   the existing lookup. Manual entry and photo upload remain.
6. **Bench on device**: run the awkward real-plate set; record read-rate and
   latency vs the PWA numbers in the PR. Only proceed to the full hybrid if native
   clearly wins on the hard frames.

**Acceptance for the prototype**: reads angled / glare / non-yellow / small plates
that the PWA refuses, at interactive frame rate, 100% offline, with no wrong-locks.

---

## 6. Phasing & rough effort

| Phase | Work | Rough effort |
|---|---|---|
| 0 | This PWA fix (done) — detect-anywhere, ships now | — |
| 1 | Native scanner **prototype** (spec §5), device bench | ~1–2 weeks |
| 2 | Hybrid shell: Expo + WebView bundling the existing app, JS bridge | ~1 week |
| 3 | Polish: torch/zoom, permissions, RTL, offline model, guidance, a11y | ~1–2 weeks |
| 4 | Store setup: Apple Developer + Play, icons/splash, review submission | ~1 week + review |

Phase 1 is the decision gate: if the native prototype doesn't clearly beat the
PWA on the hard frames on real devices, stop and keep the PWA.

---

## 7. Recommendation

Ship the PWA fix now (verified, instant, whole app intact). Build the **Phase 1
native prototype** next and bench it on a real device against the same awkward
plate set. Go native only if that prototype clears the frames the PWA can't —
otherwise the PWA remains the right home for this app.
