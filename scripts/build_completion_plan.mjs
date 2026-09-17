#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { isPriceRange } from './price_resolver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const GENERIC_CLASSIFICATION_VALUES = new Set(['', '餐厅', 'restaurant', 'その他グルメ']);
const PROVIDER_PRIORITY = new Map([
  ['official', 400],
  ['Tabelog', 300],
  ['Hot Pepper', 200]
]);

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function readJson(root, relative, fallback = {}) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function loadWindowScript(root, relative, windowObject) {
  const context = { window: windowObject };
  vm.createContext(context);
  vm.runInContext(read(root, relative), context, { filename: relative });
  return context.window;
}

function fingerprint(payload) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))].sort();
}

function providerRank(provider) {
  return PROVIDER_PRIORITY.get(provider) ?? 100;
}

function sourceValues(row) {
  const out = [];
  if (row?.cuisine != null) out.push(row.cuisine);
  if (Array.isArray(row?.tags)) out.push(...row.tags);
  return out.map((value) => String(value).normalize('NFKC').trim()).filter(Boolean);
}

function isGenericClassificationValue(taxonomy, value) {
  return GENERIC_CLASSIFICATION_VALUES.has(taxonomy.normalizeSourceValue(value));
}

function hasUnmappedClassificationValue(taxonomy, row) {
  return sourceValues(row)
    .filter((value) => !isGenericClassificationValue(taxonomy, value))
    .some((value) => !taxonomy.resolveConceptToken(value));
}

function directConcepts(taxonomy, row) {
  const result = taxonomy.classifyRestaurant(row || {});
  return new Set(result.directIds || []);
}

function rowsByPlaceId(rows, valueField) {
  return new Map((rows || [])
    .filter((row) => row?.googlePlaceId)
    .map((row) => [row.googlePlaceId, valueField ? row[valueField] : row]));
}

function sourceFactsByPlaceId(sourceFactRows) {
  return new Map((sourceFactRows || []).map((row) => [row.googlePlaceId, row.sourceFacts || []]));
}

function loadMaintainedInputs(root) {
  const windowObject = {};
  const publicRuntimePath = path.join(root, 'data/google_inventory_runtime.js');
  let runtimeSource = 'data/production_area1.js';

  if (fs.existsSync(publicRuntimePath) && fs.statSync(publicRuntimePath).size > 0) {
    loadWindowScript(root, 'data/google_inventory_runtime.js', windowObject);
    if (Array.isArray(windowObject.GOOGLE_INVENTORY_RESTAURANTS)
      && windowObject.GOOGLE_INVENTORY_RESTAURANTS.length) {
      runtimeSource = 'data/google_inventory_runtime.js';
    }
  }

  if (runtimeSource !== 'data/google_inventory_runtime.js') {
    loadWindowScript(root, 'data/production_area1.js', windowObject);
  }

  loadWindowScript(root, 'classification.js', windowObject);
  loadWindowScript(root, 'data/source_facts.js', windowObject);
  loadWindowScript(root, 'data/source_provenance.js', windowObject);

  const detailQueue = readJson(root, 'data/google_inventory_detail_queue.json', { rows: [] });
  const rows = runtimeSource === 'data/google_inventory_runtime.js'
    ? windowObject.GOOGLE_INVENTORY_RESTAURANTS
    : windowObject.PRODUCTION_RESTAURANTS;

  return {
    rows: Array.isArray(rows) ? rows : [],
    runtimeStats: windowObject.GOOGLE_INVENTORY_STATS || null,
    taxonomy: windowObject.EAT_CLASSIFICATION || null,
    sourceFactRows: Array.isArray(windowObject.SOURCE_FACTS?.rows) ? windowObject.SOURCE_FACTS.rows : [],
    provenanceRows: Array.isArray(windowObject.SOURCE_PROVENANCE?.rows) ? windowObject.SOURCE_PROVENANCE.rows : [],
    detailRows: Array.isArray(detailQueue.rows) ? detailQueue.rows : [],
    runtimeSource
  };
}

