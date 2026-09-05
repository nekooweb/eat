# Eat Development Plan

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` has moved from manual source-by-source completion into **bulk field acquisition and official-site reconciliation**.

Identity discovery and the public product are already usable. The main bottleneck is now durable field coverage: branch-specific source URLs, Chinese recommendation labels, reference hours, budget, address and cuisine normalization.

## Random-button voice and mascot feedback

The random-result button now has a deliberately isolated presentation layer. Restaurant selection remains owned by `app.js`; click feedback is implemented separately in `effects.js` and `effects.css` so media/animation changes cannot alter recommendation behavior.

Public media assets are organized as:

- `voice/1.mp3`, `voice/2.mp3` — random click voices;
- `image/YahaUsagi.webp` — button-edge mascot artwork.

Runtime behavior:

1. clicking `#generate` continues to execute the existing restaurant `generate()` handler;
2. an additional `addEventListener` handler in `effects.js` selects one configured voice at random;
3. playback volume is fixed at **0.55**;
4. playback is capped at **2,000 ms** after playback starts; shorter files end naturally;
5. a repeated click stops and rewinds the previous voice before starting a new one, so voices never stack;
6. playback failure is swallowed and must never block restaurant generation;
7. the mascot independently pops out from the button edge for about **1.9 s** and then hides again;
8. reduced-motion users receive the simplified fade animation from `effects.css`.

The browser does not scan directories, so new voice files must be added to `voice/` **and** to the explicit `voices` array in `effects.js`. `index.html` uses a versioned `effects.js` URL so Pages clients do not retain stale click behavior after a release.

This layer is intentionally non-essential: recommendation output must remain fully functional if audio playback is blocked, a media asset fails to load, or the mascot effect is unavailable.

## Current production baseline

Latest validated production baseline before this branch:

- exact in-scope Google food-business identity inventory: **2,804 / 2,804**;
- OSM independent-source candidates: **1,273**;
- Google QC-v4 source rows: **658 verified / 615 rejected / 0 pending**;
- canonical production entities: **648** unique Place IDs;
- production IDs present in the exact Google inventory: **645**;
- usable Tabelog/official source bindings: **356 / 648 = 54.9%**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **400 / 648 = 61.7%**;
- unresolved production source queue: **248**;
- non-generic cuisine: **568 / 648**;
- budget known: **192 / 648**;
- address known: **207 / 648**;
- reference hours/holiday information: **302 / 648**;
- legacy representative-dish data: **72 / 648**;
- 百名店: **22**.

The exact-inventory reconciliation queue remains large: **2,161** Google inventory Place IDs do not yet have a verified independent-source identity. That expansion work is separate from completing the 648 current production rows.

## Normalized public fields

Every canonical production row now exposes the same display contract:

- `name`;
- `cuisine`;
- `address`;
- `lat`, `lng`, `distanceMeters`;
- `lunch`, `dinner`;
- `recommendedDishes` — always an array, **0-2 Chinese names**;
- `hoursReference` — always a string or `null`, descriptive only;
- `googlePlaceId`;
- award/weight fields and compact provider labels.

### Recommendation rule

`recommendedDishes` is deliberately sparse. A dish is added only when a reviewed source explicitly identifies a concrete item as recommended, popular, signature, specialty, famous/名物, 看板, 自慢 or an equivalent clear claim.

Generic menu items and historical `dishes` values are **not** automatically promoted to recommendations. If no reliable recommendation exists, the public field stays `[]`.

The first reviewed explicit recommendation set contains **10 restaurants**. This replaces the earlier transitional behavior that translated generic representative dishes and incorrectly made 68 rows appear to have recommendations.

### Hours rule

`hoursReference` combines maintained opening-hours / regular-closure notes into one display field. It is a reference only and does not currently remove a restaurant from the random pool.

## Result-map state

The requested hybrid map design is implemented:

- three-store overview: **Leaflet + OpenStreetMap**;
- per-store result map: **Google Maps Embed `place` mode using the verified Place ID**;
- direct Google Maps link remains available;
- if no usable Embed key is injected, the per-store map automatically falls back to Leaflet.

The Pages workflow now reuses the existing `GOOGLE_MAP_API` secret for the Embed key, per project decision. The built browser page therefore contains that key. API restrictions/quotas must account for both server-side Places maintenance calls and browser-side Maps Embed usage.

## Bulk field-acquisition pipeline

The old workflow was effectively:

```text
next restaurant
 -> manually search source
 -> manually copy fields
 -> repeat
```

