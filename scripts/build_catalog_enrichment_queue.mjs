#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const CATALOG = path.join(DATA, 'area1_catalog.json');
const HP_FACTS = path.join(DATA, 'hotpepper_catalog_facts.json');
const OUT = path.join(DATA, 'area1_enrichment_queue.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const hpPayload = fs.existsSync(HP_FACTS)
  ? JSON.parse(fs.readFileSync(HP_FACTS, 'utf8'))
  : { rows: [] };
const hpById = new Map((hpPayload.rows || []).map((row) => [row.googlePlaceId, row]));

const CORE_FIELDS = [
  'address',
  'cuisine',
  'lunchBudget',
  'dinnerBudget',
  'openingHours',
  'publicSourceEvidence'
];

const OPTIONAL_FIELDS = [
  'featuredDishes',
  'strictRecommendations'
];

const CUISINE_RULES = [
  [/ラーメン|中華そば|つけ麺/i, '拉面'],
  [/寿司|すし|鮨/i, '寿司'],
  [/焼肉|ホルモン/i, '烤肉'],
  [/韓国/i, '韩国菜'],
  [/中華|中国料理|四川|広東|台湾/i, '中华'],
  [/タイ料理|タイ・ベトナム/i, '泰国菜'],
  [/ベトナム/i, '越南菜'],
  [/インド.*ネパール|ネパール/i, '印度・尼泊尔'],
  [/インド/i, '印度菜'],
  [/アジア|エスニック/i, '亚洲・民族'],
  [/イタリア/i, '意大利菜'],
  [/フレンチ|フランス/i, '法国菜'],
  [/スペイン/i, '西班牙菜'],
  [/メキシコ/i, '墨西哥菜'],
  [/ステーキ/i, '牛排'],
  [/とんかつ/i, '炸猪排'],
  [/カレー/i, '咖喱'],
  [/そば|蕎麦/i, '荞麦面'],
  [/うどん/i, '乌冬'],
  [/お好み焼/i, '御好烧'],
  [/もんじゃ/i, '文字烧'],
  [/ハンバーガ/i, '汉堡'],
  [/ピザ/i, '披萨'],
  [/カフェ|喫茶|コーヒー/i, '咖啡'],
  [/スイーツ|デザート|ケーキ|パフェ/i, '甜品'],
  [/居酒屋/i, '居酒屋'],
  [/バー|バル|カクテル/i, '酒吧'],
  [/洋食/i, '洋食'],
  [/創作料理/i, '创意料理'],
  [/和食|日本料理/i, '日式']
];

function missingCore(row) {
  const missing = row.completeness?.missing || [];
  return CORE_FIELDS.filter((field) => missing.includes(field));
}

function sourceLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return [value.name, value.catch].filter(Boolean).join(' ').trim();
  return String(value).trim();
}

function mapHotpepperCuisine(facts) {
  for (const candidate of [sourceLabel(facts.subGenre), sourceLabel(facts.genre), String(facts.catch || '').trim()]) {
    if (!candidate) continue;
    for (const [pattern, cuisine] of CUISINE_RULES) if (pattern.test(candidate)) return cuisine;
  }
  return null;
}

function parseProviderBudgetTier(budget) {
  if (!budget || typeof budget !== 'object') return null;
  const raw = String(budget.name || '').trim();
  if (!raw) return null;
  const normalized = raw.replaceAll(',', '').replaceAll('，', '').replaceAll('〜', '～').replaceAll('~', '～');
  const numbers = [...normalized.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length >= 2) {
    const [low, high] = numbers;
    if (Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 1000000) return [low, high];
  }
  if (numbers.length === 1 && /^\s*[～≤<]/.test(normalized)) {
    const high = numbers[0];
    if (high > 0 && high <= 1000000) return [0, high];
  }
  return null;
}

function normalizeYenText(value) {
  return String(value || '')
    .replaceAll(',', '')
    .replaceAll('，', '')
    .replaceAll('〜', '～')
    .replaceAll('~', '～')
    .replaceAll('－', '-')
    .replaceAll('–', '-')
    .replaceAll('―', '-');
}

