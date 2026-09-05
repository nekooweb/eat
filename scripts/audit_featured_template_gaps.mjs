#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionPath = path.join(ROOT, 'data', 'production_area1.js');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(productionPath, 'utf8'), sandbox, { filename: 'production_area1.js' });
const rows = sandbox.window.PRODUCTION_RESTAURANTS || [];

// These are only brands whose representative/signature item and Chinese name
// have already been reviewed in committed source enrichment. This audit does
// not create new dish semantics; it only finds same-brand production rows that
// could reuse an existing reviewed template after source/availability checks.
const templates = [
  { key:'tullys', re:/^タリーズコーヒー/u, item:'ハニーミルクラテ', zh:'蜂蜜牛奶拿铁', source:'https://www.tullys.co.jp/menu/drink/coffee/honey_m.html' },
  { key:'starbucks', re:/^スターバックス(?: コーヒー)?/u, item:'スターバックス ラテ', zh:'星巴克拿铁', source:'https://menu.starbucks.co.jp/4524785000230' },
  { key:'doutor', re:/^ドトールコーヒーショップ/u, item:'ミラノサンドA', zh:'米兰三明治A', source:'https://www.doutor.co.jp/app/dcs/menu/list/milano.html' },
  { key:'torikizoku', re:/^鳥貴族/u, item:'もも貴族焼\(たれ\)', zh:'招牌鸡腿贵族烧（酱汁）', source:'https://torikizoku.co.jp/menu/yakitori/' },
  { key:'hanamaru', re:/^はなまるうどん/u, item:'かけ', zh:'汤汁乌冬面', source:'https://www.hanamaruudon.com/menu/index.html' },
  { key:'royalhost', re:/^ロイヤルホスト/u, item:'黒×黒ハンバーグ', zh:'黑×黑汉堡肉排', source:'https://www.royalhost.jp/menu/grand/kurokuro_hamburg/black-black-hamburger-steak.html' },
  { key:'cocoichibanya', re:/^カレーハウスCoCo壱番屋/u, item:'ポークカレー', zh:'猪肉咖喱', source:'https://www.ichibanya.co.jp/menu/order.html' },
  { key:'tsujita', re:/^つじ田(?: |$)/u, item:'濃厚つけ麺', zh:'浓厚蘸面', source:'https://tsukemen-tsujita.com/menu/noukoutsukemen/' },
  { key:'cafe_veloce', re:/^カフェ[・･]ベローチェ/u, item:'ブレンドコーヒー', zh:'混合咖啡', source:'https://c-united.co.jp/veloce/drink/' },
  { key:'cafe_de_crie', re:/^カフェ[・･]ド[・･]クリエ/u, item:'ソルベージュ®エスプレッソ', zh:'浓缩咖啡冰沙', source:'https://c-united.co.jp/crie/drink/' },
  { key:'saizeriya', re:/^サイゼリヤ/u, item:'ミラノ風ドリア', zh:'米兰风焗饭', source:'https://www.saizeriya.co.jp/concept/' },
  { key:'nakau', re:/^なか卯/u, item:'親子丼', zh:'亲子丼', source:'https://www.nakau.co.jp/jp/menu/category/1.html' },
  { key:'cocos', re:/^ココス/u, item:'濃厚ビーフシチューの包み焼きハンバーグ', zh:'浓厚牛肉炖汤锡纸包汉堡肉排', source:'https://www.cocos-jpn.co.jp/menu/grand/hamburg/' },
  { key:'butayama', re:/^(?:ラーメン)?豚山/u, item:'小ラーメン', zh:'小份豚山拉面', source:'https://butayama.com/menu' },
  { key:'ueshima', re:/^上島珈琲店/u, item:'ミルク珈琲（黒糖）', zh:'黑糖牛奶咖啡', source:'https://www.ueshima-coffee-ten.jp/menu/coffee/milk-coffee-kokutou/' }
];

const groups = [];
let totalBrandRows = 0;
let totalMissing = 0;
for (const template of templates) {
  const matched = rows.filter((row) => template.re.test(String(row.name || '')));
  const missing = matched.filter((row) => !(Array.isArray(row.featuredDishes) && row.featuredDishes.length));
  totalBrandRows += matched.length;
  totalMissing += missing.length;
  groups.push({
    brand: template.key,
    reviewedItem: template.item,
    reviewedZh: template.zh,
    source: template.source,
    productionRows: matched.length,
    withFeatured: matched.length - missing.length,
    missingFeatured: missing.length,
    rows: missing.map((row) => ({
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      sources: row.sources || [],
      hasRecommended: Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0
    }))
  });
}

const output = {
  productionEntities: rows.length,
  templateBrands: templates.length,
  templateBrandRows: totalBrandRows,
  missingFeaturedAcrossTemplateBrands: totalMissing,
  groups: groups.filter((group) => group.productionRows > 0)
};
console.log(JSON.stringify(output, null, 2));
