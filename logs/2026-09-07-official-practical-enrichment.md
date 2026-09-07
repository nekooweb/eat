# 2026-09-07 — Official practical-field enrichment

## Why this stage exists

The current SQLite planner still has a large practical-field gap after retained Hot Pepper rich metadata and other deterministic retained-source resolvers. Re-running Hot Pepper logic or weakening identity rules would not address restaurants without a rich Hot Pepper binding.

This stage therefore uses already retained and reviewed official-page identities as a zero-paid-API supplemental field source.

## Safety and provenance rules

- No new Google data API calls.
- Google display payloads are not persisted.
- A restaurant must already be publishable (`verified` or `source_matched`) and non-conflict.
- The retained official binding must be `reviewed`.
- The current HTTPS page must still reconfirm the retained restaurant identity.
- `robots.txt`, 401/403/429 and access restrictions are respected; no bypass is attempted.
- Raw HTML is never persisted.
- Durable evidence stores the source/final URL, retrieval time, SHA-256 content hash, parser version, explicit field claim and a bounded evidence snippet.
- Missing text never means `false`. A boolean value is emitted only when an explicit local positive or negative phrase occurs next to the relevant label.
- Official-web practical evidence is imported after retained/structured practical resolvers, so it fills residual gaps only.

## First supported practical fields

The first pass intentionally limits automatic extraction to seven comparatively clear boolean fields:

- `practical.card_available`
- `practical.parking_available`
- `practical.wifi_available`
- `practical.private_room_available`
- `practical.barrier_free`
- `practical.children_welcome`
- `practical.english_menu`

Smoking policy is deliberately excluded from this first automatic pass because official pages frequently distinguish smoking areas, time windows, heated-tobacco rules and other multi-state policies that should not be reduced to a simple boolean.

## Implementation

Added:

- `data/official_practical_web_evidence.json`
- `scripts/database/collect_official_practical_fields.py`
- `scripts/database/import_official_practical_web_evidence.py`
- `.github/workflows/official-practical-enrichment.yml`

Updated:

- `scripts/database/build_master.py`

Execution model:

```text
reviewed official identities
  -> robots-aware current-page fetch
  -> current-page identity reconfirmation
  -> explicit practical-label extraction
  -> durable evidence with bounded snippets
  -> missing-only SQLite import
  -> master validation + ingestion re-plan
```

The workflow shares the `public-web-field-evidence` concurrency group with other official web field workers to avoid concurrent evidence writes.

## Baseline before this pass

Latest validated master before this stage had approximately:

- 2,804 frozen catalog Place IDs
- 651 verified
- 750 source-matched
- 1,388 ID-only
- 15 conflict
- practical missing: 909

## First batch result

Actions run `34122726395` completed successfully end-to-end.

Collection:

- 144 target official pages
- 118 pages fetched successfully
- 23 restaurants produced strict practical evidence
- 57 identity-confirmed pages contained no still-missing explicit practical claim
- 38 readable pages were rejected because the current page name was not specific enough
- 5 shared page URLs were deferred
- access-policy skips included one non-HTML response, one robots 503 and 24 unavailable robots checks

Durable canonical field additions:

- `practical.private_room_available`: 11
- `practical.wifi_available`: 8
- `practical.parking_available`: 7
- `practical.children_welcome`: 5
- `practical.card_available`: 4
- total resolved practical fields: 35

No first-batch automatic claim was emitted for `practical.barrier_free` or `practical.english_menu`; those remain valid supported fields but require a page with an explicit unambiguous label/value pair.

Master effect:

- identity states unchanged: 651 verified / 750 source-matched / 1,388 ID-only / 15 conflict
- practical-missing restaurant count: 909 -> 888
- importer network requests: 0
- importer identity changes: 0
- import-time missing-only: true

Thirty-five field resolutions reduce the restaurant-level practical-missing count by 21 because a single restaurant can receive several practical fields while the planner still represents that restaurant with one field-completion task containing multiple missing fields.

## Next stage

The next high-yield practical pass should stay on the same reviewed official identities but inspect a very small number of same-origin detail pages whose links are explicitly related to store information, facilities, access or FAQ. This can recover practical labels that are absent from the landing page without broad crawling. The same robots/access restrictions, current-identity confirmation, explicit-label rule and no-raw-HTML rule must remain in force.
