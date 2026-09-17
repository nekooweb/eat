#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';
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

  const rows = runtimeSource === 'data/google_inventory_runtime.js'
    ? windowObject.GOOGLE_INVENTORY_RESTAURANTS
    : windowObject.PRODUCTION_RESTAURANTS;

  return {
    rows: Array.isArray(rows) ? rows : [],
    taxonomy: windowObject.EAT_CLASSIFICATION || null,
    sourceFactRows: Array.isArray(windowObject.SOURCE_FACTS?.rows) ? windowObject.SOURCE_FACTS.rows : [],
    runtimeSource
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

function buildClassificationEntityTasks({ rows, factsById, taxonomy }) {
  const conceptById = new Map(taxonomy.concepts.map((concept) => [concept.id, concept]));
  const retainedRecoveries = [];
  const unresolved = [];

  for (const row of rows) {
    if (directConcepts(taxonomy, row).size) continue;
    const facts = factsById.get(row.googlePlaceId) || [];
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
        sourceFingerprint: fingerprint(evidence.sort((a, b) =>
          providerRank(b.provider) - providerRank(a.provider)
          || String(b.checkedAt || '').localeCompare(String(a.checkedAt || ''))))
      });
      continue;
    }

    unresolved.push({
      taskType: 'classification_entity_review',
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      retainedSourceFactCount: facts.length,
      hasUnmappedRuntimeToken,
      hasUnmappedClassificationFact,
      taxonomyTokenMayResolve: hasUnmappedRuntimeToken || hasUnmappedClassificationFact,
      networkRequired: facts.length === 0,
      sourceFingerprint: fingerprint((facts || []).map((fact) => ({
        provider: fact.provider || 'unknown',
        checkedAt: fact.checkedAt || null,
        cuisine: fact.cuisine || null,
        tags: Array.isArray(fact.tags) ? [...fact.tags].sort() : []
      })).sort((a, b) => a.provider.localeCompare(b.provider)))
    });
  }

  retainedRecoveries.sort((a, b) =>
    Number(a.networkRequired) - Number(b.networkRequired)
    || a.distanceMeters - b.distanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId));
  unresolved.sort((a, b) =>
    Number(b.taxonomyTokenMayResolve) - Number(a.taxonomyTokenMayResolve)
    || Number(a.networkRequired) - Number(b.networkRequired)
    || a.distanceMeters - b.distanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId));

  return { retainedRecoveries, unresolved };
}

function buildHoursTasks({ rows, factsById }) {
  const recoverable = [];
  const retainedUnparsed = [];
  const discovery = [];

  for (const row of rows) {
    if (row.openingHours) continue;
    const candidates = (factsById.get(row.googlePlaceId) || [])
      .filter((fact) => String(fact.openingHoursRaw || '').trim())
      .map((fact) => {
        const schedule = normalizeOpeningHours(fact.openingHoursRaw, fact.closedDays || []);
        return {
          provider: fact.provider || 'unknown',
          checkedAt: fact.checkedAt || null,
          validNormalizedSchedule: validateOpeningHours(schedule),
          openingHoursRaw: String(fact.openingHoursRaw).normalize('NFKC').trim(),
          closedDays: Array.isArray(fact.closedDays) ? [...fact.closedDays] : []
        };
      })
      .sort((a, b) => providerRank(b.provider) - providerRank(a.provider)
        || String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));

    const parseable = candidates.filter((candidate) => candidate.validNormalizedSchedule);
    const common = {
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      candidateProviders: uniqueSorted(candidates.map((candidate) => candidate.provider)),
      sourceFingerprint: fingerprint(candidates.map((candidate) => ({
        provider: candidate.provider,
        checkedAt: candidate.checkedAt,
        openingHoursRaw: candidate.openingHoursRaw,
        closedDays: candidate.closedDays
      })))
    };

    if (parseable.length) {
      recoverable.push({
        taskType: 'recover_retained_hours',
        ...common,
        parseableCandidateCount: parseable.length,
        networkRequired: false
      });
    } else if (candidates.length) {
      retainedUnparsed.push({
        taskType: 'review_unparsed_retained_hours',
        ...common,
        retainedCandidateCount: candidates.length,
        networkRequired: false
      });
    } else {
      discovery.push({
        taskType: 'discover_hours_source',
        ...common,
        networkRequired: true
      });
    }
  }

  const sortRows = (a, b) => a.distanceMeters - b.distanceMeters || a.googlePlaceId.localeCompare(b.googlePlaceId);
  recoverable.sort(sortRows);
  retainedUnparsed.sort(sortRows);
  discovery.sort(sortRows);
  return { recoverable, retainedUnparsed, discovery };
}