function parseExplicitLunchRange(facts) {
  const budget = facts.budget && typeof facts.budget === 'object' ? facts.budget : {};
  const raw = normalizeYenText([budget.average, facts.budgetMemo].filter(Boolean).join(' / '));
  if (!raw || !/(ランチ|昼食|昼平均|昼予算)/.test(raw)) return null;

  const label = '(?:ランチ|昼食|昼平均|昼予算)';
  const twoSided = new RegExp(`${label}[^0-9]{0,18}(\\d{2,6})\\s*円?\\s*[～-]\\s*(\\d{2,6})\\s*円`, 'i');
  const match = raw.match(twoSided);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (low >= 0 && low <= high && high <= 1000000) return [low, high];
  }

  const upperCap = new RegExp(`${label}[^0-9]{0,18}(?:～|<|≤)?\\s*(\\d{2,6})\\s*円\\s*(?:以下|未満)`, 'i');
  const capMatch = raw.match(upperCap);
  if (capMatch) {
    const high = Number(capMatch[1]);
    if (high > 0 && high <= 1000000) return [0, high];
  }

  const prefixCap = new RegExp(`${label}[^0-9]{0,18}[～<≤]\\s*(\\d{2,6})\\s*円`, 'i');
  const prefixMatch = raw.match(prefixCap);
  if (prefixMatch) {
    const high = Number(prefixMatch[1]);
    if (high > 0 && high <= 1000000) return [0, high];
  }

  return null;
}

function availableHotpepperCandidates(row) {
  const hp = hpById.get(row.googlePlaceId);
  if (!hp || !row.hotpepperBinding?.autoEligible || !row.currentProduction) return [];
  const facts = hp.facts || {};
  const missing = new Set(row.completeness?.missing || []);
  const candidates = [];
  if (missing.has('address') && String(facts.address || '').trim()) candidates.push('address');
  if (missing.has('cuisine') && mapHotpepperCuisine(facts)) candidates.push('cuisine');
  if (missing.has('lunchBudget') && parseExplicitLunchRange(facts)) candidates.push('lunchBudgetExplicitText');
  if (missing.has('dinnerBudget') && parseProviderBudgetTier(facts.budget)) candidates.push('dinnerBudget');
  if (missing.has('openingHours') && String(facts.openingHoursText || '').trim()) candidates.push('openingHours');
  if (missing.has('featuredDishes') && String(facts.catch || '').trim()) candidates.push('featuredDishesReview');
  if (facts.lunchAvailabilityText) candidates.push('lunchAvailability');
  return candidates;
}

function openConfidence(row) {
  return row.openIdentityCandidate?.candidate
    ? row.openIdentityCandidate.matchConfidence || 'none'
    : 'none';
}

function openTriage(row) {
  return row.openIdentityCandidate?.overtureSupport?.triage || null;
}

function isCrossPriority(row) {
  return ['A_priority_review', 'B_blocker_review'].includes(openTriage(row));
}

function priorityFor(row) {
  const core = missingCore(row);
  let score = 0;
  if (row.currentProduction) score += 1000;
  if (row.currentProduction && row.sourceState.publicSourceLinks === 0) score += 300;
  score += core.length * 50;
  if (core.includes('lunchBudget')) score += 90;
  if (core.includes('address')) score += 60;
  if (core.includes('openingHours')) score += 50;
  if (core.includes('dinnerBudget')) score += 40;
  if (core.includes('cuisine')) score += 30;
  if (row.sourceState.providerFactRecords > 0) score += 40;
  if (row.sourceState.hotpepperCatalogFacts) score += 35;
  if (row.hotpepperBinding?.autoEligible) score += 25;
  else if (row.hotpepperBinding?.confidence === 'high') score += 10;

  if (!row.currentProduction) {
    if (row.openIdentityCandidate?.historicalQcStatus === 'closed_permanently') score -= 300;
    if (isCrossPriority(row)) score += 140;
    if (row.sourceState.hotpepperCatalogFacts && isCrossPriority(row)) score += 80;
    const confidence = openConfidence(row);
    if (confidence === 'high') score += 90;
    else if (confidence === 'medium') score += 70;
    else if (confidence === 'review') score += 40;
    else if (confidence === 'low') score += 10;
  }
  return score;
}

