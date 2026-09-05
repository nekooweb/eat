#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const OUTPUT = process.argv[3] || path.join(ROOT, 'data', 'source_enrichment_zlocatorhours.js');
const CHECKED_AT = process.env.LOCATOR_HOURS_CHECKED_AT || '2026-09-06';

// These hosts are store-detail/brand locators where the visible 営業時間 block is
// intended to describe the current branch, not a generic news/article page.
const TRUSTED_LOCATOR_HOSTS = new Set([
  'shop.tullys.co.jp',
  'store.starbucks.co.jp',
  'c-united.co.jp',
  'shop.doutor.co.jp',
  'map.torikizoku.co.jp',
  'locations.royalhost.jp',
  'stores.hanamaruudon.com',
  'tenpo.ichibanya.co.jp',
  'shop.saizeriya.co.jp',
  'shop.ufs.co.jp',
  'maps.nakau.co.jp',
  'maps.cocos-jpn.co.jp',
  'map.reins.co.jp',
  'shop.butayama.com',
  'shop.pronto.co.jp',
  'search.daisyo.co.jp',
  'shoplist.teke-teke.com',
  'skylark.co.jp',
  'yomenya-goemon.com',
  'tsukemen-tsujita.com',
  'ginza-renoir.co.jp'
]);

const STALE_OR_EXCEPTION = /(?:臨時|営業時間変更|営業時間を変更|時短|短縮営業|新型コロナ|コロナ|年末年始|特別営業時間|休業のお知らせ|休館日|期間限定)/u;
const DATE_NOTICE = /(?:20(?:1\d|2[0-5])年\s*\d{1,2}月|20(?:1\d|2[0-5])[./-]\d{1,2}[./-]\d{1,2})/u;

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function cleanHours(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || !/\d{1,2}:\d{2}/.test(s)) return null;
  if (STALE_OR_EXCEPTION.test(s) || DATE_NOTICE.test(s)) return null;
  return s.slice(0, 520);
}

function js(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const records = [];

for (const row of payload.results || []) {
  const current = productionById.get(row.googlePlaceId);
  if (!current || current.openingHours || !row.main?.ok || !row.nameMatched) continue;
  const sourceUrl = row.pageUrl || row.main?.finalUrl;
  if (!sourceUrl || !TRUSTED_LOCATOR_HOSTS.has(host(sourceUrl))) continue;

  const raw = cleanHours(row.main?.visibleHours);
  if (!raw) continue;
  const normalized = normalizeOpeningHours(raw, []);
  if (!normalized || !validateOpeningHours(normalized)) continue;

  records.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    sourceUrl,
    openingHoursRaw: raw
  });
}

records.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
const rowsJs = records.map((row) => `  { googlePlaceId:${js(row.googlePlaceId)}, name:${js(row.name)}, sourceUrl:${js(row.sourceUrl)}, openingHoursRaw:${js(row.openingHoursRaw)} }`).join(',\n');
const lines = [
  '// Conservative current-hours patches from trusted official store locator pages.',
  '// This z-shard augments an existing official enrichment row where possible,',
  '// preserving the one-official-row-per-Place-ID source-binding invariant.',
  '// Temporary/news language is rejected before this file is generated.',
  `const LOCATOR_HOURS_CHECKED_AT = ${js(CHECKED_AT)};`,
  'const locatorHourPatches = [',
  rowsJs,
  '];',
  '',
  'for (const patch of locatorHourPatches) {',
  "  const ref = { provider:'official', url:patch.sourceUrl, checkedAt:LOCATOR_HOURS_CHECKED_AT, fields:['hours'] };",
  "  let row = [...window.RESTAURANTS].reverse().find((item) => item && item.googlePlaceId === patch.googlePlaceId && item.source === 'official' && item.sourceOnly);",
  '  if (row) {',
  '    row.openingHoursRaw = patch.openingHoursRaw;',
  '    row.closedDays = [];',
  '    row.closedNote = null;',
  '    row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];',
  "    row.sourceRefs = row.sourceRefs.filter((item) => !(item.provider === 'official' && (item.fields || []).includes('hours')));",
  '    row.sourceRefs.push(ref);',
  '  } else {',
  "    window.RESTAURANTS.push({ id:`src-locator-hours-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`, profile:'TOKYO', area:'地区1️⃣', name:patch.name, googlePlaceId:patch.googlePlaceId, source:'official', sourceOnly:true, openingHoursRaw:patch.openingHoursRaw, closedDays:[], closedNote:null, sourceRefs:[ref] });",
  '  }',
  '}',
  ''
];

fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ records: records.length, hosts: [...new Set(records.map((r) => host(r.sourceUrl)))].sort() }));
