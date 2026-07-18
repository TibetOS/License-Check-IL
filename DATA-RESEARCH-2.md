# Data research round 2 — beyond the ministry registries

Round 1 ([DATA-RESEARCH.md](DATA-RESEARCH.md)) established that data.gov.il has
no more *per-plate registries* to add — the app already queries every one the
Ministry of Transport publishes. This round asks the next question: **what can
we pull from everywhere else?** Three directions turned out to be productive:

1. **A field we already fetch but never use — the VIN** (`misgeret`) — unlocks
   external decoders and fraud cross-checks.
2. **Open APIs outside data.gov.il** (NHTSA vPIC, Wikidata, the Open Bus
   project) that are CORS-open and joinable from the browser.
3. **Non-MoT datasets on data.gov.il** joinable at the model level or usable
   as context (fuel prices, EV charging stations).

All API behaviors below were verified live on 2026-07-18 (endpoints, CORS
headers, and sample queries), same methodology as round 1. Dead ends are
documented too, so they aren't re-researched later.

## TL;DR

| # | Opportunity | Source | Verified | Effort | Value |
|---|---|---|---|---|---|
| 1 | WMI / VIN cross-checks (fraud red flags) | client-side static table | ✅ (VIN present in registry) | S | ★★★ |
| 2 | VIN decode — plant, body, airbag inventory | NHTSA vPIC API | ✅ CORS `*` | S | ★★ |
| 3 | Bus "career" — real routes this bus drove | Open Bus / Stride API | ✅ CORS `*` | M | ★★ |
| 4 | Annual fuel-cost estimate | orl-prices + WLTP CO₂ | ✅ datastore | S | ★★ |
| 5 | Model specs/image hardening | Wikidata SPARQL | ✅ CORS `*` | M | ★★ |
| 6 | Official deep links (liens, fines) | gov.il pages | n/a (links only) | S | ★★ |
| 7 | EV charging-station summary | MoT dataset | ✅ (no coords in CSV) | M | ★ |
| 8 | Licence-fee amount, Euro NCAP stars | static tables we'd maintain | ⚠️ no API | M–L | ★ |

---

## 1. The unexploited goldmine: `misgeret` is a full VIN

The main registry returns the complete 17-character chassis number for every
vehicle — e.g. plate `3662074` → `misgeret: "JTDKJ3C3801009553"`. The app
currently displays it as an opaque string. It encodes real, checkable data.

### 1a. Client-side WMI decode — zero requests, works offline

The first 3 characters (World Manufacturer Identifier) identify manufacturer
and **country of manufacture**: `JT…` = Toyota/Japan, `WVW` = VW/Germany,
`KMH` = Hyundai/Korea, `VF3` = Peugeot/France, etc. A static table of the
~100 WMIs common in the Israeli fleet is a few KB shipped with the app.

Two features fall out of this:

- **Provenance line**: "שלדה: טויוטה, יפן" — independent confirmation of the
  registry's `tozeret_nm`.
- **Mismatch red flag**: if the WMI country/maker contradicts `tozeret_nm`
  (registry says "טויוטה יפן", VIN starts with something non-Toyota), that is
  a strong signal of a cloned/ringer vehicle or registry error — exactly what
  a pre-purchase checker exists for. Verified consistency on the test plate:
  `tozeret_nm` "טויוטה יפן" ↔ WMI `JTD` (Toyota Japan). This check must be
  worded carefully ("אי-התאמה בין השלדה ליצרן הרשום — מומלץ לבדוק") and only
  shown on a confident mismatch, never on an unknown WMI.

A second cheap cross-check: the VIN's 10th character encodes model year in
US/ISO usage. **Caveat verified**: many non-US-market VINs don't follow it
(the test VIN has `0` at position 10, which is not a valid year code — vPIC
flagged exactly that). Only raise a flag when the character *is* a valid year
code **and** disagrees with `shnat_yitzur` by more than a year.

