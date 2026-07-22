# Data research round 3 — the manufacturer color code (paint code)

A user asked whether the app can also show the car's **manufacturer color code** —
the factory paint code (e.g. Toyota `1F7`, VW `LC9X`) printed on the door-jamb /
engine-bay sticker and used to match touch-up paint. This round documents where
that datum lives, what is and isn't pullable, and — for the sources that *are*
pullable — a capture procedure so the app can be built against **confirmed, real
requests** rather than guesses.

Findings below verified live on 2026-07-22, same methodology as rounds 1–2.

## TL;DR

- The paint code is **not** in any data.gov.il registry and **not** in the VIN.
  The registry carries only a colour *name* (`tzeva_rechev`, e.g. "כסף מטלי") and
  the ministry's internal colour code (`tzeva_cd`) — neither is the manufacturer
  paint code. The VIN encodes no paint data (confirmed against NHTSA vPIC: 154
  fields, none paint/colour).
- What *does* exist: **official Israeli importers publish per-plate color-code
  lookup tools.** They take the licence plate — the exact input the app already
  has — and return the manufacturer paint code.
- Two mechanisms seen so far: a **clean REST GET** (Mazda / Delek Motors) and a
  **client-side JS/XHR call after submit** (Kia / Telcar). Both are keyed on the
  plate; neither requires personal data for the plate-only widget.
- **Architecture constraint:** the app is a static, no-backend PWA. These importer
  endpoints are same-origin calls on the *importers'* sites and will not send CORS
  headers to our origin, so the browser can't read them directly. Pulling the code
  in-app therefore needs a **small server-side proxy** (`plate → code`), plus a
  privacy note (the plate now travels to our proxy and to the importer). Shipped
  interim: per-brand **deep links** from the colour row (PR #29), zero backend.
- Status: the pull is **feasible** but not yet built. Blocked on capturing each
  importer's exact request from an environment with normal browser/network access
  (the research sandbox blocks headless Chromium and was flaky to the Delek host).

## Shipped interim (PR #29) — deep links, no backend

The colour row now shows a link to the correct importer's color-code tool when the
registered manufacturer has one. Keyed by the English manufacturer name via the
existing `makerEnglish()` dictionary (`COLOR_CODE_TOOLS` in `app.js`). Brands with
no tool show no link — consistent with the app's "never guess" rule. Covered:
Kia, Škoda, Audi, Volkswagen / SEAT / Cupra (Champion Motors), Mazda, NIO, Mini,
BMW. This stays valuable regardless of whether the data-pull ships: the user gets
the code in one extra click, and it costs nothing to run.

## Where the paint code is NOT

| Candidate | Result |
|---|---|
| data.gov.il main registry | Only `tzeva_rechev` (name) + `tzeva_cd` (MoT internal code). No manufacturer paint code. |
| Other registries (cancellation, heavy, personal import, …) | Same — colour name only, no paint code field. |
| VIN (`misgeret`) | Paint colour is not encoded in any VIN. |
| NHTSA vPIC VIN decoder | 154 fields returned; none is paint/colour (only `Trim`). |
| Open datasets / GitHub | VIN decoders (no paint data) and paint-code *catalogs* keyed by make/model/colour-name — **not** per-vehicle. No open source maps a specific plate/VIN → its factory paint code. |

Conclusion: the only per-vehicle source is the manufacturer's own build record,
which the **Israeli importers** expose (for their own brands) through plate-keyed
web tools.

## Mechanism A — clean REST GET (Mazda / Delek Motors) ✅ endpoint identified

Mazda's color-code page (`mazda.co.il/color-code`) is a Next.js app whose lookup
function was recovered from its JS bundle:

```
GET https://forms.delek-motors.co.il/Home/GetColorCodes?brandId=1&licenseNumber=<plate>
```

- `brandId=1` = Mazda (Delek Motors imports several brands off the same host —
  other `brandId` values likely map to its other marques; to be confirmed on
  capture).
- A sibling call `GetRecalls?brandId=1&licenseNumber=<plate>` exists on the same
  host — potentially a second enrichment source, out of scope here.
- The page also offers lookup by chassis (`&chassis=<vin>` instead of
  `licenseNumber`).

**Not yet verified end-to-end:** a live code could not be pulled from the research
sandbox (`forms.delek-motors.co.il` returned 502/000 through the egress proxy).
Capture step below should confirm the response JSON shape and its CORS headers.

## Mechanism B — client-side XHR after submit (Kia / Telcar) ⚠️ endpoint not captured

Kia's page (`kia-israel.co.il/color-code`, WordPress) has the plate-only widget the
user confirmed:

```html
<form method="post" id="serviceform" action="">
  <input type="text" pattern="\d*" name="plateNum" minlength="7" maxlength="8" required />
  <input type="submit" id="searchsubmit" value="בדוק רכב" />
</form>
```

Established facts:

- The widget takes **only the plate** — no name / phone / ID. (An earlier note
  claiming it needed a national ID was wrong: it described a *different* form on
  the same page — `gform_24`, a service-booking Gravity Form. The page hosts nine
  forms; the color-code widget is `#serviceform`.)
- The plain server-side POST to `/color-code` does **not** render the code (two
  different plates returned pages differing only by anti-spam tokens), and no AJAX
  handler for `#serviceform` appears in the page's static scripts. So the code is
  fetched by a **browser-side XHR** whose exact URL only reveals itself at runtime
  (Telcar backend or a WordPress `admin-ajax.php` action).
- Capturing that call needs a real browser. The research sandbox's egress proxy
  reset every headless-Chromium navigation (`ERR_CONNECTION_RESET`; curl through
  the same proxy worked — consistent with importer-side bot protection reacting to
  a non-human TLS fingerprint), so it must be captured elsewhere.

## Architecture: why a proxy is (probably) required

The app is a static PWA that talks only to data.gov.il, which deliberately serves
`access-control-allow-origin: *`. Importer color-code endpoints are same-origin
XHRs on the importers' own SPAs; a browser running on the app's origin will be
blocked by CORS from reading their responses **unless** a given endpoint happens to
send permissive CORS headers. Therefore:

- **Per brand, check the response's `access-control-allow-origin` header** (capture
  step 7). If permissive → that brand may be callable **directly from the browser**,
  no proxy.
