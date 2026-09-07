#!/usr/bin/env python3
from __future__ import annotations
import argparse,os,uuid
from collections import defaultdict
from pathlib import Path
import derive_hotpepper_practical as derived
import master_import_core as core
import plan_ingestion_tasks as planner
import retained_phase2 as phase2
import resolve_master as resolver
ROOT=Path(__file__).resolve().parents[2]; DATA=ROOT/'data'; PARSER_VERSION=core.PARSER_VERSION; parse_budget_range=core.parse_budget_range
_ORIGINAL_RESOLVE=core.resolve
def _resolve_preserving_known_on_conflict(db,place_id,field_key,observation_id,state,provider,stamp):
    if state=='conflict':
        cur=db.execute('SELECT resolution_state FROM field_resolutions WHERE place_id=? AND field_key=?',(place_id,field_key)).fetchone()
        if cur is not None and cur[0]=='known': return
    return _ORIGINAL_RESOLVE(db,place_id,field_key,observation_id,state,provider,stamp)
core.resolve=_resolve_preserving_known_on_conflict
def _import_hotpepper_preserving_normalized_cuisine(db,doc,conflict_keys,stamp):
    original=core.add_field
    def guarded(db_,place_id,source_record_id,field_key,value,binding_state,provider,observed_at,stamp_,*,resolve_field=True):
        if field_key=='cuisine': return None
        return original(db_,place_id,source_record_id,field_key,value,binding_state,provider,observed_at,stamp_,resolve_field=resolve_field)
    core.add_field=guarded
    try: return core.import_hotpepper(db,doc,conflict_keys,stamp)
    finally: core.add_field=original
def retained_conflict_index(basics,hotpepper,phase2_inputs):
    basic=defaultdict(set); allp=defaultdict(set)
    for r in basics.get('rows',[]):
        k=f"{r['provider']}|{r['providerId']}"; p=r['googlePlaceId']; basic[k].add(p); allp[k].add(p)
    for r in hotpepper.get('rows',[]): allp[f"Hot Pepper|{r['hotpepperId']}"].add(r['googlePlaceId'])
    for k,p in phase2.native_identity_rows(phase2_inputs): allp[k].add(p)
    bc={k for k,v in basic.items() if len(v)>1}; ac={k for k,v in allp.items() if len(v)>1}
    if len(bc)!=5: raise RuntimeError(f'retained basic collision baseline changed: expected 5 groups, found {len(bc)}')
    if not bc.issubset(ac): raise RuntimeError('cross-layer collision index lost a known basic collision')
    return bc,ac,allp
def build(output:Path,reset=False):
    if reset and output.exists(): output.unlink()
    if reset:
        for s in ('-wal','-shm'):
            p=Path(str(output)+s)
            if p.exists(): p.unlink()
    inventory=core.read_json(DATA/'area1_google_ids.json'); basics=core.read_json(DATA/'google_basic_source_matches.json'); hotpepper=core.read_json(DATA/'hotpepper_catalog_facts.json'); production=core.read_production(); p2=phase2.load_inputs(); ids=inventory.get('googlePlaceIds') or []; idset=set(ids)
    if len(ids)!=2804 or len(idset)!=2804 or inventory.get('count')!=2804: raise RuntimeError('frozen catalog must contain exactly 2,804 unique Place IDs')
    basic_conflicts,conflict_keys,allp=retained_conflict_index(basics,hotpepper,p2); conflict_places=set().union(*(allp[k] for k in conflict_keys)) if conflict_keys else set(); stamp=core.now_iso(); source_commit=os.environ.get('GITHUB_SHA') or 'repository-working-tree'; run_id=uuid.uuid4().hex; db=core.connect(output)
    try:
        core.apply_migrations(db); db.execute('BEGIN IMMEDIATE'); db.execute('INSERT INTO ingestion_runs(run_id,started_at,source_commit,parser_version,status) VALUES(?,?,?,?,?)',(run_id,stamp,source_commit,PARSER_VERSION,'running')); snapshot=core.canonical_json({'checkedAt':inventory.get('checkedAt'),'method':inventory.get('method'),'count':inventory.get('count')})
        for pid in ids: core.upsert_catalog(db,pid,inventory.get('scope') or 'TOKYO/地区1️⃣',snapshot,'id_only',stamp)
        legacy=core.import_legacy_canonical(db,production,idset,stamp); basic=core.import_basic(db,basics,conflict_keys,stamp); hp=_import_hotpepper_preserving_normalized_cuisine(db,hotpepper,conflict_keys,stamp); phase=phase2.import_all(db,p2,conflict_keys,stamp); derived_counts=derived.resolve_hotpepper_basic_practical(db,stamp); rich=resolver.resolve_safe_practical(db,stamp); taskplan=planner.plan_tasks(db,stamp)
        summary={'catalog':db.execute('SELECT count(*) FROM catalog_entries').fetchone()[0],'identityStates':dict(db.execute('SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state')),'sourceRecords':db.execute('SELECT count(*) FROM source_records').fetchone()[0],'sourceBindings':db.execute('SELECT count(*) FROM source_bindings').fetchone()[0],'observations':db.execute('SELECT count(*) FROM field_observations').fetchone()[0],'resolutions':db.execute('SELECT count(*) FROM field_resolutions').fetchone()[0],'legacyCanonical':dict(legacy),'basicBindings':dict(basic),'hotPepperBindings':dict(hp),'phase2':phase,'hotPepperBasicPractical':derived_counts,'safePracticalResolver':rich,'ingestionPlan':taskplan,'basicConflictSourceKeys':len(basic_conflicts),'allRetainedConflictSourceKeys':len(conflict_keys),'allRetainedConflictPlaces':len(conflict_places),'hoursRawObserved':db.execute("SELECT count(*) FROM field_observations WHERE field_key='hours.raw' AND value_json IS NOT NULL").fetchone()[0],'closuresRawObserved':db.execute("SELECT count(*) FROM field_observations WHERE field_key='closure.raw' AND value_json IS NOT NULL").fetchone()[0],'budgetRangesKnown':db.execute("SELECT count(*) FROM field_resolutions WHERE field_key='budget.dinner.range' AND resolution_state='known'").fetchone()[0],'exceptions':db.execute('SELECT count(*) FROM retained_exceptions').fetchone()[0]}
        db.execute("UPDATE ingestion_runs SET completed_at=?,status='succeeded',summary_json=? WHERE run_id=?",(core.now_iso(),core.canonical_json(summary),run_id)); db.commit(); return summary
    except Exception: db.rollback(); raise
    finally: db.close()
def main():
    p=argparse.ArgumentParser(); p.add_argument('--output',type=Path,default=ROOT/'_local'/'eat-main.sqlite'); p.add_argument('--reset',action='store_true'); a=p.parse_args(); s=build(a.output,a.reset); print(core.canonical_json({'status':'pass','database':str(a.output),**s}))
if __name__=='__main__': main()
