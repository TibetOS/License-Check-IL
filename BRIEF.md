# License-Check-IL — App Brief

## Overview
A simple web app that lets a user enter an Israeli license plate number and instantly see the vehicle's official registration details, pulled live from the Israeli government open-data portal (data.gov.il).

## Problem
Checking a vehicle's details (before buying a used car, verifying a plate, etc.) requires digging through government sites. There is no quick, friendly lookup tool.

## Solution
A single-page app with one input: the plate number. On submit, the app queries the Ministry of Transport vehicle registry on data.gov.il and shows the results in a clean, readable card.

## Data Source
- **Portal:** data.gov.il (CKAN API)
- **API:** `https://data.gov.il/api/3/action/datastore_search`
- **Primary dataset:** Private and commercial vehicle registry (resource `053cea08-09bc-40ec-8f7a-156f0677aff3`), queried by the `mispar_rechev` (plate number) field.
- No API key required; data is public.

## Core Features (MVP)
1. **Plate lookup** — input field with validation (7–8 digits), formatted display (e.g. `12-345-67`).
2. **Vehicle details card** — manufacturer, model, year, color, fuel type, ownership type, last annual test (test) date, and registration validity.
3. **Not found / error states** — clear message when a plate isn't in the registry or the API is down.
4. **Hebrew + RTL UI** — primary language Hebrew, mobile-first layout.

## Nice-to-Have (Later)
- Lookup in additional registries (motorcycles, disabled parking permits, vehicle recalls).
- Shareable result link.
- Recent-searches history (local only).

## Tech Approach
- **Frontend:** single-page app (React or plain HTML/JS) — the CKAN API supports CORS, so no backend is required for MVP.
- **Hosting:** static hosting (GitHub Pages / Vercel / Cloudflare Pages).
- **No user data stored.** Queries go directly from the browser to data.gov.il.

## Success Criteria
- A valid plate returns full vehicle details in under 2 seconds.
- Works on mobile and desktop, in Hebrew, with correct RTL rendering.
- Zero infrastructure cost for MVP.

## Out of Scope
- Owner personal information (not available in the public dataset).
- Payment, accounts, or saved data on a server.
