# 2026-09-07 — Parallel sub-agent enrichment architecture

## Why parallel workers are useful now

The remaining work is no longer a single-source lookup problem. The master task planner currently separates identity recovery, field completion, conflict review, and dish semantic review. These task families are independent enough to run concurrently, but they must not write directly to the same master database.

The parallel design therefore uses **proposal-only sub-agents**:

1. build the current SQLite master and unified ingestion plan;
2. assign each active task to exactly one deterministic shard;
3. route shards by task/source type;
4. let workers collect or review evidence independently;
5. require workers to emit proposals/evidence only;
6. merge proposals through the central resolver/validator;
7. rebuild the task plan after accepted changes.

## Agent families

### Identity recovery agents

`identity-public-recovery`

- target: current `id_only` tasks;
- default parallelism: 8 shards;
- durable evidence must come from independent public sources;
- historical Google display content is never durable;
- proximity-only matching is forbidden;
- ambiguous results remain candidate/review-required.

### Field completion agents

Field tasks are routed by retained source context:

- `field-official`
- `field-hotpepper`
- `field-tabelog-retained`
- `field-open-data`
- `field-existing-source`

Default parallelism is 6 shards per field-agent family, with the planner automatically increasing shard count if needed to keep every shard <=250 tasks.

The extraction rule remains one confirmed source visit -> all supported missing fields.

### Review agents

- `identity-conflict-review`: conflict/collision tasks; normally one shard because these require careful arbitration rather than throughput.
- `dish-semantic-review`: source-backed dish evidence semantic review; default 2 shards.

## Safety and consistency rules

Sub-agents do not write SQLite directly. Their outputs are proposals that retain task ID, Place ID, source URL/provider context, target fields, evidence/provenance, and confidence/review state.

Hard rules enforced in the workplan:

- paid Google data API calls = 0;
- Google historical display payload cannot become durable evidence;
- proximity-only identity binding = forbidden;
- direct master writes by sub-agents = forbidden;
- one active task appears in exactly one shard;
- shard size <=250 tasks;
- ambiguous identity results remain candidates;
- accepted data still passes the existing master resolver, collision quarantine, provenance validation, export validation, and no-paid-API audit.

## Implementation

Added `scripts/database/build_agent_workplan.py`.

The planner reads active `ingestion_tasks` and `ingestion_task_details`, inspects existing source bindings for each Place ID, and deterministically assigns every task to a worker family and shard using a stable SHA-256 bucket. This means repeated runs on the same task set produce the same ownership and avoid duplicate worker effort.

Added `.github/workflows/parallel-agent-workplan.yml`.

The workflow:

1. checks the planner syntax and no-paid-API policy;
2. builds and validates the current SQLite master;
3. validates the current unified ingestion plan;
4. builds deterministic proposal-only worker shards;
5. verifies unique task ownership and <=250-task shard size;
6. uploads the manifest and shard JSON files as a short-lived Actions artifact.

No external data source is called by the planning workflow itself.

## Next implementation stage

The next stage is to add per-family worker executors and a central proposal importer/reviewer. The preferred order is:

1. retained/public-source identity collector workers;
2. source-bound field-completion workers;
3. proposal validator/importer;
4. master rebuild + task re-plan;
5. repeat until identity and field gaps plateau.

Workers should be horizontally scalable and disposable. The SQLite master, resolver rules, and accepted provenance remain the single durable truth.
