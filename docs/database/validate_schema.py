#!/usr/bin/env python3
"""Read-only, in-memory validation of the proposed database contract.
Not a production importer, collector, resolver, or persistent backup tool.
"""
import sqlite3
import json
import hashlib
from pathlib import Path
from collections import Counter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
manifest = json.loads((HERE / 'input-manifest.json').read_text(encoding='utf-8'))
listed = {item['path']: item for item in manifest['files']}

def read_verified(relative):
    raw = (ROOT / relative).read_bytes()
    sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if sha != listed[relative]['gitBlobSha']:
        raise AssertionError('Input differs from audited snapshot; refresh audit and manifest: ' + relative)
    return json.loads(raw)

inventory = read_verified('data/area1_google_ids.json')
basics = read_verified('data/google_basic_source_matches.json')
d = {
    'schema': (HERE / 'schema-v1.sql').read_text(encoding='utf-8'),
    'ids': inventory['googlePlaceIds'],
    'basic': [[r['googlePlaceId'], r['provider'], r['providerId'], r['name']] for r in basics['rows']],
    'commit': manifest['sourceCommit']
}
assert len(d['ids']) == inventory['count'] == len(set(d['ids']))
assert all(r[0] in set(d['ids']) for r in d['basic'])

db=sqlite3.connect(':memory:')
db.executescript(d['schema'])
tests=[]
for pid in d['ids']:
 db.execute('INSERT INTO catalog_entries VALUES(?,?,?,?,?)',(pid,'area1',d['commit'],'id_only','2026-09-07'))
db.commit()
assert db.execute('SELECT count(*) FROM catalog_entries').fetchone()[0]==2804
tests.append('2804 exact inventory IDs imported')
keys=[provider+'|'+sid for _,provider,sid,_ in d['basic']]
conflicts={k for k,count in Counter(keys).items() if count>1}
def ingest():
 for pid,provider,sid,name in d['basic']:
  state='conflict' if provider+'|'+sid in conflicts else 'known'
  payload=json.dumps({'name':name},ensure_ascii=False,sort_keys=True)
  digest=hashlib.sha256(payload.encode()).hexdigest()
  key=provider+':'+sid+':'+digest
  db.execute('INSERT OR IGNORE INTO source_records VALUES(?,?,?,?,?,?,?,?)',(key,provider,sid,None,'2026-09-06','2026-09-07',digest,payload))
  db.execute('INSERT OR IGNORE INTO source_bindings VALUES(?,?,?,?)',(pid,key,'conflict' if state=='conflict' else 'reviewed','existing_retained_strong_binding'))
  oid=hashlib.sha256((pid+key+'name').encode()).hexdigest()
  db.execute('INSERT OR IGNORE INTO field_observations VALUES(?,?,?,?,?,?,?)',(oid,pid,key,'name',json.dumps(name,ensure_ascii=False),state,'2026-09-06'))
  db.execute('INSERT OR IGNORE INTO field_resolutions VALUES(?,?,?,?,?)',(pid,'name',oid if state=='known' else None,state,'prototype-v1'))
 db.commit()
ingest()
counts=lambda:tuple(db.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ('catalog_entries','source_records','source_bindings','field_observations','field_resolutions'))
before=counts()
ingest()
assert before==counts()
tests.append('760 retained bindings imported twice without duplicate growth')
assert db.execute("SELECT count(*) FROM source_bindings WHERE binding_state='conflict'").fetchone()[0]==10
assert db.execute("SELECT count(*) FROM field_resolutions WHERE resolution_state='conflict' AND observation_id IS NULL").fetchone()[0]==10
tests.append('5 reused source IDs / 10 bindings quarantined as conflicts without selected canonical name')
pid,provider,sid,name=d['basic'][0]
name_resolution=db.execute('SELECT observation_id FROM field_resolutions WHERE place_id=? AND field_key=?',(pid,'name')).fetchone()[0]
source=db.execute('SELECT source_record_id FROM source_bindings WHERE place_id=?',(pid,)).fetchone()[0]
db.execute('INSERT INTO field_observations VALUES(?,?,?,?,?,?,?)',('missing-new',pid,source,'name',None,'unknown','2026-09-07'))
assert db.execute('SELECT observation_id FROM field_resolutions WHERE place_id=? AND field_key=?',(pid,'name')).fetchone()[0]==name_resolution
tests.append('unknown new observation does not erase the selected known name')
db.commit()
def must_fail(sql,args=()):
 db.execute('SAVEPOINT rejection')
 try:
  db.execute(sql,args)
 except sqlite3.IntegrityError:
  db.execute('ROLLBACK TO rejection');db.execute('RELEASE rejection')
  return
 db.execute('ROLLBACK TO rejection');db.execute('RELEASE rejection')
 raise AssertionError('expected constraint failure')
must_fail('INSERT INTO catalog_entries VALUES(?,?,?,?,?)',(pid,'area1',d['commit'],'id_only','2026-09-07'))
tests.append('duplicate directory key rejected')
must_fail('INSERT INTO source_bindings VALUES(?,?,?,?)',('absent-place',source,'reviewed','invalid'))
tests.append('unknown Place ID source binding rejected')
other=d['basic'][1][0]
must_fail('INSERT INTO field_resolutions VALUES(?,?,?,?,?)',(other,'wrong-field',name_resolution,'known','prototype-v1'))
tests.append('cross-place/cross-field resolution rejected by composite foreign key')
must_fail('INSERT INTO field_observations VALUES(?,?,?,?,?,?,?)',('null-known',pid,source,'address',None,'known','2026-09-07'))
tests.append('known field without value rejected')
must_fail('INSERT INTO field_observations VALUES(?,?,?,?,?,?,?)',('bad-json',pid,source,'address','not-json','known','2026-09-07'))
tests.append('malformed JSON rejected')
pre=db.execute('SELECT count(*) FROM source_records').fetchone()[0]
db.execute('SAVEPOINT failed_batch')
db.execute('INSERT INTO source_records VALUES(?,?,?,?,?,?,?,?)',('rollback-row','test','test',None,None,'2026-09-07','hash','{}'))
db.execute('ROLLBACK TO failed_batch');db.execute('RELEASE failed_batch')
assert db.execute('SELECT count(*) FROM source_records').fetchone()[0]==pre
tests.append('failed batch rollback preserves original rows')
db.commit()
backup=sqlite3.connect(':memory:')
db.backup(backup)
assert backup.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert backup.execute('SELECT count(*) FROM catalog_entries').fetchone()[0]==2804
assert list(backup.execute('PRAGMA foreign_key_check'))==[]
tests.append('SQLite backup/restore in memory preserves 2804 IDs and referential integrity')
assert list(db.execute('PRAGMA foreign_key_check'))==[]
tests.append('final foreign-key audit clean')
print(json.dumps({'status':'pass','sqliteVersion':sqlite3.sqlite_version,'tests':tests,'counts':dict(zip(('catalog_entries','source_records','source_bindings','field_observations','field_resolutions'),counts())),'scope':'in-memory relational prototype only; no persistent database, no end-to-end collector or publisher'},ensure_ascii=False))
