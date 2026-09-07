# Identity recovery v2–v4 — 2026-09-07

## Scope and immutable policy

This batch continued recovery of the frozen 2,804 Google Place ID catalog without making any new paid Google data API calls.

Hard boundary throughout v2–v4:

- Google Place ID may remain as the frozen catalog/navigation compatibility key.
- Historical Google display fields are private, short-lived linkage hints only.
- Google name/address/location/phone/website/types are not copied into durable repository rows.
- Durable restaurant fields must come from Hot Pepper, OpenStreetMap, Overture Maps, or a public HTTPS business page.
- Proximity-only identity binding is forbidden.
- Existing source-ID collisions stay quarantined.
- Public-page collection does not bypass robots, login, CAPTCHA, 401/403/429, or other access controls.
- Raw HTML is not persisted.

## Starting master baseline

Before the new recovery layers:

- catalog: 2,804
- identity: 651 verified / 746 source_matched / 1,392 id_only / 15 conflict
- active tasks: 2,972
- identity recovery tasks: 1,392

## v2 — structured-address consensus

Rule: `private-address-consensus-v2`.

The historical hint was compared with structured independent-source address components rather than only raw-string equality or distance. The rule retained strict name/address uniqueness and source-ID collision gates.

Result:

- recovered: 1
- recovered restaurant: `Tully's Coffee`
- Place ID: `ChIJswfCsA-MGGARIz1Zn1TprVs`
- durable provider: Overture Maps
- Overture ID: `4ac1e72b-be43-4856-b732-2488312fe8ec`
- runtime named rows: 1,411 -> 1,412
- SQLite id_only: 1,392 -> 1,391
- new paid Google data calls: 0

The v2 probe also showed hundreds of address-near candidates, but only one met the full automatic-binding gate. Therefore structured address alone was not treated as a license to loosen the identity threshold globally.

## v3 — independent multi-source consensus

Rule: `private-multisource-consensus-v3`.

Instead of asking one provider to agree strongly with the historical hint, v3 first grouped independent provider rows and required different providers to prove they represented the same business. The historical hint then linked that independently supported cluster to the frozen Place ID.

Key diagnostics:

- current ID-only records entering the stage: 1,391
- records with at least one >=2-provider independent cluster: 581
- automatically admissible identities: 1
- new paid Google data calls: 0

Recovered identity:

- restaurant: `和Dining三十`
- Place ID: `ChIJq9lWshaMGGARk5S-OqNwPUU`
- Hot Pepper ID: `J001208797`
- Overture ID: `2bb2e9d2-5f9d-456b-bd2c-16a43f66a54d`
- independent-source name similarity: 1.0
- independent-source spatial separation: 7.117 m
- structured address agreement: yes

After v3:

- runtime named rows: 1,412 -> 1,413
- SQLite identity: 651 verified / 748 source_matched / 1,390 id_only / 15 conflict

The important result is the diagnostic, not only the single recovery: 581 rows already have multi-source spatial clusters, but most clusters still lack a discriminating third signal. Lowering the v3 name/distance threshold would convert dense-neighborhood co-location into false identity evidence, so the next stage must add another independent signal instead.

## v4 — public official-web third evidence

Rule: `private-official-web-consensus-v4`.
Parser: `official-web-jsonld-v1`.

v4 starts only from an ID-only record that already has an independent multi-source cluster. It then inspects public HTTPS URLs already carried by the independent source records.

Access behavior:

1. reject Google/aggregator/social hosts;
2. HTTPS only;
3. check `robots.txt` before the page;
4. do not bypass explicit disallow, 401, 403, 429, CAPTCHA, or login restrictions;
5. cap response size;
6. keep only parsed facts + stable URL + retrieved_at + SHA-256 + parser version;
7. never retain raw HTML.

Parsed evidence may include:

- business name
- structured address
- opening hours
- cuisine
- priceRange
- telephone
- geo coordinates

Automatic identity confirmation requires the official/public page name plus at least one discriminating signal:

- structured address, or
- phone, or
- geo.

### Real CI result

Successful v4 run: GitHub Actions run `34112269690`.

Observed coverage:

- multi-source clusters: 580
- candidate cluster components carrying usable website URLs: 190
- unique public candidate pages actually scheduled: 31
- pages successfully fetched and parsed: 22
- HTTP 404 skipped: 4
- HTTP 503 skipped: 1
- robots HTTP 403 skipped: 1
- robots/network unavailable skipped conservatively: 3
- `official_name_plus_structured_address`: 2
- durable recoveries: 2
- durable recovery provider: Overture Maps = 2
- new paid Google data calls: 0

The first v4 run validated both rows but hit a final Git rebase conflict because another enrichment worker advanced the monolithic basic-source JSON while the public-page job was running. The workflow was then changed to fetch the newest `main` and re-apply the already validated durable overlay onto that latest file before committing. Run #2 completed all validation and promotion steps successfully.

Promotion commit:

- `38c1e2ed44885096cd6d99bcfc91792195848e46` — `Promote official-web identity recoveries v4`

After v4 promotion:

- `data/google_basic_source_matches.json`: 764 source-basic rows
- published/named runtime baseline: 651 production + 764 source-basic = **1,415**
- runtime-held catalog ID-only: **1,389**
- provider distribution: Hot Pepper 358 / OpenStreetMap 11 / Overture Maps 395
- SQLite validated identity state after applying the two rows: **651 verified / 750 source_matched / 1,388 id_only / 15 conflict**

The one-record difference between runtime-held ID-only and SQLite id_only remains expected: the SQLite master contains one independently recovered official identity that is not represented in the basic-source runtime layer.

## Concurrency lesson

A parallel worker must never finish by rebasing a generated monolithic JSON snapshot captured before another worker ran. For identity overlays, the safe promotion pattern is now:

`collect/validate durable overlay -> fetch latest main -> checkout latest main -> re-apply overlay with collision validation -> commit`

This preserves deterministic proposal ownership while allowing multiple evidence workers to advance the repository without losing validated rows.

## Next stage

Do not lower v2/v3/v4 identity thresholds to chase count.

Priority is now:

1. continue third-evidence collection for the remaining multi-source clusters;
2. enrich already source-backed identities from their public websites;
3. in one confirmed page visit, capture all supported missing fields (address/hours/cuisine/price/contact/geo);
4. feed those facts into SQLite observations/resolutions and re-plan field tasks;
5. regenerate deterministic agent shards from the new master state.
