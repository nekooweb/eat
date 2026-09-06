#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const CHECKED_AT = '2026-09-06';

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'production_area1.js'), 'utf8'), sandbox);
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

const reviewed = [
  {
    googlePlaceId: 'ChIJ2Yrt4RmMGGARLlGJseqwXLU',
    name: 'Delifrance お茶の水カフェベーカリー店',
    cuisine: '面包・烘焙',
    address: '東京都千代田区神田駿河台2-14-3 1F',
    openingHoursRaw: '月–金 07:00–20:30; 土 07:00–20:00; 日 08:00–20:00',
    closedDays: [],
    sourceUrl: 'https://shop.viedefrance.co.jp/detail/7001/',
    fields: ['name', 'cuisine', 'address', 'hours', 'closure']
  },
  {
    googlePlaceId: 'ChIJ7wAjrBuMGGARHOWStkoMVCI',
    name: "NEW YORKER'S Cafe 駿河台4丁目店",
    cuisine: '咖啡',
    address: '東京都千代田区神田駿河台4-1-1 ウエルトンビル1F',
    openingHoursRaw: '月–金 07:00–22:00; 土 08:00–22:00; 日 08:00–21:30',
    closedDays: [],
    sourceUrl: 'https://www.ginza-renoir.co.jp/shopsearch/shops/tokyo/chiyoda-ku/nyc-surugadai-4chome.html',
    fields: ['name', 'cuisine', 'address', 'hours', 'closure']
  },
  {
    googlePlaceId: 'ChIJB_WeKhqMGGARiHfhZXYgVFo',
    name: 'おむすび権米衛 御茶ノ水ソラシティ店',
    cuisine: '日式',
    address: '東京都千代田区神田駿河台4-6 御茶ノ水ソラシティ地下1階',
    dishes: ['おむすび'],
    sourceUrl: 'https://www.omusubi-gonbei.com/shoplist/tokyo/otyanomizu.html',
    fields: ['name', 'cuisine', 'address', 'dishes'],
    featured: [{ nameJa: 'おむすび', nameZh: '饭团', kind: 'representative' }]
  },
  {
    googlePlaceId: 'ChIJCzypNAWMGGAR_z5GQlqWIjE',
    name: '焼肉一頭',
    cuisine: '烤肉',
    address: '東京都千代田区神田小川町3-1-3 ヤギビル1F',
    openingHoursRaw: '月–金 17:00–23:00; 土–日 12:00–22:00',
    closedDays: [],
    dishes: ['厚切上タン'],
    sourceUrl: 'https://yakiniku-ittou.foodre.jp/',
    fields: ['name', 'cuisine', 'address', 'hours', 'closure', 'dishes'],
    recommended: ['厚切特级牛舌']
  },
  {
    googlePlaceId: 'ChIJiYAt_buNGGARFvMBSTCT2Lk',
    name: '四川厨房 随苑',
    cuisine: '中华',
    address: '東京都千代田区内神田2-10-2 不動前ビル1F',
    openingHoursRaw: '月–日 11:00–15:00, 17:00–23:00',
    closedDays: [],
    dishes: ['牛肉と豆腐の四川風煮込み', '鉢鉢鶏'],
    sourceUrl: 'https://shisenchubouzuien.jp/sp/menu.html',
    fields: ['name', 'cuisine', 'address', 'hours', 'closure', 'dishes'],
    recommended: ['四川风牛肉豆腐煮', '四川钵钵鸡']
  },
  {
    googlePlaceId: 'ChIJkf2ziASMGGARHUeHSS0R9Vw',
    name: '月光食堂 神田司町店',
    cuisine: '居酒屋',
    address: '東京都千代田区神田司町2-9-2 ディーキューブビル1F',
    openingHoursRaw: '月–金 11:30–13:45, 17:00–23:00; 土 17:00–23:00',
    closedDays: ['日'],
    dishes: ['もつ鍋', '焼豚足'],
    sourceUrl: 'https://gekko-shokudo-kanda.com/',
    fields: ['name', 'cuisine', 'address', 'hours', 'closure', 'dishes'],
    recommended: ['博多牛杂锅', '名物烤猪蹄']
  },
  {
    googlePlaceId: 'ChIJyZAT2BCMGGARLI6GGHovI0c',
    name: 'ブラッセルズ神田神保町',
    cuisine: '酒吧',
    address: '東京都千代田区神田小川町3-16-1 サニービル1F',
    sourceUrl: 'https://www.brussels.co.jp/restaurant_01.html',
    fields: ['name', 'cuisine', 'address']
  }
];

