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

function featuredMatchesFromText(value, limit = 4) {
  const text = cleanText(value);
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
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

  const richWindow = loadWindowFile('hotpepper_rich_metadata.js');
  const rich = richWindow.HOTPEPPER_RICH_METADATA || {};
  const richRows = Array.isArray(rich.rows) ? rich.rows : [];
  const defaultCheckedAt = cleanText(rich.checkedAt) || '2026-09-06';

  const evidenceRows = [];
  let eligibleRichRows = 0;
  let promotionalTextsScanned = 0;
  let genreCatchTexts = 0;
  let specialFeatureTitleTexts = 0;
  let recommendationTextHits = 0;
  let featuredTextHits = 0;
  const recommendationPlaceIds = new Set();
  const featuredPlaceIds = new Set();
  const providerItemCounts = { genreCatch: 0, specialFeatureTitle: 0 };

  for (const richRow of richRows) {
    const googlePlaceId = cleanText(richRow.googlePlaceId);
    const publicRow = runtimeById.get(googlePlaceId);
    if (!publicRow) continue;
    if (!['strict_auto', 'manual_exact'].includes(cleanText(richRow.hotpepperReviewMode))) continue;
    const sourceUrl = cleanText(richRow.hotpepperUrl);
    if (!/^https:\/\/www\.hotpepper\.jp\/strJ\d+/i.test(sourceUrl)) continue;
    const checkedAt = cleanText(richRow.checkedAt) || defaultCheckedAt;
    eligibleRichRows += 1;

    const texts = [];
    const genreCatch = cleanText(richRow.hotpepperGenre?.catch);
    if (genreCatch) {
      texts.push({ kind: 'genreCatch', text: genreCatch });
      genreCatchTexts += 1;
    }
    for (const feature of richRow.specialFeatures || []) {
      const title = cleanText(feature?.title);
      if (!title) continue;
      texts.push({ kind: 'specialFeatureTitle', text: title });
      specialFeatureTitleTexts += 1;
    }

    const recommendedDishes = [];
    const featuredDishes = [];
    const seenTexts = new Set();
    for (const entry of texts) {
      if (seenTexts.has(entry.text)) continue;
      seenTexts.add(entry.text);
      promotionalTextsScanned += 1;

      const strict = extractStrictRecommendationsFromText(entry.text, 4);
      if (strict.length) {
        recommendationTextHits += 1;
        for (const match of strict) {
          recommendedDishes.push(sourceItem(
            match,
            sourceUrl,
            checkedAt,
            'source_recommendation_text',
            `hotpepper-rich-${entry.kind}:${match.rule}`,
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
          sourceUrl,
          checkedAt,
          'provider_promotional_dish_text',
          `hotpepper-rich-${entry.kind}:${match.rule}`,
          entry.text
        ));
        providerItemCounts[entry.kind] += 1;
      }
    }

    const recommended = dedupe(recommendedDishes, 6);
    const recommendedNames = new Set(recommended.map((item) => item.nameZh));
    const featured = dedupe(featuredDishes, 8).filter((item) => !recommendedNames.has(item.nameZh)).slice(0, 6);
    if (!recommended.length && !featured.length) continue;
    if (recommended.length) recommendationPlaceIds.add(googlePlaceId);
    if (featured.length) featuredPlaceIds.add(googlePlaceId);
    evidenceRows.push({
      googlePlaceId,
      name: publicRow.name,
      recommendedDishes: recommended,
      featuredDishes: featured
    });
  }

  evidenceRows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const summary = {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    richMetadataRows: richRows.length,
    eligibleReviewedRichRows: eligibleRichRows,
    promotionalTextsScanned,
    genreCatchTexts,
    specialFeatureTitleTexts,
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
    schemaVersion: 1,
    checkedAt: defaultCheckedAt,
    policy: {
      source: 'retained reviewed Hot Pepper rich metadata only',
      networkRequests: 0,
      paidGoogleDataApiCalls: 0,
      eligibleBindings: ['strict_auto', 'manual_exact'],
      textFields: ['hotpepperGenre.catch', 'specialFeatures[].title'],
      sourceCatchExcludedAsDuplicateOfCatalogFactsCatch: true,
      restaurantNameInferenceAllowed: false,
      cuisineInferenceAllowed: false,
      genericFallbackAllowed: false,
      recommendationRequiresExplicitMarker: true,
      featuredRequiresConcreteDishTermInRetainedProviderText: true,
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
