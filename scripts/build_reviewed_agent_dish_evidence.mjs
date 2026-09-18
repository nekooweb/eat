#!/usr/bin/env node
// Offline adapter only. It never fetches sources or writes canonical/runtime truth.
// A semantic reviewer approves immutable full-template files before this gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DISH_RULES, RECOMMENDATION_MARKER, normalizePlainText } from './recommended_dish_extractor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LANES = Object.freeze({
  'DISH-R-OFFICIAL': 'official_crawl',
  'DISH-R-RETAINED': 'retained_source_mining',
  'DISH-R-DISCOVERY': 'independent_source_discovery',
  'DISH-F-SOURCE': 'official_or_retained_featured'
});
const STATUS_FIELDS = Object.freeze({
  accepted_evidence: 'acceptedEvidenceRows', candidate: 'candidateRows', no_evidence: 'noEvidenceRows',
  blocked: 'blockedRows', skipped_already_complete: 'skippedAlreadyCompleteRows'
});
const PROVIDERS = new Map([
  ['official', 'sourceWebsite'], ['official_web', 'sourceWebsite'], ['sourceWebsite', 'sourceWebsite'],
  ['tabelog', 'Tabelog'], ['Tabelog', 'Tabelog'], ['hotpepper', 'Hot Pepper'], ['Hot Pepper', 'Hot Pepper'],
  ['Reviewed independent', 'Reviewed independent'],
  ["Let's Enjoy Tokyo", 'Reviewed independent'],
  ['Kanda Curry Grand Prix', 'Reviewed independent']
]);
// Explicit equivalents in the assignment contract supplement the shared extractor.
const EQUIVALENT_SEMANTICS = /定番|ご好評|自信作|自信の一品|一番の売り商品|一押し|お勧め|お薦め|おススメ|一番のおすすめ|代名詞|必ず.{0,16}オーダー|オーダーしたい逸品/i;
const HOLD_NAMES = new Set(['えびず焼き', 'ソルベージュ®エスプレッソ']);
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;

