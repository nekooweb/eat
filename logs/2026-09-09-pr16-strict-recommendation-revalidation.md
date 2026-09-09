# PR #16 strict recommendation revalidation — 2026-09-09

The six recommendation rows from stale PR #16 were intentionally excluded from the source-fact migration until their recommendation semantics were rechecked independently.

All six source pages were re-read on 2026-09-09 and still contain explicit popularity/signature/specialty wording:

- Little Marco — `US産サーロインステーキ`: official page calls it `当店自慢の逸品料理`.
- ぼたん — `鳥すきやき`: the page describes it as the restaurant's traditional core dish and says it has been loved for more than 100 years.
- かんだやぶそば — `そばとろ`: Visit Chiyoda explicitly calls it `不動の人気メニュー`.
- 神田志乃多寿司 — `稲荷寿司` and the kanpyo `のり巻`: Visit Chiyoda says these have been `評判` since the restaurant's early history.
- 博多もつ鍋やまや 御茶ノ水ワテラス店 — `博多もつ鍋` and `名物 ごまさば`: the official page labels the latter `名物` and describes the relevant set as a way to enjoy popular Yamaya products.
- 泡貝 — `シェルアンドチップス`: the official page explicitly calls it `大人気`.

The rows are restored to `data/recommended_dishes.js` with `checkedAt: 2026-09-09`.

No generic dish, cuisine-derived suggestion, or approximate recommendation is added. Catalog Place IDs and runtime names are unchanged, and no paid Google data API is used.
