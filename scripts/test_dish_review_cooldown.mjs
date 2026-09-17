#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findDishReviewCooldown,
  loadDishReviewCooldowns,
  reviewCooldownDecision
} from './dish_review_cooldown.mjs';

const now = new Date('2026-09-17T00:00:00Z');
assert.deepEqual(
  reviewCooldownDecision({ status: 'accepted_evidence', reviewedAt: '2026-09-15', now }),
  { terminalStatus: 'accepted_evidence', lastReviewedAt: '2026-09-15', retryAfter: '2026-10-15', cooldownDays: 30 }
);
assert.deepEqual(
  reviewCooldownDecision({ status: 'candidate', reviewedAt: '2026-09-15', now }),
  { terminalStatus: 'candidate', lastReviewedAt: '2026-09-15', retryAfter: '2026-10-15', cooldownDays: 30 }
);
assert.deepEqual(
  reviewCooldownDecision({ status: 'no_evidence', reviewedAt: '2026-09-15', now }),
  { terminalStatus: 'no_evidence', lastReviewedAt: '2026-09-15', retryAfter: '2026-11-14', cooldownDays: 60 }
);
assert.equal(reviewCooldownDecision({ status: 'candidate', reviewedAt: '2026-01-01', now }), null);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-review-cooldown-'));
try {
  const official = path.join(root, 'DISH-R-OFFICIAL');
  const discovery = path.join(root, 'DISH-R-DISCOVERY');
  fs.mkdirSync(official, { recursive: true });
  fs.mkdirSync(discovery, { recursive: true });
  fs.writeFileSync(path.join(official, 'S0.json'), JSON.stringify({
    marker: 'DISH-R-OFFICIAL', reviewedAt: '2026-09-15', records: [
      { googlePlaceId: 'official-candidate', status: 'candidate' },
      { googlePlaceId: 'official-accepted', status: 'accepted_evidence' }
    ]
  }));
  fs.writeFileSync(path.join(discovery, 'S3.json'), JSON.stringify({
    marker: 'DISH-R-DISCOVERY', generatedAt: '2026-09-14T12:00:00Z', records: [
      { googlePlaceId: 'discovery-none', status: 'no_evidence' },
      { googlePlaceId: 'discovery-blocked', status: 'blocked' }
    ]
  }));

  const cooldowns = loadDishReviewCooldowns(root, { now });
  assert.equal(cooldowns.size, 4, 'all recent terminal review outcomes must prevent immediate duplicate assignment');
  assert.equal(findDishReviewCooldown(cooldowns, 'official-candidate', 'official_crawl')?.terminalStatus, 'candidate');
  assert.equal(findDishReviewCooldown(cooldowns, 'official-accepted', 'official_crawl')?.terminalStatus, 'accepted_evidence');
  assert.equal(findDishReviewCooldown(cooldowns, 'discovery-none', 'independent_source_discovery')?.retryAfter, '2026-11-13');
  assert.equal(findDishReviewCooldown(cooldowns, 'discovery-blocked', 'independent_source_discovery')?.retryAfter, '2026-10-14');
  assert.equal(findDishReviewCooldown(cooldowns, 'official-candidate', 'retained_source_mining'), null,
    'review cooldown is lane-specific and must not suppress a different evidence lane');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ status: 'pass', checks: 'accepted/candidate/no-evidence/blocked cooldown and lane isolation' }));
