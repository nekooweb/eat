# Eat Page Requirements

## Scope
- Single-page static web app hosted at `https://nekooweb.github.io/eat/`.
- No backend. All behavior and data are maintained directly in repository code/data files.
- Fast loading and usable on both mobile and desktop.
- Public top-level profiles are `TOKYO` and `SHIZUOKA`.
- Personal names must not appear in repository files, code, data, documentation, comments, or public UI.
- Development should remain intentionally simple: no backend service, no database, and no unnecessary framework/build layer.

## Profile states
- Top-level selector contains `TOKYO` and `SHIZUOKA`.
- `TOKYO`: active configuration and data will be implemented first.
- `SHIZUOKA`: visible in the UI but its area/data configuration is `TBD` for now.

## Area privacy / abstraction
- For `TOKYO`, the public UI exposes exactly two area choices: `地区1️⃣` and `地区2️⃣`.
- The UI must NOT reveal what real-world locations those labels represent.
- Internal collection anchors:
  - `地区1️⃣`: restaurants collected around Tokyo Jimbocho Station (神保町駅).
  - `地区2️⃣`: restaurants collected around Itabashihoncho Station (板橋本町駅).
- These real-world anchors are implementation/data-maintenance information only and must not be exposed as the meaning of the labels in the public UI.
- `SHIZUOKA` remains `TBD` and receives no real area configuration yet.

## Restaurant collection logic
- Restaurant candidates are collected and cross-checked using both 食べログ (Tabelog) and Google Maps.
- Data collection is performed during repository maintenance and written into the static local restaurant dataset; the public page does not dynamically discover restaurants.
- Tabelog is used primarily for cuisine/genre classification, menu/recommended-dish context, concrete lunch/dinner budget ranges, regular business hours, and restaurant discovery.
- Google Maps is used primarily for business identity, map location, coordinates, current-place cross-checking, route context, and direct place-page access.
- Each production record should be manually reconcilable against both sources and retain maintenance/reference metadata.

## Opening / closed-day logic
- Each restaurant record must store regular opening information and known closed-day / holiday rules when available.
- The webpage reads the visitor's current local date/time in the browser.
- Before recommendation, restaurants that are clearly closed according to the locally stored schedule for the current day/time are excluded.
- Known regular closing days are shown in restaurant results.
- Uncertain/irregular/temporary business hours must be represented as uncertainty rather than falsely presented as live truth.
- Google Maps remains the destination for confirming exceptional closures or same-day changes.

## UI flow
1. Profile selector: `TOKYO` / `SHIZUOKA`.
2. Area selector: TOKYO has `地区1️⃣` / `地区2️⃣`; SHIZUOKA remains `TBD`.
3. Food-category rejection filters.
4. Expected-budget filter using concrete yen ranges.
5. One primary button to generate proposals.
6. After clicking, apply all filters first, then randomly generate exactly 3 distinct restaurants from 3 distinct primary cuisine families when possible.
7. Initial cards remain compact.
8. Clicking/tapping a restaurant name or expand control reveals its embedded Google Maps view.

## Strict randomness requirement
- Recommendation must be actual browser-side random sampling from the eligible static dataset, not generated/reordered according to restaurant descriptions, ratings, source order, editorial preference, or model-like content logic.
- All filtering is completed BEFORE randomness begins.
- Required sampling sequence:
  1. filter profile;
  2. filter area;
  3. remove rejected categories;
  4. filter requested concrete yen budget;
  5. remove clearly closed restaurants according to stored schedule/current browser time;
  6. group the remaining restaurants by `primary_cuisine`;
  7. uniformly sample 3 cuisine groups without replacement;
  8. uniformly sample one restaurant from each selected cuisine group without replacement;
  9. randomly shuffle the final 3 result cards.
- Use browser cryptographic randomness (`crypto.getRandomValues`) for sampling rather than content order or deterministic ranking.
- No rating, popularity, review count, distance, price, alphabetical order, insertion order, source order, or hand-authored priority may influence probability unless the user explicitly requests weighting in the future.
- Repeated button presses are independent random events. A previously shown restaurant may legitimately appear again; do not secretly down-weight recent results.
- If fewer than 3 distinct eligible cuisine families remain, state that there are insufficient distinct cuisine options rather than duplicating a cuisine family.

## Distance logic
- Each restaurant stores a rough distance bucket relative to the area's anchor station.
- Approximation is sufficient; display rounded values such as `约100m`, `约200m`, `约300m`, `约400m`.
- `地区1️⃣` is estimated relative to 神保町駅 internally.
- `地区2️⃣` is estimated relative to 板橋本町駅 internally.
- Public UI never explains the hidden station/area mapping.

