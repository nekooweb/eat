#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  extractStrictRecommendationsFromText
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'retained_hotpepper_promotional_dish_evidence.json');

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceItem(match, sourceUrl, checkedAt, evidenceClass, evidenceRule, snippet) {
  return {
    nameZh: match.nameZh,
    nameJa: cleanText(match.nameOriginal || match.nameJa || match.nameZh).slice(0, 80),
    provider: 'Hot Pepper',
    sourceUrl,
    checkedAt,
    evidenceClass,
    evidenceRule,
    evidenceSnippet: cleanText(snippet || match.evidenceSnippet || match.nameOriginal).slice(0, 90)
  };
}

const PROMOTIONAL_SPECIFIC_RULES = [
  [/鉄板焼(?:き)?そば/i, '铁板炒面'],
  [/焼きそば|焼そば/i, '炒面'],
  [/肉寿司/i, '肉寿司']
];

function featuredMatchesFromText(value, limit = 4) {
  const text = cleanText(value);
  const output = [];
  const seen = new Set();

  for (const [pattern, nameZh] of PROMOTIONAL_SPECIFIC_RULES) {
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({
      nameZh,
      nameOriginal: match[0],
      rule: `promotional-specific:${pattern.source}`,
      evidenceSnippet: text.slice(0, 90)
    });
    if (output.length >= limit) return output;
  }

  const hasYakisoba = /鉄板焼(?:き)?そば|焼きそば|焼そば/i.test(text);
  const hasMeatSushi = /肉寿司/i.test(text);
  for (const [pattern, nameZh] of DISH_RULES) {
    if (hasYakisoba && nameZh === '荞麦面') continue;
    if (hasMeatSushi && nameZh === '寿司') continue;
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({
      nameZh,
      nameOriginal: match[0],
      rule: pattern.source,
      evidenceSnippet: text.slice(0, 90)
    });
    if (output.length >= limit) break;
  }
  return output;
}

function dedupe(items, limit = 8) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

function validHotPepperUrl(value) {
  const text = cleanText(value);
  return /^https:\/\/www\.hotpepper\.jp\/strJ\d+/i.test(text) ? text : '';
}

