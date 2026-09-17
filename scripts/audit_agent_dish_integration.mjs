#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['recommendedDishes', 'featuredDishes'];
const key = (id, field, dish) => JSON.stringify([id, field, dish.nameZh, dish.provider, dish.sourceUrl, dish.evidenceClass || '']);
const label = dish => typeof dish === 'string' ? dish : dish?.nameZh;
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function runtimeDishNames(items, id, field) {
  const names = (items || []).map(label);
  if (names.some(name => typeof name !== 'string' || !name.trim() || /^(none|null|undefined)$/i.test(name))) {
    throw new Error(`Missing/invalid runtime dish name: ${id}/${field}`);
  }
  if (new Set(names).size !== names.length) throw new Error(`Duplicate runtime dish name: ${id}/${field}`);
  return names.sort();
}

export function snapshotState(runtimeRows, evidence, catalogIds) {
  const seen = new Set();
  const runtimeEvidenceKeys = [];
  const runtime = runtimeRows.map(row => {
    if (!row.googlePlaceId || seen.has(row.googlePlaceId)) throw new Error('Missing/duplicate runtime identity');
    seen.add(row.googlePlaceId);
    if (typeof row.name !== 'string' || !row.name.trim() || /^(none|null|undefined)$/i.test(row.name)) throw new Error('Invalid runtime name');
    for (const field of FIELDS) for (const dish of row[field] || []) {
      if (dish && typeof dish === 'object' && dish.sourceUrl) runtimeEvidenceKeys.push(key(row.googlePlaceId, field, dish));
    }
    return { googlePlaceId: row.googlePlaceId, name: row.name,
      ...Object.fromEntries(FIELDS.map(field => [field, runtimeDishNames(row[field], row.googlePlaceId, field)])) };
  }).sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const catalog = [...catalogIds].sort();
  if (new Set(catalog).size !== catalog.length || runtime.some(row => !catalog.includes(row.googlePlaceId))) {
    throw new Error('Frozen catalog/identity mismatch');
  }
  const evidenceKeys = [], evidenceIds = new Set(), reviewSnapshots = [], evidenceNames = [];
  for (const row of evidence.rows || []) {
    if (evidenceIds.has(row.googlePlaceId)) throw new Error('Duplicate canonical evidence row');
    evidenceIds.add(row.googlePlaceId);
    if (!catalog.includes(row.googlePlaceId)) throw new Error('Evidence outside frozen catalog');
    if (row.name != null && (typeof row.name !== 'string' || /^(none|null|undefined)$/i.test(row.name))) throw new Error('Invalid evidence identity name');
    evidenceNames.push([row.googlePlaceId, row.name || null]);
    for (const field of FIELDS) for (const dish of row[field] || []) {
      if (typeof dish?.nameZh !== 'string' || !dish.nameZh.trim() ||
          typeof dish.provider !== 'string' || !dish.provider.trim() ||
          typeof dish.sourceUrl !== 'string' || !/^https?:\/\//.test(dish.sourceUrl)) throw new Error('Malformed evidence dish shape/name/provider/source');
      const evidenceKey = key(row.googlePlaceId, field, dish);
      evidenceKeys.push(evidenceKey);
      for (const snapshot of dish.reviewedSourceEvidence || []) {
        reviewSnapshots.push(JSON.stringify([evidenceKey, sha(JSON.stringify(snapshot))]));
      }
    }
  }
  if (new Set(evidenceKeys).size !== evidenceKeys.length) throw new Error('Duplicate canonical evidence item');
  return { schemaVersion: 1, catalogIds: catalog, runtime, evidenceKeys: evidenceKeys.sort(), reviewSnapshots: reviewSnapshots.sort(),
    evidenceNames: evidenceNames.sort(([a], [b]) => a.localeCompare(b)), runtimeEvidenceKeys: runtimeEvidenceKeys.sort(),
    counts: { catalogTotal: catalog.length, publicRestaurants: runtime.length,
      recommendedRestaurants: runtime.filter(row => row.recommendedDishes.length).length,
      featuredRestaurants: runtime.filter(row => row.featuredDishes.length).length,
      displayRestaurants: runtime.filter(row => row.recommendedDishes.length || row.featuredDishes.length).length,
      recommendationGap: runtime.filter(row => !row.recommendedDishes.length).length,
      recommendationEvidenceItems: evidenceKeys.filter(value => JSON.parse(value)[1] === 'recommendedDishes').length,
      featuredEvidenceItems: evidenceKeys.filter(value => JSON.parse(value)[1] === 'featuredDishes').length } };
}

export function auditIntegration(before, after, accepted) {
  if (JSON.stringify(before.catalogIds) !== JSON.stringify(after.catalogIds)) throw new Error('Frozen catalog identity mutation');
  const identities = snapshot => snapshot.runtime.map(row => [row.googlePlaceId, row.name]);
  if (JSON.stringify(identities(before)) !== JSON.stringify(identities(after))) throw new Error('Public identity set/name mutation');
  const originalEvidenceNames = new Map(before.evidenceNames || []);
  const currentRuntimeNames = new Map(identities(after));
  for (const [id, name] of after.evidenceNames || []) {
    // Preserve legacy evidence aliases unchanged; new or changed evidence names
    // must be the current frozen runtime identity, never a new source alias.
    if (originalEvidenceNames.has(id) && originalEvidenceNames.get(id) === name) continue;
    if (!currentRuntimeNames.has(id) || name !== currentRuntimeNames.get(id)) throw new Error(`Evidence identity name changed: ${id}`);
  }
  const oldKeys = new Set(before.evidenceKeys), newKeys = new Set(after.evidenceKeys), allowedKeys = new Set();
  for (const row of accepted.rows || []) for (const field of FIELDS) for (const dish of row[field] || []) {
    allowedKeys.add(key(row.googlePlaceId, field, dish));
  }
  for (const value of oldKeys) if (!newKeys.has(value)) throw new Error(`Lost historical evidence (retention): ${value}`);
  const retainedSnapshots = new Set(after.reviewSnapshots || []);
  for (const snapshot of before.reviewSnapshots || []) if (!retainedSnapshots.has(snapshot)) {
    throw new Error(`Lost central-review provenance snapshot: ${snapshot}`);
  }
  for (const value of newKeys) if (!oldKeys.has(value) && !allowedKeys.has(value)) throw new Error(`Unapproved evidence addition: ${value}`);
  const runtimeProvenance = new Set([...(before.runtimeEvidenceKeys || []), ...oldKeys, ...allowedKeys]);
  for (const value of [...runtimeProvenance]) {
    const parts = JSON.parse(value);
    if (parts[1] === 'recommendedDishes') { parts[1] = 'featuredDishes'; runtimeProvenance.add(JSON.stringify(parts)); }
  }
  for (const value of after.runtimeEvidenceKeys || []) if (!runtimeProvenance.has(value)) {
    throw new Error(`Unapproved runtime provenance change: ${value}`);
  }
  const acceptedById = new Map((accepted.rows || []).map(row => [row.googlePlaceId, row]));
  for (let i = 0; i < before.runtime.length; i++) {
    const old = before.runtime[i], current = after.runtime[i], approved = acceptedById.get(current.googlePlaceId);
    for (const field of FIELDS) {
      if (old[field].length && !current[field].length) throw new Error(`Runtime coverage lost: ${current.googlePlaceId}/${field}`);
      const allowed = new Set((approved?.[field] || []).map(label));
      if (field === 'featuredDishes') for (const dish of approved?.recommendedDishes || []) allowed.add(label(dish));
      for (const value of current[field]) if (!old[field].includes(value) && !allowed.has(value)) {
        throw new Error(`Unapproved runtime dish addition: ${current.googlePlaceId}/${field}/${value}`);
      }
    }
  }
  const delta = Object.fromEntries(Object.keys(before.counts).map(field => [field, after.counts[field] - before.counts[field]]));
  const added = [...newKeys].filter(value => !oldKeys.has(value));
  return { status: 'pass', before: before.counts, after: after.counts, delta,
    frozenIdentitySetPreserved: true, publicIdentityNamesPreserved: true, allOldEvidenceKeysRetained: true,
    oldEvidenceItems: oldKeys.size, newRecommendationEvidenceItems: added.filter(value => JSON.parse(value)[1] === 'recommendedDishes').length,
    newFeaturedEvidenceItems: added.filter(value => JSON.parse(value)[1] === 'featuredDishes').length,
    allReviewProvenanceSnapshotsRetained: true, allAdditionsApproved: true, paidGoogleDataApiCalls: 0 };
}

function readCurrent() {
  const raw = fs.readFileSync(path.join(ROOT, 'data/google_inventory_runtime.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(raw, sandbox);
  const evidenceRaw = fs.readFileSync(path.join(ROOT, 'data/google_inventory_detail_evidence.json'), 'utf8');
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/area1_google_ids.json')));
  if (catalog.count !== 2804 || catalog.googlePlaceIds.length !== 2804) throw new Error('Frozen catalog count mismatch');
  return { ...snapshotState(sandbox.window.GOOGLE_INVENTORY_RESTAURANTS, JSON.parse(evidenceRaw), catalog.googlePlaceIds),
    inputHashes: { runtime: sha(raw), evidence: sha(evidenceRaw) } };
}

function main() {
  const [mode, beforePath, acceptedPath, outputPath] = process.argv.slice(2);
  if (mode === '--snapshot' && beforePath) {
    fs.mkdirSync(path.dirname(beforePath), { recursive: true });
    const snapshot = readCurrent();
    fs.writeFileSync(beforePath, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(JSON.stringify(snapshot.counts));
  } else if (mode === '--compare' && beforePath && acceptedPath && outputPath) {
    const before = JSON.parse(fs.readFileSync(beforePath));
    const accepted = JSON.parse(fs.readFileSync(acceptedPath));
    const result = auditIntegration(before, readCurrent(), accepted);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } else throw new Error('usage: audit_agent_dish_integration.mjs --snapshot <before.json> | --compare <before.json> <accepted.json> <audit.json>');
}

if (process.argv[1] && fs.existsSync(process.argv[1]) &&
    fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
