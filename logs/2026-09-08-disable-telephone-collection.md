# Disable active telephone collection — 2026-09-08

Active telephone enrichment has been removed from the Area 1 pipeline.

## Why

The dedicated currentness/official telephone lane added disproportionate workflow and importer complexity for very small marginal yield. One iteration exposed an importer regression while wiring new telephone evidence into the master build. Although the regression was corrected and a small number of strict telephone observations were safely retained, continuing this lane is not justified.

## Removed

- currentness telephone enrichment workflow v1
- currentness telephone enrichment workflow v2
- currentness telephone collectors v1/v2
- reviewed-official labeled telephone enrichment workflow
- reviewed-official labeled telephone collector
- the combined official core-field sweep that bundled telephone with address/hours

## Active collectors

The general source-basic and reviewed-official web collectors now run through no-telephone wrappers. Telephone is excluded before target selection, and the workflows assert that no new telephone claims are emitted.

The ingestion planner is now `master-plan-v5-no-telephone`; `telephone` is excluded from active field-completion tasks.

## Preserved data

Existing source-backed canonical telephone values and historical telephone evidence are retained. This change stops future active telephone collection; it does not delete previously validated telephone data.

## Remaining priorities

Continue identity recovery, dish evidence, hours, budget, practical fields, address and other non-telephone source-backed enrichment. Paid Google data APIs remain prohibited.
