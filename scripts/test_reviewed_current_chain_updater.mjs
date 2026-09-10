#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'eat-current-chain-')),'evidence.json');
const run=spawnSync(process.execPath,[path.join(HERE,'build_reviewed_current_chain_recommendations.mjs'),out],{cwd:ROOT,encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const x=JSON.parse(fs.readFileSync(out,'utf8'));
const s=x.summary||{};
assert.equal(x.policy?.networkRequests,0);
assert.equal(x.policy?.paidGoogleDataApiCalls,0);
assert.equal(x.policy?.identityMutationAllowed,false);
assert.equal(x.policy?.sourceDomainMustAlreadyBeBoundToIdentity,true);
assert.equal(x.policy?.alreadyRecommendedTargetsSkipped,true);
assert.equal(x.policy?.outputOnlyCurrentRecommendationGaps,true);
assert.match(String(x.policy?.publicRuntimeCountPolicy||''),/^dynamic;/);
assert.ok(Number.isInteger(Number(s.reviewedRules))&&Number(s.reviewedRules)>0);
assert.equal(Number(s.skippedAlreadyRecommendedRules||0)+Number(s.recommendationRestaurants||0),Number(s.reviewedRules));
assert.equal((x.rows||[]).length,Number(s.recommendationRestaurants||0));
const ids=(x.rows||[]).map(row=>row.googlePlaceId);
assert.equal(new Set(ids).size,ids.length,'current gap output must not contain duplicate Place IDs');
for(const row of x.rows||[]){
  assert.ok(row.googlePlaceId&&row.name);
  assert.ok(Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length>0&&row.recommendedDishes.length<=2);
  for(const item of row.recommendedDishes){
    assert.ok(item.nameZh&&item.nameJa);
    assert.equal(item.provider,'sourceWebsite');
    assert.match(item.sourceUrl,/^https:\/\//);
    assert.equal(item.evidenceClass,'source_recommendation_text');
    assert.match(item.evidenceRule,/^reviewed-current-chain:/);
    assert.ok(item.evidenceSnippet);
  }
}
for(const rel of ['scripts/build_reviewed_current_chain_recommendations.mjs','scripts/build_reviewed_doutor_chain_gap_recommendations.mjs']){
  const source=fs.readFileSync(path.join(ROOT,rel),'utf8');
  assert.doesNotMatch(source,/\.length\s*!==\s*1422|\.length!==1422/,`${rel} must not pin the named runtime to 1422`);
  assert.match(source,/assertRuntimeCatalogContract/);
}
console.log(JSON.stringify({status:'pass',reviewedRules:Number(s.reviewedRules),currentGapRows:(x.rows||[]).length,skipped:Number(s.skippedAlreadyRecommendedRules||0),fixedNamedRuntimeCount:false}));
