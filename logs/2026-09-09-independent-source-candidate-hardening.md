# Independent source candidate hardening — 2026-09-09

## Context

The current Area1 frozen catalog remains 2,804 Place IDs, with 1,422 named/public runtime rows. Dish coverage at this checkpoint is 556 rows with strict recommended dishes, 651 with featured/menu dishes, and 711 with at least one displayed dish. The remaining recommendation-source work is stratified into 249 rows with crawlable official URLs, 321 rows with retained third-party sources, and 296 rows that still need a new independent dish source.

This work follows the 2026-09-09 tool identity-name fix: runtime/catalog `name` is the tool identity name, while official/source names are aliases/evidence only and may not replace catalog identity.

## What was tested first

PR #35 tested whether the 296 independent-source gaps could recover more Overture candidates despite name mismatch.

### Address/proximity alias hypothesis — rejected

An offline audit found many different-name Overture entities at extremely small coordinate distance and apparently matching addresses. Manual inspection of the generated samples showed that dense Tokyo buildings frequently contain multiple distinct businesses at the same address/near-identical point. Examples included clearly different nearby stores for `たまりば飯田橋店` and `はなくま`.

Conclusion: address, postcode, building co-location, or sub-meter proximity cannot establish alias equivalence. They may be supporting or rejection evidence only.

### Overture source-provided common-name hypothesis — no usable data

A fresh zero-paid Overture `2026-08-19.0` Area1 snapshot was generated in PR CI while temporarily retaining `names.primary` and `names.common`. It returned 3,908 food candidates inside the 1.2 km radius, but `rowsWithCommonNames = 0` and `commonNameValues = 0`. Therefore no same-entity source common-name bridge was available for the 296 targets.

PR #35 was closed without merge. It made no identity, catalog-name, dish-evidence, or production-schema changes.

## Root cause found in the weak-nearby lane

The existing weak-nearby candidate builder intentionally allowed name-incompatible Overture rows to be proposed purely by very tight proximity, relying on the strict v3 public-page reviewer to reject wrong identities later. The final reviewer remained safe, but the proposal stage still produced unnecessary network work and mixed obvious co-located wrong stores with plausible weak-name candidates.

The same audit also exposed URL families that should not be considered independent merchant sources in this lane, including Hitosara, Localplace, Demae-can, EPARK, Uber Eats, and Wolt.

## Production hardening

PR #36 changes only candidate admission before network review:

- weak-nearby proposals still use the retained Overture snapshot and remain offline/proposal-only;
- the workflow keeps the existing 15 m maximum candidate distance and 6 m different-host ambiguity gap;
- a candidate now requires normalized name similarity >= 0.45 before it may become a weak proposal;
- this is deliberately below the standard-plan 0.82 compatibility threshold, so plausible partial-name/variant cases can still reach the strict reviewer;
- proximity alone may no longer create a proposal and still may never create a binding;
- the unchanged strict v3 page-name + location criteria remain the final identity admission gate;
- no dish evidence may be written before identity review;
- Hitosara, Localplace, Demae-can, EPARK, Uber Eats, and Wolt are excluded from the weak independent-source lane.

## Regression result

The PR Review rebuilds current public inputs and runs the weak plan with the workflow parameters (`15 m`, `6 m`, minimum name similarity `0.45`). The observed result was:

- current standard independent-source proposals: 29;
- hardened weak proposals: 5;
- low-name-similarity nearby candidates rejected before network review: 212;
- ambiguous nearby candidates rejected: 9;
- two real co-located false-positive Place IDs from the alias audit are explicitly blocked by regression;
- expanded aggregator/delivery hosts are absent from both the current standard plan and the generated weak plan;
- Maidreamin identity-name regression still passes;
- PR Review, Pages preview, and no-paid-data-API checks all pass.

The standard 29-candidate plan currently contains none of the newly identified aggregator/delivery hosts, so this PR does not rewrite the standard candidate threshold or current standard data. A future defense-in-depth change may centralize the host policy across all independent-source reviewers/planners, but it is not required to make this verified weak-lane correction safe.

## Execution boundary after merge

After this hardening reaches `main`, one controlled manual run of `review-weak-nearby-independent-sources.yml` is justified because the network-review input is now only five pre-filtered candidates. The workflow must retain the unchanged strict v3 identity gate. If that single run yields no new strict approvals, do not repeat the weak lane without new source evidence or a new matching method.
