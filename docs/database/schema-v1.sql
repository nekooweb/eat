-- Validated relational prototype; not a production migration or field resolver.
PRAGMA foreign_keys=ON;
CREATE TABLE catalog_entries (
  place_id TEXT PRIMARY KEY CHECK(length(place_id)>0),
  scope TEXT NOT NULL,
  membership_snapshot TEXT NOT NULL,
  identity_state TEXT NOT NULL CHECK(identity_state IN ('id_only','source_matched','verified','closed','moved','conflict')),
  created_at TEXT NOT NULL
);
CREATE TABLE source_records (
  source_record_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source_url TEXT,
  observed_at TEXT,
  ingested_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(provider,provider_id,content_hash)
);
CREATE TABLE source_bindings (
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  source_record_id TEXT NOT NULL REFERENCES source_records(source_record_id),
  binding_state TEXT NOT NULL CHECK(binding_state IN ('reviewed','candidate','conflict','retracted')),
  binding_method TEXT NOT NULL,
  PRIMARY KEY(place_id,source_record_id)
);
CREATE TABLE field_observations (
  observation_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  source_record_id TEXT NOT NULL REFERENCES source_records(source_record_id),
  field_key TEXT NOT NULL,
  value_json TEXT CHECK(value_json IS NULL OR json_valid(value_json)),
  field_state TEXT NOT NULL CHECK(field_state IN ('known','unknown','reviewed_none','not_applicable','conflict','retracted')),
  observed_at TEXT,
  FOREIGN KEY(place_id,source_record_id) REFERENCES source_bindings(place_id,source_record_id),
  CHECK(field_state <> 'known' OR (value_json IS NOT NULL AND value_json <> 'null')),
  UNIQUE(observation_id,place_id,field_key)
);
CREATE TABLE field_resolutions (
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  field_key TEXT NOT NULL,
  observation_id TEXT,
  resolution_state TEXT NOT NULL CHECK(resolution_state IN ('known','unknown','reviewed_none','not_applicable','conflict')),
  rule_version TEXT NOT NULL,
  PRIMARY KEY(place_id,field_key),
  FOREIGN KEY(observation_id,place_id,field_key) REFERENCES field_observations(observation_id,place_id,field_key),
  CHECK(resolution_state <> 'known' OR observation_id IS NOT NULL)
);
CREATE INDEX observations_by_place_field ON field_observations(place_id,field_key);
CREATE INDEX bindings_by_source ON source_bindings(source_record_id);
CREATE TABLE ingestion_tasks (
  task_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES catalog_entries(place_id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','partial','failed','blocked','review_required')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_retry_at TEXT,
  error_code TEXT
);
CREATE TABLE exports (
  export_id TEXT PRIMARY KEY,
  source_commit TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  validated_at TEXT NOT NULL
);