function sourceContext(googlePlaceId, detailById, provenanceById) {
  const detail = detailById.get(googlePlaceId) || {};
  const provenance = provenanceById.get(googlePlaceId) || {};
  const sourceLinks = Array.isArray(provenance.sourceLinks) ? provenance.sourceLinks : [];
  const providers = uniqueSorted(sourceLinks.map((link) => link.provider));
  const claimedFields = uniqueSorted(sourceLinks.flatMap((link) => Array.isArray(link.fields) ? link.fields : []));
  const sourceUrlCount = Math.max(Number(detail.sourceUrlCount || 0), sourceLinks.length);
  return {
    sourceUrlCount,
    crawlableOfficialUrlCount: Number(detail.crawlableOfficialUrlCount || 0),
    retainedThirdPartyUrlCount: Number(detail.retainedThirdPartyUrlCount || 0),
    providers,
    claimedFields,
    sourceLastCheckedAt: provenance.sourceLastCheckedAt || null
  };
}

function buildTokenInventory({ rows, factsById, taxonomy }) {
  const runtimeAccepted = new Map(rows.map((row) => [row.googlePlaceId, directConcepts(taxonomy, row).size > 0]));
  const groups = new Map();

  function add(value, googlePlaceId, origin, provider = null) {
    if (isGenericClassificationValue(taxonomy, value)) return;
    if (taxonomy.resolveConceptToken(value)) return;
    const normalizedToken = taxonomy.normalizeSourceValue(value);
    if (!normalizedToken) return;
    if (!groups.has(normalizedToken)) {
      groups.set(normalizedToken, {
        normalizedToken,
        rawVariants: new Set(),
        runtimePlaceIds: new Set(),
        sourceFactPlaceIds: new Set(),
        unknownPlaceIds: new Set(),
        providerCounts: new Map()
      });
    }
    const group = groups.get(normalizedToken);
    group.rawVariants.add(String(value).normalize('NFKC').trim());
    if (origin === 'runtime') group.runtimePlaceIds.add(googlePlaceId);
    else group.sourceFactPlaceIds.add(googlePlaceId);
    if (!runtimeAccepted.get(googlePlaceId)) group.unknownPlaceIds.add(googlePlaceId);
    if (provider) group.providerCounts.set(provider, (group.providerCounts.get(provider) || 0) + 1);
  }

  for (const row of rows) {
    for (const value of sourceValues(row)) add(value, row.googlePlaceId, 'runtime');
    for (const fact of factsById.get(row.googlePlaceId) || []) {
      for (const value of sourceValues(fact)) add(value, row.googlePlaceId, 'source_fact', fact.provider || null);
    }
  }

  return [...groups.values()].map((group) => {
    const affected = uniqueSorted([...group.runtimePlaceIds, ...group.sourceFactPlaceIds]);
    const rawVariants = uniqueSorted([...group.rawVariants]);
    const providerCounts = Object.fromEntries([...group.providerCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    return {
      taskType: 'classification_taxonomy_token',
      normalizedToken: group.normalizedToken,
      rawVariants,
      runtimeRestaurantCount: group.runtimePlaceIds.size,
      sourceFactRestaurantCount: group.sourceFactPlaceIds.size,
      affectedRestaurantCount: affected.length,
      unknownRestaurantCount: group.unknownPlaceIds.size,
      providerCounts,
      samplePlaceIds: affected.slice(0, 10),
      networkRequired: false,
      newSourceDiscoveryRequired: false,
      sourceFingerprint: fingerprint({
        normalizedToken: group.normalizedToken,
        rawVariants,
        affected,
        providerCounts
      })
    };
  }).sort((a, b) =>
    b.unknownRestaurantCount - a.unknownRestaurantCount
    || b.affectedRestaurantCount - a.affectedRestaurantCount
    || a.normalizedToken.localeCompare(b.normalizedToken, 'ja'));
}

function buildClassificationEntityTasks({ rows, factsById, taxonomy, detailById, provenanceById }) {
  const conceptById = new Map(taxonomy.concepts.map((concept) => [concept.id, concept]));
  const retainedRecoveries = [];
  const unresolved = [];

  for (const row of rows) {
    if (directConcepts(taxonomy, row).size) continue;
    const facts = factsById.get(row.googlePlaceId) || [];
    const context = sourceContext(row.googlePlaceId, detailById, provenanceById);
    const evidence = [];
    const conceptIds = new Set();
    const hasUnmappedRuntimeToken = hasUnmappedClassificationValue(taxonomy, row);
    let hasUnmappedClassificationFact = false;

    for (const fact of facts) {
      const direct = directConcepts(taxonomy, fact);
      for (const id of direct) conceptIds.add(id);
      if (hasUnmappedClassificationValue(taxonomy, fact)) hasUnmappedClassificationFact = true;
      if (direct.size) {
        evidence.push({
          provider: fact.provider || 'unknown',
          checkedAt: fact.checkedAt || null,
          conceptIds: [...direct].sort(),
          sourceValues: uniqueSorted(sourceValues(fact).filter((value) => !isGenericClassificationValue(taxonomy, value)))
        });
      }
    }

    if (conceptIds.size) {
      const providers = uniqueSorted(evidence.map((item) => item.provider));
      const candidateConceptIds = [...conceptIds].sort();
      retainedRecoveries.push({
        taskType: 'classification_entity_review',
        evidenceOrigin: 'retained_source_fact_exact_taxonomy',
        googlePlaceId: row.googlePlaceId,
        name: row.name,
        distanceMeters: row.distanceMeters,
        candidateConceptIds,
        candidateLabels: candidateConceptIds.map((id) => conceptById.get(id)?.label).filter(Boolean),
        providers,
        networkRequired: false,
        newSourceDiscoveryRequired: false,
        sourceFingerprint: fingerprint(evidence.sort((a, b) =>
          providerRank(b.provider) - providerRank(a.provider)
          || String(b.checkedAt || '').localeCompare(String(a.checkedAt || ''))))
      });
      continue;
    }

    const taxonomyTokenMayResolve = hasUnmappedRuntimeToken || hasUnmappedClassificationFact;
    const nextStage = taxonomyTokenMayResolve
      ? 'classification_taxonomy_token_review'
      : context.sourceUrlCount > 0
        ? 'review_bound_classification_source'
        : 'generate_name_keyword_candidate';

    unresolved.push({
      taskType: 'classification_entity_review',
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      retainedSourceFactCount: facts.length,
      ...context,
      hasUnmappedRuntimeToken,
      hasUnmappedClassificationFact,
      taxonomyTokenMayResolve,
      nextStage,
      networkRequired: nextStage === 'review_bound_classification_source',
      newSourceDiscoveryRequired: false,
      sourceFingerprint: fingerprint({
        facts: (facts || []).map((fact) => ({
          provider: fact.provider || 'unknown',
          checkedAt: fact.checkedAt || null,
          cuisine: fact.cuisine || null,
          tags: Array.isArray(fact.tags) ? [...fact.tags].sort() : []
        })).sort((a, b) => a.provider.localeCompare(b.provider)),
        context
      })
    });
  }

  retainedRecoveries.sort((a, b) => a.distanceMeters - b.distanceMeters || a.googlePlaceId.localeCompare(b.googlePlaceId));
  unresolved.sort((a, b) =>
    Number(b.taxonomyTokenMayResolve) - Number(a.taxonomyTokenMayResolve)
    || Number(b.sourceUrlCount > 0) - Number(a.sourceUrlCount > 0)
    || a.distanceMeters - b.distanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId));

  return { retainedRecoveries, unresolved };
}

function buildHoursTasks({ rows, factsById, detailById, provenanceById }) {
  const retainedReview = [];
  const boundSourceReview = [];
  const discovery = [];

  for (const row of rows) {
    if (typeof row.hoursReference === 'string' && row.hoursReference.trim()) continue;
    const facts = factsById.get(row.googlePlaceId) || [];
    const context = sourceContext(row.googlePlaceId, detailById, provenanceById);
    const rawFacts = facts
      .filter((fact) => typeof fact?.openingHoursRaw === 'string' && fact.openingHoursRaw.trim())
      .map((fact) => ({
        provider: fact.provider || 'unknown',
        checkedAt: fact.checkedAt || null,
        openingHoursRaw: String(fact.openingHoursRaw).normalize('NFKC').trim(),
        closedDays: Array.isArray(fact.closedDays) ? [...fact.closedDays] : [],
        closedNote: fact.closedNote || null
      }))
      .sort((a, b) => providerRank(b.provider) - providerRank(a.provider)
        || String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));

    const common = {
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      ...context
    };

    if (rawFacts.length) {
      retainedReview.push({
        taskType: 'review_retained_hours_gap',
        ...common,
        retainedRawFactCount: rawFacts.length,
        candidateProviders: uniqueSorted(rawFacts.map((fact) => fact.provider)),
        networkRequired: false,
        newSourceDiscoveryRequired: false,
        reason: 'public materializer left this row without hoursReference despite retained raw hours; review conflict/unparseable/semantic state before any new fetch',
        sourceFingerprint: fingerprint({ rawFacts, context })
      });
    } else if (context.sourceUrlCount > 0) {
      boundSourceReview.push({
        taskType: 'review_bound_hours_source',
        ...common,
        networkRequired: true,
        newSourceDiscoveryRequired: false,
        reason: 'existing bound source URLs should be checked before searching for a new source',
        sourceFingerprint: fingerprint(context)
      });
    } else {
      discovery.push({
        taskType: 'discover_hours_source',
        ...common,
        networkRequired: true,
        newSourceDiscoveryRequired: true,
        reason: 'no retained raw hours or currently bound source URL is available in the maintained plan inputs',
        sourceFingerprint: fingerprint(context)
      });
    }
  }

  const sortRows = (a, b) => a.distanceMeters - b.distanceMeters || a.googlePlaceId.localeCompare(b.googlePlaceId);
  retainedReview.sort(sortRows);
  boundSourceReview.sort(sortRows);
  discovery.sort(sortRows);
  return { retainedReview, boundSourceReview, discovery };
}

