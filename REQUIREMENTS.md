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
- Restaurant collection can therefore be updated later by editing the local data without changing or explaining the public area labels.
- `SHIZUOKA` remains `TBD` and receives no real area configuration yet.

## Restaurant collection logic
- Restaurant candidates are collected and cross-checked using both 食べログ (Tabelog) and Google Maps.
- Data collection is performed offline / during repository maintenance and written into the static local restaurant dataset; the public page does not query Tabelog or Google Places dynamically for restaurant discovery.
- Tabelog is used primarily for cuisine/genre classification, menu/recommended-dish context, and restaurant discovery.
- Google Maps is used primarily for place identity, map location, rough price level, opening-hours reference, route/distance context, and direct place-page access.
- Each restaurant record should note enough source metadata to be manually reviewed or refreshed later.
- The dataset should be periodically maintainable entirely by editing repository data.

## Opening / closed-day logic
- Each restaurant record must store regular opening information and known closed-day / holiday rules when available.
- The webpage must read the visitor's current local date/time in the browser.
- Before recommendation, restaurants that are clearly closed according to the locally stored schedule for the current day/time must be excluded.
- Known regular closing days must be shown in restaurant results.
- If a restaurant has uncertain, irregular, temporary, or frequently changing business hours, the dataset should be able to mark this uncertainty and the UI should avoid claiming live certainty.
- Static schedule filtering is intended to avoid obvious bad recommendations; Google Maps remains the destination for the user to confirm current-day exceptional closures or temporary changes.

## UI flow
1. Profile selector at the top: `TOKYO` / `SHIZUOKA`.
2. Area selector.
   - `TOKYO`: `地区1️⃣` / `地区2️⃣` only.
   - `SHIZUOKA`: `TBD` / unavailable until later requirements are supplied.
3. Food-category rejection filters using checkboxes or equivalent multi-select controls.
4. Expected-budget filter using preset controls aligned conceptually with Google Maps price levels.
5. One primary button to generate proposals.
6. After clicking:
   - apply profile, area, rejection-category, budget, and current-time/opening filters;
   - build the eligible restaurant pool;
   - randomly generate exactly 3 restaurant proposals when possible;
   - the 3 selected restaurants must belong to 3 different cuisine systems / primary cuisine categories;
   - do not return multiple restaurants from the same primary cuisine family in one generation.
7. Initial result list for each restaurant shows key summary information only.
8. Clicking/tapping a restaurant name or its expand control reveals the small embedded Google Maps view for that restaurant.

## Recommendation randomization
- Random choice is performed only after all filters are applied.
- Eligible restaurants should remain equal-probability within the applicable cuisine-selection logic unless a later requirement explicitly adds weighting.
- Each generation should aim for 3 distinct primary cuisines and 3 distinct restaurants.
- If fewer than 3 distinct eligible cuisine categories remain after filtering, the UI should clearly state that there are not enough distinct cuisine options rather than silently duplicating the same cuisine family.

## Distance logic
- Each restaurant should have a rough distance bucket relative to the anchor station of its anonymous area.
- Distance does not need to be exact turn-by-turn walking distance; a reasonable approximate distance is sufficient.
- Preferred public display uses rounded buckets such as approximately `100 m`, `200 m`, `300 m`, `400 m`, etc.
- `地区1️⃣` distance is calculated/estimated relative to 神保町駅 internally.
- `地区2️⃣` distance is calculated/estimated relative to 板橋本町駅 internally.
- The public UI shows only the approximate distance, not the hidden station-to-area mapping explanation.

## Google Maps requirement
- A URL-only result is not sufficient.
- The initial 3-result list should remain compact; the embedded map is shown only after the user clicks/taps a restaurant entry.
- The expanded result must embed Google Maps as a compact map view showing the selected restaurant's location.
- The embedded map should provide a natural path to open the same place in Google Maps.
- Google Maps is the detailed destination for ratings, reviews, route planning, live/exceptional opening information, and Google-provided price information.
- Do not build a custom mapping system when Google Maps embedding can provide the required presentation.
- The map should be responsive and appropriately sized for mobile and desktop.

