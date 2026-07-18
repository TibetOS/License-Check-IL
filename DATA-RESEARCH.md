# Data research — pulling vehicle data from data.gov.il

Research notes on the CKAN API behind the app, the structure of the vehicle
registry, and every related per-plate registry on the portal. All resource IDs,
schemas, and behaviors below were verified live against the API on 2026-07-17.

> **Round 2** — sources *beyond* the ministry registries (VIN decoding, Open
> Bus, fuel prices, Wikidata, verified dead ends): see
> [DATA-RESEARCH-2.md](DATA-RESEARCH-2.md).

## TL;DR

- The app already queries the right resource. The dataset's second file
  ("המשך") is **not more vehicles** — it's extra columns for the same rows.
- Every registry is keyed by `mispar_rechev`, so the app can be extended to a
  fallback chain (inactive vehicles → motorcycles → personal import) to turn
  "not found" into a meaningful answer, and enriched via the WLTP model table
  (safety rating, horsepower, CO₂) with one extra request.
- `datastore_search` is open CORS (`access-control-allow-origin: *`), no API
  key, supports GET and POST JSON. `datastore_search_sql` is blocked by the
  WAF — don't build on it.

## API mechanics

Endpoint: `https://data.gov.il/api/3/action/datastore_search`

| Aspect | Verified behavior |
|---|---|
| Auth | None needed |
| CORS | `access-control-allow-origin: *` — safe to call from any static host |
| Methods | GET with query params, or POST with a JSON body — both work |
| Exact match | `filters={"mispar_rechev":3662074}` (JSON, URL-encoded). String and number values both match the numeric column |
| Full-text | `q=3662074` also works, but is slower and can over-match — prefer `filters` |
| Projection | `fields=mispar_rechev,tozeret_nm,...` trims the response |
| Pagination | `limit` / `offset`; response `total` is the full match count |
| Perf | `limit=1` + `filters` answers in well under a second; `include_total=false` shaves a bit more |
| SQL | `datastore_search_sql` returns **403 Security Violation** (WAF) — unusable |
| Bulk | Each resource has a full CSV dump at `/dataset/<dataset>/resource/<id>/download` (the main registry is ~826 MB) |

Not-found is a normal `success: true` response with an empty `records` array —
API errors and missing plates are distinguishable, which the app relies on.

## The primary dataset (private & commercial vehicles)

Dataset `private-and-commercial-vehicles`, publisher: Ministry of Transport,
updated **daily** (verified `last_modified` = today). Two resources:

| Resource | ID | Rows | Role |
|---|---|---|---|
| מאגר מספרי רישוי של כלי רכב | `053cea08-09bc-40ec-8f7a-156f0677aff3` | 4,154,881 | Main registry — what the app queries |
| \...המשך (continuation) | `0866573c-40cd-4ca8-91d2-9dd2d7a492e5` | 4,154,881 | **Column extension, same vehicles** |

Verified: identical row counts, and sample plates from each resource exist in
the other. The continuation adds per-vehicle tire load/speed codes
(`kod_omes_tzmig_*`, `kod_mehirut_tzmig_*`) and tow-hitch status (`grira_nm`,
e.g. "וו גרירה קבוע" / "אין וו גרירה"). Join key: `mispar_rechev`.

Main-resource fields used by the app: `tozeret_nm` (manufacturer),
`kinuy_mishari`/`degem_nm` (model), `shnat_yitzur` (year), `tzeva_rechev`
(color), `sug_delek_nm` (fuel), `baalut` (ownership), `mivchan_acharon_dt`
(last test), `tokef_dt` (registration validity). Dates are ISO `YYYY-MM-DD`
text. Coverage per the portal: active private vehicles from model year 1996+
and commercial vehicles up to 3,500 kg from 1998+.

## Related per-plate registries (all verified live)

