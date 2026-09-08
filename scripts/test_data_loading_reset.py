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

if __name__=='__main__':
    unittest.main(verbosity=2)
