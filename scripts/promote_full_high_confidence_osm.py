#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
QUEUE=ROOT/'data'/'area1_full_collection_queue.json'
CACHE=ROOT/'data'/'google_places_cache.json'
OUT=ROOT/'data'/'google_entities.generated.js'
QC_VERSION=5

BLOCK_REASONS={'closed_permanently','outside_1_2km','non_food_google_type','no_google_place'}
UPGRADABLE_REASONS={'name_mismatch','location_mismatch','missing_google_location'}

def write_outputs(cache):
    CACHE.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    rows=list(cache.values())
    payload=json.dumps(rows,ensure_ascii=False,separators=(',',':'))
    script=("(()=>{const rows="+payload+";"
            "const byId=new Map(rows.filter(x=>x.sourceId).map(x=>[x.sourceId,x]));"
            "window.RESTAURANTS.forEach(r=>{const x=byId.get(r.id);if(!x)return;"
            "r.googleStatus=x.status;if(x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;"
            "if(x.reason)r.googleRejectReason=x.reason;});"
            "window.GOOGLE_BATCH_STATS={verified:rows.filter(x=>x.status==='verified').length,"
            "rejected:rows.filter(x=>x.status==='rejected').length,"
            "pending:rows.filter(x=>x.status==='pending').length};})();\n")
    OUT.write_text(script,encoding='utf-8')

def main():
    q=json.loads(QUEUE.read_text(encoding='utf-8'))
    cache=json.loads(CACHE.read_text(encoding='utf-8'))
    candidates=[r for r in q['rows'] if r.get('googleStatus')=='operational_food' and r.get('matchConfidence')=='high' and r.get('candidate')]
    promoted=[];blocked=[];unchanged=[]
    for row in candidates:
        pid=row['googlePlaceId'];c=row['candidate'];sid=c['sourceCandidateId']
        if c.get('nameSimilarity',0)<0.92 or c.get('distanceMeters',9999)>60:
            blocked.append({'googlePlaceId':pid,'sourceCandidateId':sid,'reason':'threshold_regression'});continue
        old=cache.get(sid)
        if old:
            old_pid=old.get('googlePlaceId');status=old.get('status');reason=old.get('reason')
            if status=='verified':
                if old_pid==pid:unchanged.append({'googlePlaceId':pid,'sourceCandidateId':sid,'reason':'already_verified'})
                else:blocked.append({'googlePlaceId':pid,'sourceCandidateId':sid,'reason':'source_already_verified_to_other_place','existingPlaceId':old_pid})
                continue
            if reason in BLOCK_REASONS:
                blocked.append({'googlePlaceId':pid,'sourceCandidateId':sid,'reason':'terminal_existing_rejection','existingReason':reason});continue
            if old_pid and old_pid!=pid and reason not in UPGRADABLE_REASONS:
                blocked.append({'googlePlaceId':pid,'sourceCandidateId':sid,'reason':'conflicting_existing_candidate','existingPlaceId':old_pid,'existingReason':reason});continue
        cache[sid]={'sourceId':sid,'status':'verified','googlePlaceId':pid,'qcVersion':QC_VERSION}
        promoted.append({'googlePlaceId':pid,'sourceCandidateId':sid,'distanceMeters':c.get('distanceMeters'),'nameSimilarity':c.get('nameSimilarity')})
    write_outputs(cache)
    print(json.dumps({'highCandidates':len(candidates),'promoted':len(promoted),'blocked':len(blocked),'unchanged':len(unchanged),'promotedRows':promoted,'blockedRows':blocked},ensure_ascii=False))
if __name__=='__main__':main()
