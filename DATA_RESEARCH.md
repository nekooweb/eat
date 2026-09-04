# Initial Restaurant Research and Data Notes

## Budget display rule
- Do not display abstract labels such as `💰💰 中等` in result cards.
- Display a concrete yen range sourced from the maintained restaurant record, e.g. `¥1,000–1,999`, `¥4,000–4,999`, `¥6,000–7,999`.
- Keep lunch and dinner ranges separately when the source provides both; the UI may choose the relevant range based on current time.
- Budget filtering should be based on the stored yen range rather than a hidden subjective label.

## Google Maps association strategy
For each restaurant, store the following whenever available:
- `name_ja`
- `address`
- `lat`
- `lng`
- `google_place_id`
- `google_maps_url`
- `google_maps_query`

Google Maps deep-link format should use the official Maps URL form and prefer a Place ID when available:
`https://www.google.com/maps/search/?api=1&query=...&query_place_id=...`

Reasoning:
- Google documents Maps URLs as cross-platform and API-key-free.
- Google recommends Place IDs as the strongest way to link to one exact establishment.
- Coordinates alone can place a pin but may not open the correct business details panel, so coordinates should not be the only identity field.
- Google Place IDs can change over time, so the dataset should retain name/address as fallback identifiers and support periodic refresh.

For embedded maps:
- The official Google Maps Embed API supports `place` mode in an iframe.
- It requires an API key and billing-enabled Google Cloud project, although Embed API requests are currently free/unlimited according to Google documentation.
- If we decide not to maintain an API key, a simpler map preview can be considered, but the production design should prefer the official Embed API if an authentic Google Maps place view is required.

## Randomness requirement
Random recommendation must be data-driven and independent of restaurant content ordering.

Required sequence:
1. Filter by profile.
2. Filter by anonymous area.
3. Remove rejected food categories.
4. Filter by the requested yen budget range.
5. Remove restaurants that are clearly closed according to the stored weekly schedule and current browser time.
6. Build the remaining eligible pool.
7. Group eligible restaurants only by their `primary_cuisine` key.
8. Randomly select 3 distinct cuisine groups without weighting.
9. Within each selected cuisine group, randomly select exactly one restaurant without weighting.
10. Shuffle the final 3 cards before display.

Implementation rule:
- No ranking, score, review count, distance, alphabetical order, source order, recommendation text, or hand-authored priority may influence probability unless a future explicit requirement introduces weighting.
- Use browser cryptographic randomness (`crypto.getRandomValues`) rather than relying on deterministic list order or content-driven output.
- Sampling must be without replacement.
- Repeated clicks may legitimately repeat a previously seen restaurant; there is no hidden anti-repeat weighting unless explicitly added later.

## Initial TOKYO restaurant sample
This is an initial research sample, not yet the final production dataset.

### 地区1️⃣ collection anchor
Public UI label remains `地区1️⃣`; internal collection anchor is 神保町駅.

#### タケウチ 神保町本店（TAKEUCHI）
- Primary cuisine: カレー
- Tabelog budget: lunch `¥1,000–1,999`; dinner `¥1,000–1,999`
- Approx. station distance: 160 m → public bucket `约200m`
- Address: 東京都千代田区神田神保町1-20-3 1F
- Tabelog notes current daily operation around 11:30–20:00 but may open earlier when preparation is complete; may close when sold out; exceptional closure notices can occur.
- Recommended-dish candidates seen in menu references: `2種あいがけカレー`, `3種あいがけカレー`, `イベリコ豚と野菜のチーズカレー`.
- Special handling: mark schedule as `variable/sold_out_risk`; static time filtering should not claim guaranteed availability.

#### 神保町 可以
- Primary cuisine: ラーメン
- Tabelog budget: `～¥999` (source display); recent review aggregates may show `¥1,000–1,999`, so production record needs a current cross-check before finalization.
- Station: 神保町駅
- Candidate dish: `煮干し中華そば`.
- Production record still needs exact Place ID, coordinates, opening schedule and current budget reconciliation.

#### 海老丸らーめん
- Primary cuisine: ラーメン
- Tabelog budget: lunch `¥1,000–1,999`; dinner `¥1,000–1,999`
- Candidate dishes from current listing context: `濃厚海老丸ラーメン`, seasonal/limited ramen.
- Production record still needs exact Place ID, coordinates, station distance and weekly closure schedule.

#### スープカレー屋 鴻 神田駿河台店
- Primary cuisine: カレー / スープカレー
- Tabelog budget: lunch `¥1,000–1,999`; dinner `¥1,000–1,999`
- Approx. station distance: 297 m → public bucket `约300m`
- Candidate dish: `チキンカレー`.
- Production record still needs exact Google Place ID, coordinates and weekly closure schedule.

