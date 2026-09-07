# 2026-09-07 — Private strong-consensus identity diagnostic v5

## Purpose

After v2 structured-address recovery, v3 independent multi-source clustering and v4 public official-page confirmation, this diagnostic asks whether the remaining ID-only catalog contains any stronger discriminator already shared by the retained independent sources.

The diagnostic is intentionally non-promoting. Historical Google Places results are read only from the two already-paid, short-lived private Actions artifacts and are used only to connect the frozen Place ID to a local candidate neighborhood. No new Google API call is made and no Google display payload is written to the repository, SQLite master or public runtime.

## Rules tested

A candidate component must already contain at least two independent providers among Hot Pepper, OpenStreetMap and Overture Maps. It is then tested for one of three strong rules:

- `exact_cross_provider_phone`
- `exact_cross_provider_official_url`
- `domain_plus_structured_address`

The diagnostic still requires independent-source name/geospatial consistency and rejects proximity-only binding. Aggregator domains do not count as official-domain consensus.

## Actions result

Workflow: `Diagnose strong independent identity consensus v5`

Run: `34123552810`

Result: success.

Current master entering the diagnostic:

- frozen Place IDs: 2,804
- verified: 651
- source-matched: 750
- ID-only: 1,388
- conflict: 15

Diagnostic result:

- ID-only inspected: 1,388
- had at least one multi-source independent cluster: 566
- historical non-operational: 1
- no historical hint: 1
- `no_strong_signal`: 1,386
- strong candidates: **0**

No promotion was performed.

## Interpretation

The remaining identity problem is not primarily candidate availability: 566 unresolved Place IDs still have at least one multi-source cluster nearby. The limiting factor is discriminating identity evidence. Within the currently retained Hot Pepper / OSM / Overture payloads, none of those unresolved components has a sufficiently strong shared phone, official URL, or official-domain-plus-structured-address signal under the v5 rules.

Therefore the next identity stage must add new independent public evidence rather than lowering distance/name thresholds. In particular, proximity-only, postcode-only and looser fuzzy-name matching remain prohibited.

## Next identity stage

The next diagnostic is an official same-origin detail-page pass. For multi-source components that already carry an allowed public website URL, it may inspect a very small number of same-origin store/access/info pages. A detail page must independently reconfirm the business using a restaurant/store name plus structured address, phone or geospatial support against the independent-source component before any future durable promotion can be considered.

Access restrictions, robots.txt, 401/403/429 responses and CAPTCHA/login gates remain non-bypassable. Raw HTML is not durable evidence.
