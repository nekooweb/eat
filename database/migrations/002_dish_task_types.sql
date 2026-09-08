-- Transactional upgrade; all previous task rows are retained.
ALTER TABLE ingestion_task_details RENAME TO ingestion_task_details_v1;
CREATE TABLE IF NOT EXISTS ingestion_task_details (
  task_id TEXT PRIMARY KEY REFERENCES ingestion_tasks(task_id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK(task_type IN ('identity_conflict_review','identity_recovery','field_completion','dish_semantic_review','dish_source_acquisition','featured_dish_source_acquisition')),
  priority INTEGER NOT NULL CHECK(priority >= 0),
  field_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(field_keys_json)),
  task_payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(task_payload_json)),
  source_hint TEXT,
  planner_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO ingestion_task_details SELECT * FROM ingestion_task_details_v1;
DROP TABLE ingestion_task_details_v1;
CREATE INDEX IF NOT EXISTS ingestion_task_details_active_priority ON ingestion_task_details(active, priority DESC, task_type);
CREATE INDEX IF NOT EXISTS ingestion_task_details_type ON ingestion_task_details(task_type, active);