## Food-category taxonomy
- Rejection categories should be based primarily on the genre structure used by 食べログ 百名店 rather than an arbitrary custom taxonomy.
- Current 百名店 examples include categories such as: ラーメン, 焼肉, 焼き鳥, 鳥料理, とんかつ, ハンバーガー, 中国料理, カレー, アジア・エスニック, 食堂, スペイン料理, パン, 喫茶店, アイス・ジェラート, うなぎ, 居酒屋, お好み焼き, ステーキ・鉄板焼き, そば, カフェ, 洋食, フレンチ, イタリアン, ピザ, 日本料理, 天ぷら, 寿司, すき焼き・しゃぶしゃぶ, 餃子, スイーツ, etc.
- The final UI does not necessarily need every 百名店 category individually; adjacent categories may later be grouped for usability, but the source taxonomy should remain traceable to 食べログ.
- Each restaurant requires one primary cuisine family for the 3-distinct-cuisine recommendation rule, with optional secondary tags for search/filtering.
- Rejection logic is exclusion-based: checked categories are removed from the eligible pool.

## Budget taxonomy
- Budget presets should follow the conceptual Google Maps / Google Places price-level system rather than arbitrary yen ranges.
- Google Places defines price levels as `INEXPENSIVE`, `MODERATE`, `EXPENSIVE`, and `VERY_EXPENSIVE` (`FREE` is irrelevant to normal restaurant selection).
- Preserve these relative price-level semantics rather than claiming a universal fixed yen conversion.
- If user-facing yen examples are added for Japan, treat them as UI guidance/local calibration rather than Google's fixed official thresholds.

## Recommended dishes
- Each restaurant record should include 1-2 representative / recommended dishes when sufficient information is available from Tabelog, Google Maps, official restaurant information, or consistent menu references.
- Recommended dishes are static editorial metadata maintained in the repository, not dynamically scraped at page load.
- The UI should show 1-2 concise recommended dishes with each restaurant result.

## Display language
- Restaurant names should remain in their original Japanese form.
- Other key UI/result information should be presented in Chinese for clarity, including cuisine type, approximate distance, budget level, recommended dishes, regular closed day, and status notes.
- Japanese dish names may be retained where useful, with a short Chinese translation/explanation next to them.
- Do not unnecessarily translate brand/proper restaurant names into Chinese.

## Result card minimum content
Each generated restaurant summary should display:
- Japanese restaurant name;
- primary cuisine category in Chinese;
- approximate distance from the selected area's anchor station (`约100m`, `约200m`, etc.);
- Google-style budget/price level in an understandable Chinese presentation;
- 1-2 recommended dishes;
- regular closed-day / opening-status note based on stored schedule;
- an expand/click interaction that reveals the embedded Google Maps view;
- a direct Google Maps access path for full details.

## Data model
- Food repository is stored locally in static JS/JSON data.
- Each entry should support at least:
  - restaurant name (Japanese/original form);
  - profile scope (`TOKYO`, later `SHIZUOKA`, or shared if needed);
  - anonymous public area key (`地区1️⃣` or `地区2️⃣` for TOKYO);
  - actual location/address/map metadata used internally for restaurant collection and map rendering;
  - primary cuisine family;
  - secondary Tabelog-derived cuisine/category tags;
  - Google-style price level;
  - approximate distance bucket from the relevant anchor station;
  - recommended dishes (1-2 where available);
  - regular opening hours;
  - regular closed days / known holiday rules;
  - schedule uncertainty/status note when needed;
  - Google Maps query / place identifier when available;
  - address;
  - latitude and longitude when available;
  - source/reference notes for Tabelog and Google Maps maintenance.

## Technical direction
- Static HTML + CSS + vanilla JavaScript.
- Use a lightweight responsive baseline/template; Pico CSS remains a candidate, preferably vendored locally rather than loaded from a CDN.
- Keep dependencies minimal and avoid a build step unless later requirements make one necessary.
- Browser-side current date/time is used for static opening-hours filtering.
- Google Maps embedded display is loaded only on restaurant expansion if practical, to preserve fast initial page load.

## Visual direction
- Bright, playful, rounded, cute visual language inspired by the energetic yellow/white feeling associated with Usagi from Chiikawa, without copying official character artwork.
- Primary palette direction: warm yellow + white, with dark text and small accent colors.
- Large touch targets, rounded cards/buttons, clear spacing, minimal page chrome.
- Single-screen/short-scroll utility feel is preferred over a content-heavy website.

## Confirmed-but-not-yet-specified
- `SHIZUOKA` area/data configuration: `TBD`.
- Exact grouping level of the 食べログ 百名店 taxonomy for the rejection UI: to be decided later.
- Exact restaurant inclusion radius / maximum practical distance from each TOKYO anchor station: to be decided during data collection.
- Whether profiles eventually receive separate defaults/history/preferences: to be decided later.
