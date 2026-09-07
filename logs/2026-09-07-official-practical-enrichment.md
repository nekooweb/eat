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

## Supported practical fields

Automatic extraction is intentionally limited to seven comparatively clear boolean fields:

- `practical.card_available`
- `practical.parking_available`
- `practical.wifi_available`
- `practical.private_room_available`
- `practical.barrier_free`
- `practical.children_welcome`
- `practical.english_menu`

Smoking policy is deliberately excluded because official pages frequently distinguish smoking areas, time windows, heated-tobacco rules and other multi-state policies that should not be reduced to a simple boolean.

## Implementation

Landing-page layer:

- `data/official_practical_web_evidence.json`
- `scripts/database/collect_official_practical_fields.py`
- `scripts/database/import_official_practical_web_evidence.py`

Same-origin detail layer:

- `data/official_practical_detail_web_evidence.json`
- `scripts/database/collect_official_detail_practical_fields.py`
- `scripts/database/import_official_practical_detail_web_evidence.py`

Shared execution:

- `.github/workflows/official-practical-enrichment.yml`
- `scripts/database/build_master.py`

Execution model:

```text
reviewed official identities
  -> robots-aware landing-page fetch
  -> current-page identity reconfirmation
  -> explicit practical-label extraction
  -> at most two same-origin store-info/access/facility/FAQ detail links
  -> independent robots-aware detail-page fetches
  -> explicit practical-label extraction
  -> durable evidence per URL/content hash
  -> retained/structured provider resolvers first
  -> landing official practical missing-only import
  -> detail official practical missing-only import
  -> master validation + ingestion re-plan
```

The workflow shares the `public-web-field-evidence` concurrency group with other official web field workers to avoid concurrent evidence writes. Detail snapshots are keyed by `(Place ID, final URL, content hash)` rather than collapsed by Place ID, so provenance from distinct pages is never mixed.

## Initial baseline

Before this stage the validated master had approximately:

- 2,804 frozen catalog Place IDs
- 651 verified
- 750 source-matched
- 1,388 ID-only
- 15 conflict
- practical missing: 909

## First landing-page batch

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

Master effect:

- identity states unchanged: 651 verified / 750 source-matched / 1,388 ID-only / 15 conflict
- practical-missing restaurant count: 909 -> 888
- importer network requests: 0
- importer identity changes: 0
- import-time missing-only: true

Subsequent landing reruns increased the durable landing set to 26 restaurants and 42 resolved fields without changing the extraction rule. The cumulative landing field counts became:

- `practical.private_room_available`: 11
- `practical.wifi_available`: 9
- `practical.parking_available`: 9
- `practical.children_welcome`: 6
- `practical.card_available`: 6
- `practical.barrier_free`: 1

The master immediately before the first detail-page pass therefore had practical missing = 886.

## First same-origin detail-page batch

Actions run `34123205772` completed successfully end-to-end. Durable evidence was committed by bot commit `012c1eef0e410b7bcd151ddca550e41521971822` (`Add official practical landing and detail evidence`).

Collection:

- 143 target restaurants still missing at least one supported practical field
- 139 official landing pages fetched successfully
- 93 landing pages re-confirmed the retained restaurant identity
- 59 verified landing pages had no qualifying practical-detail link
- 54 same-origin detail links selected
- 52 detail pages fetched successfully
- 47 readable detail pages had no still-missing explicit practical claim
- 1 cross-origin redirect was rejected
- 2 detail pages were non-HTML and skipped
- access-policy home-page skips included explicit 403, 429 and 503 robots responses; none were bypassed

Strict detail-page durable evidence:

- 4 independent detail snapshots
- `practical.parking_available`: +2
- `practical.wifi_available`: +2
- `practical.card_available`: +1
- total new canonical detail fields: +5

Master effect for the detail-enabled run:

- field-completion tasks: 1,348 -> 1,347
- practical-missing restaurant count: 886 -> 882
- address missing unchanged: 334
- hours missing unchanged: 633
- dinner-budget missing unchanged: 792
- lunch-budget missing unchanged: 1,232
- identity states unchanged: 651 verified / 750 source-matched / 1,388 ID-only / 15 conflict
- detail importer network requests: 0
- detail importer identity changes: 0
- detail import-time missing-only: true

The `886 -> 882` restaurant-level practical change is the effect of enabling the new detail evidence on top of the already durable 26-row landing evidence. The detail importer itself resolved exactly five previously unknown canonical fields across four detail evidence rows.

## Current conclusion

The landing layer is clearly useful; the tightly bounded same-origin detail layer is lower-yield but still positive and safe. It should remain available as a deterministic supplemental worker, but further broadening should not turn into general website crawling. New practical expansion should prioritize additional already-structured retained/public sources or exceptionally high-signal same-origin facility pages, while preserving the explicit-label rule.

The remaining major field gaps are now dominated by lunch/dinner budget and practical coverage rather than coordinates/cuisine. Official-site meal-budget experiments produced no strict per-meal finite ranges, so menu/course item prices must not be substituted for restaurant budget ranges.