### 1b. NHTSA vPIC — free VIN decoder with open CORS

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json
```

Verified live: no key, `access-control-allow-origin: *` (confirmed with an
`Origin` header), instant JSON. Decoding the Israeli-market test VIN returned
genuinely new fields the Israeli registry doesn't have:

- Plant: KANEGASAKI, IWATE, JAPAN (Toyota Motor East Japan)
- Body class: Hatchback/Liftback, 5 doors
- **Airbag inventory**: curtain all rows, front driver+passenger, knee
  (driver), side 1st row — a safety datum buyers care about, absent from the
  MoT data for pre-WLTP vehicles
- US-market model family ("Prius C" for the NSP120 platform)

**Caveats (verified)**: Israeli-market VINs fail the US check-digit rule and
sometimes use non-US year codes — the response carries `ErrorCode` 1/11/14 and
decoded fields may be partial or approximate (the "Prius C" name is the
platform's US name, not the Israeli "Space Verso"). Rules for using it safely:

- Fire it lazily (a "פרטים נוספים מהשלדה" expander), never on the hot path.
- Display only when `Make` agrees with the registry's manufacturer; otherwise
  discard silently — vPIC data is best-effort for non-US VINs.
- Prefer structural fields (plant, body, airbags) over marketing names.
- It's a US government API — availability is good but it's a third party;
  treat failures as "no data", never as a red flag.

## 2. Open Bus project (הסדנא לידע ציבורי) — what buses actually do

The public-transport SIRI feed archives every bus's real-time locations, and
**the SIRI `vehicle_ref` is the license plate**. The Hasadna Stride API over
that archive is open and CORS-enabled:

```
https://open-bus-stride-api.hasadna.org.il/siri_rides/list
    ?vehicle_refs=<plate>
    &scheduled_start_time_from=...&scheduled_start_time_to=...
    &order_by=scheduled_start_time desc&limit=10
```

Verified live: took a plate from a fresh SIRI snapshot (`68510603`), confirmed
it exists in the MoT public-transport registry (Higer urban bus, 2024, M3),
and pulled its actual rides from 2026-07-16 with timestamps. CORS
`access-control-allow-origin: *`.

Feature: on a public-transport hit, a "מה האוטובוס הזה עשה השבוע" panel —
which lines it served, when it was last seen moving, even its last GPS
position (`/siri_vehicle_locations/list?siri_ride__vehicle_ref=<plate>` with a
bounded time window). Great trust-builder and genuinely unique.

Implementation notes (all verified the hard way):

- **Always bound the time window.** An unbounded `vehicle_refs` query scans
  years of data and times out (>60s). With a date bound it answers in ~1-2s.
- GTFS enrichment (`gtfs_route__route_short_name`, agency name) is `null` on
  rides less than ~1-2 days old — the joiner lags the SIRI feed. For fresh
  rides fall back to `siri_route__line_ref` → one lookup in `/gtfs_routes/list`
  on an older date, or simply query a window ending "yesterday".
- Not-in-service is an empty list — same "no data ≠ no" semantics the app
  already applies to partial registries.
- It's a volunteer-run (Hasadna) service: degrade gracefully.

## 3. Fuel-cost estimate — Ministry of Energy prices × WLTP CO₂

Two verified facts combine into a "כמה עולה לתדלק אותו בשנה" estimate:

- **Dataset `orl-prices`** (משרד האנרגיה), resource
  `aaa40832-ac82-4c86-bac6-0d05c83f576f`, is datastore-active and queryable
  with the exact same `datastore_search` call the app already uses. Monthly
  rows per product; verified a row for "בנזין 95 אוקטן נטול עופרת" (₪/kiloliter,
  refinery-gate maximum price under the supervision order). Updated monthly
  (last modified 2026-07-01).
- The WLTP model table has **no liters/100km column** (verified the schema —
  only `kamut_CO2`, `kamut_CO2_city`, `kamut_CO2_hway`, `CO2_WLTP`), but
  consumption derives from CO₂ by chemistry: l/100km ≈ CO₂ g/km × 100 ÷
  2,392 g/L for petrol (÷ 2,640 g/L for diesel) — e.g. 150 g/km ≈ 6.3 l/100km.

Combined with the average-annual-km figure the app already computes per
vehicle: `annual cost ≈ annual km × l/km × price/L`.

**Honesty caveats**: the refinery-gate price excludes excise, VAT, and margin
— the pump price is roughly 2.5-3× it. Either apply the published fixed
components as a static yearly-updated constant, or (safer) label the result as
an estimate range. Skip entirely for EVs (`sug_delek_nm` חשמל) and LPG
conversions (`gapam_ind`).

## 4. Wikidata — harden the model image and add lineage

`https://query.wikidata.org/sparql?format=json&query=...` verified: CORS `*`
(explicit allow-headers too), and a label lookup for a model name returns its
entity. Compared to the current Wikipedia-search approach for images, Wikidata
adds structured, per-entity facts:

