#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from pathlib import Path
p=Path('scripts/build_reviewed_agent_dish_evidence.mjs')
s=p.read_text()
old="""export const LANES = Object.freeze({
  'DISH-R-OFFICIAL': 'official_crawl',
  'DISH-R-RETAINED': 'retained_source_mining'
});"""
new="""export const LANES = Object.freeze({
  'DISH-R-OFFICIAL': 'official_crawl',
  'DISH-R-RETAINED': 'retained_source_mining',
  'DISH-R-DISCOVERY': 'independent_source_discovery',
  'DISH-F-SOURCE': 'official_or_retained_featured'
});"""
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('LANES patch anchor missing')
old2="const currentRows = currentPlan.rows.filter(row => Object.values(LANES).includes(row.lane));"
new2="""const assignmentScopes = new Set(assignments.map(row => `${row.lane}:${row.shard}`));
  const currentRows = currentPlan.rows.filter(row => assignmentScopes.has(`${row.lane}:${row.shard}`));"""
if old2 in s:
    s=s.replace(old2,new2,1)
elif new2 not in s:
    raise SystemExit('currentRows patch anchor missing')
s=s.replace("throw new Error('Assignment outside Official/Retained scope');", "throw new Error('Assignment outside supported reviewed-evidence scope');")
p.write_text(s)

p=Path('scripts/test_reviewed_agent_dish_evidence.mjs')
s=p.read_text()
old="const { buildReviewedEvidence, auditReviewCoverage, translateExactDish } = await import(moduleUrl);"
new="const { buildReviewedEvidence, auditReviewCoverage, translateExactDish, LANES } = await import(moduleUrl);"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('test import patch anchor missing')
anchor="assert.equal(stdinImport.status, 0, `Adapter helpers must be importable from stdin: ${stdinImport.stderr}`);"
insert=anchor+"\nassert.equal(LANES['DISH-R-DISCOVERY'], 'independent_source_discovery');\nassert.equal(LANES['DISH-F-SOURCE'], 'official_or_retained_featured');"
if insert not in s:
    if anchor not in s:
        raise SystemExit('test lane assertion anchor missing')
    s=s.replace(anchor,insert,1)
regression="""
for (const [marker, lane] of [['DISH-R-DISCOVERY', 'independent_source_discovery'], ['DISH-F-SOURCE', 'official_or_retained_featured']]) {
  const assignmentLane = { googlePlaceId: `test-${marker}`, name: `Frozen ${marker}`, lane, shard: 3 };
  const laneRecord = { googlePlaceId: assignmentLane.googlePlaceId, restaurantName: assignmentLane.name,
    status: 'no_evidence', identity: { state: 'unverified', sourceAliases: [], evidence: [] },
    dishProposals: [], attemptedSources: [], blocker: null, notes: 'Regression terminal outcome.' };
  const laneDoc = { marker, shard: 'S3', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: 'b'.repeat(40),
    generatedAt: date, policyAttestation: document.policyAttestation, records: [laneRecord],
    summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 0, candidateRows: 0,
      noEvidenceRows: 1, blockedRows: 0, skippedAlreadyCompleteRows: 0 } };
  const coverage = auditReviewCoverage([assignmentLane], [{ document: laneDoc }], { sourceQueueCommit: 'b'.repeat(40) });
  assert.equal(coverage.reviewedRows, 1, `${marker} must be accepted by the fail-closed coverage gate`);
}
"""
if 'DISH-R-DISCOVERY must be accepted by the fail-closed coverage gate' not in s and "for (const [marker, lane] of [['DISH-R-DISCOVERY'" not in s:
    s += regression
p.write_text(s)
PY