function classify(row) {
  const core = missingCore(row);
  if (row.currentProduction) {
    if (!core.length) return 'production_core_complete';
    if (row.sourceState.publicSourceLinks > 0 || row.sourceState.providerFactRecords > 0 || row.sourceState.hotpepperCatalogFacts) {
      return 'production_existing_source_extract';
    }
    return 'production_source_binding';
  }
  if (row.openIdentityCandidate?.historicalQcStatus === 'closed_permanently') return 'inventory_historical_closed_hold';
  if (row.sourceState.hotpepperCatalogFacts && isCrossPriority(row)) return 'inventory_multisource_loaded_review';
  if (row.sourceState.hotpepperCatalogFacts) return 'inventory_hotpepper_loaded_review';
  if (isCrossPriority(row)) return 'inventory_open_cross_supported_review';
  const confidence = openConfidence(row);
  if (confidence === 'high' || confidence === 'medium') return 'inventory_open_highmedium_review';
  if (confidence === 'review') return 'inventory_open_review';
  if (confidence === 'low') return 'inventory_open_low_hint';
  return 'inventory_source_binding';
}

const items = (catalog.rows || []).map((row) => {
  const coreMissing = missingCore(row);
  const optionalMissing = OPTIONAL_FIELDS.filter((field) => row.completeness?.missing?.includes(field));
  const hp = hpById.get(row.googlePlaceId) || null;
  const candidates = availableHotpepperCandidates(row);
  const open = row.openIdentityCandidate?.candidate || null;
  const overture = row.openIdentityCandidate?.overtureSupport || null;
  return {
    googlePlaceId: row.googlePlaceId,
    catalogStatus: row.catalogStatus,
    currentProduction: row.currentProduction,
    name: row.canonical?.name || hp?.facts?.name || null,
    candidateName: !row.currentProduction && !hp?.facts?.name ? open?.name || overture?.name || null : null,
    queue: classify(row),
    priorityScore: priorityFor(row),
    coreMissing,
    optionalMissing,
    sourceProviders: row.sourceState.providers || [],
    publicSourceLinks: row.sourceState.publicSourceLinks || 0,
    providerFactRecords: row.sourceState.providerFactRecords || 0,
    hotpepperCatalogFacts: Boolean(row.sourceState.hotpepperCatalogFacts),
    hotpepperConfidence: row.hotpepperBinding?.confidence || null,
    hotpepperAutoEligible: Boolean(row.hotpepperBinding?.autoEligible),
    openCandidate: open ? {
      provider: open.provider,
      sourceCandidateId: open.sourceCandidateId,
      name: open.name,
      cuisine: open.cuisine,
      address: open.address,
      lat: open.lat,
      lng: open.lng,
      confidence: row.openIdentityCandidate?.matchConfidence || 'none',
      historicalQcStatus: row.openIdentityCandidate?.historicalQcStatus || null,
      distanceMeters: open.historicalMatchDistanceMeters,
      nameSimilarity: open.historicalNameSimilarity
    } : null,
    overtureSupport: overture ? {
      release: overture.release,
      overtureId: overture.overtureId,
      name: overture.name,
      basicCategory: overture.basicCategory,
      websites: overture.websites,
      brand: overture.brand,
      distanceToOsmMeters: overture.distanceToOsmMeters,
      nameSimilarity: overture.nameSimilarity,
      addressSimilarity: overture.addressSimilarity,
      combinedScore: overture.combinedScore,
      crossSourceConfidence: overture.crossSourceConfidence,
      triage: overture.triage
    } : null,
    existingHotpepperFieldCandidates: candidates,
    explicitLunchRangeFromLoadedHotpepper: candidates.includes('lunchBudgetExplicitText')
      ? parseExplicitLunchRange(hp?.facts || {})
      : null,
    nextActions: row.nextActions || []
  };
});

