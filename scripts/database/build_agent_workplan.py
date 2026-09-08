#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PLANNER_VERSION = 'agent-workplan-v1'
DEFAULT_IDENTITY_SHARDS = 8
DEFAULT_FIELD_SHARDS = 6
DEFAULT_DISH_SHARDS = 2
MAX_TASKS_PER_SHARD = 250
BANNED_KEYS = {
    'displayName', 'formattedAddress', 'googleName', 'googleAddress',
    'googleLocation', 'location', 'businessStatus', 'primaryType', 'types'
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def stable_bucket(value: str, count: int) -> int:
    digest = hashlib.sha256(value.encode('utf-8')).digest()
    return int.from_bytes(digest[:8], 'big') % count


def parse_json(value: str, fallback):
    try:
        return json.loads(value)
    except Exception:
        return fallback


def source_context(db: sqlite3.Connection) -> dict[str, dict]:
    providers = defaultdict(set)
    reviewed_urls = defaultdict(list)
    candidates = defaultdict(int)
    conflicts = defaultdict(int)
    for place_id, provider, source_url, binding_state in db.execute(
        """
        SELECT sb.place_id, sr.provider, sr.source_url, sb.binding_state
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id = sb.source_record_id
        ORDER BY sb.place_id, sr.provider, sr.provider_id
        """
    ):
        providers[place_id].add(provider)
        if binding_state == 'reviewed' and source_url:
            reviewed_urls[place_id].append(source_url)
        elif binding_state == 'candidate':
            candidates[place_id] += 1
        elif binding_state == 'conflict':
            conflicts[place_id] += 1
    return {
        place_id: {
            'providers': sorted(providers[place_id]),
            'reviewedSourceUrls': sorted(set(reviewed_urls[place_id])),
            'candidateBindings': candidates[place_id],
            'conflictBindings': conflicts[place_id],
        }
        for place_id in set(providers) | set(reviewed_urls) | set(candidates) | set(conflicts)
    }


def route_field_agent(context: dict) -> str:
    names = ' '.join(context.get('providers') or []).lower()
    if 'official' in names:
        return 'field-official'
    if 'hot pepper' in names or 'hotpepper' in names:
        return 'field-hotpepper'
    if 'tabelog' in names:
        return 'field-tabelog-retained'
    if 'openstreetmap' in names or 'overture' in names:
        return 'field-open-data'
    return 'field-existing-source'


def active_tasks(db: sqlite3.Connection) -> list[dict]:
    context = source_context(db)
    rows = db.execute(
        """
        SELECT t.task_id, t.place_id, t.provider, t.status, t.attempts,
               d.task_type, d.priority, d.field_keys_json,
               d.task_payload_json, d.source_hint
        FROM ingestion_tasks t
        JOIN ingestion_task_details d ON d.task_id = t.task_id
        WHERE d.active = 1 AND t.status IN ('pending','partial','review_required','blocked','failed')
        ORDER BY d.priority DESC, d.task_type, t.task_id
        """
    ).fetchall()
    tasks = []
    for row in rows:
        task_id, place_id, provider, status, attempts, task_type, priority, field_keys_json, payload_json, source_hint = row
        payload = parse_json(payload_json, {})
        field_keys = parse_json(field_keys_json, [])
        source = context.get(place_id, {'providers': [], 'reviewedSourceUrls': [], 'candidateBindings': 0, 'conflictBindings': 0})
        if task_type == 'identity_conflict_review':
            agent_type = 'identity-conflict-review'
        elif task_type == 'identity_recovery':
            agent_type = 'identity-public-recovery'
        elif task_type == 'field_completion':
            agent_type = route_field_agent(source)
        elif task_type == 'dish_semantic_review':
            agent_type = 'dish-semantic-review'
        elif task_type in ('dish_source_acquisition', 'featured_dish_source_acquisition'):
            agent_type = 'dish-source-acquisition'
        else:
            agent_type = 'unclassified-review'
        tasks.append({
            'taskId': task_id,
            'placeId': place_id,
            'taskType': task_type,
            'agentType': agent_type,
            'priority': priority,
            'status': status,
            'attempts': attempts,
            'fieldKeys': field_keys if isinstance(field_keys, list) else [],
            'sourceHint': source_hint,
            'sourceContext': source,
            'taskPayload': payload if isinstance(payload, dict) else {},
        })
    return tasks


def shard_count(agent_type: str, task_count: int, identity_shards: int, field_shards: int, dish_shards: int) -> int:
    if task_count <= 0:
        return 0
    if agent_type == 'identity-public-recovery':
        desired = identity_shards
    elif agent_type.startswith('field-'):
        desired = field_shards
    elif agent_type in ('dish-semantic-review','dish-source-acquisition'):
        desired = dish_shards
    else:
        desired = 1
    minimum_for_size = (task_count + MAX_TASKS_PER_SHARD - 1) // MAX_TASKS_PER_SHARD
    return max(1, min(task_count, max(desired, minimum_for_size)))


def make_shards(tasks: list[dict], identity_shards: int, field_shards: int, dish_shards: int) -> list[dict]:
    grouped = defaultdict(list)
    for task in tasks:
        grouped[task['agentType']].append(task)
    shards = []
    for agent_type in sorted(grouped):
        agent_tasks = grouped[agent_type]
        count = shard_count(agent_type, len(agent_tasks), identity_shards, field_shards, dish_shards)
        buckets = [[] for _ in range(count)]
        for task in agent_tasks:
            buckets[stable_bucket(task['taskId'], count)].append(task)
        bounded = []
        for bucket in buckets:
            bucket.sort(key=lambda item: (-item['priority'], item['taskId']))
            bounded.extend(bucket[offset:offset + MAX_TASKS_PER_SHARD]
                           for offset in range(0, len(bucket), MAX_TASKS_PER_SHARD))
        for index, bucket in enumerate(bounded, start=1):
            shard_id = f'{agent_type}-{index:02d}-of-{len(bounded):02d}'
            shards.append({
                'schemaVersion': 1,
                'plannerVersion': PLANNER_VERSION,
                'generatedAt': None,
                'proposalOnly': True,
                'agentType': agent_type,
                'shardId': shard_id,
                'taskCount': len(bucket),
                'policy': {
                    'paidGoogleDataApiCalls': 0,
                    'googleHistoricalDisplayContentDurable': False,
                    'proximityOnlyIdentityBindingAllowed': False,
                    'directMasterWritesAllowed': False,
                    'ambiguousIdentityMustRemainCandidate': True,
                    'oneConfirmedSourceVisitExtractAllSupportedFields': True,
                },
                'tasks': bucket,
            })
    return shards


def contains_banned_key(value) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in BANNED_KEYS or contains_banned_key(child):
                return True
    elif isinstance(value, list):
        return any(contains_banned_key(child) for child in value)
    return False


def validate_shards(tasks: list[dict], shards: list[dict]) -> dict:
    expected = {task['taskId'] for task in tasks}
    seen = []
    oversize = []
    banned = []
    empty = []
    for shard in shards:
        if shard['taskCount'] == 0:
            empty.append(shard['shardId'])
        if shard['taskCount'] > MAX_TASKS_PER_SHARD:
            oversize.append(shard['shardId'])
        if contains_banned_key(shard):
            banned.append(shard['shardId'])
        seen.extend(task['taskId'] for task in shard['tasks'])
    counts = Counter(seen)
    duplicates = sorted(task_id for task_id, count in counts.items() if count != 1)
    missing = sorted(expected - set(seen))
    unexpected = sorted(set(seen) - expected)
    if duplicates or missing or unexpected or oversize or banned or empty:
        raise RuntimeError(json.dumps({
            'duplicates': duplicates[:20], 'missing': missing[:20], 'unexpected': unexpected[:20],
            'oversize': oversize, 'banned': banned, 'empty': empty,
        }, ensure_ascii=False))
    return {
        'taskCount': len(tasks),
        'shardCount': len(shards),
        'maxShardSize': max((shard['taskCount'] for shard in shards), default=0),
        'agentTypeCounts': dict(sorted(Counter(task['agentType'] for task in tasks).items())),
        'taskTypeCounts': dict(sorted(Counter(task['taskType'] for task in tasks).items())),
    }


def write_workplan(db_path: Path, outdir: Path, identity_shards: int, field_shards: int, dish_shards: int) -> dict:
    db = sqlite3.connect(db_path)
    try:
        tasks = active_tasks(db)
    finally:
        db.close()
    shards = make_shards(tasks, identity_shards, field_shards, dish_shards)
    stamp = now_iso()
    for shard in shards:
        shard['generatedAt'] = stamp
    summary = validate_shards(tasks, shards)
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = {
        'schemaVersion': 1,
        'plannerVersion': PLANNER_VERSION,
        'generatedAt': stamp,
        'proposalOnly': True,
        'policy': {
            'paidGoogleDataApiCalls': 0,
            'durableEvidenceMustBeIndependentSource': True,
            'proximityOnlyIdentityBindingAllowed': False,
            'subagentsMayWriteMasterDirectly': False,
        },
        **summary,
        'shards': [
            {'shardId': shard['shardId'], 'agentType': shard['agentType'], 'taskCount': shard['taskCount'], 'file': f"{shard['shardId']}.json"}
            for shard in shards
        ],
    }
    for shard in shards:
        (outdir / f"{shard['shardId']}.json").write_text(json.dumps(shard, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (outdir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('database', type=Path)
    parser.add_argument('--outdir', type=Path, required=True)
    parser.add_argument('--identity-shards', type=int, default=DEFAULT_IDENTITY_SHARDS)
    parser.add_argument('--field-shards', type=int, default=DEFAULT_FIELD_SHARDS)
    parser.add_argument('--dish-shards', type=int, default=DEFAULT_DISH_SHARDS)
    args = parser.parse_args()
    for value in (args.identity_shards, args.field_shards, args.dish_shards):
        if value < 1 or value > 32:
            raise SystemExit('shard counts must be between 1 and 32')
    manifest = write_workplan(args.database, args.outdir, args.identity_shards, args.field_shards, args.dish_shards)
    print(json.dumps({'status': 'pass', **{k: manifest[k] for k in ('taskCount','shardCount','maxShardSize','agentTypeCounts','taskTypeCounts')}}, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