node scripts/audit_no_paid_apis.mjs
python3 scripts/reload_data.py --public-only --outdir /tmp/e2e-s3-baseline
node - <<'NODE'
const fs=require('fs'),vm=require('vm');
const plan=JSON.parse(fs.readFileSync('data/dish_batch_plan.json','utf8'));
const rows=plan.rows.filter(r=>r.shard===3 && ['independent_source_discovery','official_or_retained_featured'].includes(r.lane));
const byLane=Object.fromEntries(['independent_source_discovery','official_or_retained_featured'].map(l=>[l,rows.filter(r=>r.lane===l).length]));
if(rows.length!==49 || byLane.independent_source_discovery!==40 || byLane.official_or_retained_featured!==9) throw new Error(`Unexpected rebuilt S3 denominator ${JSON.stringify(byLane)}`);
if(new Set(rows.map(r=>r.googlePlaceId)).size!==rows.length) throw new Error('duplicate current S3 assignment');
fs.writeFileSync('/tmp/e2e-s3-assignment.json',JSON.stringify({total:rows.length,byLane,rows},null,2)+'\n');
const sandbox={window:{},console}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('data/google_inventory_runtime.js','utf8'),sandbox);
const s=sandbox.window.GOOGLE_INVENTORY_STATS||{};
fs.writeFileSync('/tmp/e2e-s3-before-stats.json',JSON.stringify(s,null,2)+'\n');
console.log('S3_CURRENT_ASSIGNMENT='+JSON.stringify({total:rows.length,byLane}));
console.log('S3_BASELINE='+JSON.stringify({recommended:s.recommendedDishesKnown,featured:s.featuredDishesKnown,display:s.chineseDishDisplayRows,noDish:s.unfilledDishRows,recommendationGap:1422-s.recommendedDishesKnown}));
NODE

node scripts/build_e2e_dish_s3_review.mjs
node scripts/test_reviewed_agent_dish_evidence.mjs
mkdir -p _audit
node scripts/build_reviewed_agent_dish_evidence.mjs \
  data/agent_reviews/e2e-dish-s3-20260914.json \
  _audit/e2e-s3-reviewed-evidence.json \
  _audit/e2e-s3-translation-pending.json \
  _audit/e2e-s3-review-audit.json | tee /tmp/e2e-s3-adapter.log
node - <<'NODE'
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('_audit/e2e-s3-review-audit.json','utf8'));
const current=JSON.parse(fs.readFileSync('/tmp/e2e-s3-assignment.json','utf8'));
if(a.currentAssignmentRows!==49 || a.currentReviewedRows!==49 || a.reviewedRows!==49 || current.total!==49) throw new Error('S3 review coverage is not 49/49');
if(a.translationPendingItems!==0) throw new Error('Unexpected S3 translation pending item');
console.log('S3_REVIEW='+JSON.stringify(a));
NODE

node scripts/audit_agent_dish_integration.mjs --snapshot _audit/e2e-s3-before.json
node scripts/merge_google_inventory_detail_evidence.mjs \
  data/google_inventory_detail_evidence.json \
  _audit/e2e-s3-reviewed-evidence.json \
  /tmp/e2e-s3-merged.json | tee /tmp/e2e-s3-merge.log
cp /tmp/e2e-s3-merged.json data/google_inventory_detail_evidence.json
node scripts/correct_dish_specificity_evidence.mjs \
  data/google_inventory_detail_evidence.json \
  data/google_inventory_detail_evidence.json | tee /tmp/e2e-s3-specificity.log
node scripts/audit_google_inventory_detail_evidence.mjs

python3 scripts/reload_data.py --public-only --outdir /tmp/e2e-s3-after
node scripts/audit_agent_dish_integration.mjs --compare \
  _audit/e2e-s3-before.json \
  _audit/e2e-s3-reviewed-evidence.json \
  _audit/e2e-s3-integration-audit.json | tee /tmp/e2e-s3-integration.log
node scripts/test_agent_dish_integration.mjs
node scripts/test_reviewed_agent_dish_evidence.mjs
node scripts/audit_google_inventory_detail_evidence.mjs
node scripts/audit_no_paid_apis.mjs

node scripts/merge_google_inventory_detail_evidence.mjs \
  data/google_inventory_detail_evidence.json \
  _audit/e2e-s3-reviewed-evidence.json \
  /tmp/e2e-s3-replay.json >/tmp/e2e-s3-replay.log
