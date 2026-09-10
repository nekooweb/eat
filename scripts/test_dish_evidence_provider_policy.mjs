#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALLOWED_DISH_EVIDENCE_PROVIDERS } from './dish_evidence_provider_policy.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eat-provider-policy-'));
const evidence=path.join(tmp,'retained.json');
const pending=path.join(tmp,'pending.json');
const run=spawnSync(process.execPath,[path.join(HERE,'build_retained_dish_evidence.mjs'),evidence,pending],{cwd:ROOT,encoding:'utf8'});
assert.equal(run.status,0,run.stderr||run.stdout);
const x=JSON.parse(fs.readFileSync(evidence,'utf8'));
const allowed=new Set(ALLOWED_DISH_EVIDENCE_PROVIDERS);
const observed=new Set();
for(const row of x.rows||[]){
  for(const item of [...(row.recommendedDishes||[]),...(row.featuredDishes||[])]){
    observed.add(item.provider);
    assert.ok(allowed.has(item.provider),`retained builder emitted provider missing from audit allow-list: ${item.provider}`);
  }
}
assert.ok(observed.has('Tokyo Ramen of the Year'),'regression fixture must exercise the provider that previously broke the full collection merge audit');
assert.ok(observed.has('Visit Chiyoda'));
assert.ok(observed.has('Tabelog'));
assert.ok(observed.has('official'));
assert.equal(new Set(ALLOWED_DISH_EVIDENCE_PROVIDERS).size,ALLOWED_DISH_EVIDENCE_PROVIDERS.length,'allow-list must not contain duplicates');
console.log(JSON.stringify({status:'pass',observedProviders:[...observed].sort(),allowedProviders:ALLOWED_DISH_EVIDENCE_PROVIDERS}));