function buildBudgetTasks({ rows, factsById, meal }) {
  const recoverable = [];
  const discovery = [];

  for (const row of rows) {
    if (isPriceRange(row[meal])) continue;
    const candidates = (factsById.get(row.googlePlaceId) || [])
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
      sourceFingerprint: fingerprint(candidates)
    };

    if (candidates.length) {
      const distinctRanges = uniqueSorted(candidates.map((candidate) => JSON.stringify(candidate.value)));
      recoverable.push({
        taskType: `recover_retained_${meal}_budget`,
        ...common,
        candidateProviders: uniqueSorted(candidates.map((candidate) => candidate.provider)),
        candidateRanges: distinctRanges.map((value) => JSON.parse(value)),
        conflictingRetainedRanges: distinctRanges.length > 1,
        networkRequired: false
      });
    } else {
      discovery.push({
        taskType: `discover_${meal}_budget_source`,
        ...common,
        networkRequired: true
      });
    }
  }

  const sortRows = (a, b) =>
    Number(a.conflictingRetainedRanges || false) - Number(b.conflictingRetainedRanges || false)
    || a.distanceMeters - b.distanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId);
  recoverable.sort(sortRows);
  discovery.sort(sortRows);
  return { recoverable, discovery };
}

function assertUniqueIds(rows, label) {
  const ids = rows.map((row) => row.googlePlaceId).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate googlePlaceId in ${label}`);
}

export function buildCompletionPlan(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const now = options.now instanceof Date ? options.now : new Date(options.now || process.env.COMPLETION_PLAN_NOW || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid completion-plan time');

  const { rows, taxonomy, sourceFactRows, runtimeSource } = loadMaintainedInputs(root);
  if (!rows.length) throw new Error('Missing public runtime rows');
  if (!taxonomy) throw new Error('Missing EAT_CLASSIFICATION');

  const factsById = sourceFactsByPlaceId(sourceFactRows);
  const acceptedRows = rows.filter((row) => directConcepts(taxonomy, row).size > 0).length;
  const taxonomyTasks = buildTokenInventory({ rows, factsById, taxonomy });
  const classificationEntities = buildClassificationEntityTasks({ rows, factsById, taxonomy });
  const hours = buildHoursTasks({ rows, factsById });
  const lunch = buildBudgetTasks({ rows, factsById, meal: 'lunch' });
  const dinner = buildBudgetTasks({ rows, factsById, meal: 'dinner' });

  assertUniqueIds(classificationEntities.retainedRecoveries, 'classification retained recoveries');
  assertUniqueIds(classificationEntities.unresolved, 'classification unresolved');
  assertUniqueIds(hours.recoverable, 'hours recoverable');
  assertUniqueIds(hours.retainedUnparsed, 'hours retained unparsed');
  assertUniqueIds(hours.discovery, 'hours discovery');
  assertUniqueIds(lunch.recoverable, 'lunch recoverable');
  assertUniqueIds(lunch.discovery, 'lunch discovery');
  assertUniqueIds(dinner.recoverable, 'dinner recoverable');
  assertUniqueIds(dinner.discovery, 'dinner discovery');

  return {
    schemaVersion: 1,
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
      maintainedPublicRuntimePreferred: true
    },
    summary: {
      runtimeRows: rows.length,
      sourceFactRows: sourceFactRows.length,
      classification: {
        acceptedRows,
        unknownRows: rows.length - acceptedRows,
        unmappedTaxonomyTokens: taxonomyTasks.length,
        retainedExactEntityRecoveryRows: classificationEntities.retainedRecoveries.length,
        unresolvedEntityRows: classificationEntities.unresolved.length
      },
      hours: {
        knownRows: rows.filter((row) => Boolean(row.openingHours)).length,
        missingRows: hours.recoverable.length + hours.retainedUnparsed.length + hours.discovery.length,
        retainedParseableRows: hours.recoverable.length,
        retainedUnparsedRows: hours.retainedUnparsed.length,
        discoveryRows: hours.discovery.length
      },
      lunchBudget: {
        knownRows: rows.filter((row) => isPriceRange(row.lunch)).length,
        missingRows: lunch.recoverable.length + lunch.discovery.length,
        retainedRangeRows: lunch.recoverable.length,
        discoveryRows: lunch.discovery.length
      },
      dinnerBudget: {
        knownRows: rows.filter((row) => isPriceRange(row.dinner)).length,
        missingRows: dinner.recoverable.length + dinner.discovery.length,
        retainedRangeRows: dinner.recoverable.length,
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
