#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function restaurant(id, cuisine, tags = [], extra = {}) {
  return {
    id, googlePlaceId: id, name: id, cuisine, tags,
    lat: 35.6959, lng: 139.7576, distanceMeters: 100,
    nameKnown: true, basicInfoState: 'canonical', inventoryWithinRadius: true,
    recommendedDishes: [], featuredDishes: [], lunch: null, dinner: null,
    ...extra
  };
}

function boot(rows) {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', hidden: false, handlers: {}, onclick: null,
      addEventListener(type, handler) { this.handlers[type] = handler; }
    });
    return nodes.get(selector);
  }
  [
    '#rejects', '#stats', '#results', '#generate', '#clear-rejects',
    '[data-filter-module="budget"]', '[data-filter-module="food"]'
  ].forEach(node);

  const ctx = {
    window: {
      GOOGLE_INVENTORY_RESTAURANTS: rows,
      GOOGLE_INVENTORY_STATS: { inventoryTotal: rows.length, namedBasic: rows.length, placeIdOnly: 0, catalogTotal: 2804 }
    },
    document: {
      querySelector: (selector) => nodes.get(selector) || null,
      querySelectorAll: () => []
    },
    crypto: { getRandomValues(array) { array.fill(0); return array; } },
    console,
    requestAnimationFrame: (callback) => callback()
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('classification.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), ctx);

  return {
    node,
    generate() { node('#generate').onclick(); return node('#results').innerHTML; },
    exclude(classId) {
      const button = { dataset: { classId }, classList: { toggle() {} }, setAttribute() {} };
      node('#rejects').handlers.click({ target: { closest: () => button } });
    },
    clear() { node('#clear-rejects').onclick(); }
  };
}

const rows = [
  restaurant('拉面甲', 'ラーメン'),
  restaurant('拉面乙', '拉面'),
  restaurant('乌冬甲', 'うどん'),
  restaurant('寿司甲', '寿司'),
  restaurant('咖啡甲', 'カフェ'),
  restaurant('酒吧甲', 'バー・カクテル'),
  restaurant('未知甲', '餐厅')
];

{
  const page = boot([...rows, restaurant('日式甲', '日式')]);
  const filters = page.node('#rejects').innerHTML;
  assert.match(filters, /菜系风格/);
  assert.match(filters, /主营食物/);
  assert.match(filters, /店铺类型/);
  assert.match(filters, /data-class-id="style-japanese"/);
  assert.match(filters, /data-class-id="food-noodles"/);
  assert.match(filters, /data-class-id="food-ramen"/);
  assert.match(filters, /data-class-id="venue-cafe"/);
}

{
  const page = boot(rows);
  page.exclude('food-noodles');
  assert.match(page.node('#stats').textContent, /4 \/ 7/, 'noodle parent must exclude ramen + udon but keep unknown rows');
  const html = page.generate();
  assert.doesNotMatch(html, /拉面甲|拉面乙|乌冬甲/);
}

{
  const page = boot(rows);
  page.exclude('food-ramen');
  assert.match(page.node('#stats').textContent, /5 \/ 7/, 'ramen exclusion must not exclude udon or unknown rows');
  page.clear();
  assert.match(page.node('#stats').textContent, /7 \/ 7/);
}

{
  const page = boot(rows);
  page.generate();
  page.exclude('venue-bar');
  assert.match(page.node('#results').innerHTML, /条件已变化，请重新生成/,
    'changing a filter must invalidate the previous random result instead of silently treating it as current');
}

{
  const multi = boot([
    restaurant('日式寿司居酒屋', '日式', ['寿司', '居酒屋']),
    restaurant('咖啡乙', '咖啡'),
    restaurant('酒吧乙', '酒吧')
  ]);
  const html = multi.generate();
  assert.match(html, /日式/);
  assert.match(html, /寿司|居酒屋/, 'cards must use the same normalized accepted classification result as filtering');
}

console.log(JSON.stringify({ status: 'pass', checks: 'grouped filters, parent exclusion, child isolation, unknown preservation, clear action, stale-result invalidation' }));