function main() {
  const runtime = loadWindowFile('google_inventory_runtime.js');
  const runtimeRows = Array.isArray(runtime.GOOGLE_INVENTORY_RESTAURANTS)
    ? runtime.GOOGLE_INVENTORY_RESTAURANTS
    : [];
  const runtimeStats = runtime.GOOGLE_INVENTORY_STATS || {};
  if (runtimeStats.catalogTotal !== 2804) throw new Error(`Frozen catalog mismatch: ${runtimeStats.catalogTotal}`);
  if (runtimeStats.inventoryTotal !== runtimeRows.length) throw new Error('Published runtime/stat count mismatch');
  if (runtimeRows.length + Number(runtimeStats.unpublishedPlaceIdOnly || 0) !== 2804) {
    throw new Error('Published + unpublished Place-ID-only rows must reconcile to 2,804');
  }
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));

  const catalogFacts = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
  const catalogRows = Array.isArray(catalogFacts.rows) ? catalogFacts.rows : [];
  const catalogCheckedAt = cleanText(catalogFacts.checkedAt) || '2026-09-06';

  const richWindow = loadWindowFile('hotpepper_rich_metadata.js');
  const rich = richWindow.HOTPEPPER_RICH_METADATA || {};
  const richRows = Array.isArray(rich.rows) ? rich.rows : [];
  const richCheckedAt = cleanText(rich.checkedAt) || catalogCheckedAt;

  // Aggregate retained promotional text by frozen Place ID. The basic provider
  // catch is intentionally excluded because collect_google_inventory_recommendations.mjs
  // already consumes facts.catch. This pass adds the previously-unused
  // facts.genre.catch and concrete facts.freeFood text at all retained catalog
  // bindings, reviewed rich special-feature titles, and concrete all-you-can-eat
  // provider text when those fields name an actual dish. Generic service booleans
  // are not dish evidence.
  const retainedById = new Map();
  let eligibleCatalogRows = 0;
  let eligibleRichRows = 0;
  let catalogGenreCatchTexts = 0;
  let catalogFreeFoodTexts = 0;
  let richSpecialFeatureTitleTexts = 0;
  let richAllYouCanEatTexts = 0;

  function addText(googlePlaceId, sourceUrl, checkedAt, kind, text) {
    const publicRow = runtimeById.get(googlePlaceId);
    const clean = cleanText(text);
    if (!publicRow || !sourceUrl || !clean) return;
    if (!retainedById.has(googlePlaceId)) {
      retainedById.set(googlePlaceId, {
        googlePlaceId,
        name: publicRow.name,
        texts: []
      });
    }
    retainedById.get(googlePlaceId).texts.push({ sourceUrl, checkedAt, kind, text: clean });
  }

  for (const catalogRow of catalogRows) {
    const googlePlaceId = cleanText(catalogRow.googlePlaceId);
    if (!runtimeById.has(googlePlaceId)) continue;
    const sourceUrl = validHotPepperUrl(catalogRow.facts?.urls?.pc || catalogRow.facts?.urls?.mobile);
    if (!sourceUrl) continue;
    eligibleCatalogRows += 1;
    const genreCatch = cleanText(catalogRow.facts?.genre?.catch);
    if (genreCatch) {
      addText(googlePlaceId, sourceUrl, catalogCheckedAt, 'catalogGenreCatch', genreCatch);
      catalogGenreCatchTexts += 1;
    }

    const freeFood = cleanText(catalogRow.facts?.freeFood);
    if (freeFood && /食べ放題|食放|ビュッフェ|バイキング/i.test(freeFood) && featuredMatchesFromText(freeFood, 1).length) {
      addText(googlePlaceId, sourceUrl, catalogCheckedAt, 'catalogFreeFood', freeFood);
      catalogFreeFoodTexts += 1;
    }
  }

  for (const richRow of richRows) {
    const googlePlaceId = cleanText(richRow.googlePlaceId);
    if (!runtimeById.has(googlePlaceId)) continue;
    if (!['strict_auto', 'manual_exact'].includes(cleanText(richRow.hotpepperReviewMode))) continue;
    const sourceUrl = validHotPepperUrl(richRow.hotpepperUrl);
    if (!sourceUrl) continue;
    eligibleRichRows += 1;
    const checkedAt = cleanText(richRow.checkedAt) || richCheckedAt;
    for (const feature of richRow.specialFeatures || []) {
      const title = cleanText(feature?.title);
      if (!title) continue;
      addText(googlePlaceId, sourceUrl, checkedAt, 'richSpecialFeatureTitle', title);
      richSpecialFeatureTitleTexts += 1;
    }

    const allYouCanEat = cleanText(richRow.sourceServiceText?.allYouCanEat);
    if (allYouCanEat && /食べ放題|食放|ビュッフェ|バイキング/i.test(allYouCanEat) && featuredMatchesFromText(allYouCanEat, 1).length) {
      addText(googlePlaceId, sourceUrl, checkedAt, 'richAllYouCanEat', allYouCanEat);
      richAllYouCanEatTexts += 1;
    }
  }

  const evidenceRows = [];
  let promotionalTextsScanned = 0;
  let duplicatePromotionalTextsSkipped = 0;
  let recommendationTextHits = 0;
  let featuredTextHits = 0;
  const recommendationPlaceIds = new Set();
  const featuredPlaceIds = new Set();
  const providerItemCounts = {
    catalogGenreCatch: 0,
    catalogFreeFood: 0,
    richSpecialFeatureTitle: 0,
    richAllYouCanEat: 0
  };

  for (const retained of retainedById.values()) {
    const recommendedDishes = [];
    const featuredDishes = [];
    const seenTexts = new Set();
    for (const entry of retained.texts) {
      const textKey = `${entry.sourceUrl}|${entry.text}`;
      if (seenTexts.has(textKey)) {
        duplicatePromotionalTextsSkipped += 1;
        continue;
      }
      seenTexts.add(textKey);
      promotionalTextsScanned += 1;

      const strict = extractStrictRecommendationsFromText(entry.text, 4);
      if (strict.length) {
        recommendationTextHits += 1;
        for (const match of strict) {
          recommendedDishes.push(sourceItem(
            match,
            entry.sourceUrl,
            entry.checkedAt,
            'source_recommendation_text',
            `hotpepper-retained-${entry.kind}:${match.rule}`,
            entry.text
          ));
          providerItemCounts[entry.kind] += 1;
        }
        continue;
      }

      const featured = featuredMatchesFromText(entry.text, 4);
      if (featured.length) featuredTextHits += 1;
      for (const match of featured) {
        featuredDishes.push(sourceItem(
          match,
          entry.sourceUrl,
          entry.checkedAt,
          'provider_promotional_dish_text',
          `hotpepper-retained-${entry.kind}:${match.rule}`,
          entry.text
        ));
        providerItemCounts[entry.kind] += 1;
      }
    }

    const recommended = dedupe(recommendedDishes, 6);
    const recommendedNames = new Set(recommended.map((item) => item.nameZh));
    const featured = dedupe(featuredDishes, 8).filter((item) => !recommendedNames.has(item.nameZh)).slice(0, 6);
    if (!recommended.length && !featured.length) continue;
    if (recommended.length) recommendationPlaceIds.add(retained.googlePlaceId);
    if (featured.length) featuredPlaceIds.add(retained.googlePlaceId);
    evidenceRows.push({
      googlePlaceId: retained.googlePlaceId,
      name: retained.name,
      recommendedDishes: recommended,
      featuredDishes: featured
    });
  }

  evidenceRows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const summary = {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    hotPepperCatalogFactRows: catalogRows.length,
    eligibleCatalogRows,
    richMetadataRows: richRows.length,
    eligibleReviewedRichRows: eligibleRichRows,
    catalogGenreCatchTexts,
    catalogFreeFoodTexts,
    richSpecialFeatureTitleTexts,
    richAllYouCanEatTexts,
    promotionalTextsScanned,
    duplicatePromotionalTextsSkipped,
    recommendationTextHits,
    featuredTextHits,
    evidenceRestaurants: evidenceRows.length,
    recommendationRestaurants: recommendationPlaceIds.size,
    featuredRestaurants: featuredPlaceIds.size,
    recommendationItems: evidenceRows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    featuredItems: evidenceRows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
    providerItemCounts
  };

  const payload = {
    schemaVersion: 4,
    checkedAt: richCheckedAt,
    policy: {
      source: 'retained Hot Pepper catalog facts plus reviewed rich metadata only',
      networkRequests: 0,
      paidGoogleDataApiCalls: 0,
      catalogBindingTrustMatchesExistingRetainedCatchCollector: true,
      richEligibleBindings: ['strict_auto', 'manual_exact'],
      textFields: [
        'facts.genre.catch',
        'facts.freeFood (concrete dish text only)',
        'specialFeatures[].title',
        'sourceServiceText.allYouCanEat (concrete dish text only)'
      ],
      basicFactsCatchExcludedBecauseMainCollectorAlreadyConsumesIt: true,
      richSourceCatchExcludedAsDuplicateOfCatalogFactsCatch: true,
      shopDetailExcludedBecauseKeywordListsAreNotStableMenuEvidence: true,
      genericServiceBooleansAreDishEvidence: false,
      restaurantNameInferenceAllowed: false,
      cuisineInferenceAllowed: false,
      genericFallbackAllowed: false,
      recommendationRequiresExplicitMarker: true,
      featuredRequiresConcreteDishTermInRetainedProviderText: true,
      allYouCanEatRequiresConcreteAvailabilityWording: true,
      catalogFreeFoodRequiresConcreteAvailabilityWording: true,
      promotionalSpecificRulesBeforeBroadDishFamilyRules: true,
      targetLanguage: 'zh-CN',
      preserveSourceOriginal: true
    },
    summary,
    rows: evidenceRows
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary));
}

main();
