#!/usr/bin/env python3
"""Regression tests for offline reload, publication size, and task retention."""
import importlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/database'))
master=importlib.import_module('build_master')
workplan=importlib.import_module('build_agent_workplan')

def assignment(text,name):
    decoder=json.JSONDecoder()
    marker='window.'+name+'='
    return decoder.raw_decode(text[text.index(marker)+len(marker):])[0]

class DataLoadingRegression(unittest.TestCase):
    def run_node(self,*args):
        p=subprocess.run(['node',*args],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,(p.stdout+p.stderr)[-1600:])

    def test_current_named_runtime_passes_materialized_audit(self):
        self.run_node('scripts/audit_materialized_chinese_dish_runtime.mjs')

    def test_candidate_plan_accepts_current_runtime_and_queue(self):
        with tempfile.TemporaryDirectory() as td:
            self.run_node('scripts/build_independent_dish_source_candidate_plan.mjs',str(Path(td)/'plan.json'),'8')

    def test_failed_reset_preserves_previous_database(self):
        with tempfile.TemporaryDirectory() as td:
            out=Path(td)/'main.sqlite'
            db=sqlite3.connect(out)
            db.execute('create table sentinel(value text)')
            db.execute("insert into sentinel values ('preserve')")
            db.commit();db.close()
            with patch.object(master.core,'read_json',side_effect=RuntimeError('invalid input')):
                with self.assertRaisesRegex(RuntimeError,'invalid input'):
                    master.build(out,reset=True)
            self.assertTrue(out.exists(),'reset deleted the usable database before validating inputs')
            db=sqlite3.connect(out)
            self.assertEqual(db.execute('select value from sentinel').fetchone()[0],'preserve')
            db.close()

    def test_successful_reset_preserves_backup(self):
        with tempfile.TemporaryDirectory() as td:
            out=Path(td)/'main.sqlite'
            db=sqlite3.connect(out)
            db.execute('create table sentinel(value text)')
            db.execute("insert into sentinel values ('recoverable')")
            db.commit();db.close()
            result=master.build(out,reset=True)
            backup=Path(result.get('reset',{}).get('backup',''))
            self.assertTrue(backup.is_file(),'successful reset must expose a recoverable old database backup')
            db=sqlite3.connect(backup)
            self.assertEqual(db.execute('select value from sentinel').fetchone()[0],'recoverable')
            db.close()
            db=sqlite3.connect(out)
            self.assertEqual(db.execute('select count(*) from catalog_entries').fetchone()[0],2804)
            self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok')
            db.close()

    def test_failed_active_tasks_remain_in_workplan(self):
        db=sqlite3.connect(':memory:')
        db.executescript((ROOT/'database/migrations/001_initial.sql').read_text())
        db.execute('insert into catalog_entries values (?,?,?,?,?,?)',('p','area1','{}','id_only','now','now'))
        db.execute('insert into ingestion_tasks values (?,?,?,?,?,?,?)',('task','p','public-identity','failed',1,None,'network_error'))
        db.execute('insert into ingestion_task_details values (?,?,?,?,?,?,?,?,?,?)',('task','identity_recovery',900,'[]','{}',None,'test',1,'now','now'))
        tasks=workplan.active_tasks(db)
        self.assertEqual([x['taskId'] for x in tasks],['task'])
        db.close()

    def test_public_package_drops_unused_maintenance_fields(self):
        text=(ROOT/'data/google_inventory_runtime.js').read_text()
        rows=assignment(text,'GOOGLE_INVENTORY_RESTAURANTS')
        stats=assignment(text,'GOOGLE_INVENTORY_STATS')
        for key in ['detailEvidenceSummary','publicWebFieldEvidenceSummary','reviewedOfficialOverlaySummary','sourceBasicProviders']:
            self.assertNotIn(key,stats)
        for row in rows:
            self.assertNotIn('dishes',row)
            self.assertNotIn('priceReference',row)

    def test_live_pipeline_does_not_pin_named_count(self):
        for filename in ['scripts/audit_materialized_chinese_dish_runtime.mjs','scripts/build_independent_dish_source_candidate_plan.mjs','scripts/review_independent_dish_source_candidates.mjs']:
            for line in (ROOT/filename).read_text().splitlines():
                if not line.lstrip().startswith('//'):
                    self.assertNotRegex(line,r'\b1415\b|named 1,415|public 1,415')

    def test_validator_rejection_preserves_previous_database(self):
        from safe_reset import rebuild_database
        with tempfile.TemporaryDirectory() as td:
            output=Path(td)/'main.sqlite'
            db=sqlite3.connect(output)
            db.execute('create table sentinel(value text)')
            db.execute("insert into sentinel values ('intact')")
            db.commit();db.close()
            def builder(path):
                db=sqlite3.connect(path)
                db.execute('create table catalog_entries(place_id text primary key)')
                db.executemany('insert into catalog_entries values (?)',[(str(i),) for i in range(2804)])
                db.commit();db.close()
                return {}
            def reject(_):
                raise RuntimeError('business validation rejected')
            with self.assertRaisesRegex(RuntimeError,'business validation rejected'):
                rebuild_database(output,builder,reject)
            db=sqlite3.connect(output)
            self.assertEqual(db.execute('select value from sentinel').fetchone()[0],'intact')
            db.close()

    def test_schema_upgrade_retains_existing_task_history(self):
        db=sqlite3.connect(':memory:')
        db.executescript((ROOT/'database/migrations/001_initial.sql').read_text())
        db.execute('insert into catalog_entries values (?,?,?,?,?,?)',('p','area1','{}','id_only','now','now'))
        db.execute('insert into ingestion_tasks values (?,?,?,?,?,?,?)',('task','p','source','failed',3,None,'network_error'))
        db.execute('insert into ingestion_task_details values (?,?,?,?,?,?,?,?,?,?)',('task','identity_recovery',900,'[]','{}',None,'test',1,'now','now'))
        db.commit()
        master.core.apply_migrations(db)
        master.core.apply_migrations(db)
        self.assertEqual(db.execute('select status,attempts from ingestion_tasks').fetchone(),('failed',3))
        self.assertEqual(db.execute('select task_type,active from ingestion_task_details').fetchone(),('identity_recovery',1))
        self.assertEqual(list(db.execute('select version from schema_migrations order by version')),[(1,),(2,)])
        db.execute("update ingestion_task_details set task_type='dish_source_acquisition'")
        tasks=workplan.active_tasks(db)
        self.assertEqual(tasks[0]['agentType'],'dish-source-acquisition')
        db.close()

    def test_oversized_hash_bucket_is_split_without_task_loss(self):
        tasks=[{'taskId':str(i),'placeId':str(i),'agentType':'dish-source-acquisition','priority':1} for i in range(601)]
        with patch.object(workplan,'stable_bucket',return_value=0):
            shards=workplan.make_shards(tasks,8,6,2)
        summary=workplan.validate_shards(tasks,shards)
        self.assertEqual(summary['taskCount'],601)
        self.assertLessEqual(summary['maxShardSize'],250)
        self.assertTrue(all(s['taskCount']>0 for s in shards))

    def test_candidate_plan_rejects_same_count_wrong_queue_identity(self):
        p=ROOT/'data/google_inventory_detail_queue.json'
        original=p.read_bytes()
        queue=json.loads(original)
        queue['rows'][0]['googlePlaceId']='not-in-the-current-runtime'
        try:
            p.write_text(json.dumps(queue))
            with tempfile.TemporaryDirectory() as td:
                r=subprocess.run(['node','scripts/build_independent_dish_source_candidate_plan.mjs',str(Path(td)/'bad.json'),'8'],cwd=ROOT,capture_output=True,text=True)
                self.assertNotEqual(r.returncode,0)
                self.assertIn('same complete ID set',r.stderr)
        finally:
            p.write_bytes(original)

if __name__=='__main__':
    unittest.main(verbosity=2)
