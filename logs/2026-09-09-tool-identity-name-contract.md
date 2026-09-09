# Tool identity-name contract fix — 2026-09-09

## Trigger

A concrete bad task-field example was reported:

- source/official alias: `めいどりーみん 秋葉原 AKIBA`
- frozen catalog identity: `Maidreamin Akihabara Himitsukichi`
- Google Place ID: `ChIJAQA0URyMGGARcHdnj-vbe6s`

The source alias is useful evidence about the current official page, but it is not allowed to replace the catalog identity used by downstream tools.

## Root cause

The reviewed official-source layer is explicitly source-only and does not permit runtime name or identity mutation. However, two downstream menu tools were promoting `officialName` into their task `name` field:

1. `collect_official_menu_image_text_evidence.mjs` used `row.officialName` directly.
2. `audit_official_embedded_menu_json.mjs` used the runtime name with `officialName` as a fallback.

This violated the separation between catalog identity and source-page aliases. A renamed branch, translated name, shortened brand label, or current official-page label could therefore enter tool queries/records as if it were the frozen catalog identity.

## Contract after the fix

- `googlePlaceId` remains the catalog identity key.
- `name` in tool tasks must come from the current generated runtime/catalog row.
- a task is skipped when the runtime identity has no known name; source aliases may not fill that gap.
- `officialName`, page titles, and source names are retained only as `sourceOfficialName`/source aliases and identity evidence.
- both runtime identity name and source alias may be used to reject restaurant-name text from menu-image alt/title evidence, without conflating the two fields.
- no paid Google data API was introduced and the fix does not change identity bindings.

## Regression guard

`scripts/test_tool_identity_name_contract.mjs` is run by PR Review after `reload_data.py --public-only` generates the current runtime. It checks the real Maidreamin Place ID and asserts that passing `めいどりーみん 秋葉原 AKIBA` as a source alias still produces `Maidreamin Akihabara Himitsukichi` as the tool identity name. It also rejects the two previously unsafe source-code patterns.

The manual official-menu workflow additionally checks that emitted evidence-row `name` values equal the generated runtime name for the same Place ID.

## Scope

This is a task identity-field correction, not a manual one-row rename. Existing official/source aliases remain available as evidence. Existing Overture/OSM field-only overlays continue to reuse reviewed bindings and do not gain authority to mutate catalog identity.