const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
for (const item of reviewed) {
  if (!productionById.has(item.googlePlaceId)) {
    throw new Error(`reviewed Place ID is not canonical production: ${item.googlePlaceId}`);
  }
}

const indexPath = path.join(DATA, 'official_candidate_index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const indexById = new Map((index.records || []).map((row) => [row.googlePlaceId, row]));
for (const item of reviewed) {
  const prod = productionById.get(item.googlePlaceId);
  const pageHost = new URL(item.sourceUrl).hostname.replace(/^www\./, '');
  indexById.set(item.googlePlaceId, {
    googlePlaceId: item.googlePlaceId,
    name: item.name,
    distanceMeters: prod.distanceMeters,
    pageUrl: item.sourceUrl,
    pageHost,
    menuUrls: item.dishes ? [item.sourceUrl] : []
  });
}
index.records = [...indexById.values()].sort((a, b) =>
  (a.distanceMeters ?? 99999) - (b.distanceMeters ?? 99999)
  || a.googlePlaceId.localeCompare(b.googlePlaceId));
index.generatedAt = CHECKED_AT;
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');

const rows = reviewed.map((item) => {
  const prod = productionById.get(item.googlePlaceId);
  const row = {
    id: `official-fullcollection-${item.googlePlaceId}`,
    name: item.name,
    cuisine: item.cuisine,
    lat: prod.lat,
    lng: prod.lng,
    distanceMeters: prod.distanceMeters,
    sourceOnly: true,
    googlePlaceId: item.googlePlaceId,
    address: item.address,
    sourceRefs: [{
      provider: 'official',
      url: item.sourceUrl,
      checkedAt: CHECKED_AT,
      fields: item.fields
    }]
  };
  if (item.openingHoursRaw) row.openingHoursRaw = item.openingHoursRaw;
  if (item.closedDays) row.closedDays = item.closedDays;
  if (item.dishes) row.dishes = item.dishes;
  return row;
});

const lines = [];
lines.push('// Reviewed independent official sources for restaurants admitted during the full 2,804-ID collection pass.');
lines.push('// Google display payload is not persisted here. Ambiguous or conflicting fields stay omitted.');
lines.push('window.RESTAURANTS.push(');
rows.forEach((row, i) => {
  const suffix = i === rows.length - 1 ? '' : ',';
  lines.push(`${JSON.stringify(row, null, 2)}${suffix}`);
});
lines.push(');');

for (const item of reviewed.filter((x) => x.featured)) {
  lines.push(`window.FEATURED_DISHES.push(${JSON.stringify({
    googlePlaceId: item.googlePlaceId,
    dishes: item.featured,
    sourceUrl: item.sourceUrl,
    checkedAt: CHECKED_AT
  })});`);
}
for (const item of reviewed.filter((x) => x.recommended)) {
  lines.push(`window.RECOMMENDED_DISHES.push(${JSON.stringify({
    googlePlaceId: item.googlePlaceId,
    dishes: item.recommended,
    sourceUrl: item.sourceUrl,
    checkedAt: CHECKED_AT
  })});`);
}

const shardPath = path.join(DATA, 'source_enrichment_fullcollection.js');
fs.writeFileSync(shardPath, lines.join('\n') + '\n', 'utf8');

console.log(JSON.stringify({
  reviewedOfficialSources: reviewed.length,
  officialIndexRecords: index.records.length,
  sourceRows: rows.length,
  addressRows: reviewed.filter((x) => x.address).length,
  openingHoursRows: reviewed.filter((x) => x.openingHoursRaw).length,
  cuisineRows: reviewed.filter((x) => x.cuisine).length,
  representativeDishRows: reviewed.filter((x) => x.featured).length,
  strictRecommendationRows: reviewed.filter((x) => x.recommended).length,
  intentionallyNoHours: ['ChIJB_WeKhqMGGARiHfhZXYgVFo', 'ChIJyZAT2BCMGGARLI6GGHovI0c'],
  stillNoOfficialSource: ['ChIJSUtVU-mNGGAR7Q_BobNqLS8']
}, null, 2));