#### 四川料理 秋 神保町本店
- Primary cuisine: 中国料理
- Tabelog budget: lunch `～¥999`; dinner `¥2,000–2,999`
- Approx. station distance: 194 m → public bucket `约200m`
- Candidate dish family: 担々麺 / 四川料理.
- Production record still needs exact Place ID, coordinates and opening/closure details.

### 地区2️⃣ collection anchor
Public UI label remains `地区2️⃣`; internal collection anchor is 板橋本町駅.

#### ラーメン慶次郎 本店
- Primary cuisine: ラーメン
- Tabelog listed budget: `～¥999`; recent review aggregate can be `¥1,000–1,999`, so production record needs a current cross-check.
- Approx. station distance: 156 m → public bucket `约200m`
- Address: 東京都板橋区本町14-14
- Regular hours currently listed: Mon/Wed/Thu/Fri 11:30–14:30, 17:30–23:00; Sat 11:30–15:00, 17:30–23:00; Sun/holiday 11:30–15:00, 17:30–22:00.
- Regular closure: Tuesday; also 2nd and 4th Wednesday.
- Recommended-dish candidate: `ラーメン` (二郎系 style; toppings such as ヤサイ/アブラ/ニンニク).

#### 麺庵 小島流 板橋本町本店
- Primary cuisine: ラーメン
- Tabelog budget: lunch `～¥999` / current review aggregate often `¥1,000–1,999`; dinner `¥1,000–1,999`.
- Approx. station distance: 281 m → public bucket `约300m`
- Address: 東京都板橋区本町32-12 サンハイツ本町101
- Regular hours currently listed: Mon/Wed/Thu/Fri 11:30–14:00, 18:00–22:00; Sat/Sun/holiday 11:30–14:30, 18:00–22:00.
- Regular closure: Tuesday.
- Source explicitly warns of temporary closures/openings; production record should carry an `irregular_notice` flag.
- Recommended-dish candidate: `鶏清湯ら〜めん（醤油）`.

#### そば処 田中屋
- Primary cuisine: そば
- Tabelog budget: lunch `¥1,000–1,999`; dinner `¥1,000–1,999`
- Approx. station distance: 376 m → public bucket `约400m`
- Address: 東京都板橋区清水町50-15
- Regular closure: Thursday.
- Current listing shows lunch and dinner service; exact closing time should be rechecked before production import.

#### 時楽
- Primary cuisine: 焼肉
- Tabelog budget: dinner `¥6,000–7,999`
- Approx. station distance: 59 m → public bucket `约100m`
- Address: 東京都板橋区本町36-9 アーバンライフ 101
- Recommended-dish candidate from multiple review references: `ワイルドタン` / tongue-focused yakiniku course.
- Production record still needs exact weekly schedule, coordinates and stable Google Place ID.

#### 聚幸園
- Primary cuisine: 中国料理
- Tabelog budget: lunch `¥1,000–1,999`; dinner `¥1,000–1,999`
- Approx. station distance: 221 m → public bucket `约200m`
- Address: 東京都板橋区本町17-3
- Production record still needs recommended dishes, schedule, coordinates and stable Google Place ID.

#### ナマステ・ネパール
- Primary cuisine: インド・ネパール料理 / カレー
- Tabelog budget: lunch `～¥999`; dinner `¥1,000–1,999`
- Approx. station distance: 155 m → public bucket `约200m`
- Candidate dish references include curry sets and 豚丼; final recommended dish selection needs source reconciliation.
- Production record still needs exact address, weekly schedule, coordinates and stable Google Place ID.

#### 長寿庵
- Primary cuisine: 食堂 / そば・うどん
- Approx. station distance: 286 m → public bucket `约300m`
- Address: 東京都板橋区本町18-9
- Hours currently listed: Mon/Tue/Wed/Fri/Sat/Sun 11:00–20:00.
- Regular closure: Thursday.
- Production record still needs exact current budget, dish recommendations, coordinates and Google Place ID.

#### 曙軒
- Primary cuisine: 中国料理
- Tabelog budget aggregate: `～¥999`
- Approx. station distance: 328 m → public bucket `约300m`
- Current hours listed: Mon/Thu/Fri/Sat/Sun 11:30–18:30.
- Regular closure: Tuesday and Wednesday.
- Production record still needs exact address validation, recommended dishes, coordinates and stable Google Place ID.

## Next data-curation pass
Before importing a restaurant into production JSON, verify:
1. Tabelog page identity.
2. Google Maps business identity.
3. Current address.
4. Coordinates.
5. Google Place ID if available.
6. Stable Maps URL.
7. Current lunch/dinner yen ranges.
8. Weekly opening hours and regular closure days.
9. Temporary/irregular closure warning if applicable.
10. 1-2 representative dishes with source support.
11. Primary cuisine key and secondary tags.
12. Approximate station-distance bucket.
