#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function boot(rows, randomValue = 0) {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', hidden: false, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; }
    });
    return nodes.get(selector);
  }
  ['#rejects','#stats','#results','#generate','[data-filter-module="budget"]','[data-filter-module="food"]','#more-cuisines-summary'].forEach(node);
  const ctx = {
    window: { GOOGLE_INVENTORY_RESTAURANTS: rows, GOOGLE_INVENTORY_STATS: {
      inventoryTotal: rows.length, namedBasic: rows.length, placeIdOnly: 0, catalogTotal: 2804
    }},
    document: {querySelector: selector => nodes.get(selector) || null, querySelectorAll: () => []},
    crypto: {getRandomValues(array) {array.fill(randomValue);return array;}},
    console, requestAnimationFrame: callback => callback()
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('app.js','utf8'),ctx);
  return {
    node,
    generate() {node('#generate').onclick();return node('#results').innerHTML;},
    exclude(tag) {
      const button={dataset:{tag},classList:{toggle(){}},setAttribute(){}};
      node('#rejects').handlers.click({target:{closest:()=>button}});
    }
  };
}

function restaurant(id,cuisine,extra={}) {
  return {id,googlePlaceId:id,name:id,cuisine,lat:35.6959,lng:139.7576,distanceMeters:100,
    nameKnown:true,basicInfoState:'canonical',inventoryWithinRadius:true,
    recommendedDishes:[],featuredDishes:[],lunch:null,dinner:null,...extra};
}

test('cuisine aliases become one filter and exclusion matches both source spellings',()=>{
  const rows=[restaurant('中餐甲','中华'),restaurant('中餐乙','中華'),
    restaurant('韩餐甲','韩国菜'),restaurant('韩餐乙','韓国料理'),
    restaurant('拉面甲','拉面'),restaurant('拉面乙','ラーメン')];
  const original=JSON.stringify(rows),page=boot(rows);
  const filters=page.node('#rejects').innerHTML;
  assert.equal((filters.match(/data-tag="中华"/g)||[]).length,1);
  assert.doesNotMatch(filters,/data-tag="(?:中華|韓国料理|ラーメン)"/);
  page.exclude('中华');
  const html=page.generate();
  assert.doesNotMatch(html,/中餐甲|中餐乙/);
  assert.equal(JSON.stringify(rows),original,'display normalization must not mutate source rows');
});

test('generic cuisine placeholders are not shown as filters or result badges',()=>{
  const page=boot([restaurant('甲','restaurant'),restaurant('乙','餐厅'),restaurant('丙','その他グルメ')]);
  assert.doesNotMatch(page.node('#rejects').innerHTML,/data-tag="/);
  assert.doesNotMatch(page.generate(),/<span class="pill">(?:restaurant|餐厅|その他グルメ|菜系待补)<\/span>/);
});

test('database status does not expose internal diagnostic counters',()=>{
  const page=boot([restaurant('甲','日式'),restaurant('乙','中华'),restaurant('丙','咖啡')]);
  const text=page.node('#stats').innerHTML+page.node('#stats').textContent;
  assert.doesNotMatch(text,/Google Maps|Place ID|库存|已有基础资料|已知菜系|待补|推荐菜|特色菜/);
  assert.match(text,/3/);
});

test('comparison is opt-in and entirely unknown fields do not produce rows',()=>{
  const page=boot([restaurant('甲','日式'),restaurant('乙','中华'),restaurant('丙','咖啡')]);
  const html=page.generate();
  assert.match(html,/<details[^>]*class="[^"]*compare-panel/);
  assert.doesNotMatch(html,/<details[^>]*compare-panel[^>]*\bopen(?:[ >])/);
  const table=html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]||'';
  assert.doesNotMatch(table,/<th[^>]*>(?:预算|推荐\/特色菜|营业时间|百名店)<\/th>/);
  assert.equal((html.match(/<article class="card result-card">/g)||[]).length,3);
  assert.match(html,/id="overview-map"/);
  assert.match(html,/query_place_id=/);
});

test('known dishes budgets and hours remain on the cards',()=>{
  const extra={recommendedDishes:['饺子'],lunch:[1000,1999],hoursReference:'周一 11:00–14:00'};
  const html=boot([restaurant('甲','中华',extra),restaurant('乙','咖啡'),restaurant('丙','日式')]).generate();
  assert.match(html,/推荐菜/);assert.match(html,/饺子/);assert.match(html,/¥1,000/);assert.match(html,/周一 11:00–14:00/);
});

test('secondary cuisine filters are collapsed and accessible when many types exist',()=>{
  const page=boot(Array.from({length:20},(_,i)=>restaurant('店'+i,'类别'+i)));
  assert.match(page.node('#rejects').innerHTML,/<details[^>]*class="[^"]*more-cuisines/);
  assert.match(page.node('#rejects').innerHTML,/<summary[^>]*>更多菜系/);
});

test('footer retains attribution and legal links without internal pipeline narration',()=>{
  const index=fs.readFileSync('index.html','utf8');
  const footer=index.match(/<footer[\s\S]*?<\/footer>/)?.[0]||'';
  assert.doesNotMatch(footer,/Place ID|冻结|API key|独立来源匹配/);
  assert.match(footer,/ホットペッパー/);assert.match(footer,/OpenStreetMap/);
  assert.match(footer,/privacy.html/);assert.match(footer,/terms.html/);
  assert.ok((footer.match(/<p>/g)||[]).length<=3);
});

test('normalized cuisine grouping avoids two aliases when three real cuisines exist',()=>{
  const rows=[restaurant('中餐甲','中华'),restaurant('中餐乙','中華'),
    restaurant('韩餐甲','韩国菜'),restaurant('拉面甲','拉面')];
  const html=boot(rows,0).generate();
  const names=[...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(x=>x[1]);
  assert.equal(names.filter(x=>x.startsWith('中餐')).length,1);
  assert.ok(names.includes('韩餐甲'));
  assert.ok(names.includes('拉面甲'));
});

test('more-cuisines summary reveals active exclusions while collapsed',()=>{
  const page=boot(Array.from({length:20},(_,i)=>restaurant('店'+i,'类别'+String(i).padStart(2,'0'))));
  page.exclude('类别19');
  assert.match(page.node('#more-cuisines-summary').textContent,/已排除 1 项/);
  page.exclude('类别19');
  assert.doesNotMatch(page.node('#more-cuisines-summary').textContent,/已排除/);
});

test('restaurant text remains escaped in card and comparison markup',()=>{
  const html=boot([restaurant('<script>甲</script>','中华'),restaurant('乙','咖啡'),restaurant('丙','日式')]).generate();
  assert.doesNotMatch(html,/<script>甲<\/script>/);
  assert.match(html,/&lt;script&gt;甲&lt;\/script&gt;/);
});
