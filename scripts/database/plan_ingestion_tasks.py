#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sqlite3
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path
PLANNER_VERSION='master-plan-v1'
FIELD_REQUIREMENTS={'address':('address',),'coordinates':('coordinates',),'cuisine':('cuisine',),'hours':('hours.raw','hours.reference.legacy','hours.normalized.legacy'),'dinner_budget':('budget.dinner.range','budget.dinner.legacy_range'),'lunch_budget':('budget.lunch.range','budget.lunch.legacy_range')}
FIELD_WEIGHTS={'address':60,'coordinates':70,'cuisine':60,'hours':80,'dinner_budget':70,'lunch_budget':30,'practical':20}
def now_iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def canonical_json(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def known_resolution_set(db): return {(p,f) for p,f in db.execute("SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'")}
def task_id(t,p): return f'plan:{t}:{p}'
def compute_desired_tasks(db):
    known=known_resolution_set(db); identities=dict(db.execute('SELECT place_id,identity_state FROM catalog_entries'))
    source_counts=dict(db.execute('SELECT place_id,count(*) FROM source_bindings GROUP BY place_id')); obs_counts=dict(db.execute('SELECT place_id,count(*) FROM field_observations GROUP BY place_id'))
    practical_places={p for p,f in known if f.startswith('practical.')}
    conflicts=defaultdict(list)
    for p,provider,pid in db.execute("SELECT DISTINCT sb.place_id,sr.provider,sr.provider_id FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id WHERE sb.binding_state='conflict' ORDER BY sb.place_id,sr.provider,sr.provider_id"):
        conflicts[p].append({'provider':provider,'providerId':pid})
    conflict_places=set(conflicts)
    names={}
    for p,v in db.execute("SELECT r.place_id,o.value_json FROM field_resolutions r JOIN field_observations o ON o.observation_id=r.observation_id WHERE r.field_key='name' AND r.resolution_state='known'"):
        try: x=json.loads(v)
        except Exception: x=None
        if isinstance(x,str) and x.strip(): names[p]=x.strip()
    desired={}
    for p in sorted(conflict_places):
        desired[task_id('identity_conflict_review',p)]={'placeId':p,'taskType':'identity_conflict_review','provider':'manual-review','status':'review_required','priority':1000,'fieldKeys':['identity'],'sourceHint':'review_colliding_native_provider_ids_before_publication','payload':{'conflictingSources':conflicts[p],'currentIdentityState':identities.get(p),'currentName':names.get(p)}}
    for p,state in sorted(identities.items()):
        if state=='id_only': desired[task_id('identity_recovery',p)]={'placeId':p,'taskType':'identity_recovery','provider':'public-identity','status':'pending','priority':900,'fieldKeys':['name','address','coordinates','cuisine'],'sourceHint':'official_or_existing_public_provider_identity_sources_no_paid_data_api','payload':{'currentIdentityState':state,'existingSourceRecords':source_counts.get(p,0),'existingObservations':obs_counts.get(p,0),'policy':'do_not_bind_from_proximity_alone'}}
    for p,state in sorted(identities.items()):
        if state not in ('verified','source_matched') or p in conflict_places or p not in names: continue
        missing=[]
        for logical,keys in FIELD_REQUIREMENTS.items():
            if not any((p,k) in known for k in keys): missing.append(logical)
        if p not in practical_places: missing.append('practical')
        if not missing: continue
        priority=500+sum(FIELD_WEIGHTS[f] for f in missing)
        desired[task_id('field_completion',p)]={'placeId':p,'taskType':'field_completion','provider':'source-orchestrator','status':'pending','priority':priority,'fieldKeys':missing,'sourceHint':'reuse_retained_evidence_then_bound_official_or_public_provider_pages','payload':{'name':names[p],'missingFields':missing,'existingSourceRecords':source_counts.get(p,0),'existingObservations':obs_counts.get(p,0),'collectionRule':'one_confirmed_source_visit_extract_all_supported_fields'}}
    dish=defaultdict(lambda:{'recommendationEvidence':0,'featuredEvidence':0})
    for p,f,c in db.execute("SELECT o.place_id,o.field_key,count(*) FROM field_observations o JOIN source_records sr ON sr.source_record_id=o.source_record_id WHERE sr.acquisition_method='retained_dish_evidence' AND o.field_key IN ('dish.recommendation.evidence','dish.featured.evidence') GROUP BY o.place_id,o.field_key"):
        dish[p]['recommendationEvidence' if f=='dish.recommendation.evidence' else 'featuredEvidence']=c
    for p,counts in sorted(dish.items()):
        desired[task_id('dish_semantic_review',p)]={'placeId':p,'taskType':'dish_semantic_review','provider':'semantic-review','status':'review_required','priority':300 if p not in conflict_places else 150,'fieldKeys':['recommended_dishes','featured_dishes'],'sourceHint':'review_retained_dish_evidence_before_semantic_promotion','payload':{**counts,'identityConflict':p in conflict_places,'currentName':names.get(p)}}
    return desired
def upsert_task(db,task,stamp):
    tid=task_id(task['taskType'],task['placeId'])
    db.execute("INSERT INTO ingestion_tasks(task_id,place_id,provider,status,attempts,next_retry_at,error_code) VALUES(?,?,?,?,0,NULL,NULL) ON CONFLICT(task_id) DO UPDATE SET place_id=excluded.place_id,provider=excluded.provider,status=CASE WHEN ingestion_tasks.attempts=0 AND ingestion_tasks.status IN ('pending','review_required','succeeded') THEN excluded.status ELSE ingestion_tasks.status END,error_code=CASE WHEN ingestion_tasks.attempts=0 THEN NULL ELSE ingestion_tasks.error_code END",(tid,task['placeId'],task['provider'],task['status']))
    row=db.execute('SELECT created_at FROM ingestion_task_details WHERE task_id=?',(tid,)).fetchone(); created=row[0] if row else stamp
    db.execute("INSERT INTO ingestion_task_details(task_id,task_type,priority,field_keys_json,task_payload_json,source_hint,planner_version,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET task_type=excluded.task_type,priority=excluded.priority,field_keys_json=excluded.field_keys_json,task_payload_json=excluded.task_payload_json,source_hint=excluded.source_hint,planner_version=excluded.planner_version,active=1,updated_at=excluded.updated_at",(tid,task['taskType'],task['priority'],canonical_json(task['fieldKeys']),canonical_json(task['payload']),task['sourceHint'],PLANNER_VERSION,1,created,stamp))
def plan_tasks(db,stamp=None):
    stamp=stamp or now_iso(); desired=compute_desired_tasks(db); wanted=set(desired)
    for task in desired.values(): upsert_task(db,task,stamp)
    existing={r[0] for r in db.execute("SELECT task_id FROM ingestion_task_details WHERE task_id LIKE 'plan:%' AND active=1")}; stale=existing-wanted
    for tid in stale:
        db.execute('UPDATE ingestion_task_details SET active=0,updated_at=? WHERE task_id=?',(stamp,tid)); db.execute("UPDATE ingestion_tasks SET status=CASE WHEN attempts=0 AND status IN ('pending','review_required') THEN 'succeeded' ELSE status END,error_code=CASE WHEN attempts=0 THEN 'planner_no_longer_needed' ELSE error_code END WHERE task_id=?",(tid,))
    types=Counter(t['taskType'] for t in desired.values()); missing=Counter()
    for t in desired.values():
        if t['taskType']=='field_completion': missing.update(t['fieldKeys'])
    return {'plannerVersion':PLANNER_VERSION,'activeTasks':len(desired),'taskTypeCounts':dict(sorted(types.items())),'fieldCompletionMissingCounts':dict(sorted(missing.items())),'staleTasksDeactivated':len(stale)}
def main():
    a=argparse.ArgumentParser(); a.add_argument('database',type=Path); args=a.parse_args(); db=sqlite3.connect(args.database); db.execute('PRAGMA foreign_keys=ON')
    try: db.execute('BEGIN IMMEDIATE'); s=plan_tasks(db); db.commit()
    except Exception: db.rollback(); raise
    finally: db.close()
    print(json.dumps({'status':'pass',**s},ensure_ascii=False,sort_keys=True))
if __name__=='__main__': main()
