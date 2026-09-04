# Eat Page Requirements

## Scope
- Single-page static web app hosted at `https://nekooweb.github.io/eat/`.
- No backend. All behavior and data are maintained directly in repository code/data files.
- Fast loading and usable on both mobile and desktop.
- Public top-level profiles are `TOKYO` and `SHIZUOKA`.
- Personal names must not appear in repository files, code, data, documentation, comments, or public UI.

## Profile and area
- Top-level selector: `TOKYO` / `SHIZUOKA`.
- TOKYO public areas: `地区1️⃣` / `地区2️⃣` only.
- Internal anchors: 地区1️⃣ = 神保町駅; 地区2️⃣ = 板橋本町駅. Never explain this mapping in public UI.
- SHIZUOKA remains `TBD`.

## Restaurant data collection
- Cross-check restaurants using both 食べログ (Tabelog) and Google Maps during repository maintenance.
- Tabelog: cuisine taxonomy, discovery, concrete lunch/dinner budget, menu/recommended dishes, regular hours.
- Google Maps: business identity, map/location cross-check, coordinates, current-place context and direct Maps access.
- Production records remain static and manually refreshable; no backend discovery/scraping at page load.

## Opening-hours logic
- Store weekly opening hours, regular closed days and uncertainty/temporary-closure notes.
- Read current browser local date/time.
- Exclude restaurants clearly closed according to stored schedule at generation time.
- Never claim that static data guarantees live opening status; Google Maps/store notices remain the final confirmation source.

## Recommendation flow
1. Select TOKYO/SHIZUOKA.
2. Select anonymous area.
3. Select food categories to reject.
4. Select concrete yen budget range.
5. Generate proposals.
6. Apply ALL filters before random sampling.
7. Generate 3 distinct restaurants from 3 distinct primary cuisine families when possible.
8. Clicking a restaurant name expands its Google Maps preview.

## Strict randomness
- Actual browser-side random sampling only; recommendation content must not be model/ranking driven.
- Sequence: profile filter → area filter → rejected-category filter → budget filter → current-time/opening filter → group by primary cuisine → uniformly sample 3 cuisine groups without replacement → uniformly sample one restaurant per group → shuffle final cards.
- Use `crypto.getRandomValues` with unbiased bounded sampling.
- Ratings, popularity, review count, distance, price, alphabetic order, insertion/source order and editorial preference MUST NOT influence probability.
- Repeated clicks are independent; no hidden anti-repeat weighting.
- If fewer than 3 eligible cuisine families remain, explain that instead of duplicating a cuisine.

## Distance
- Store rough distance buckets relative to each hidden station anchor.
- Display approximately `约100m`, `约200m`, `约300m`, `约400m`, etc.

## Google Maps
- URL-only is insufficient.
- Keep initial result cards compact; load/show the small map only when a restaurant is clicked.
- Expanded card shows a Google Maps location view and a direct Google Maps link.
- Store name, address, coordinates, query, Maps URL and Place ID when available.
- Prefer Place ID for exact business identity when obtainable; keep name/address fallback.

## Food taxonomy
- Base rejection taxonomy primarily on 食べログ 百名店 genres.
- Each restaurant has one primary cuisine family plus optional secondary tags.
- Adjacent categories may later be grouped for mobile usability.

## Budget
- Never use abstract `💰💰 中等` as the primary display.
- Display concrete ranges such as `¥1,000–1,999`, `¥2,000–2,999`, `¥6,000–7,999`.
- Keep lunch/dinner ranges separately where available and show the contextually relevant range.
- Budget filters operate on stored yen ranges.

## Recommended dishes and language
- Store 1-2 supported representative dishes per restaurant.
- Restaurant names remain Japanese.
- Other key information is Chinese: cuisine, distance, price, recommended dishes, regular closure and status notes.
- Japanese dish names may be retained alongside concise Chinese translation.

## Result card minimum
- Japanese restaurant name;
- primary cuisine in Chinese;
- approximate distance;
- concrete yen range;
- 1-2 recommended dishes;
- closed-day/opening-status note;
- expandable Google Maps preview;
- direct Google Maps access.

## Data model
Each restaurant should eventually support: `name_ja`, profile, anonymous area, primary cuisine, secondary tags, lunch/dinner budget, distance bucket, recommended dishes, weekly hours, regular closures, uncertainty flag, address, latitude/longitude, Google Maps query/URL/Place ID, source notes and last verification date.

## Future interaction-history requirement (record now, design later)
- A future version must record recommendation/button interactions locally using the user's device/browser context.
- Each recorded interaction should include the user's system/browser timestamp at the moment of the click/generation.
- The future design also needs a persistent per-device identifier so records from the same device can be associated across visits.
- Exact device-ID generation, persistence, privacy behavior, reset behavior and how history affects the product are intentionally NOT specified yet.
- Do not implement invasive browser fingerprinting implicitly. The device identifier mechanism must be explicitly designed/approved later; a locally generated random installation/device ID stored in browser storage is a likely low-complexity option.
- This future history requirement must not silently alter the strict random recommendation probability unless a later requirement explicitly says history should affect sampling.

## Technical direction
- Static HTML + CSS + vanilla JavaScript; minimal dependencies and no unnecessary build step.
- Browser local time drives static schedule filtering.
- Lazy-load map embeds on expansion when practical.

## Visual direction
- Bright, playful, rounded, cute yellow/white visual language inspired by the energetic feeling associated with Usagi from Chiikawa, without copying official character artwork.
- Warm yellow + white, dark text, small accents, large touch targets, rounded cards/buttons, minimal chrome.

## Research
- `DATA_RESEARCH.md` tracks source investigation before records are promoted into production data.

## Still TBD
- SHIZUOKA data.
- Exact food-category grouping.
- Maximum collection distance.
- Exact interaction-history/device-ID design.