items.sort((a, b) =>
  b.priorityScore - a.priorityScore
  || a.queue.localeCompare(b.queue)
  || (a.name || a.candidateName || '').localeCompare(b.name || b.candidateName || '')
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const counts = {};
for (const item of items) counts[item.queue] = (counts[item.queue] || 0) + 1;
const productionItems = items.filter((item) => item.currentProduction);
const inventoryItems = items.filter((item) => !item.currentProduction);
const productionCoreIncomplete = productionItems.filter((item) => item.coreMissing.length);
const zeroRequestHotpepperCandidates = productionItems.filter((item) => item.existingHotpepperFieldCandidates.length);
const safeAutoProduction = productionItems.filter((item) => item.hotpepperAutoEligible);

const coreGapCounts = Object.fromEntries(CORE_FIELDS.map((field) => [
  field,
  productionItems.filter((item) => item.coreMissing.includes(field)).length
]));
const inventoryOpenConfidenceCounts = {};
const inventoryTriageCounts = {};
for (const item of inventoryItems) {
  if (item.openCandidate) {
    const confidence = item.openCandidate.confidence || 'none';
    inventoryOpenConfidenceCounts[confidence] = (inventoryOpenConfidenceCounts[confidence] || 0) + 1;
  }
  if (item.overtureSupport?.triage) {
    inventoryTriageCounts[item.overtureSupport.triage] = (inventoryTriageCounts[item.overtureSupport.triage] || 0) + 1;
  }
}

const summary = {
  schemaVersion: 4,
  checkedAt: catalog.summary?.checkedAt || new Date().toISOString().slice(0, 10),
  identityUniverse: items.length,
  production: productionItems.length,
  inventoryOnly: inventoryItems.length,
  productionCoreIncomplete: productionCoreIncomplete.length,
  productionCoreComplete: productionItems.length - productionCoreIncomplete.length,
  queueCounts: counts,
  productionCoreGapCounts: coreGapCounts,
  inventoryWithHistoricalOpenCandidate: inventoryItems.filter((item) => item.openCandidate).length,
  inventoryOpenConfidenceCounts,
  inventoryTriageCounts,
  inventoryHighMediumOpenCandidates: inventoryItems.filter((item) =>
    item.openCandidate && ['high', 'medium'].includes(item.openCandidate.confidence)).length,
  inventoryWithOvertureSupport: inventoryItems.filter((item) => item.overtureSupport).length,
  inventoryMultisourceLoadedPriority: inventoryItems.filter((item) => item.queue === 'inventory_multisource_loaded_review').length,
  inventoryOpenCrossSupportedPriority: inventoryItems.filter((item) => item.queue === 'inventory_open_cross_supported_review').length,
  inventoryHotpepperLoaded: inventoryItems.filter((item) => item.hotpepperCatalogFacts).length,
  strictAutoHotpepperProductionBindings: safeAutoProduction.length,
  productionWithLoadedStrictHotpepperFieldCandidates: zeroRequestHotpepperCandidates.length,
  productionLoadedStrictHotpepperCandidateFieldCounts: {
    address: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('address')).length,
    cuisine: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('cuisine')).length,
    lunchBudgetExplicitText: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('lunchBudgetExplicitText')).length,
    dinnerBudget: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('dinnerBudget')).length,
    openingHours: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('openingHours')).length,
    featuredDishesReview: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('featuredDishesReview')).length,
    lunchAvailability: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('lunchAvailability')).length
  },
  policy: {
    catalogFirst: true,
    sourceExtractionBeforeBroadDiscovery: true,
    inventoryAdmissionSeparatedFromFieldLoading: true,
    historicalOpenMatchesRemainCandidatesUntilValidated: true,
    overtureCrossSupportDoesNotAutoAdmitIdentity: true,
    lowConfidenceOpenCandidatesAreHintsOnly: true,
    strictHotpepperGateRequiredForCanonicalCandidates: true,
    explicitLunchTextRequiresFiniteLabelledRange: true,
    noExternalPaidRequests: true
  }
};

fs.writeFileSync(OUT, `${JSON.stringify({ schemaVersion: 4, summary, items }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