## Google Maps requirement
- A URL-only result is not sufficient.
- Initial results do not load all maps; the map is shown only after a restaurant is clicked/tapped.
- Expanded results display a compact Google Maps view of the selected restaurant and provide direct access to the same business in Google Maps.
- Production data should retain restaurant name, address, latitude, longitude, Google Maps query, Maps URL, and Google Place ID when obtainable.
- Prefer Place ID for exact business linking when available, with name/address as fallback identity fields.
- Google Maps URLs are used for cross-platform deep links.
- If the official Google Maps Embed API is selected for the embedded place view, its required API key/cloud configuration must be handled explicitly; do not hide that requirement.

## Food-category taxonomy
- Rejection categories are based primarily on 食べログ 百名店 genre structure.
- Examples include ラーメン, 焼肉, 焼き鳥, 鳥料理, とんかつ, ハンバーガー, 中国料理, カレー, アジア・エスニック, 食堂, スペイン料理, パン, 喫茶店, アイス・ジェラート, うなぎ, 居酒屋, お好み焼き, ステーキ・鉄板焼き, そば, カフェ, 洋食, フレンチ, イタリアン, ピザ, 日本料理, 天ぷら, 寿司, すき焼き・しゃぶしゃぶ, 餃子, スイーツ, etc.
- Adjacent categories may later be grouped for mobile usability while remaining traceable to source taxonomy.
- Each restaurant has one primary cuisine family for the 3-distinct-cuisine rule and optional secondary tags.

## Budget taxonomy and display
- Result cards must NOT use abstract labels such as `💰💰 中等` as the primary budget presentation.
- Store and display concrete yen ranges, e.g. `¥1,000–1,999`, `¥2,000–2,999`, `¥6,000–7,999`.
- Keep lunch and dinner budget ranges separately whenever the source distinguishes them.
- When possible, choose the displayed budget range based on current time/service period.
- Budget filters should map to stored concrete yen ranges.
- Google price-level metadata may be retained as supplemental data but is not a substitute for the visible yen range.

## Recommended dishes
- Each restaurant record includes 1-2 representative/recommended dishes when sufficiently supported by Tabelog, Google Maps, official restaurant information, or consistent menu references.
- Recommended dishes are static curated metadata, not dynamically scraped on page load.

## Display language
- Restaurant names remain in original Japanese.
- Other key information is presented in Chinese: cuisine type, approximate distance, yen budget, recommended dishes, regular closed day, and status notes.
- Japanese dish names may be retained with concise Chinese translations/explanations.

## Result card minimum content
- Japanese restaurant name;
- primary cuisine in Chinese;
- approximate distance (`约100m`, etc.);
- concrete yen budget range;
- 1-2 recommended dishes;
- regular closed-day/opening-status note;
- click/expand interaction revealing Google Maps;
- direct Google Maps access.

## Data model
Each static restaurant record should support at least:
- `name_ja`;
- profile scope;
- anonymous area key;
- primary cuisine family;
- secondary cuisine tags;
- lunch budget min/max or source range;
- dinner budget min/max or source range;
- approximate distance bucket;
- recommended dishes;
- weekly opening hours;
- regular closed days / holiday rules;
- schedule uncertainty/status flag;
- address;
- latitude / longitude;
- Google Maps query;
- Google Maps URL;
- Google Place ID when available;
- Tabelog/source reference notes and last verification date.

## Technical direction
- Static HTML + CSS + vanilla JavaScript.
- Lightweight responsive baseline/template; Pico CSS remains a candidate and should preferably be vendored locally.
- No unnecessary build step.
- Browser current date/time drives static schedule filtering.
- Google Maps is loaded on expansion when practical to preserve initial load performance.

## Visual direction
- Bright, playful, rounded, cute visual language inspired by the energetic yellow/white feeling associated with Usagi from Chiikawa, without copying official character artwork.
- Warm yellow + white, dark text, small accent colors, large touch targets, rounded cards/buttons, and minimal chrome.

## Research notes
- Initial restaurant/source investigation is tracked separately in `DATA_RESEARCH.md` before records are promoted into the production restaurant dataset.

## Confirmed-but-not-yet-specified
- `SHIZUOKA` area/data configuration: `TBD`.
- Exact grouping level of the 食べログ 百名店 taxonomy for rejection UI.
- Exact maximum restaurant collection distance from each TOKYO anchor station.