function required(value, label) {
  if (typeof value !== 'string' || !value.trim() || /^(?:none|null|undefined)$/i.test(value.trim())) {
    throw new Error(`Missing/invalid ${label}`);
  }
  return value.trim();
}
function validDate(value, label) {
  const date = required(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${label}`);
  return date;
}
function sourceUrl(value) {
  let url;
  try { url = new URL(required(value, 'source URL')); } catch { throw new Error('Invalid source URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      /(^|\.)(?:googleapis\.com|google\.com|google\.co\.jp|gstatic\.com)$/.test(url.hostname)) {
    throw new Error('Invalid or Google data source URL');
  }
  if (/\/(?:dtlrvwlst|rvw|reviews?)(?:\/|$)/i.test(url.pathname)) throw new Error('Customer review is not menu evidence');
  return value;
}
function semantics(value) { return RECOMMENDATION_MARKER.test(value) || EQUIVALENT_SEMANTICS.test(value); }
function chineseLabel(value) {
  return typeof value === 'string' && value.length <= 24 && /[\u3400-\u9fff]/u.test(value) &&
    !/[\u3040-\u30ff]/u.test(value) && !/约|大概|菜品待定|推荐菜|特色菜/.test(value);
}
function checkPolicy(doc) {
  const policy = doc.policyAttestation;
  if (policy?.paidGoogleDataApiCalls !== 0) throw new Error('Zero paid API policy attestation required');
  for (const key of ['canonicalMasterEditedDirectly', 'proximityOnlyIdentityBindingUsed',
    'recommendationWithoutExplicitSemanticsAdded', 'accessRestrictionBypassUsed']) {
    if (policy[key] !== false) throw new Error(`Unsafe/missing policy attestation: ${key}`);
  }
}

export function auditReviewCoverage(assignments, documents, { sourceQueueCommit } = {}) {
  const expectedQueueCommit = sourceQueueCommit || documents[0]?.document.sourceQueueCommit;
  const expected = new Map();
  for (const row of assignments) {
    if (!Object.values(LANES).includes(row.lane)) throw new Error('Assignment outside Official/Retained scope');
    if (expected.has(row.googlePlaceId)) throw new Error('Duplicate assignment Place ID');
    expected.set(row.googlePlaceId, row);
  }
  const seen = new Set();
  const counts = Object.fromEntries(Object.keys(STATUS_FIELDS).map(key => [key, 0]));
  const byMarker = Object.fromEntries(Object.keys(LANES).map(marker => [marker, { assignedRows: 0, reviewedRows: 0 }]));
  for (const row of assignments) byMarker[Object.keys(LANES).find(marker => LANES[marker] === row.lane)].assignedRows++;
  for (const { document: doc } of documents) {
    if (!LANES[doc.marker] || !/^S[0-7]$/.test(doc.shard || '')) throw new Error('Invalid marker/shard');
    checkPolicy(doc);
    if (doc.sourceQueue !== 'data/dish_batch_plan.json' || !/^[0-9a-f]{40}$/.test(doc.sourceQueueCommit || '')) {
      throw new Error('Missing source queue provenance');
    }
    if (doc.sourceQueueCommit !== expectedQueueCommit) throw new Error('Review source queue commit differs from the approved assignment provenance');
    if (!Array.isArray(doc.records)) throw new Error('Full-template records required');
    const shardRows = assignments.filter(row => row.lane === LANES[doc.marker] && row.shard === Number(doc.shard.slice(1)));
    const local = Object.fromEntries(Object.values(STATUS_FIELDS).map(key => [key, 0]));
    for (const record of doc.records) {
      const assignment = expected.get(record.googlePlaceId);
      if (!assignment || assignment.lane !== LANES[doc.marker] || assignment.shard !== Number(doc.shard.slice(1))) {
        throw new Error(`Outside exact assignment/shard: ${record.googlePlaceId}`);
      }
      if (seen.has(record.googlePlaceId)) throw new Error(`Duplicate logical review: ${record.googlePlaceId}`);
      seen.add(record.googlePlaceId);
      if (!STATUS_FIELDS[record.status]) throw new Error(`Invalid terminal status: ${record.status}`);
      required(record.restaurantName, 'catalog identity name');
      if (record.restaurantName !== assignment.name) throw new Error(`Catalog identity name changed: ${record.googlePlaceId}`);
      const assignmentFingerprint = String(assignment.sourceFingerprint || '').trim();
      if (assignmentFingerprint) {
        if (Number(assignment.fingerprintVersion) !== 1 || !SOURCE_FINGERPRINT.test(assignmentFingerprint)) {
          throw new Error(`Invalid assignment source fingerprint: ${record.googlePlaceId}`);
        }
        if (Number(record.fingerprintVersion) !== Number(assignment.fingerprintVersion)
            || record.sourceFingerprint !== assignmentFingerprint) {
          throw new Error(`Review source fingerprint differs from assignment: ${record.googlePlaceId}`);
        }
      }
      counts[record.status]++;
      local[STATUS_FIELDS[record.status]]++;
      byMarker[doc.marker].reviewedRows++;
      if (record.status !== 'accepted_evidence' && !record.notes && !record.blocker) {
        throw new Error(`Terminal outcome has no reason: ${record.googlePlaceId}`);
      }
    }
    const summary = { assignedRows: shardRows.length, reviewedRows: doc.records.length, ...local };
    for (const [key, value] of Object.entries(summary)) {
      if (doc.summary?.[key] !== value) throw new Error(`Summary mismatch ${doc.marker}/${doc.shard}/${key}`);
    }
  }
  const missing = [...expected.keys()].filter(id => !seen.has(id));
  if (missing.length) throw new Error(`Missing logical reviews: ${missing.join(', ')}`);
  return { assignedRows: expected.size, reviewedRows: seen.size, byMarker, statusCounts: counts };
}

export function translateExactDish(raw, translations = {}) {
  const native = normalizePlainText(raw);
  if (HOLD_NAMES.has(native)) return null;
  if (Object.hasOwn(translations, native)) {
    const entry = translations[native];
    if (!entry || !chineseLabel(entry.nameZh) || !entry.rationale) throw new Error(`Invalid reviewed translation: ${native}`);
    return { nameZh: entry.nameZh, rule: 'reviewed-exact-source-native-translation' };
  }
  // Existing broad substring rules are useful to discovery, but cannot safely
  // erase modifiers from a manually reviewed concrete dish at this adapter.
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = native.match(pattern);
    if (match?.index === 0 && match[0].length === native.length && chineseLabel(nameZh)) {
      return { nameZh, rule: `exact:${pattern.source}` };
    }
  }
  return null;
}

export function buildReviewedEvidence({ documents, assignments, catalogNames, translations = {}, checkedAt, sourceQueueCommit }) {
  validDate(checkedAt, 'adapter date');
  const coverage = auditReviewCoverage(assignments, documents, { sourceQueueCommit });
  const rows = [];
  const pending = [];
  let acceptedRItems = 0, acceptedFItems = 0;
  const restaurantsR = new Set(), restaurantsF = new Set(), distinctR = new Set(), distinctF = new Set();
  for (const { path: proposalPath, document: doc } of documents) for (const record of doc.records) {
    if (catalogNames.get(record.googlePlaceId) !== record.restaurantName) throw new Error('Current catalog identity name mismatch');
    if (record.status !== 'accepted_evidence') continue;
    if (record.identity?.state !== 'verified' || !record.identity.evidence?.length) throw new Error('Exact branch identity evidence required');
    for (const identity of record.identity.evidence) {
      sourceUrl(identity.sourceUrl);
      validDate(identity.checkedAt, 'identity check date');
      required(identity.note, 'identity evidence note');
    }
    const canonical = { googlePlaceId: record.googlePlaceId, name: record.restaurantName,
      recommendedDishes: [], featuredDishes: [] };
    const seen = new Set();
    for (const dish of record.dishProposals || []) {
      if (dish.classification === 'C') continue;
      if (!['R', 'F'].includes(dish.classification) || dish.targetField !==
          (dish.classification === 'R' ? 'recommendedDishes' : 'featuredDishes')) throw new Error('Classification/target field disagreement');
      const native = required(dish.nameOriginal, 'source-native dish name');
      const text = required(dish.evidenceText, 'source-native evidence text');
      const compact = value => normalizePlainText(value).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
      if (!compact(text).includes(compact(native))) throw new Error(`Source-native dish name is absent from evidence: ${native}`);
      if (/customer|consumer|user.review|review.prose/i.test([dish.evidenceClass, dish.sourceOrigin, dish.sourceKind].join(' '))) {
        throw new Error('Customer review contamination is not menu evidence');
      }
      sourceUrl(dish.sourceUrl);
      const date = validDate(dish.checkedAt, 'dish check date');
      if (date > checkedAt) throw new Error('Dish evidence check date is in the future');
      if (dish.sourceScope !== 'branch') throw new Error('Dish source scope is not exact branch');
      if (!['high', 'medium'].includes(dish.confidence)) throw new Error('Dish confidence must pass central review');
      const provider = PROVIDERS.get(dish.provider);
      if (!provider) throw new Error(`Unsupported provider: ${dish.provider}`);
      const host = new URL(dish.sourceUrl).hostname;
      if (provider === 'Tabelog' && !/(^|\.)tabelog\.com$/.test(host)) throw new Error('Tabelog provider URL mismatch');
      if (provider === 'Hot Pepper' && !/(^|\.)hotpepper\.jp$/.test(host)) throw new Error('Hot Pepper provider URL mismatch');
      if (dish.classification === 'R' && (!semantics(dish.recommendationSemantics || '') || !semantics(text))) {
        throw new Error(`Missing dish-level recommendation semantics: ${native}`);
      }
      const nativeKey = JSON.stringify([dish.classification, native, provider, dish.sourceUrl]);
      if (seen.has(nativeKey)) continue;
      seen.add(nativeKey);
      const logicalDish = JSON.stringify([record.googlePlaceId, normalizePlainText(native).normalize('NFKC')]);
      if (dish.classification === 'R') { acceptedRItems++; restaurantsR.add(record.googlePlaceId); distinctR.add(logicalDish); }
      else { acceptedFItems++; restaurantsF.add(record.googlePlaceId); distinctF.add(logicalDish); }
      const provenance = {
        proposalPath, marker: doc.marker, shard: doc.shard,
        sourceQueueCommit: doc.sourceQueueCommit, identity: record.identity, dishProposal: dish,
        ...(record.sourceFingerprint ? {
          fingerprintVersion: Number(record.fingerprintVersion),
          sourceFingerprint: record.sourceFingerprint
        } : {})
      };
      const translated = translateExactDish(native, translations);
      if (!translated) {
        pending.push({ googlePlaceId: record.googlePlaceId, restaurantName: record.restaurantName,
          status: 'needs_exact_zh_normalization', reason: 'Source-backed evidence retained; no exact safe Chinese normalization.', ...provenance });
        continue;
      }
      const evidenceClass = dish.classification === 'R' ? 'source_recommendation_text' :
        provider === 'Tabelog' ? 'tabelog_menu_text' : provider === 'Hot Pepper' ? 'hotpepper_menu_text' :
        provider === 'sourceWebsite' ? 'source_menu_text' : 'retained_source_menu_item';
      const item = { nameZh: translated.nameZh, nameJa: native, provider, sourceUrl: dish.sourceUrl,
        checkedAt: date, evidenceClass, evidenceRule: `central-reviewed:${dish.classification}:${translated.rule}`,
        evidenceSnippet: text.slice(0, 90), reviewedSourceEvidence: [provenance] };
      const existing = canonical[dish.targetField].find(old => old.nameZh === item.nameZh &&
        old.provider === provider && old.sourceUrl === item.sourceUrl && old.evidenceClass === evidenceClass);
      if (existing) existing.reviewedSourceEvidence.push(provenance);
      else canonical[dish.targetField].push(item);
    }
    if (!seen.size) throw new Error(`Accepted row contains no R/F evidence: ${record.googlePlaceId}`);
    if (canonical.recommendedDishes.length || canonical.featuredDishes.length) rows.push(canonical);
  }
  rows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const summary = { ...coverage, acceptedRItems, acceptedFItems, acceptedRRestaurants: restaurantsR.size,
    acceptedRDistinctDishes: distinctR.size, acceptedFDistinctDishes: distinctF.size,
    acceptedFOnlyRestaurants: [...restaurantsF].filter(id => !restaurantsR.has(id)).length,
    emittedRItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    emittedFItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0), translationPendingItems: pending.length };
  return {
    coverage: summary,
    evidence: { schemaVersion: 4, checkedAt, policy: { paidGoogleDataApiCalls: 0, networkRequests: 0,
      source: 'digest-approved full-template agent reviews', cuisineNameBrandInferenceAllowed: false,
      fullSourceEvidenceRetained: true, evidenceStorageItemLimit: null }, summary, rows },
    pending: { schemaVersion: 1, checkedAt, policy: { paidGoogleDataApiCalls: 0, networkRequests: 0,
      existingTranslationHoldsModified: false }, rows: pending }
  };
}

function main() {
  const [manifestPath, outputPath, pendingPath, auditPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath || !pendingPath || !auditPath) throw new Error(
    'usage: build_reviewed_agent_dish_evidence.mjs <approved-manifest.json> <evidence-output.json> <pending-output.json> <audit-output.json>');
  for (const output of [outputPath, pendingPath, auditPath]) {
    if (!path.resolve(output).startsWith(path.join(ROOT, '_audit') + path.sep)) {
      throw new Error('Adapter outputs must stay under _audit; canonical integration uses the maintained merge');
    }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.approvalState !== 'approved' || !manifest.reviewer || !manifest.reviewedFiles?.length) {
    throw new Error('Explicit central approval manifest required');
  }
  const documents = manifest.reviewedFiles.map(ref => {
    const input = path.resolve(ROOT, ref.path);
    if (!input.startsWith(path.join(ROOT, 'data', 'agent_reviews') + path.sep)) throw new Error('Review path outside allowed directory');
    const raw = fs.readFileSync(input);
    if (crypto.createHash('sha256').update(raw).digest('hex') !== ref.sha256) throw new Error(`Review digest changed: ${ref.path}`);
    return { path: ref.path, document: JSON.parse(raw) };
  });
  const currentQueue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/google_inventory_detail_queue.json')));
  const currentPlan = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dish_batch_plan.json')));
  const assignments = manifest.assignmentSnapshot.rows;
  if (!/^[0-9a-f]{40}$/.test(manifest.assignmentSnapshot.sourceQueueCommit || '')) throw new Error('Explicit assignment queue commit provenance required');
  const expected = new Map(assignments.map(row => [row.googlePlaceId, row]));
  const selectedScopes = new Set(documents.map(({ document }) => `${LANES[document.marker]}:${Number(document.shard.slice(1))}`));
  const currentRows = currentPlan.rows.filter(row => selectedScopes.has(`${row.lane}:${row.shard}`));
  for (const row of currentRows) {
    const original = expected.get(row.googlePlaceId);
    if (!original || original.lane !== row.lane || original.shard !== row.shard) {
      throw new Error(`Current assignment moved or is unreviewed: ${row.googlePlaceId}`);
    }
  }
  const queueById = new Map(currentQueue.rows.map(row => [row.googlePlaceId, row]));
  const currentIds = new Set(currentRows.map(row => row.googlePlaceId));
  for (const original of assignments) if (!currentIds.has(original.googlePlaceId)) {
    const current = queueById.get(original.googlePlaceId);
    if (!current || !(current.recommendedDishesKnown > 0 || current.nextAction === 'dish_complete')) {
      throw new Error(`Assignment disappeared without canonical completion: ${original.googlePlaceId}`);
    }
  }
  const result = buildReviewedEvidence({ documents, assignments,
    catalogNames: new Map(currentQueue.rows.map(row => [row.googlePlaceId, row.name])),
    translations: manifest.translations || {}, checkedAt: manifest.reviewedAt,
    sourceQueueCommit: manifest.assignmentSnapshot.sourceQueueCommit });
  result.coverage.currentAssignmentRows = currentRows.length;
  result.coverage.currentReviewedRows = currentRows.length;
  result.coverage.completedAssignmentsRemovedByRebuild = assignments.length - currentRows.length;
  for (const [output, payload] of [[outputPath, result.evidence], [pendingPath, result.pending], [auditPath, result.coverage]]) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
  }
  console.log(JSON.stringify(result.coverage));
}

if (process.argv[1] && fs.existsSync(process.argv[1]) &&
    fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