The new workflow is:

```text
canonical Place IDs
 -> existing official-source batch fetch
 -> transient Google websiteUri discovery for identities lacking an official source
 -> fetch the website itself
 -> structured HTML / JSON-LD / menu / recommendation signal extraction
 -> high-confidence official-site review queue
 -> reviewed source binding + fields
 -> canonical build + audits
```

Google `websiteUri` is used only as a transient discovery input. The discovery output does not retain the Google-returned URI as a Places response field; the review artifact retains the final URL independently returned by the website fetch.

### Existing official-source extraction test

Run `33974331919` proved that one batch job can inspect the already-bound official pages rather than querying restaurants individually:

- official URLs targeted: **60**;
- successfully fetched: **55** in the first run;
- pages with JSON-LD/structured facts: **10**;
- pages with recommendation/signature signals: **21**;
- pages with price signals: **22**;
- pages with menu links: **36**.

Remote websites are variable; a later run fetched fewer of the same 60 pages. Therefore fetch failure is treated as a retry/review condition, not as evidence that a restaurant or source is invalid.

### Google-assisted official-site discovery test

Run `33974475744` used the existing `GOOGLE_MAP_API` and scanned the **589 production identities without an existing official binding**:

- Place Details requests successful: **589 / 589**;
- website available: **445**;
- website fetched successfully: **287**;
- fetched page text matched the canonical restaurant name: **195**;
- candidate non-platform/official hosts: **265**;
- pages with structured facts: **121**;
- pages with recommendation signals: **160**;
- pages with price signals: **107**;
- pages with menu links: **223**;
- no website returned: **144**;
- Google lookup errors: **0**;
- website fetch failures/timeouts: **158**.

A stricter review filter requiring successful fetch + candidate official host + canonical-name match + HTTPS reduces this to **164 high-confidence official-site candidates**:

- structured facts: **72**;
- recommendation signals: **97**;
- price signals: **60**;
- menu links: **134**.

Those 164 are the first review queue. They are **candidates**, not auto-approved facts.

## Maintenance workflows

### Pages

`.github/workflows/pages.yml`:

1. builds the canonical dataset;
2. runs repository/source/normalized-field audits;
3. generates coverage and field-gap reports;
4. assembles only public site assets;
5. injects the existing `GOOGLE_MAP_API` value into the Google Maps Embed placeholder for deployed Pages output;
6. deploys main or emits a review artifact for PRs.

### Bulk source extraction

`.github/workflows/extract-official-fields.yml` is an explicit `workflow_dispatch` maintenance job so a routine data commit does **not** automatically repeat hundreds of Places requests.

It:

1. rebuilds canonical production;
2. fetches all already-known official pages;
3. transiently requests `websiteUri` for production identities without an official binding;
4. fetches those websites;
5. generates a high-confidence review queue;
6. uploads short-lived review artifacts.

The dispatch accepts `google_limit`; `0` means all currently eligible rows.

## Ordered next work

### Priority 1 — promote the 164 high-confidence official candidates

Process by host/template rather than restaurant distance. For each candidate:

1. confirm the fetched page represents the exact branch/business;
2. bind the final website URL as an official source;
3. import structured address/hours/cuisine only where directly supported;
4. add 1-2 Chinese recommendation names only where the page explicitly recommends concrete dishes;
5. leave unsupported fields empty;
6. run canonical/source audits after each batch.

Chain/template groups should be handled together (for example Starbucks, Tully's, Doutor/C-United, Royal Host, Yoshinoya and other repeated hosts).

### Priority 2 — recover the website-fetch failures

The 158 fetch failures are not identity failures. Retry with host-specific handling where worthwhile, especially JavaScript-heavy or anti-bot sites. Do not mark them closed or source-not-found merely because the generic fetcher failed.

### Priority 3 — rows with no official website

The 144 rows where Places returned no website continue through existing Tabelog/manual source research. They should not trigger repeated Google identity searches because their Place IDs are already known.

### Priority 4 — remaining source outcomes and exact-inventory expansion

Continue the **248** unresolved source outcomes for current production, then separately reconcile the **2,161** exact-inventory Place IDs without independent-source identity. Do not weaken the 1.2 km or identity QC gates to increase counts.

### Priority 5 — recommendation/runtime logic after data stabilization

Do not add automatic open-now filtering yet. First improve `hoursReference` coverage and semantics. Recommendation weighting remains 百名店 2.2 vs ordinary 1.0; no ratings/review-count ranking is introduced.
