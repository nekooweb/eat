# 2026-09-08 — Specific Chinese dish bulk completion v2

## Why v2 was required

The first relaxed Chinese display pass reached nominal 100% coverage by allowing a universal fallback such as `招牌主菜 / 时令小菜`. That made the coverage number look complete but provided little practical information to users. This v2 pass supersedes that behavior.

The new requirement is deliberately stricter:

- prefer a blank recommendation over meaningless generic filler;
- preserve existing source-backed / reviewed Chinese dishes first;
- allow approximate Chinese recommendations only when a restaurant has a usable brand, dish keyword, ingredient/cooking keyword, specific cuisine, or food-bearing broad cuisine signal;
- never use `招牌主菜`, `时令小菜`, `推荐菜`, `特色菜`, or `主菜` as universal filler;
- keep generic `餐厅`, `酒吧`, generic dining-bar/cocktail-bar labels blank unless the restaurant name itself supplies a stronger food signal;
- approximate display suggestions remain presentation-only and are never promoted to verified source evidence.

## Policy

Runtime policy: `relaxed-zh-v2`

Approximate rows carry:

- `dishRecommendationConfidence: approximate`
- `dishRecommendationBasis: <specific rule id>`
- `dishRecommendationQualityTier: brand | dish-keyword | cuisine | broad-cuisine`
- `dishRecommendationLanguage: zh-CN`
- `dishRecommendationDisplayPolicy: relaxed-zh-v2`

`genericFallbackAllowed` is `false`.

The blocking runtime audit rejects the exact generic labels:

- `招牌主菜`
- `时令小菜`
- `推荐菜`
- `特色菜`
- `主菜`

It also rejects approximate rows without a concrete basis or an approved quality tier.

## Batch expansion

The v2 rule set was expanded in bulk rather than by individual restaurants.

### Brand / chain rules

Examples include Starbucks, Tully's, Doutor, Veloce, Cafe de Crie, Renoir, Ueshima, Komeda, Pronto, Hoshino, McDonald's, Subway, Shake Shack, Burger King, MOS Burger, Torikizoku, Hanamaru Udon, Marugame, Yudetaro, Royal Host, Gusto, Jonathan's, Cocos, Saizeriya, Goemon, CoCo Ichibanya, Hinoya, Bondy, Tsujita, Taishoken, Machida Shoten, Hidakaya, Ringer Hut, Butayama, Katsuya, Yoshinoya, Sukiya, Matsuya, Nakau, Tenya, Ootoya, Yayoiken, Domino's and multiple local/area chains.

### Dish / ingredient / cooking signals

Examples include tsukemen, ie-kei ramen, niboshi ramen, shio-shoga ramen, tantanmen, malatang, knife-cut noodles, ramen-name patterns, curry, sushi, sashimi, unagi, oysters, tuna, mackerel, sardines, bonito, seafood, yakitori, chicken-specialty names, yakiton, kushikatsu, yakiniku, gyutan, udon, soba, tempura, tonkatsu, gyudon, oyakodon, seafood bowls, okonomiyaki, takoyaki, yakisoba, sukiyaki, shabu-shabu, motsunabe, oden, teppan, robata, omurice, gyoza, xiaolongbao, biryani, kebab, banh mi, pho, paella, tacos, onigiri, pudding, douhua and wagashi.

### Specific cuisine rules

Examples include Sichuan, Shanghai, Cantonese, Hong Kong, Beijing, Taiwan, Chinese, Indian, Nepalese, Sri Lankan, Thai, Korean, Vietnamese, Spanish, Mexican, Moroccan, Turkish, Italian, pizza, French, bistro, yoshoku, steak, seafood, cafe, bakery, sweets, ice cream, burgers, Okinawan and Hawaiian food.

### Minimum broad-cuisine tier

A low but still useful `broad-cuisine` tier is allowed only for food-bearing categories:

- `和食 / 日式 / 日本料理` -> concrete Japanese examples such as grilled mackerel / Japanese fried chicken;
- `居酒屋 / 大衆酒場` -> concrete izakaya examples such as yakitori / Japanese fried chicken;
- `定食 / 食堂` -> concrete set-meal examples such as ginger pork set / grilled mackerel set.

Generic `餐厅` and `酒吧` are intentionally not mapped.

## Measured results

Public named runtime size: **1,415 restaurants**.

### Strict v2 first pass after removing generic filler

- meaningful Chinese dish display: **860 / 1,415 (60.8%)**
- existing/source-backed Chinese dish rows: **291**
- approximate rows with a specific basis: **569**
- intentionally unfilled: **555**

### Second bulk v2 pass

After the large rule expansion:

- meaningful Chinese dish display: **1,133 / 1,415 (80.1%)**
- existing/source-backed Chinese dish rows: **291**
- approximate rows with a specific basis: **842**
- intentionally unfilled: **282**

This pass therefore added **273 restaurants with concrete Chinese dish suggestions in one batch** and reduced the meaningful dish gap from **555 to 282**.

Current approximate rows by quality tier:

- `brand`: **62**
- `dish-keyword`: **237**
- `cuisine`: **316**
- `broad-cuisine`: **227**

### Remaining 282 rows

The remaining gap is now dominated by intentionally opaque categories where automatically inventing dishes would recreate the old low-value fallback problem:

- `酒吧`: **106**
- `餐厅`: **103**
- `ダイニングバー・バル`: **29**
- `バー・カクテル`: **19**
- `アジア・エスニック料理`: **9**
- `面食`: **5**
- `創作料理`: **3**
- `快餐`: **3**
- `カラオケ・パーティ`: **3**
- other small categories: **2**

Future passes should recover these only through stronger restaurant-name/brand/source signals, not by restoring a generic restaurant fallback.

## CI / safety

GitHub Pages build run `34176613985` completed the build path successfully with the v2 audit.

The no-paid-data-API audit also passed:

- paid data API policy: pass
- files scanned: 189
- hits: 0

The dish threshold was adjusted without weakening the frozen-catalog, radius, identity, forbidden-Google-payload, or zero-paid-data-API controls.

## Commits

- `93de3796` — Replace generic dish fallback with specific Chinese inference rules
- `0270d22c` — Require specific Chinese dish suggestions and report remaining gaps
- `4cf7ed99` — Align source facts builder with specific dish policy v2
- `2869164e` — Bulk expand specific Chinese dish inference without generic filler
- `24bceb05` — Audit broad cuisine dish tier while keeping generic fallback banned
