#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'eat-retained-strict-')),'evidence.json');
const run=spawnSync(process.execPath,[path.join(HERE,'build_retained_hotpepper_strict_gap_recommendations.mjs'),out],{cwd:ROOT,encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const x=JSON.parse(fs.readFileSync(out,'utf8'));
const s=x.summary||{};
assert.equal(x.policy?.networkRequests,0);
assert.equal(x.policy?.paidGoogleDataApiCalls,0);
assert.equal(x.policy?.identityMutationAllowed,false);
assert.equal(x.policy?.recommendationRequiresExplicitMarker,true);
assert.equal(x.policy?.recommendationRequiresConcreteSourceNativeDishRule,true);
assert.equal(x.policy?.outputOnlyCurrentRecommendationGaps,true);
assert.equal(x.policy?.zeroGapIsValid,true);
assert.match(String(x.policy?.publicRuntimeCountPolicy||''),/^dynamic;/);
assert.equal(Number(s.recommendationRestaurants||0),(x.rows||[]).length);
assert.equal(Number(s.recommendationItems||0),(x.rows||[]).reduce((n,row)=>n+(row.recommendedDishes||[]).length,0));
assert.ok(Number(s.publicRuntimeTotal)>0);
for(const row of x.rows||[]){
  assert.ok(row.googlePlaceId&&row.name);
  assert.ok(Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length>0);
  for(const item of row.recommendedDishes){
    assert.equal(item.provider,'Hot Pepper');
    assert.equal(item.evidenceClass,'source_recommendation_text');
    assert.match(item.sourceUrl,/^https:\/\/www\.hotpepper\.jp\/strJ\d+/u);
    assert.match(item.evidenceRule,/^hotpepper-strict-gap-/);
    assert.ok(item.nameZh&&item.nameJa&&item.evidenceSnippet);
  }
}
const source=fs.readFileSync(path.join(HERE,'build_retained_hotpepper_strict_gap_recommendations.mjs'),'utf8');
assert.doesNotMatch(source,/\.length\s*!==\s*1422|\.length!==1422/);
assert.match(source,/assertRuntimeCatalogContract/);
console.log(JSON.stringify({status:'pass',currentGapRows:(x.rows||[]).length,fixedNamedRuntimeCount:false,zeroGapValid:true}));
