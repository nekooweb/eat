#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,sqlite3
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path

PLANNER_VERSION='master-plan-v6-dish-first'

# Product priority: restaurant identity exists to make dish evidence safe to attach.
# Address / telephone / hours / budgets / practical are not active completion targets.
# They may remain in canonical storage when already known, but the planner does not
# create work merely to fill them.
NON_DISH_COMPLETION_FIELDS=[
    'address','coordinates','cuisine','hours','dinner_budget','lunch_budget','telephone','practical'
]

def now_iso(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def canonical_json(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def known_resolution_set(db): return {(p,f) for p,f in db.execute("SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'")}
def task_id(t,p): return f'plan:{t}:{p}'

def compute_desired_tasks(db):
    known=known_resolution_set(db)
    identities=dict(db.execute('SELECT place_id,identity_state FROM catalog_entries'))
    source_counts=dict(db.execute('SELECT place_id,count(*) FROM source_bindings GROUP BY place_id'))
    obs_counts=dict(db.execute('SELECT place_id,count(*) FROM field_observations GROUP BY place_id'))

    conflicts=defaultdict(list)
    for p,provider,pid in db.execute("SELECT DISTINCT sb.place_id,sr.provider,sr.provider_id FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id WHERE sb.binding_state='conflict' ORDER BY sb.place_id,sr.provider,sr.provider_id"):
        conflicts[p].append({'provider':provider,'providerId':pid})
    conflict_places=set(conflicts)

    names={}
    for p,v in db.execute("SELECT r.place_id,o.value_json FROM field_resolutions r JOIN field_observations o ON o.observation_id=r.observation_id WHERE r.field_key='name' AND r.resolution_state='known'"):
        try: x=json.loads(v)
        except Exception: x=None
        if isinstance(x,str) and x.strip(): names[p]=x.strip()

    dish=defaultdict(lambda:{'recommendationEvidence':0,'featuredEvidence':0})
    for p,f,c in db.execute("SELECT o.place_id,o.field_key,count(*) FROM field_observations o JOIN source_records sr ON sr.source_record_id=o.source_record_id WHERE sr.acquisition_method='retained_dish_evidence' AND o.field_key IN ('dish.recommendation.evidence','dish.featured.evidence') GROUP BY o.place_id,o.field_key"):
        dish[p]['recommendationEvidence' if f=='dish.recommendation.evidence' else 'featuredEvidence']=c

    desired={}

    # Identity conflicts stay first because dish evidence cannot be published safely
    # while a native source binding is ambiguous.
    for p in sorted(conflict_places):
        desired[task_id('identity_conflict_review',p)]={
            'placeId':p,'taskType':'identity_conflict_review','provider':'manual-review',
            'status':'review_required','priority':1000,'fieldKeys':['identity'],
            'sourceHint':'resolve_source_identity_collision_before_any_dish_publication',
            'payload':{'conflictingSources':conflicts[p],'currentIdentityState':identities.get(p),'currentName':names.get(p),'goal':'unlock_source_backed_dish_collection'}
        }

    # ID-only recovery is retained only because a source-backed restaurant identity is
    # required before menu/recommendation evidence can be attached. We do not recover
    # identity for the purpose of filling address/phone/profile fields.
    for p,state in sorted(identities.items()):
        if state=='id_only':
            desired[task_id('identity_recovery',p)]={
                'placeId':p,'taskType':'identity_recovery','provider':'public-identity',
                'status':'pending','priority':900,'fieldKeys':['identity'],
                'sourceHint':'recover_minimum_branch_identity_from_official_or_existing_public_sources_to_unlock_dish_collection',
                'payload':{
                    'currentIdentityState':state,
                    'existingSourceRecords':source_counts.get(p,0),
                    'existingObservations':obs_counts.get(p,0),
                    'policy':'do_not_bind_from_proximity_alone; do_not_collect_profile_fields_for_completeness',
                    'goal':'dish_evidence_eligibility'
                }
            }

    for p,state in sorted(identities.items()):
        if state not in ('verified','source_matched') or p in conflict_places or p not in names:
            continue

        rec_known=(p,'recommended_dishes.zh') in known
        feat_known=(p,'featured_dishes.zh') in known
        counts=dish.get(p,{'recommendationEvidence':0,'featuredEvidence':0})
        rec_ev=int(counts.get('recommendationEvidence') or 0)
        feat_ev=int(counts.get('featuredEvidence') or 0)

        # Existing evidence that has not become canonical is cheap/high-value review work.
        missing_semantics=[]
        if rec_ev and not rec_known: missing_semantics.append('recommended_dishes.zh')
        if feat_ev and not feat_known: missing_semantics.append('featured_dishes.zh')
        if missing_semantics:
            desired[task_id('dish_semantic_review',p)]={
                'placeId':p,'taskType':'dish_semantic_review','provider':'semantic-review',
                'status':'review_required','priority':880,'fieldKeys':missing_semantics,
                'sourceHint':'normalize_or_review_existing_source_backed_dish_evidence_without_inference',
                'payload':{
                    **counts,
                    'resolvedRecommendedZh':rec_known,
                    'resolvedFeaturedZh':feat_known,
                    'identityConflict':False,
                    'currentName':names.get(p)
                }
            }

        # Acquisition priority is based on public dish usefulness, not generic metadata
        # completeness. A restaurant with no displayable dish is highest priority.
        if not rec_known:
            no_public_dish = not feat_known
            priority = 850 if no_public_dish else 780
            desired[task_id('dish_source_acquisition',p)]={
                'placeId':p,'taskType':'dish_source_acquisition','provider':'dish-source-orchestrator',
                'status':'pending','priority':priority,
                'fieldKeys':['recommended_dishes.zh'] + ([] if feat_known else ['featured_dishes.zh']),
                'sourceHint':'official_menu_or_retained_source_or_independent_dish_source; explicit_recommendation_for_R; ordinary_menu_only_F',
                'payload':{
                    'name':names[p],
                    'recommendedKnown':rec_known,
                    'featuredKnown':feat_known,
                    'existingRecommendationEvidence':rec_ev,
                    'existingFeaturedEvidence':feat_ev,
                    'existingSourceRecords':source_counts.get(p,0),
                    'existingObservations':obs_counts.get(p,0),
                    'goal':'maximize_source_backed_public_dish_coverage',
                    'policy':'no_cuisine_name_brand_inference; preserve_source_original; zh_CN_canonical_display'
                }
            }
        elif not feat_known:
            desired[task_id('featured_dish_source_acquisition',p)]={
                'placeId':p,'taskType':'featured_dish_source_acquisition','provider':'dish-source-orchestrator',
                'status':'pending','priority':600,'fieldKeys':['featured_dishes.zh'],
                'sourceHint':'collect_source_backed_menu_items_only; never_upgrade_plain_menu_to_recommendation',
                'payload':{
                    'name':names[p],
                    'recommendedKnown':True,
                    'featuredKnown':False,
                    'existingFeaturedEvidence':feat_ev,
                    'existingSourceRecords':source_counts.get(p,0),
                    'goal':'broaden_source_backed_dish_display'
                }
            }

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
    types=Counter(t['taskType'] for t in desired.values())
    dish_targets=Counter()
    for t in desired.values():
        if t['taskType'] in ('dish_source_acquisition','featured_dish_source_acquisition','dish_semantic_review'):
            dish_targets.update(t['fieldKeys'])
    return {
        'plannerVersion':PLANNER_VERSION,
        'activeTasks':len(desired),
        'taskTypeCounts':dict(sorted(types.items())),
        'dishTargetCounts':dict(sorted(dish_targets.items())),
        'fieldCompletionMissingCounts':{},
        'excludedFieldCompletionTargets':NON_DISH_COMPLETION_FIELDS,
        'telephoneCollectionEnabled':False,
        'addressCollectionEnabled':False,
        'primaryGoal':'source_backed_recommended_and_featured_dish_coverage',
        'staleTasksDeactivated':len(stale)
    }

def main():
    a=argparse.ArgumentParser(); a.add_argument('database',type=Path); args=a.parse_args(); db=sqlite3.connect(args.database); db.execute('PRAGMA foreign_keys=ON')
    try: db.execute('BEGIN IMMEDIATE'); s=plan_tasks(db); db.commit()
    except Exception: db.rollback(); raise
    finally: db.close()
    print(json.dumps({'status':'pass',**s},ensure_ascii=False,sort_keys=True))
if __name__=='__main__': main()
