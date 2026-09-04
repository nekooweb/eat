# Eat Page Requirements

## Scope
- Single-page static web app hosted at `https://nekooweb.github.io/eat/`.
- No backend. All behavior and data are maintained directly in repository code/data files.
- Fast loading and usable on both mobile and desktop.
- Initial users: `ziko` and `neko`.
- Development should remain intentionally simple: no backend service, no database, and no unnecessary framework/build layer.

## User states
- Top-level user selector contains `ziko` and `neko`.
- `ziko`: active configuration and data will be implemented first.
- `neko`: visible in the UI but its area/data configuration is `TBD` for now.

## UI flow
1. User selector at the top with the two names: `ziko` and `neko`.
2. Area selector.
   - Only `ziko` receives real area options in the first implementation.
   - `neko` area selection remains clearly marked `TBD` / unavailable until later requirements are supplied.
3. Food-category rejection filters using checkboxes or equivalent multi-select controls.
4. Expected-budget filter using preset controls aligned conceptually with Google Maps price levels.
5. One primary button to generate a proposal.
6. After clicking, filter the local restaurant/food repository by all active conditions and then choose one eligible entry with uniform random selection.
7. Result view shows at minimum:
   - restaurant / food-place name;
   - a small embedded Google Maps-style map preview directly inside the result area;
   - a marker or equivalent visual indication of the restaurant's approximate/exact stored location;
   - a direct link/button opening the restaurant in Google Maps, where ratings, reviews, opening information, and Google-provided price information can be inspected.

## Map requirement
- A URL-only result is not sufficient.
- The page itself must contain a compact map preview after a restaurant is selected.
- The preview should be lightweight and suitable for both mobile and desktop.
- Restaurant records should therefore retain location information suitable for map display (prefer coordinates and/or a stable Google Maps place/query identifier).
- The implementation should avoid a backend. If the chosen Google map embed approach requires an API key or billing, that tradeoff must be evaluated before development rather than silently introducing it.

## Food-category taxonomy
- Rejection categories should be based primarily on the genre structure used by 食べログ 百名店 rather than an arbitrary custom taxonomy.
- Current 百名店 examples include categories such as: ラーメン, 焼肉, 焼き鳥, 鳥料理, とんかつ, ハンバーガー, 中国料理, カレー, アジア・エスニック, 食堂, スペイン料理, パン, 喫茶店, アイス・ジェラート, うなぎ, 居酒屋, お好み焼き, ステーキ・鉄板焼き, そば, カフェ, 洋食, フレンチ, イタリアン, ピザ, 日本料理, 天ぷら, 寿司, すき焼き・しゃぶしゃぶ, 餃子, スイーツ, etc.
- The final UI does not necessarily need every 百名店 category individually; adjacent categories may later be grouped for usability, but the source taxonomy should remain traceable to 食べログ.
- Rejection logic is exclusion-based: checked categories are removed from the eligible pool.

## Budget taxonomy
- Budget presets should follow the conceptual Google Maps / Google Places price-level system rather than arbitrary yen ranges.
- Google Places defines price levels as:
  - `INEXPENSIVE`
  - `MODERATE`
  - `EXPENSIVE`
  - `VERY_EXPENSIVE`
  - (`FREE` exists in the API model but is not relevant to normal restaurant selection.)
- Legacy Google Places documentation represents the same concept on a 0–4 scale where 1 = inexpensive, 2 = moderate, 3 = expensive, 4 = very expensive; Google notes that the exact monetary meaning varies by region.
- Therefore, the first implementation should preserve these relative price-level semantics rather than hard-code an unsupported universal yen conversion.
- If we later want user-facing yen examples for Japan, those should be treated as UI guidance/local calibration rather than claimed as Google's fixed official yen thresholds.

## Data model
- Food repository is stored locally in static JS/JSON data.
- Each entry should support at least:
  - name;
  - user scope (`ziko`, later `neko`, or shared if needed);
  - area;
  - 食べログ-derived cuisine/category tags;
  - Google-style price level;
  - Google Maps query / place identifier when available;
  - address;
  - latitude and longitude when available.
- Random selection must be performed only after all active filters are applied.
- Every eligible entry should have equal probability unless a future requirement explicitly adds weighting.

## Technical direction
- Static HTML + CSS + vanilla JavaScript.
- Use a lightweight responsive baseline/template; Pico CSS remains a candidate, preferably vendored locally rather than loaded from a CDN.
- Keep dependencies minimal and avoid a build step unless later requirements make one necessary.
- Google Maps direct links remain useful as the detailed destination page, but they are supplementary to the required embedded map preview.

## Visual direction
- Bright, playful, rounded, cute visual language inspired by the energetic yellow/white feeling associated with Usagi from Chiikawa, without copying official character artwork.
- Primary palette direction: warm yellow + white, with dark text and small accent colors.
- Large touch targets, rounded cards/buttons, clear spacing, minimal page chrome.
- Single-screen/short-scroll utility feel is preferred over a content-heavy website.

## Confirmed-but-not-yet-specified
- `ziko` area list: to be supplied later.
- `neko` area/data configuration: `TBD`.
- Exact grouping level of the 食べログ 百名店 taxonomy for the rejection UI: to be decided later.
- Whether `ziko` and `neko` eventually receive separate defaults/history/preferences: to be decided later.