node - <<'NODE'
const fs=require('fs');
const current=JSON.parse(fs.readFileSync('data/google_inventory_detail_evidence.json','utf8'));
const replay=JSON.parse(fs.readFileSync('/tmp/e2e-s3-replay.json','utf8'));
if(JSON.stringify(current.rows)!==JSON.stringify(replay.rows)) throw new Error('Logical evidence rows changed on replay');
const counts=x=>({rows:x.rows.length,r:x.rows.reduce((n,row)=>n+(row.recommendedDishes||[]).length,0),f:x.rows.reduce((n,row)=>n+(row.featuredDishes||[]).length,0)});
if(JSON.stringify(counts(current))!==JSON.stringify(counts(replay))) throw new Error('Logical evidence counts changed on replay');
console.log('S3_LOGICAL_REPLAY='+JSON.stringify(counts(replay)));
NODE

sha256sum data/google_inventory_detail_evidence.json data/google_inventory_detail_queue.json data/google_inventory_runtime.js > /tmp/e2e-s3-stable-hashes.txt
node - <<'NODE'
const fs=require('fs');
const plan=JSON.parse(fs.readFileSync('data/dish_batch_plan.json','utf8'));
const cand=JSON.parse(fs.readFileSync('data/independent_dish_source_candidates.json','utf8'));
const candidateLogical=cand.records ?? cand.rows ?? cand.candidates ?? [];
fs.writeFileSync('/tmp/e2e-s3-derived-logical.json',JSON.stringify({planRows:plan.rows,candidateLogical}));
NODE
python3 scripts/reload_data.py --public-only --outdir /tmp/e2e-s3-replay-rebuild
sha256sum -c /tmp/e2e-s3-stable-hashes.txt
node - <<'NODE'
const fs=require('fs');
const prior=JSON.parse(fs.readFileSync('/tmp/e2e-s3-derived-logical.json','utf8'));
const plan=JSON.parse(fs.readFileSync('data/dish_batch_plan.json','utf8'));
const cand=JSON.parse(fs.readFileSync('data/independent_dish_source_candidates.json','utf8'));
const now={planRows:plan.rows,candidateLogical:cand.records ?? cand.rows ?? cand.candidates ?? []};
if(JSON.stringify(prior)!==JSON.stringify(now)) throw new Error('Derived planner/candidate logical records changed on second rebuild');
console.log('S3_SECOND_REBUILD_LOGICAL_STABLE='+JSON.stringify({planRows:now.planRows.length,candidateRows:now.candidateLogical.length}));
NODE

node - <<'NODE'
const fs=require('fs'),vm=require('vm');
const before=JSON.parse(fs.readFileSync('/tmp/e2e-s3-before-stats.json','utf8'));
const audit=JSON.parse(fs.readFileSync('_audit/e2e-s3-integration-audit.json','utf8'));
const review=JSON.parse(fs.readFileSync('_audit/e2e-s3-review-audit.json','utf8'));
const assignment=JSON.parse(fs.readFileSync('/tmp/e2e-s3-assignment.json','utf8'));
const plan=JSON.parse(fs.readFileSync('data/dish_batch_plan.json','utf8'));
const postRows=plan.rows.filter(r=>r.shard===3 && ['independent_source_discovery','official_or_retained_featured'].includes(r.lane));
const postByLane=Object.fromEntries(['independent_source_discovery','official_or_retained_featured'].map(l=>[l,postRows.filter(r=>r.lane===l).length]));
const sandbox={window:{},console}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('data/google_inventory_runtime.js','utf8'),sandbox);
const after=sandbox.window.GOOGLE_INVENTORY_STATS||{};
const out={assignment:{total:assignment.total,byLane:assignment.byLane},postRebuildAssignment:{total:postRows.length,byLane:postByLane},review,integration:audit,beforeRuntime:{recommended:before.recommendedDishesKnown,featured:before.featuredDishesKnown,display:before.chineseDishDisplayRows,noDish:before.unfilledDishRows,recommendationGap:1422-before.recommendedDishesKnown},afterRuntime:{recommended:after.recommendedDishesKnown,featured:after.featuredDishesKnown,display:after.chineseDishDisplayRows,noDish:after.unfilledDishRows,recommendationGap:1422-after.recommendedDishesKnown},paidGoogleDataApiCalls:0,idempotent:true};
fs.writeFileSync('/tmp/e2e-s3-result.json',JSON.stringify(out,null,2)+'\n');
console.log('S3_RESULT='+JSON.stringify(out));
NODE