- Otherwise → a **small server-side proxy** (`plate + brand → code`) is needed.
  This is a genuine change to the app's posture: today the plate never leaves the
  device except to the government registry; a proxy routes it to our server and to
  a third-party importer. That must be disclosed in the UI/README, and the feature
  should be opt-in / clearly labelled.

Hosting for the proxy is deferred (candidate: a Cloudflare Worker — the repo
already has CF tooling). Not to be built until endpoints are confirmed.

## Capture procedure (run on a desktop browser, per brand)

1. Open the importer's color-code page → **F12** → **Network** tab.
2. Click the **Fetch/XHR** filter and enable **Preserve log**.
3. Enter a **real plate of that brand** and submit.
4. Find the request whose **Response** contains the colour code (check the
   Response / Preview tab of candidate rows).
5. Right-click that row → **Copy → Copy as cURL**. Save it.
6. Copy the **Response body** too.
7. In the request's **Headers**, note whether the response includes
   `access-control-allow-origin` (and its value).

"Copy as cURL" captures method, URL, query/body, and any tokens/cookies in one
shot — enough to reproduce the call server-side (or decide it's CORS-open).

### Paste-back template (one block per brand)

```
Brand:
Page URL:
Copy-as-cURL:
Response body (the colour code result):
Response header access-control-allow-origin (present? value?):
Notes (instant on-screen code, or a "we'll email you" lead form?):
```

If a brand's tool turns out to be a lead-capture form that emails the code later
(rather than showing it on screen), it **cannot** be auto-pulled and stays a
deep-link.

## Per-brand capture targets

| Brand(s) | Page | What to look for |
|---|---|---|
| Mazda | mazda.co.il/color-code | Confirm `forms.delek-motors.co.il/Home/GetColorCodes?brandId=1&licenseNumber=…`; paste its JSON response + CORS header. |
| Kia | kia-israel.co.il/color-code | The post-submit XHR that returns the code (Telcar host or `admin-ajax.php`). The key missing capture. |
| VW / SEAT / Cupra | championmotors.co.il/check-color | One Champion Motors backend for all three — note the param that distinguishes the marque. |
| Audi / Škoda | audi.co.il/color-finder, skoda.co.il/color-finder | Same importer group — likely one shared endpoint with a brand param. |
| Mini / BMW | mini.co.il/…/color-codes, bmw.co.il/…/color-codes | BMW group — one endpoint likely serves both. |
| NIO | nio.co.il/color-code | Capture as-is. |

One plate per brand is enough to start. Mazda + Kia confirmed would be enough to
build the pilot proxy against real endpoints.

## Next steps

1. Capture endpoints per the procedure above (needs a normal browser/network env).
2. Per confirmed endpoint: verify reproducibility, classify CORS-open vs
   proxy-required, note token/session handling.
3. Build the pilot proxy (start with Mazda's clean GET), wire into the app behind a
   feature flag, with a clear privacy disclosure for the plate leaving the device.
4. Extend brand-by-brand; any lead-form-only brand stays a deep-link (PR #29).
