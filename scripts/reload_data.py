#!/usr/bin/env python3
"""Single offline rebuild entry. Collection is a separate manual operation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'

def run(command, env, logdir, label):
    p=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True)
    (logdir/(label+'.log')).write_text(p.stdout+p.stderr,encoding='utf-8')
    if p.returncode:
        raise RuntimeError(label+' failed:\n'+(p.stdout+p.stderr)[-5000:])
    if p.stdout.strip():
        print(p.stdout.strip(),flush=True)

def assignment(path,name):
    text=path.read_text(encoding='utf-8')
    prefix='window.'+name+'='
    return json.JSONDecoder().raw_decode(text[text.index(prefix)+len(prefix):])[0]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--outdir',type=Path,default=ROOT/'_audit/data-reload')
    ap.add_argument('--database',type=Path)
    ap.add_argument('--public-only',action='store_true')
    ap.add_argument('--reset',action='store_true')
    args=ap.parse_args()
    out=args.outdir.absolute()
    out.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy()
    rev=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True)
    source_commit=rev.stdout.strip() if rev.returncode==0 else env.get('GITHUB_SHA','unknown')
    env['GITHUB_SHA']=source_commit
    commands=[
        ('cost-policy',['node','scripts/audit_no_paid_apis.mjs']),
        ('rich-fallback',['node','scripts/build_hotpepper_rich_core_fallback.mjs']),
        ('canonical',['node','scripts/build_production_dataset.mjs']),
        ('provenance',['node','scripts/build_source_provenance.mjs']),
        ('source-facts',['node','scripts/build_source_facts.mjs']),
        ('official-overlay',[sys.executable,'scripts/database/export_reviewed_official_runtime_sources.py']),
        ('practical-overlay',['node','scripts/build_hotpepper_catalog_practical_overlay.mjs','data/hotpepper_catalog_practical_overlay.json']),
        ('runtime-raw',['node','scripts/build_google_inventory_runtime.mjs']),
        ('independent-source-overlay',['node','scripts/apply_reviewed_independent_source_overlay.mjs']),
        ('independent-source-overlay-audit',['node','scripts/audit_reviewed_independent_source_overlay.mjs']),
        ('runtime-practical-contact',['node','scripts/materialize_runtime_practical_fields.mjs']),
        ('runtime-identity',['node','scripts/audit_google_inventory_runtime.mjs']),
        ('runtime-materialize',['node','scripts/materialize_chinese_dish_runtime.mjs']),
        ('runtime-materialized-audit',['node','scripts/audit_materialized_chinese_dish_runtime.mjs']),
        ('detail-queue',['node','scripts/build_google_inventory_detail_queue.mjs']),
        ('dish-batches',['node','scripts/build_dish_batch_plan.mjs','data/dish_batch_plan.json','8']),
        ('dish-source-plan',['node','scripts/build_independent_dish_source_candidate_plan.mjs','data/independent_dish_source_candidates.json','8']),
    ]
    for label,command in commands: run(command,env,out,label)
    database=args.database.absolute() if args.database else out/'eat-master.sqlite'
    if not args.public_only:
        command=[sys.executable,'scripts/database/build_master.py','--output',str(database)]
        if args.reset: command.append('--reset')
        run(command,env,out,'master')
        for name in ['validate_master','validate_derived_practical','validate_source_semantics',
                     'validate_official_identity','validate_osm_identity','validate_retained_field_resolver',
                     'validate_hotpepper_candidate_fields','validate_ingestion_plan']:
            run([sys.executable,'scripts/database/'+name+'.py',str(database)],env,out,name)
        export_dir=out/'export'
        run([sys.executable,'scripts/database/export_master.py',str(database),'--outdir',str(export_dir)],env,out,'export')
        run([sys.executable,'scripts/database/validate_export.py',str(database),
             str(export_dir/'catalog.shadow.json'),str(export_dir/'recommendation.shadow.json')],env,out,'validate-export')
        run([sys.executable,'scripts/database/build_agent_workplan.py',str(database),
             '--outdir',str(out/'workplan')],env,out,'workplan')
    stats=assignment(DATA/'google_inventory_runtime.js','GOOGLE_INVENTORY_STATS')
    rows=assignment(DATA/'google_inventory_runtime.js','GOOGLE_INVENTORY_RESTAURANTS')
    queue=json.loads((DATA/'google_inventory_detail_queue.json').read_text())
    runtime_ids={r['googlePlaceId'] for r in rows}
    queue_ids=[r['googlePlaceId'] for r in queue['rows']]
    if len(queue_ids)!=len(runtime_ids) or set(queue_ids)!=runtime_ids:
        raise RuntimeError('Runtime/queue identity sets diverged after reload')
    files={}
    for name in ['production_area1.js','source_provenance.js','source_facts.js','reviewed_official_runtime_sources.json',
                 'reviewed_independent_dish_sources.json','hotpepper_catalog_practical_overlay.json',
                 'google_inventory_runtime.js','google_inventory_detail_queue.json',
                 'dish_batch_plan.json','independent_dish_source_candidates.json']:
        raw=(DATA/name).read_bytes()
        files[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    manifest={'schemaVersion':1,'sourceCommit':source_commit,'mode':'public-only' if args.public_only else 'full',
              'externalCollectionExecuted':False,'catalogTotal':stats['catalogTotal'],'publicRows':len(rows),
              'unpublishedRows':stats['unpublishedPlaceIdOnly'],'recommendedRows':stats['recommendedDishesKnown'],
              'featuredRows':stats['featuredDishesKnown'],'hoursRows':stats['hoursKnown'],
              'telephoneRows':stats.get('telephoneKnown',0),'stationRows':stats.get('stationKnown',0),
              'lunchServiceRows':stats.get('lunchServiceKnown',0),'courseAvailabilityRows':stats.get('courseAvailabilityKnown',0),
              'allYouCanDrinkRows':stats.get('allYouCanDrinkKnown',0),'allYouCanEatRows':stats.get('allYouCanEatKnown',0),
              'privateRoomPolicyRows':stats.get('privateRoomPolicyKnown',0),'cardPaymentRows':stats.get('cardPaymentKnown',0),
              'smokingPolicyRows':stats.get('smokingPolicyKnown',0),'parkingPolicyRows':stats.get('parkingPolicyKnown',0),
              'queueRows':len(queue_ids),'database':None if args.public_only else str(database),'outputs':files}
    (out/'reload-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'pass',**manifest},ensure_ascii=False),flush=True)

if __name__=='__main__':
    main()
