# Data research — pulling vehicle data from data.gov.il

Research notes on the CKAN API behind the app, the structure of the vehicle
registry, and every related per-plate registry on the portal. All resource IDs,
schemas, and behaviors below were verified live against the API on 2026-07-17.

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
| Personal-import vehicles | `03adc637-b6fe-402b-9937-7c3d3afc9140` | 27,481 | Includes `sug_yevu`, test + validity dates |
| Recalls not performed | `36bf1404-0be4-49d2-82dc-2f1ead4a8b93` | 133,788 | ⚠️ Uppercase fields: `MISPAR_RECHEV`, `RECALL_ID`, `TEUR_TAKALA` |
| Disabled parking permit | `c8b9f9c8-4612-4068-934f-d4acd2e3c06e` | 688,747 | ⚠️ Field names contain spaces: `"MISPAR RECHEV"`, `"SUG TAV"` |
| WLTP model specs | `142afde2-6228-49f9-8a29-9b6c3a0cbe40` | 100,325 | Not per-plate — per model. Join from a vehicle via `tozeret_cd` + `degem_cd` + `shnat_yitzur` (+ `sug_degem`). ~100 columns: `nikud_betihut` (safety score), `ramat_eivzur_betihuty`, `koah_sus` (hp), `kamut_CO2`/`CO2_WLTP`, `madad_yarok` (green index), ADAS feature flags |
| New-car importers & price lists | `39f455bf-6db0-4926-859d-017f34eacbcb` | — | Price-list data by model |

Ownership-history is **not published** on the portal (only current `baalut`),
consistent with the brief's out-of-scope note on personal data.

## Recommendations for the app

1. **Keep the current single-request lookup** for the happy path — it's the
   fastest correct option (verified &lt;1s including network).
2. **Fallback chain on not-found** (each an identical `datastore_search` call,
   fired in parallel or in sequence): inactive-with-degem → motorcycles →
   personal import → inactive-no-degem. Lets the app say "הרכב ירד מהכביש" or
   "זהו רכב דו-גלגלי" instead of a generic not-found.
3. **Cheap enrichments** (one extra request each, keyed off the first result):
   tow hitch from the continuation resource; safety score / horsepower / CO₂
   from the WLTP table; open-recall warning from the recalls resource
   (mind its uppercase field names).
4. **Field-name quirks**: not all registries share the lowercase snake_case
   schema — the recalls and disabled-permit resources use uppercase (and even
   embedded spaces) in `filters` keys. Copy field IDs exactly from each
   resource's schema.
5. Don't use `datastore_search_sql` (WAF-blocked), and don't attempt joins
   server-side — do the 1-2 extra keyed lookups client-side instead.
