# Eat Page Requirements

Updated: 2026-09-06

## 1. Product goal

Eat is a small static decision tool: apply a few optional constraints and receive three nearby restaurant candidates without turning the page into a ranking/review portal.

The product should optimize for low decision cost, trustworthy business identity, useful spatial context and maintainable data.

## 2. Current public scope

Only the following scope is currently selectable:

- profile: `TOKYO`;
- area: `地区1️⃣`;
- strict straight-line production boundary: <=1,200 m from the private Area1 anchor.

Do not display the private anchor. Do not expose Area2/SHIZUOKA selectors before their production datasets exist.

## 3. Production identity

A production restaurant requires:

1. a Google Place ID;
2. verification state `verified`;
3. transient Google QC indicating a usable food-related place;
4. location inside the Area1 boundary;
5. no permanent-closure rejection;
6. a unique Place ID in canonical production.

Google Places is the identity/QC/discovery layer, not the permanent display database.

## 4. Canonical public fields

Every canonical restaurant must expose a consistent field shape. Important fields are:

- `id`;
- `profile`, `area`;
- `name`;
- `cuisine`, `tags`;
- `address`;
- `lat`, `lng`, `distanceMeters`;
- `lunch`, `dinner`;
- `recommendedDishes`;
- `hoursReference`;
- `googlePlaceId`, `googleStatus`;
- `hyakumeiten`, year/category;
- `randomWeight`;
- compact source-provider labels.

`recommendedDishes` is always an array with 0-2 Chinese dish names.

`hoursReference` is always a string or `null`.

Missing optional information stays empty/null. Do not fabricate values.

Legacy representative/menu fields may remain in maintenance data during migration, but the UI should use the normalized fields above.

## 5. Recommended-dish rule

A public recommendation may be populated only when a reviewed source explicitly identifies a concrete dish as one of the following or equivalent:

- recommended / おすすめ;
- popular / 人気;
- specialty / 名物;
- signature / 看板;
- house specialty / 自慢.

Requirements:

- 1-2 Chinese display names maximum;
- exact Google Place ID binding;
- source URL and review date maintained outside the public row;
- no inferred recommendation from cuisine type;
- no automatic promotion of a generic menu/representative dish.

If evidence is absent or vague, `recommendedDishes` must be `[]`.

Price may be omitted from recommendation display even when the source contains a price.

## 6. Hours rule

Opening/holiday information is normalized into `hoursReference` for display.

It is a reference only. The current recommendation pool does not implement open-now filtering. A stale or incomplete schedule must not be treated as proof of current operation.

## 7. Durable source roles

### OpenStreetMap

- independent candidate discovery;
- durable geospatial coordinates/distance where available;
- coverage comparison;
- not sufficient by itself for production admission.

### Official restaurant/organization pages

Preferred durable source for branch facts such as:

- exact name/address;
- cuisine;
- schedule reference;
- menu/signature dishes;
- supported price information.

### Tabelog

Reviewed factual enrichment/fallback where exact branch identity is supported.

External facts must be attached conservatively. Ambiguous branch matches remain unresolved.

## 8. Bulk source acquisition

The maintenance process should not require manually searching every restaurant from scratch.

Preferred flow:

```text
verified production Place IDs
 -> known official URLs fetched in batch
 -> for rows without official source: transient Place Details websiteUri lookup
 -> fetch actual website
 -> extract JSON-LD/menu/recommendation/price signals
 -> high-confidence review queue
 -> reviewed source binding and fields
```

The Google-returned `websiteUri` is a transient discovery aid. Do not build a long-lived Places-response database from it.

Bulk extraction results are staging/review candidates, not automatically trusted production facts.

Prefer processing repeated hosts/templates together instead of processing restaurants strictly one-by-one.

## 9. Filters

Current optional filters:

- cuisine exclusion;
- budget;
- distance.

Neutral states already mean no extra restriction; do not add redundant enable/disable switches.

### Budget

Current bands:

- unrestricted;
- <=¥999;
- ¥1,000-1,999;
- ¥2,000-3,999;
- >=¥4,000.

Lunch and dinner remain separate. A restaurant passes a specific budget filter if at least one known meal interval overlaps the chosen band. Unknown budget is eligible only when budget is unrestricted.

### Distance

- 300 m;
- 500 m;
- 800 m;
- 1.2 km.

1.2 km is both the neutral choice and hard Area1 boundary.

## 10. Recommendation algorithm

Hard behavior:

- fewer than 3 eligible restaurants -> ask user to relax filters;
- at least 3 eligible restaurants -> return exactly 3 distinct Place IDs.

Preferences:

- prefer cuisine diversity;
- Web Crypto randomness;
- 百名店 weight `2.2` vs ordinary `1.0`;
- no rating/review-count ranking.

## 11. Result presentation

Each successful result contains the same three restaurants across all views.

### A. Three-store overview

- Leaflet + OpenStreetMap;
- markers numbered 1-3;
- fit to the three generated points;
- do not show the private anchor.

Purpose: compare the three locations spatially.

### B. Restaurant cards

Each card may show:

- name;
- cuisine;
- distance;
- known budget;
- 1-2 Chinese `recommendedDishes` when explicitly supported;
- `hoursReference` when known;
- 百名店 badge;
- per-store Google map;
- Google Maps link.

Missing optional fields are omitted rather than filled with repeated unknown placeholders.

### C. Per-store map

Preferred implementation:

- Google Maps Embed API `place` mode;
- use the verified Place ID;
- if an Embed key is unavailable, fall back to the existing Leaflet/OSM store map.

Do not replace the three-store Leaflet overview with three unrelated Google map views.

### D. Comparison table

Compare the same numbered choices across:

- cuisine;
- distance;
- budget;
- recommended dishes;
- hours reference;
- 百名店 status.

Unknown values display as `—`.

## 12. Google Maps / API key behavior

Per current project decision, the existing `GOOGLE_MAP_API` secret is reused for both:

- server-side maintenance Places requests in GitHub Actions;
- client-side Google Maps Embed in the deployed Pages artifact.

The literal key must never be committed to tracked source files. Pages injects it only when assembling `_site`.

Because a browser-delivered key is inspectable, configure API restrictions and quotas deliberately. Reusing one key for both browser and server-side requests limits the application-restriction options compared with separate keys.

## 13. Validation

Blocking checks should cover:

- unique verified production Place IDs;
- strict <=1,200 m boundary;
- canonical normalized fields;
- recommendation rows max 2 items and exact identity binding;
- source provenance;
- no forbidden long-lived Places response-content fields in canonical rows;
- required overview/store-map/comparison hooks;
- Google store-map iframe restricted to the intended Maps Embed endpoint;
- Leaflet store-map fallback remains available;
- public artifact excludes raw maintenance datasets.

## 14. Progress accounting

Always distinguish:

- exact Google identity inventory;
- independently verified source identities;
- canonical production entities;
- usable source coverage;
- terminal source outcomes;
- field completeness;
- staging extraction candidates.

A successful website fetch or high-confidence source candidate is not automatically a reviewed production fact.

## 15. Still TBD

Not blockers for the current Area1 release:

- TOKYO Area2;
- SHIZUOKA;
- open-now/holiday exclusion;
- local recommendation history/device behavior;
- deeper cuisine-family taxonomy;
- further interaction refinements after the current data acquisition pass.
