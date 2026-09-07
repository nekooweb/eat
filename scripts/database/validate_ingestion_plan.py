#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sqlite3
from collections import Counter
from pathlib import Path
import plan_ingestion_tasks as planner
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('database',type=Path); args=ap.parse_args(); db=sqlite3.connect(args.database); db.execute('PRAGMA foreign_keys=ON'); failures=[]
    def expect(c,m):
        if not c: failures.append(m)
    desired=planner.compute_desired_tasks(db); wanted=set(desired)
    rows=list(db.execute("SELECT t.task_id,t.place_id,t.provider,t.status,t.attempts,d.task_type,d.priority,d.field_keys_json,d.task_payload_json,d.source_hint,d.planner_version,d.active FROM ingestion_tasks t JOIN ingestion_task_details d ON d.task_id=t.task_id WHERE d.active=1 ORDER BY d.priority DESC,d.task_type,t.place_id")); active={r[0] for r in rows}
    expect(active==wanted,f'active task IDs differ: active={len(active)} desired={len(wanted)}')
    pairs=[(r[5],r[1]) for r in rows]; expect(len(pairs)==len(set(pairs)),'duplicate active logical tasks')
    counts=Counter(r[5] for r in rows); expected_counts=Counter(t['taskType'] for t in desired.values()); expect(counts==expected_counts,f'type counts={dict(counts)} desired={dict(expected_counts)}')
    for r in rows:
        tid,p,provider,status,attempts,typ,priority,fjson,pjson,hint,version,activeflag=r; task=desired.get(tid)
        if not task: continue
        try: fields=json.loads(fjson); payload=json.loads(pjson)
        except Exception as e: failures.append(f'invalid task JSON {tid}: {e}'); continue
        expect(version==planner.PLANNER_VERSION,f'planner version mismatch {tid}'); expect(activeflag==1,f'active flag mismatch {tid}'); expect(p==task['placeId'],f'place mismatch {tid}'); expect(provider==task['provider'],f'provider mismatch {tid}')
        if attempts==0: expect(status==task['status'],f'status mismatch {tid}: {status}')
        expect(priority==task['priority'],f'priority mismatch {tid}'); expect(fields==task['fieldKeys'],f'fields mismatch {tid}'); expect(payload==task['payload'],f'payload mismatch {tid}'); expect(hint==task['sourceHint'],f'hint mismatch {tid}')
        h=(hint or '').lower(); expect(not any(x in h for x in ('google_places_api','text_search_api','nearby_search_api','paid_places_api')),f'paid API hint {tid}')
    conflict={r[0] for r in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}; planned_conflict={r[1] for r in rows if r[5]=='identity_conflict_review'}; expect(planned_conflict==conflict,f'conflict coverage={len(planned_conflict)} expected={len(conflict)}')
    idonly={r[0] for r in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}; planned_id={r[1] for r in rows if r[5]=='identity_recovery'}; expect(planned_id==idonly,f'identity coverage={len(planned_id)} expected={len(idonly)}')
    field_places={r[1] for r in rows if r[5]=='field_completion'}; expect(not(field_places&conflict),'field completion includes conflict'); expect(not(field_places&idonly),'field completion includes id-only')
    ranges={}
    for typ in counts:
        ps=[r[6] for r in rows if r[5]==typ]; ranges[typ]={'min':min(ps),'max':max(ps)}
    if counts.get('identity_conflict_review') and counts.get('identity_recovery'): expect(ranges['identity_conflict_review']['min']>ranges['identity_recovery']['max'],'conflict priority not above identity')
    if counts.get('identity_recovery') and counts.get('field_completion'): expect(ranges['identity_recovery']['min']>ranges['field_completion']['max'],'identity priority not above field')
    if counts.get('field_completion') and counts.get('dish_semantic_review'): expect(ranges['field_completion']['min']>ranges['dish_semantic_review']['max'],'field priority not above dish')
    missing=Counter()
    for t in desired.values():
        if t['taskType']=='field_completion': missing.update(t['fieldKeys'])
    stale=db.execute("SELECT count(*) FROM ingestion_task_details WHERE task_id LIKE 'plan:%' AND active=1 AND planner_version<>?",(planner.PLANNER_VERSION,)).fetchone()[0]; expect(stale==0,f'stale active plan tasks={stale}')
    summary={'status':'fail' if failures else 'pass','plannerVersion':planner.PLANNER_VERSION,'activeTasks':len(rows),'taskTypeCounts':dict(sorted(counts.items())),'fieldCompletionMissingCounts':dict(sorted(missing.items())),'priorityRanges':ranges,'conflictReviewPlaces':len(planned_conflict),'identityRecoveryPlaces':len(planned_id),'fieldCompletionPlaces':len(field_places),'dishSemanticReviewPlaces':counts.get('dish_semantic_review',0),'failures':failures}; print(json.dumps(summary,ensure_ascii=False,sort_keys=True)); db.close()
    if failures: raise SystemExit(1)
if __name__=='__main__': main()
