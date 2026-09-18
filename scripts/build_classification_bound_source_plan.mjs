#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildCompletionPlan } from './build_completion_plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const DEFAULT_SHARDS = 8;

const PROVIDER_PRIORITY = new Map([
  ['official', 500],
  ['Reviewed independent', 450],
  ['Hot Pepper', 400],
  ['Tabelog', 350],
  ['sourceWebsite', 300],
  ['runtime-bound', 200]
]);

function loadWindowFile(root, relative) {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
  return context.window;
}

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function normalizeFields(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));
}

function normalizeBoundUrl(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (/(^|\.)google\./u.test(host)
      || /googleusercontent\.com$/u.test(host)
      || /maps\.app\.goo\.gl$/u.test(host)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|mc_cid|mc_eid)$/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function sourceKind(provider, urlValue) {
  const providerText = clean(provider).toLowerCase();
  let host = '';
  try {
    host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    // URL already validated; keep a fail-closed fallback.
  }
  if (providerText === 'official' || providerText === 'reviewed independent') return 'official_or_reviewed_independent';
  if (/hot\s*pepper/u.test(providerText) || /hotpepper\.jp$/u.test(host)) return 'retained_third_party';
  if (/tabelog/u.test(providerText) || /tabelog\.com$/u.test(host)) return 'retained_third_party';
  return 'bound_runtime_source';
}

function providerRank(provider) {
  return PROVIDER_PRIORITY.get(clean(provider)) ?? 100;
}

function mergeSourceLink(target, incoming) {
  const fields = normalizeFields([...(target.fields || []), ...(incoming.fields || [])]);
  return {
    provider: target.provider !== 'runtime-bound' ? target.provider : incoming.provider,
    url: target.url,
    fields,
    checkedAt: [target.checkedAt, incoming.checkedAt].filter(Boolean).sort().at(-1) || null,
    sourceKind: target.sourceKind !== 'bound_runtime_source' ? target.sourceKind : incoming.sourceKind
  };
}

function explicitSourceLinks(runtimeRow, provenanceRow) {
  const byUrl = new Map();

  for (const link of provenanceRow?.sourceLinks || []) {
    const url = normalizeBoundUrl(link?.url);
    if (!url) continue;
    const item = {
      provider: clean(link?.provider) || 'runtime-bound',
      url,
      fields: normalizeFields(link?.fields),
      checkedAt: clean(link?.checkedAt) || null,
      sourceKind: sourceKind(link?.provider, url)
    };
    byUrl.set(url, byUrl.has(url) ? mergeSourceLink(byUrl.get(url), item) : item);
  }

  for (const raw of runtimeRow?.sourceWebsites || []) {
    const url = normalizeBoundUrl(raw);
    if (!url) continue;
    const existing = byUrl.get(url);
    const item = {
      provider: clean(runtimeRow?.sourceProvider) || 'runtime-bound',
      url,
      fields: [],
      checkedAt: clean(runtimeRow?.sourceCheckedAt) || null,
      sourceKind: sourceKind(runtimeRow?.sourceProvider, url)
    };
    byUrl.set(url, existing ? mergeSourceLink(existing, item) : item);
  }

  return [...byUrl.values()].sort((a, b) =>
    Number(b.fields.includes('cuisine')) - Number(a.fields.includes('cuisine'))
    || providerRank(b.provider) - providerRank(a.provider)
    || a.url.localeCompare(b.url, 'en'));
}

function stableSourceFingerprint(googlePlaceId, links, aggregateSourceUrlCount) {
  const stableLinks = links.map((link) => ({
    provider: link.provider,
    url: link.url,
    fields: link.fields,
    sourceKind: link.sourceKind
  }));
  const payload = {
    fingerprintVersion: 1,
    taskType: 'classification_entity_bound_source_review',
    googlePlaceId,
    stableLinks,
    aggregateSourceUrlCount: Number(aggregateSourceUrlCount || 0)
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function buildClassificationBoundSourcePlan(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const shardsRequested = Number(options.shards || process.env.CLASSIFICATION_BOUND_SHARDS || DEFAULT_SHARDS);
  const shards = Number.isInteger(shardsRequested) ? Math.max(1, Math.min(32, shardsRequested)) : DEFAULT_SHARDS;
  const now = options.now instanceof Date ? options.now : new Date(options.now || process.env.CLASSIFICATION_BOUND_NOW || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid classification bound-source plan time');

  const completion = buildCompletionPlan({ root, now });
  const targets = completion.classification.unresolvedEntityRows
    .filter((row) => row.nextStage === 'review_bound_classification_source');

  if (targets.length !== completion.summary.classification.boundSourceReviewRows) {
    throw new Error('Classification bound-source target count differs from completion summary');
  }

  const runtimeWindow = loadWindowFile(root, 'data/google_inventory_runtime.js');
  const provenanceWindow = loadWindowFile(root, 'data/source_provenance.js');
  const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
    ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
  const provenanceRows = Array.isArray(provenanceWindow.SOURCE_PROVENANCE?.rows)
    ? provenanceWindow.SOURCE_PROVENANCE.rows : [];
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
  const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));

  const rows = targets.map((target) => {
    const runtimeRow = runtimeById.get(target.googlePlaceId);
    if (!runtimeRow) throw new Error(`Bound-source target missing from public runtime: ${target.googlePlaceId}`);
    if (clean(runtimeRow.name) !== clean(target.name)) {
      throw new Error(`Catalog identity name drift for bound-source target: ${target.googlePlaceId}`);
    }

    const sourceLinks = explicitSourceLinks(runtimeRow, provenanceById.get(target.googlePlaceId));
    const reviewReady = sourceLinks.length > 0;
    const rowsWithCuisineClaim = sourceLinks.some((link) => link.fields.includes('cuisine'));

    return {
      taskType: 'classification_entity_bound_source_review',
      marker: 'CLASSIFICATION-ENTITY-BOUND',
      googlePlaceId: target.googlePlaceId,
      name: target.name,
      distanceMeters: target.distanceMeters,
      shard: fnv1a(target.googlePlaceId) % shards,
      sourceFingerprint: stableSourceFingerprint(target.googlePlaceId, sourceLinks, target.sourceUrlCount),
      completionSourceFingerprint: target.sourceFingerprint,
      reviewReady,
      sourceReferenceState: reviewReady ? 'explicit_bound_urls' : 'aggregate_count_without_explicit_url',
      sourceUrlCount: Number(target.sourceUrlCount || 0),
      sourceProviders: [...new Set(sourceLinks.map((link) => link.provider))].sort((a, b) => a.localeCompare(b, 'en')),
      sourceLinks,
      sourceLinkHasCuisineClaim: rowsWithCuisineClaim,
      networkRequired: reviewReady,
      newSourceDiscoveryRequired: false,
      sourceReferenceRepairRequired: !reviewReady,
      restaurantNameInferenceAllowed: false,
      requestedEvidence: 'Explicit branch-bound business/cuisine/category statement from an already-bound source; do not infer accepted classification from the restaurant name or menu dishes.',
      allowedStatuses: ['accepted_evidence', 'candidate', 'no_evidence', 'blocked']
    };
  }).sort((a, b) =>
    a.shard - b.shard
    || Number(b.sourceLinkHasCuisineClaim) - Number(a.sourceLinkHasCuisineClaim)
    || Number(b.reviewReady) - Number(a.reviewReady)
    || (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999)
    || a.googlePlaceId.localeCompare(b.googlePlaceId, 'en'));

  const ids = rows.map((row) => row.googlePlaceId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Place ID in classification bound-source plan');

  const providerCounts = {};
  let totalExplicitLinks = 0;
  let rowsWithOfficialOrReviewedIndependent = 0;
  let rowsWithThirdPartyOnly = 0;
  for (const row of rows) {
    totalExplicitLinks += row.sourceLinks.length;
    for (const provider of row.sourceProviders) providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    const kinds = new Set(row.sourceLinks.map((link) => link.sourceKind));
    if (kinds.has('official_or_reviewed_independent')) rowsWithOfficialOrReviewedIndependent += 1;
    else if (kinds.has('retained_third_party')) rowsWithThirdPartyOnly += 1;
  }

  const shardCounts = Array.from({ length: shards }, (_, shard) => ({
    shard,
    total: rows.filter((row) => row.shard === shard).length,
    reviewReady: rows.filter((row) => row.shard === shard && row.reviewReady).length,
    sourceReferenceRepairRequired: rows.filter((row) => row.shard === shard && row.sourceReferenceRepairRequired).length
  }));

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    mode: 'proposal-only-plan',
    marker: 'CLASSIFICATION-ENTITY-BOUND',
    policy: {
      frozenIdentityKey: 'googlePlaceId',
      catalogNameImmutable: true,
      workerCanonicalWrites: false,
      alreadyBoundSourcesOnly: true,
      newSourceDiscoveryAllowed: false,
      restaurantNameInferenceAllowed: false,
      menuDishInferenceAllowed: false,
      paidGoogleDataApiCalls: 0,
      acceptedRequiresExplicitCategoryEvidence: true,
      aggregateSourceCountWithoutUrlIsNotDiscovery: true
    },
    summary: {
      publicRuntimeTotal: completion.summary.runtimeRows,
      acceptedClassificationRows: completion.summary.classification.acceptedRows,
      unknownClassificationRows: completion.summary.classification.unknownRows,
      totalRows: rows.length,
      reviewReadyRows: rows.filter((row) => row.reviewReady).length,
      sourceReferenceRepairRows: rows.filter((row) => row.sourceReferenceRepairRequired).length,
      rowsWithCuisineClaimedLink: rows.filter((row) => row.sourceLinkHasCuisineClaim).length,
      rowsWithOfficialOrReviewedIndependent,
      rowsWithThirdPartyOnly,
      totalExplicitLinks,
      providerCounts: Object.fromEntries(Object.entries(providerCounts).sort((a, b) => a[0].localeCompare(b[0], 'en'))),
      shards,
      shardCounts
    },
    rows
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const output = process.argv[2] || null;
  const plan = buildClassificationBoundSourcePlan();
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(plan.summary));
}
