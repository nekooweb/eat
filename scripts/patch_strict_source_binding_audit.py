#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "scripts/audit_source_bindings.mjs"
s = path.read_text(encoding="utf-8")

old = """const unattached = enrichment.filter((row) => !productionIds.has(row.googlePlaceId));
if (unattached.length) {
  console.error('SOURCE BINDING AUDIT FAIL: source rows do not attach to current canonical production');
  for (const row of unattached) {
    console.error(`${row.id}\\t${row.name}\\t${row.googlePlaceId}`);
  }
  process.exit(1);
}

const attachedIds = new Set(enrichment.map((row) => row.googlePlaceId));
const latestSourceDateById = new Map();
for (const row of enrichment) {"""
new = """// Strict production may intentionally exclude otherwise useful maintenance
// evidence when a Google-bound identity lacks verified geospatial admission.
// Retain that evidence internally, but never count it as attached production data.
const unattached = enrichment.filter((row) => !productionIds.has(row.googlePlaceId));
const attachedEnrichment = enrichment.filter((row) => productionIds.has(row.googlePlaceId));
const attachedIds = new Set(attachedEnrichment.map((row) => row.googlePlaceId));
const latestSourceDateById = new Map();
for (const row of attachedEnrichment) {"""
if old not in s:
    raise SystemExit("missing enrichment attachment audit block")
s = s.replace(old, new, 1)

old = """const resolutionIds = new Set();
const supersededResolutionIds = new Set();
for (const row of resolutions) {
  if (!row.googlePlaceId || !productionIds.has(row.googlePlaceId)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: resolution is not a current production identity: ${row.name}\\t${row.googlePlaceId}`);
    process.exit(1);
  }
  if (resolutionIds.has(row.googlePlaceId)) {"""
new = """const resolutionIds = new Set();
const supersededResolutionIds = new Set();
let retainedNonProductionResolutions = 0;
for (const row of resolutions) {
  if (!row.googlePlaceId) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: resolution lacks Google Place ID: ${row.name}`);
    process.exit(1);
  }
  if (!productionIds.has(row.googlePlaceId)) {
    retainedNonProductionResolutions += 1;
    continue;
  }
  if (resolutionIds.has(row.googlePlaceId)) {"""
if old not in s:
    raise SystemExit("missing resolution production-membership audit block")
s = s.replace(old, new, 1)

old = """  enrichmentRecords: enrichment.length,
  attachedEnrichmentRecords: enrichment.length,
  sourceBackedProduction: sourceBacked.length,
  resolutionShards: resolutionFiles.length,
  explicitResolutionRecords: resolutions.length,
  currentExplicitResolutions: resolutions.length - supersededResolutionIds.size,
  supersededHistoricalResolutions: supersededResolutionIds.size,
  unresolvedByBindingAudit: 0,
  unattached: 0"""
new = """  enrichmentRecords: enrichment.length,
  attachedEnrichmentRecords: attachedEnrichment.length,
  retainedNonProductionEnrichmentRecords: unattached.length,
  sourceBackedProduction: sourceBacked.length,
  resolutionShards: resolutionFiles.length,
  explicitResolutionRecords: resolutions.length - retainedNonProductionResolutions,
  retainedNonProductionResolutions,
  currentExplicitResolutions: resolutions.length - retainedNonProductionResolutions - supersededResolutionIds.size,
  supersededHistoricalResolutions: supersededResolutionIds.size,
  unresolvedByBindingAudit: 0,
  unattached: unattached.length"""
if old not in s:
    raise SystemExit("missing source-binding report block")
s = s.replace(old, new, 1)

path.write_text(s, encoding="utf-8")
print("strict source-binding audit patched")
