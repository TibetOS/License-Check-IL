# Guidance for AI assistants working on this repo

## What this app is (and is not)

License-Check-IL is a **vehicle information tool**: it shows a vehicle's
complete official record from Ministry of Transport open data — registration
details, specs, test and license dates, history, recalls, and fees. People use
it to check their own car, track test/renewal dates, or look up any vehicle.

**It is NOT a fraud-checking tool.** Do not frame it as one — not in UI copy,
README text, PR descriptions, commit messages, or design prompts. The VIN
cross-check and change flags are individual features among many, not the app's
identity. Prefer neutral framing: "the vehicle's official record", "status",
"transparency of the registry data" — not "fraud", "red flags", "verdict",
or "consumer protection".

## Development commands

- No build step and no dependencies. Serve the repo root with any static
  server, e.g. `python3 -m http.server 8000`, and open http://localhost:8000.
- There is no test suite. Verify changes by driving the real page in a
  headless browser (Playwright/Chromium) against the local server —
  the render functions in app.js are globals and can be exercised directly
  via `page.evaluate` with mock registry records.
- Deploys are automatic: push to `main` publishes the site; push any branch
  to `staging` (`git push origin <branch>:staging --force`) publishes a
  preview under `/staging/`.

## Standing conventions

- No server, no build step: plain HTML/CSS/JS, queries go from the browser
  straight to the data.gov.il CKAN API. Keep it that way.
- Never present uncertainty as fact: missing or unmatched data shows nothing
  rather than a guess. Authoritative datasets show an explicit "אין"; partial
  datasets show "לא נמצאו נתונים".
- Any change to shell files (especially index.html) requires bumping the
  service-worker cache version in sw.js.
- The license-fee table in app.js follows the official tariff, CPI-updated
  every April — refresh the numbers and the visible "תעריף" label yearly.
- Local assets (logos/, model-images/) are stored in the repo with free
  licenses only; model-images/ATTRIBUTION.md must stay in sync.