| Registry | Resource ID | Rows | Notes |
|---|---|---|---|
| Inactive vehicles (with model code) | `f6efe89a-fb3d-43a4-bb61-9bf12a9b9099` | 593,501 | Same schema as main registry — vehicles taken off the road |
| Inactive vehicles (no model code) | `6f6acd03-f351-4a8f-8ecf-df792f4f573a` | 1,436,483 | Older/partial records, different schema |
| Motorcycles (two-wheelers) | `bf9df4e2-d90d-4c0a-a400-19e15af8e95f` | 189,742 | Own schema: `nefach_manoa`, `hespek`, ownership, no color/test fields |
| Public transport vehicles | `cf29862d-ca25-4691-84f6-1be60dcb4a1e` | 65,864 | Buses/taxis; includes cancellation fields |
| Bus fleet | `91d298ed-a260-4f93-9d50-d5e3c5b82ce1` | 15,409 | ⚠️ Keyed by **`bus_license_id`** (= the plate), not `mispar_rechev`. Rich per-bus data absent from the public-transport registry: `operator_nm` (אגד/דן/…), **`total_kilometer`** (odometer), `PropulsionType_nm` (diesel/electric), `BusType_nm` (urban/intercity), `SeatsNum`, `stone_proof_nm`/`bullet_proof_nm` (armour), `cluster_nm`. Joins to a public-transport hit by plate |
| Personal-import vehicles | `03adc637-b6fe-402b-9937-7c3d3afc9140` | 27,481 | Includes `sug_yevu`, test + validity dates |
| Heavy vehicles >3.5t | `cd3acc5c-03c3-4c89-9c54-d40f93c0d790` | 419,271 | Trucks + vintage/collector vehicles absent from the main registry. Schema like inactive-no-degem plus `grira_nm`, `hanaa_nm`, weights, tire sizes, seats. ⚠️ Contains historic plates with **fewer than 7 digits** (e.g. `870`, a 1955 Chevrolet) — the app's validation was relaxed to 2–8 digits because of this |
| Construction equipment (צמ"ה) | `58dc4654-16b1-42ed-8170-98fadec153ea` | — | Forklifts, cranes, tractors, excavators. ⚠️ Keyed by **`mispar_tzama`, not `mispar_rechev`** — a separate, short numbering space that overlaps old vehicle plates, so it's queried **last** in the fallback chain and its enrichments (recalls/permit/history, all `mispar_rechev`-keyed) are **skipped** to avoid false cross-matches. Own schema: `sug_tzama_nm` (type), `shilda_totzar_en_nm` (maker), `kosher_harama_ton` (lift capacity), `mishkal_kolel_ton`, `hagbala_nm_1..4` (restrictions), `rishum_date`/`tokef_date` as `YYYY-MM-DD HH:MM:SS` |
| צמ"ה air-pollution grade | `f2e130e8-bc94-4443-91bd-3ba3353b1494` | 178,414 | Keyed by `mispar_tzama` — joins to a צמ"ה hit. `yatzran` (maker), `power_engine_kilowalt`, `dargat_zihum_avir` (pollution grade, e.g. מזהם), `hutkan_mesanen_helkikim` (particle filter yes/no), **`murshe_peelut`** (authorised to operate — a real red flag when "לא מורשה פעילות") |
| Final cancellation (scrapped) | `851ecab1-0622-4dbe-a6c7-f950cf82abf9` | 1,190,443 | Vehicles cancelled permanently. Rich schema: `bitul_dt`, `misgeret`, `tzeva_rechev`, `kinuy_mishari`, `ramat_gimur`, engine fields; `moed_aliya_lakvish` is a plain year int here. Verified test plate: `2910639` (Opel Astra 2016, in no other registry) |
| Final cancellation archive 2010-2016 | `4e6b9724-4c1e-43f0-909a-154d4cc4e046` | — | Same columns as above, **but every value is text** — see the zero-padding quirk below |
| Final cancellation archive 2000-2009 | `ec8cbc34-72e1-4b69-9c48-22821ba0bd6c` | — | Same as the 2010-2016 archive |
| Recalls not performed | `36bf1404-0be4-49d2-82dc-2f1ead4a8b93` | 133,788 | ⚠️ Uppercase fields: `MISPAR_RECHEV`, `RECALL_ID`, `TEUR_TAKALA` |
| Recall catalog (all recalls) | `2c33523f-87aa-44ec-a736-edbb0a82975e` | — | Per `RECALL_ID` (uppercase fields): `OFEN_TIKUN` (fix method), `YEVUAN_TEUR` (importer), `TELEPHONE`, `WEBSITE`. Join from a per-plate recall row via `RECALL_ID`. Verified: `15781` → כלמוביל יונדאי, `*5606`. `WEBSITE` is uppercase and sometimes scheme-less (`WWW.KIA-ISRAEL.CO.IL`) |
| Disabled parking permit | `c8b9f9c8-4612-4068-934f-d4acd2e3c06e` | 688,747 | ⚠️ Field names contain spaces: `"MISPAR RECHEV"`, `"SUG TAV"` |
| Aftermarket safety system (fee discount) | `83bfb278-7be1-4dab-ae2d-40125a923da1` | — | Pure membership list: `mispar_rechev` + `updated_dt` only. Hit ⇒ an approved aftermarket safety system is installed (licence-fee discount). Verified hit: `3662074` |
| Diesel particle filter installed | `7cb2bd95-bf2e-49b6-aea1-fcb5ff6f0473` | 6,569 | `taarich_hatkana` (install date), EU vehicle class |
| Cargo anchor-point obligation | `786b33b5-75c4-42a3-a241-b1af3c9ca487` | 128,941 | Trucks required to have cargo anchor points; `sug_rechev_EU_cd`, `mishkal_kolel` |
| WLTP model specs | `142afde2-6228-49f9-8a29-9b6c3a0cbe40` | 100,325 | Not per-plate — per model. Join from a vehicle via `tozeret_cd` + `degem_cd` + `shnat_yitzur` (+ `sug_degem`). ~100 columns: `nikud_betihut` (safety score), `ramat_eivzur_betihuty`, `koah_sus` (hp), `kamut_CO2`/`CO2_WLTP`, `madad_yarok` (green index), `hanaa_nm` (4X2/4X4), `kvuzat_agra_cd` (licence-fee group), ADAS feature flags |
| New-car importers & price lists | `39f455bf-6db0-4926-859d-017f34eacbcb` | — | Price-list data by model |

**Coverage ceiling (verified 2026-07-17):** a cross-org search of the whole
portal (`package_search` for `mispar_rechev` / "מספר רכב") returned *only*
Ministry-of-Transport datasets — there is no per-plate vehicle data published by
any other government body. In particular, **liens/charges (שעבוד/עיקול)** and
**per-vehicle accident history** are **not** open data: accidents are published
only as area-level statistics (`accidents_municipal`, `accid_taz`), and charges
live at רשם המשכונות keyed by owner ID. The closest in-registry proxies for
"was it in an accident" are the history flags `shinui_mivne_ind` (structure
change) and `shnui_zeva_ind` (colour change). The practical implication: the app
is at the ceiling of *new sources*; further enrichment comes from **fields we
already fetch** — the WLTP model row alone carries 94 columns (comfort +
dimensions + a ~20-flag ADAS inventory), of which the app now surfaces the
high-value subset.

## Derived signals (computed, not fetched)

Beyond raw fields, a few high-value signals are *computed*:

- **Model popularity/rarity** — `datastore_search` with `limit=0&include_total=true`
  filtered by `tozeret_cd`+`degem_cd` (and optionally `shnat_yitzur`) returns the
  count of that model in the active registry ("how many on the road"). A filtered
  total over 4.15M rows takes ~3-4s, so it's fired as a lazy background fill.
- **Average annual mileage** — `kilometer_test_aharon` ÷ years since
  `rishum_rishon_dt` (both from the vehicle-history record). An estimate (the
  odometer is as-of-last-test, not today), labelled `~`; skipped for vehicles
  under 6 months old.
- **Motorcycle licence class** — estimated from `nefach_manoa`+`hespek`:
  A1 (≤125cc & ≤14.6 hp), A2 (≤47 hp), A (above). `hespek` is present on ~90%
  of two-wheelers; where absent, only a coarse class is shown.

## Vehicle history (dataset `shinui_mivne`, updated daily)

Two per-plate resources that together give a real "vehicle history" view.
Coverage is **partial** (mostly newer vehicles) — a missing row means "no
data", not "no history", so the app never renders "—" or a fake negative
here. When **both** lookups succeed with empty results it shows an explicit
"no data — partial registry" note; a failed request shows nothing, because
absence must never be inferred from an error.

| Resource | ID | Content |
|---|---|---|
| Vehicle-history record | `56063a99-8a3e-4ff4-912e-5966c0279bad` | One row per plate: `kilometer_test_aharon` (odometer at last annual test), `mispar_manoa` (engine serial), `rishum_rishon_dt` (first registration, `YYYY-MM-DD HH:MM:SS` text), `mkoriut_nm` (often empty), and 0/1 flags `shinui_mivne_ind` (structure change), `gapam_ind` (LPG installed), `shnui_zeva_ind` (color change — note the different spelling), `shinui_zmig_ind` (tire change) |
| Ownership changes | `bb2355dc-9ec7-4f06-9c3f-3344672171da` | Multiple rows per plate: `baalut_dt` (**`YYYYMM` int**, e.g. `202210`) + `baalut` (ownership type). Sort by `baalut_dt`; the row count is the hand count ("יד N") |

Verified live: plate `16597603` → 14,480 km, first registration 2022-10-24,
two ownership rows (`202210` החכר → `202211` פרטי = יד 2); plates `3662074`
and `5569379` correctly return zero rows in both resources.

Ownership-history rows contain only the ownership *type* (private / leasing /
dealer) and month — still no personal data, consistent with the brief.

## Recommendations for the app

1. **Keep the current single-request lookup** for the happy path — it's the
   fastest correct option (verified &lt;1s including network).
2. **Fallback chain on not-found** (each an identical `datastore_search` call,
   fired in parallel or in sequence): inactive-with-degem → motorcycles →
   personal import → public transport → heavy >3.5t → final cancellation
   (+ its two archives) → inactive-no-degem. Lets the app say "הרכב ירד
   מהכביש" or "הרכב בוטל סופית" instead of a generic not-found.
3. **Cheap enrichments** (one extra request each, keyed off the first result):
   tow hitch + tire load/speed codes from the continuation resource; safety
   score / horsepower / CO₂ / drivetrain / fee group from the WLTP table;
   open-recall warning from the recalls resource (mind its uppercase field
   names) joined with the recall catalog for importer/phone/fix details;
   vehicle history + ownership changes; the three small indicator lists.
4. **Negative results have three semantics** and the UI distinguishes them:
   *authoritative* registries (open recalls, disabled-parking permits) — an
   empty success is a real "no" and is shown explicitly ("אין קריאות ריקול
   פתוחות" in green, "אין תו חניה" muted); *partial* registries (vehicle
   history) — an empty success is only "no data" and is worded as such;
   *errors* — never rendered as a negative (the recall box shows an explicit
   "לא ניתן היה לבדוק" on failure). Niche membership lists (safety-discount,
   DPF, cargo anchors) and model-table joins stay hidden on a miss — their
   absence is meaningless for most vehicles.
5. **Field-name quirks**: not all registries share the lowercase snake_case
   schema — the recalls and disabled-permit resources use uppercase (and even
   embedded spaces) in `filters` keys. Copy field IDs exactly from each
   resource's schema.
6. **Zero-padded text plates in the cancellation archives**: the two archive
   resources store *every* column as text, and `mispar_rechev` is padded to
   8 characters (`"04252235"`). A numeric filter there is an **API error**
   (not just an empty result) and an unpadded string matches nothing — query
   them with `String(plate).padStart(8, "0")`. All other registries store the
   plate as a number and match either numbers or unpadded strings.
7. **Array filters work as OR**: `filters={"RECALL_ID":[15947,15781]}` returns
   both rows — one request resolves all recall details for a vehicle.
8. **Tire codes decode client-side**: the continuation resource's
   `kod_omes_tzmig_*` / `kod_mehirut_tzmig_*` are standard ETRTO load-index /
   speed-symbol codes (88 + H → 560 kg, 210 km/h) — a static lookup table in
   the app, no extra request.
9. Don't use `datastore_search_sql` (WAF-blocked), and don't attempt joins
   server-side — do the 1-2 extra keyed lookups client-side instead.
