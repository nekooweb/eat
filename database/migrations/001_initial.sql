PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_entries (
  place_id TEXT PRIMARY KEY CHECK(length(place_id) > 0),
  scope TEXT NOT NULL,
  membership_snapshot TEXT NOT NULL,
  identity_state TEXT NOT NULL CHECK(identity_state IN ('id_only','source_matched','verified','closed','moved','conflict')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_records (
  source_record_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_url TEXT,
  observed_at TEXT,
  ingested_at TEXT NOT NULL,
  acquisition_method TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  permission_basis TEXT,
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(provider, provider_id, content_hash)
);

CREATE TABLE IF NOT EXISTS source_bindings (
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  source_record_id TEXT NOT NULL REFERENCES source_records(source_record_id),
  binding_state TEXT NOT NULL CHECK(binding_state IN ('reviewed','candidate','conflict','retracted')),
  binding_method TEXT NOT NULL,
  confidence TEXT,
  source_distance_m REAL,
  reviewed_at TEXT,
  PRIMARY KEY(place_id, source_record_id)
);
CREATE INDEX IF NOT EXISTS bindings_by_source ON source_bindings(source_record_id);
CREATE INDEX IF NOT EXISTS bindings_by_place ON source_bindings(place_id);

CREATE TABLE IF NOT EXISTS field_observations (
  observation_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  source_record_id TEXT NOT NULL REFERENCES source_records(source_record_id),
  field_key TEXT NOT NULL,
  value_json TEXT CHECK(value_json IS NULL OR json_valid(value_json)),
  field_state TEXT NOT NULL CHECK(field_state IN ('known','unknown','reviewed_none','not_applicable','conflict','retracted')),
  observed_at TEXT,
  parser_version TEXT NOT NULL,
  derived_from_observation_id TEXT REFERENCES field_observations(observation_id),
  transformation_rule_version TEXT,
  FOREIGN KEY(place_id, source_record_id) REFERENCES source_bindings(place_id, source_record_id),
  CHECK(field_state <> 'known' OR (value_json IS NOT NULL AND value_json <> 'null')),
  UNIQUE(observation_id, place_id, field_key)
);
CREATE INDEX IF NOT EXISTS observations_by_place_field ON field_observations(place_id, field_key);
CREATE INDEX IF NOT EXISTS observations_by_source ON field_observations(source_record_id);

CREATE TABLE IF NOT EXISTS field_resolutions (
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  field_key TEXT NOT NULL,
  observation_id TEXT,
  resolution_state TEXT NOT NULL CHECK(resolution_state IN ('known','unknown','reviewed_none','not_applicable','conflict')),
  rule_version TEXT NOT NULL,
  resolver_priority INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT NOT NULL,
  PRIMARY KEY(place_id, field_key),
  FOREIGN KEY(observation_id, place_id, field_key) REFERENCES field_observations(observation_id, place_id, field_key),
  CHECK(resolution_state <> 'known' OR observation_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  source_commit TEXT,
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
  summary_json TEXT CHECK(summary_json IS NULL OR json_valid(summary_json))
);

CREATE TABLE IF NOT EXISTS ingestion_tasks (
  task_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','partial','failed','blocked','review_required')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_retry_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS ingestion_task_details (
  task_id TEXT PRIMARY KEY REFERENCES ingestion_tasks(task_id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK(task_type IN ('identity_conflict_review','identity_recovery','field_completion','dish_semantic_review')),
  priority INTEGER NOT NULL CHECK(priority >= 0),
  field_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(field_keys_json)),
  task_payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(task_payload_json)),
  source_hint TEXT,
  planner_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ingestion_tasks_status ON ingestion_tasks(status);
CREATE INDEX IF NOT EXISTS ingestion_task_details_active_priority ON ingestion_task_details(active, priority DESC, task_type);
CREATE INDEX IF NOT EXISTS ingestion_task_details_type ON ingestion_task_details(task_type, active);

CREATE TABLE IF NOT EXISTS retained_exceptions (
  exception_id TEXT PRIMARY KEY,
  exception_type TEXT NOT NULL,
  external_key TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  export_id TEXT PRIMARY KEY,
  export_type TEXT NOT NULL CHECK(export_type IN ('catalog','recommendation','public','audit')),
  source_commit TEXT,
  schema_version INTEGER NOT NULL,
  resolver_version TEXT NOT NULL,
  eligibility_version TEXT,
  database_snapshot_hash TEXT,
  row_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  validated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
