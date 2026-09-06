#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const RICH = path.join(DATA, 'hotpepper_rich_metadata.js');
const OUT = path.join(DATA, 'source_enrichment_hotpepper-richcore.js');

const existingSandbox = { window: { RESTAURANTS: [] }, console };
vm.createContext(existingSandbox);
for (const filename of fs.readdirSync(DATA)
  .filter((name) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(name))
  .filter((name) => name !== path.basename(OUT))
  .sort()) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), existingSandbox, { filename });
}

const existingHotPepperIds = new Set(
  (existingSandbox.window.RESTAURANTS || [])
    .filter((row) => row?.sourceOnly && row?.source === 'Hot Pepper' && row?.googlePlaceId)
    .map((row) => row.googlePlaceId)
);

const richSandbox = { window: {}, console };
vm.createContext(richSandbox);
vm.runInContext(fs.readFileSync(RICH, 'utf8'), richSandbox, { filename: 'hotpepper_rich_metadata.js' });
const rich = richSandbox.window.HOTPEPPER_RICH_METADATA;
if (!rich || !Array.isArray(rich.rows)) throw new Error('HOTPEPPER_RICH_METADATA rows missing');

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

function text(value) {
  return String(value || '').trim();
}

function mapCuisine(meta) {
  const candidates = [
    text(meta?.hotpepperGenre?.name),
    text(meta?.hotpepperGenre?.catch),
    text(meta?.sourceCatch)
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const [pattern, cuisine] of CUISINE_RULES) {
      if (pattern.test(candidate)) return cuisine;
    }
  }
  return null;
}

function parseBudgetBand(meta) {
  const raw = text(meta?.hotpepperBudget?.name);
  if (!raw) return null;
  const normalized = raw.replaceAll(',', '').replaceAll('，', '').replaceAll('〜', '～').replaceAll('~', '～');
  const numbers = [...normalized.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length >= 2) {
    const [low, high] = numbers;
    if (Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 1000000) {
      return [low, high];
    }
  }
  if (numbers.length === 1 && /^\s*[～≤<]/.test(normalized)) {
    const high = numbers[0];
    if (high > 0 && high <= 1000000) return [0, high];
  }
  return null;
}

function buildRow(meta) {
  if (!meta?.googlePlaceId || !['strict_auto', 'manual_exact'].includes(meta.hotpepperReviewMode)) return null;
  if (existingHotPepperIds.has(meta.googlePlaceId)) return null;

  const address = text(meta.hotpepperAddress);
  const cuisine = mapCuisine(meta);
  const dinner = parseBudgetBand(meta);
  const openingHoursRaw = text(meta.hotpepperOpeningHoursText);
  const closedNote = text(meta.hotpepperClosedText);
  const fields = [];
  if (address) fields.push('address');
  if (cuisine) fields.push('cuisine');
  if (dinner) fields.push('dinnerBudget');
  if (openingHoursRaw) fields.push('hours');
  if (closedNote) fields.push('closure');
  if (!fields.length) return null;

  const row = {
    id: `src-hotpepper-richcore-${meta.hotpepperId || meta.googlePlaceId}`,
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: text(meta.hotpepperName) || `Hot Pepper ${meta.hotpepperId || ''}`.trim(),
    googlePlaceId: meta.googlePlaceId,
    source: 'Hot Pepper',
    sourceOnly: true,
    hotpepperId: meta.hotpepperId || null,
    hotpepperReviewMode: meta.hotpepperReviewMode,
    tags: cuisine ? [cuisine] : [],
    lunch: null,
    dishes: [],
    sourceRefs: [{
      provider: 'Hot Pepper',
      url: text(meta.hotpepperUrl) || 'https://www.hotpepper.jp/',
      checkedAt: text(meta.checkedAt) || text(rich.checkedAt),
      fields,
      sourceNativeId: meta.hotpepperId || null,
      matchConfidence: meta.hotpepperReviewMode === 'manual_exact' ? 'manual_exact' : 'high',
      promotionMode: 'reviewed-rich-core-fallback',
      ...(dinner ? { priceEvidenceClass: 'explicit_range' } : {})
    }]
  };
  if (address) row.address = address;
  if (cuisine) row.cuisine = cuisine;
  if (dinner) row.dinner = dinner;
  if (openingHoursRaw) row.openingHoursRaw = openingHoursRaw;
  if (closedNote) {
    row.closedDays = [closedNote];
    row.closedNote = closedNote;
  }
  return row;
}

const rows = rich.rows.map(buildRow).filter(Boolean);
const summary = {
  reviewedRichRows: rich.rows.length,
  alreadyRepresentedByHotPepperSource: existingHotPepperIds.size,
  fallbackRows: rows.length,
  fieldClaims: rows.reduce((acc, row) => {
    for (const field of row.sourceRefs[0].fields) acc[field] = (acc[field] || 0) + 1;
    return acc;
  }, {})
};

const output = [
  '// Auto-generated from already-reviewed Hot Pepper rich metadata.',
  '// Adds only provider rows that do not already have a Hot Pepper source row.',
  '// It never creates production identities; stronger official/Tabelog claims retain priority.',
  `window.RESTAURANTS.push(...${JSON.stringify(rows)});`,
  ''
].join('\n');
fs.writeFileSync(OUT, output, 'utf8');
console.log(JSON.stringify(summary));