function buildBudgetTasks({ rows, factsById, detailById, provenanceById, meal }) {
  const retainedRecoveries = [];
  const boundSourceReview = [];
  const discovery = [];

  for (const row of rows) {
    if (isPriceRange(row[meal])) continue;
    const facts = factsById.get(row.googlePlaceId) || [];
    const context = sourceContext(row.googlePlaceId, detailById, provenanceById);
    const candidates = facts
      .filter((fact) => isPriceRange(fact[meal]))
      .map((fact) => ({
        provider: fact.provider || 'unknown',
        checkedAt: fact.checkedAt || null,
        value: [...fact[meal]],
        priceEvidenceClasses: uniqueSorted(Array.isArray(fact.priceEvidenceClasses) ? fact.priceEvidenceClasses : [])
      }))
      .sort((a, b) => providerRank(b.provider) - providerRank(a.provider)
        || String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));

    const common = {
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      meal,
      ...context
    };

    if (candidates.length) {
      const distinctRanges = uniqueSorted(candidates.map((candidate) => JSON.stringify(candidate.value)));
      retainedRecoveries.push({
        taskType: `recover_retained_${meal}_budget`,
        ...common,
        candidateProviders: uniqueSorted(candidates.map((candidate) => candidate.provider)),
        candidateRanges: distinctRanges.map((value) => JSON.parse(value)),
        conflictingRetainedRanges: distinctRanges.length > 1,
        networkRequired: false,
        newSourceDiscoveryRequired: false,
        sourceFingerprint: fingerprint({ candidates, context })
      });
    } else if (context.sourceUrlCount > 0) {
      boundSourceReview.push({
        taskType: `review_bound_${meal}_budget_source`,
        ...common,
        networkRequired: true,
        newSourceDiscoveryRequired: false,
        sourceFingerprint: fingerprint(context)
      });
    } else {
      discovery.push({
        taskType: `discover_${meal}_budget_source`,
        ...common,
        networkRequired: true,
        newSourceDiscoveryRequired: true,
        sourceFingerprint: fingerprint(context)
      });
    }
  }

  const sortRows = (a, b) =>
    Number(a.conflictingRetainedRanges || false) - Number(b.conflictingRetainedRanges || false)
    || a.distanceMeters - b.distanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId);
  retainedRecoveries.sort(sortRows);
  boundSourceReview.sort(sortRows);
  discovery.sort(sortRows);
  return { retainedRecoveries, boundSourceReview, discovery };
}

