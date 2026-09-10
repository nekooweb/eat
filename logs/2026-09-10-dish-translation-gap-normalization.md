# 2026-09-10 — Retained dish translation gap normalization

## Scope

This batch continues the source-first data completion plan after the public UI simplification work. It does not collect restaurant data, call a paid data API, reset SQLite, alter identities, or hand-edit the public runtime.

The current retained-source translation queue contained 9 source-backed dish items across 8 restaurants. A pending item means dish evidence and provenance already exist, but the deterministic Chinese canonicalizer cannot yet normalize the source-native label.

## Reviewed normalization results

Seven items can be normalized deterministically from their retained source-native dish names:

| source-native label | canonical zh-CN |
| --- | --- |
| 塩生姜らー麺 | 盐味生姜拉面 |
| のり巻 | 海苔卷寿司 |
| パーコー麺 | 排骨面 |
| クスクス | 库斯库斯 |
| タジン鍋 | 塔吉锅 |
| 名物 ごまさば | 芝麻鲭鱼 |
| シェルアンドチップス | 贝类配薯条 |

`塩生姜らー麺` exposed a rule-shape gap: the existing salt-ginger ramen rule accepted `ラーメン` and `らーめん`, but not the retained mixed spelling `らー麺`. The rule now includes that exact source-native spelling instead of introducing a broader inference.

The other six additions are specific-first lexical normalizations. They only fire when the source text contains the corresponding concrete dish name and therefore do not infer a dish from restaurant name, cuisine, location, or brand.

## Intentionally unresolved

Two items remain translation-pending:

- `えびず焼き`: restaurant-created product name; the retained evidence does not provide a sufficiently stable composition description for a canonical Chinese dish label.
- `ソルベージュ®エスプレッソ`: trademark/product label; it remains pending until the canonical product-name policy is explicitly settled.

This preserves the earlier conservative decision. Neither item is treated as missing dish evidence.

## Implementation

Updated `scripts/recommended_dish_extractor.mjs` with the seven reviewed normalizations.

Added `scripts/test_dish_translation_gap_regression.mjs` to assert:

- all seven reviewed source-native labels resolve to the expected Chinese canonical value;
- the original source-native label is retained as `nameOriginal`;
- the two intentionally unresolved product names still return no deterministic translation;
- the regression itself performs zero network requests and zero paid Google data API calls.

PR Review now runs this regression after `reload_data.py --public-only`, so future changes cannot silently re-open these exact normalization gaps or force the two conservative pending items through a broad rule.

## Expected generated-state effect

On the next retained evidence regeneration, the 9-item translation queue should reduce to the 2 intentionally pending items, assuming the same source evidence remains present. The retained evidence builder, not this patch, owns the generated pending file; therefore the runtime and generated queue are not hand-edited in this change.

## Boundaries / next data work

This batch does not claim to close the larger recommendation gap. The next source-first work remains:

1. mine the already-bound official-source targets;
2. deepen extraction from retained third-party evidence;
3. search free independent sources for records that still have no usable source;
4. keep recommendation (R), featured/menu (F), and candidate (C) semantics separate;
5. address the documented P0/P1 pipeline issues before treating large-scale generated counts as durable.
