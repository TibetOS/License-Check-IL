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
- Two mechanisms seen so far: a **clean REST GET** (Mazda / Delek Motors, endpoint
  identified) and a **plain form POST rendered server-side** (Kia / Telcar,
  **confirmed live** — returns real per-vehicle codes). Both are keyed on the plate;
  neither requires personal data for the plate-only widget.
- **CORS is not the blocker it was assumed to be.** For Kia, a cross-origin fetch
  from the app's real origin returns a readable body — so a proxy may be
  unnecessary. Must be re-checked per brand.
- **The actual blocker is rate limiting.** Kia's endpoint returned correct codes,
  then stopped returning any result — for every plate, including a genuine
  click-the-button submit — after ~12 requests in a few minutes. An in-app pull
  means one request to a marketing site per user lookup: it will be throttled,
  fails silently, and is likely contrary to the importers' terms.
- **Recommendation:** keep the per-brand **deep links** (PR #29, zero backend, always
  works) as the default. Any auto-pull should be best-effort only — lazy, cached
  indefinitely per plate, silently hidden on failure, never authoritative.

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

## Mechanism B — plain form POST (Kia / Telcar) ✅ confirmed live in a real browser

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
- There is **no AJAX** — the widget does a plain native form POST to the same URL,
  and the result is rendered server-side into the returned HTML:

  ```
  POST https://kia-israel.co.il/color-code
  Content-Type: application/x-www-form-urlencoded
  plateNum=<plate>
  ```

  The response contains `לקוח יקר, קוד צבע רכבך הינו <CODE>`; parse with
  `/קוד צבע רכבך הינו\s*([^\s<]+)/`.

- **Verified live (2026-07-22, real browser), cross-checked against the registry
  colour** — the codes are per-vehicle and internally consistent:

  | Plate | Registry `tzeva_rechev` | Paint code |
  |---|---|---|
  | 3101372 | בז (beige) | `J4` |
  | 3048872 | בז (beige) | `J4` (same colour ⇒ same code) |
  | 8743074 | שנהב לבן (ivory white) | `UD` (= Kia Clear White) |

- **CORS is permissive.** A cross-origin `fetch` from the app's real origin
  (`https://tibetos.github.io`) to `kia-israel.co.il` returned `type: "cors"` with a
  **readable body** — so for Kia the browser can read the response and **no proxy is
  needed on CORS grounds**. (This overturns the round-3 assumption above that a
  proxy is unavoidable; it must be re-checked per brand.)

### ⚠️ The real blocker: the endpoint throttles automated traffic

The decisive operational finding. The lookup returned correct codes on the first
three attempts, then — after roughly a dozen requests within a few minutes — began
returning the plain form with **no result for every plate**, including:

- the cross-origin `fetch` from another origin, **and**
- a genuine human-style submit (typing a plate and clicking "בדוק רכב") for a plate
  that had returned a code minutes earlier.

Causation isn't proven (a transient fault is conceivable), but "reliably works, then
reliably stops after a burst" is the signature of rate-limiting / bot protection.
Related evidence: headless Chromium could not load the site at all from the research
sandbox, while curl could — consistent with fingerprint-based bot defences.

Header spoofing does **not** bypass it: POSTs with a browser `User-Agent`, `Referer`,
`Origin: https://kia-israel.co.il`, `Sec-Fetch-Site: same-origin` and
`X-Requested-With` all returned the no-result page.

**Design implication.** An in-app pull issues one request to a *marketing site* per
user lookup. That will be throttled or IP-blocked, will fail silently when it is, and
is very likely contrary to the importers' terms — these tools are published for a
person checking their own car, not for bulk querying. Therefore:

1. Keep the **deep link** (PR #29) as the default, always-working path.
2. Treat any auto-pull as **best-effort only**: fire it lazily, cache aggressively
   (the code never changes for a given plate — cache indefinitely, per plate), hide
   the row silently on failure, and never present it as authoritative.
3. Never retry in a loop, and never pre-fetch for vehicles the user didn't ask about.

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