- `P18` image (Commons) — the same image the app finds today, but selected
  structurally instead of by search ranking → fewer wrong-generation hits.
- Production years (`P571`/`P2669`), predecessor/successor models, body style,
  Hebrew label — enables "הדגם יוצר 2010–2016, הוחלף ע"י …" one-liner.

Privacy posture unchanged: only the model name is ever sent, never the plate
(same rule the README already commits to for Wikipedia). Effort is in name
matching (Hebrew `kinuy_mishari` → entity), same problem the image feature
already solves; Wikidata's `wbsearchentities` API (also CORS `*`) can replace
the current search step.

## 5. Official deep links — no API, real value

Round 1 confirmed liens (שעבוד/עיקול) and per-plate accident history are not
open data, and that remains true. But the app can still *route the user* to
the authoritative checks with the plate pre-explained — a "בדיקות נוספות
באתרים רשמיים" box:

- gov.il vehicle-lien / ownership-verification service (שעבודים ועיקולים) —
  the paid/captcha-protected MoT check.
- רשם המשכונות (Ministry of Justice) — pledge search (keyed by owner ID; the
  link plus a one-line explanation of what to ask the seller for).
- Police fines / מוקד קנסות — outstanding-fine check.
- The recall importer links the app already shows (from the recall catalog).

Zero data risk, zero maintenance, and it answers the questions users actually
arrive with ("האם הרכב משועבד?") with the most honest possible UX: "זה לא מידע
פתוח — הנה הבדיקה הרשמית".

## 6. Marginal / static-table candidates

- **EV charging stations** (MoT `agg_charge_stations`): datastore-active CSV
  resource `528482f2-d410-4d62-8b17-566ab23a1c52`, 2,261 stations with
  operator, name, address, fast/slow counts — **but no coordinates** (geometry
  lives only in the SHP/KMZ zip resources, verified not datastore-active).
  A "nearest charger" feature would need a one-time SHP→JSON conversion
  committed to the repo. Low priority; a national count/operator summary for
  EV results is nearly free but also nearly content-free.
- **Licence-fee amount (אגרת רישוי)**: the WLTP table gives the fee *group*
  (`kvuzat_agra_cd`), but the ₪ tariff table is not on the portal (verified —
  the only "אגרות" hits are rabbinical courts, consular fees, firefighting,
  sport-driving). A small static table from the MoT tariff page, refreshed
  yearly, would turn the group number into "אגרה שנתית: ~₪X" — worthwhile if we
  accept the yearly maintenance.
- **Euro NCAP stars**: no public API — the old `umbraco/EuroNCAP/...` JSON
  endpoint now 404s behind their Next.js rebuild (verified). Star ratings
  would require a hand-maintained static table per model. The registry's own
  `nikud_betihut`/`ramat_eivzur_betihuty` already covers safety for
  WLTP-era vehicles; NCAP would mainly serve older ones. Keep on the shelf.

## 7. Verified dead ends (this round)

- **Stolen-vehicle list**: Israel Police publishes only aggregated
  `crime_records_data` on the portal; searches for גנוב/גניבות רכב return no
  per-plate dataset. The police stolen-vehicle lookup exists only as a
  captcha-protected web service — deep-link candidate at best.
- **Consumer pump fuel price**: published as a monthly notice, not a dataset;
  only the refinery-gate supervised price (§3) is queryable.
- **Driving-school vehicles, test-facility registry**: no datasets found.
- **api.gov.il** (the government API gateway): requires registration and
  serves nothing per-plate beyond what data.gov.il already exposes — not
  applicable to a no-backend static app.
- Round 1's ceiling stands: no liens, no per-plate accidents, no owner data,
  anywhere in open data.

## Recommended order of implementation

1. **WMI provenance + mismatch red flag** (§1a) — small static table, zero
   requests, and it's the only idea here that adds a *fraud-detection* signal,
   the core promise of a plate checker.
2. **vPIC lazy VIN expander** (§1b) — one fetch, real new data (airbags,
   plant), guarded by the Make-agreement rule.
3. **Fuel-cost estimate** (§3) — one monthly-cached fetch + arithmetic on
   fields already loaded; put next to the existing annual-mileage line.
4. **Stride bus panel** (§2) — medium effort, applies only to buses, but a
   distinctive feature no other Israeli plate tool has.
5. **Wikidata image/lineage hardening** (§4) — improves an existing feature's
   correctness more than it adds new data.
6. **Official-checks link box** (§5) — trivial, ship with any of the above.