function assertUniqueIds(rows, label) {
  const ids = rows.map((row) => row.googlePlaceId).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate googlePlaceId in ${label}`);
}

export function buildCompletionPlan(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const now = options.now instanceof Date ? options.now : new Date(options.now || process.env.COMPLETION_PLAN_NOW || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid completion-plan time');

  const {
    rows,
    runtimeStats,
    taxonomy,
    sourceFactRows,
    provenanceRows,
    detailRows,
    runtimeSource
  } = loadMaintainedInputs(root);
  if (!rows.length) throw new Error('Missing public runtime rows');
  if (!taxonomy) throw new Error('Missing EAT_CLASSIFICATION');

  const factsById = sourceFactsByPlaceId(sourceFactRows);
  const detailById = rowsByPlaceId(detailRows);
  const provenanceById = rowsByPlaceId(provenanceRows);
  const acceptedRows = rows.filter((row) => directConcepts(taxonomy, row).size > 0).length;
  const taxonomyTasks = buildTokenInventory({ rows, factsById, taxonomy });
  const classificationEntities = buildClassificationEntityTasks({ rows, factsById, taxonomy, detailById, provenanceById });
  const hours = buildHoursTasks({ rows, factsById, detailById, provenanceById });
  const lunch = buildBudgetTasks({ rows, factsById, detailById, provenanceById, meal: 'lunch' });
  const dinner = buildBudgetTasks({ rows, factsById, detailById, provenanceById, meal: 'dinner' });

  for (const [label, list] of [
    ['classification retained recoveries', classificationEntities.retainedRecoveries],
    ['classification unresolved', classificationEntities.unresolved],
    ['hours retained review', hours.retainedReview],
    ['hours bound-source review', hours.boundSourceReview],
    ['hours discovery', hours.discovery],
    ['lunch retained recoveries', lunch.retainedRecoveries],
    ['lunch bound-source review', lunch.boundSourceReview],
    ['lunch discovery', lunch.discovery],
    ['dinner retained recoveries', dinner.retainedRecoveries],
    ['dinner bound-source review', dinner.boundSourceReview],
    ['dinner discovery', dinner.discovery]
  ]) assertUniqueIds(list, label);

  const publicHoursKnown = rows.filter((row) => typeof row.hoursReference === 'string' && row.hoursReference.trim()).length;

  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    mode: 'report-only',
    runtimeSource,
    policy: {
      frozenIdentityKey: 'googlePlaceId',
      canonicalWrites: false,
      networkCollection: false,
      paidGoogleDataApiCalls: 0,
      candidateCountsAsAccepted: false,
      rawCuisineTagsMutationAllowed: false,
      sourceFactsFirst: true,
      boundSourcesBeforeNewDiscovery: true,
      maintainedPublicRuntimePreferred: true
    },
    summary: {
      runtimeRows: rows.length,
      sourceFactRows: sourceFactRows.length,
      provenanceRows: provenanceRows.length,
      detailRows: detailRows.length,
      classification: {
        acceptedRows,
        unknownRows: rows.length - acceptedRows,
        unmappedTaxonomyTokens: taxonomyTasks.length,
        retainedExactEntityRecoveryRows: classificationEntities.retainedRecoveries.length,
        taxonomyTokenFirstRows: classificationEntities.unresolved.filter((row) => row.nextStage === 'classification_taxonomy_token_review').length,
        boundSourceReviewRows: classificationEntities.unresolved.filter((row) => row.nextStage === 'review_bound_classification_source').length,
        nameCandidateFirstRows: classificationEntities.unresolved.filter((row) => row.nextStage === 'generate_name_keyword_candidate').length
      },
      hours: {
        knownRows: publicHoursKnown,
        missingRows: hours.retainedReview.length + hours.boundSourceReview.length + hours.discovery.length,
        retainedReviewRows: hours.retainedReview.length,
        boundSourceReviewRows: hours.boundSourceReview.length,
        discoveryRows: hours.discovery.length,
        materializerOutcomes: runtimeStats ? {
          normalizedRows: Number(runtimeStats.hoursNormalizedRows || publicHoursKnown),
          hiddenUnparseableRows: Number(runtimeStats.hoursHiddenUnparseableRows || 0),
          hiddenConflictRows: Number(runtimeStats.hoursHiddenConflictRows || 0),
          hiddenSemanticRows: Number(runtimeStats.hoursHiddenSemanticRows || 0),
          rowsWithoutSource: Number(runtimeStats.hoursRowsWithoutSource || 0)
        } : null
      },
      lunchBudget: {
        knownRows: rows.filter((row) => isPriceRange(row.lunch)).length,
        missingRows: lunch.retainedRecoveries.length + lunch.boundSourceReview.length + lunch.discovery.length,
        retainedRangeRows: lunch.retainedRecoveries.length,
        boundSourceReviewRows: lunch.boundSourceReview.length,
        discoveryRows: lunch.discovery.length
      },
      dinnerBudget: {
        knownRows: rows.filter((row) => isPriceRange(row.dinner)).length,
        missingRows: dinner.retainedRecoveries.length + dinner.boundSourceReview.length + dinner.discovery.length,
        retainedRangeRows: dinner.retainedRecoveries.length,
        boundSourceReviewRows: dinner.boundSourceReview.length,
        discoveryRows: dinner.discovery.length
      }
    },
    classification: {
      taxonomyTasks,
      retainedEntityRecoveries: classificationEntities.retainedRecoveries,
      unresolvedEntityRows: classificationEntities.unresolved
    },
    hours,
    budget: { lunch, dinner }
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const report = buildCompletionPlan();
  const output = process.argv[2];
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report.summary));
  } else {
    console.log(JSON.stringify(report));
  }
}
