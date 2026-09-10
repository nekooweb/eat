#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eat-evidence-retention-'));
const previousPath=path.join(tmp,'previous.json');
const currentPath=path.join(tmp,'current.json');
const outputPath=path.join(tmp,'merged.json');
const pid='test-place-retention';

function dish(n,checkedAt='2026-09-01',extra={}){
  return {nameZh:`测试菜${n}`,nameJa:`テスト${n}`,provider:'sourceWebsite',sourceUrl:`https://example.com/menu/${n}`,checkedAt,evidenceClass:'source_recommendation_text',evidenceRule:`old-${n}`,...extra};
}
const six=Array.from({length:6},(_,i)=>dish(i+1));
const previous={schemaVersion:3,checkedAt:'2026-09-01',rows:[{googlePlaceId:pid,name:'Test',recommendedDishes:six,featuredDishes:[]}]};
const seventh=dish(7,'2026-09-10');
const richerReplacement={...dish(1,'2026-09-01'),evidenceRule:'reviewed-richer',evidenceSnippet:'explicit recommendation text'};
const current={schemaVersion:3,checkedAt:'2026-09-10',rows:[{googlePlaceId:pid,name:'Test',recommendedDishes:[seventh,richerReplacement],featuredDishes:[]}]};
fs.writeFileSync(previousPath,JSON.stringify(previous));
fs.writeFileSync(currentPath,JSON.stringify(current));

const run=spawnSync(process.execPath,[path.join(ROOT,'scripts/merge_google_inventory_detail_evidence.mjs'),previousPath,currentPath,outputPath],{encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const merged=JSON.parse(fs.readFileSync(outputPath,'utf8'));
assert.equal(merged.rows.length,1);
const items=merged.rows[0].recommendedDishes;
assert.equal(items.length,7,'6 old + 1 distinct new evidence item must all survive storage merge');
assert.deepEqual(new Set(items.map(x=>x.nameZh)),new Set(Array.from({length:7},(_,i)=>`测试菜${i+1}`)));
const one=items.find(x=>x.nameZh==='测试菜1');
assert.equal(one.evidenceRule,'reviewed-richer','same-key evidence should keep the richer same-date representation');
assert.equal(one.evidenceSnippet,'explicit recommendation text');
assert.equal(merged.summary.previousEvidence.recommendationItems,6);
assert.equal(merged.summary.freshCrawlEvidence.recommendationItems,2);
assert.equal(merged.summary.mergedEvidence.recommendationItems,7);
assert.equal(merged.policy.evidenceStorageItemLimit,null);
assert.equal(merged.policy.presentationItemLimitAppliedHere,false);

// Empty/no-match refresh must retain the full prior evidence set too.
const emptyCurrent=path.join(tmp,'empty.json');
const emptyOutput=path.join(tmp,'empty-merged.json');
fs.writeFileSync(emptyCurrent,JSON.stringify({schemaVersion:3,checkedAt:'2026-09-11',rows:[]}));
const rerun=spawnSync(process.execPath,[path.join(ROOT,'scripts/merge_google_inventory_detail_evidence.mjs'),outputPath,emptyCurrent,emptyOutput],{encoding:'utf8'});
assert.equal(rerun.status,0,rerun.stderr||rerun.stdout);
const retained=JSON.parse(fs.readFileSync(emptyOutput,'utf8'));
assert.equal(retained.rows[0].recommendedDishes.length,7,'no-match refresh must not truncate retained evidence');

console.log(JSON.stringify({status:'pass',retainedItems:7,distinctNewItemPreserved:true,richerDuplicateSelected:true,noMatchRefreshPreserved:true}));
