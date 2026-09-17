#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findDishReviewCooldown,
  findDishReviewSourceChange,
  loadDishReviewCooldowns,
  loadDishReviewLifecycle,
  reviewCooldownDecision,
  reviewLifecycleDecision
} from './dish_review_cooldown.mjs';
import {
  DISH_SOURCE_FINGERPRINT_VERSION,
  buildDishSourceFingerprint
} from './dish_source_fingerprint.mjs';

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

const baseRow = {
  googlePlaceId: 'fingerprint-place',
  nextAction: 'collect_strict_recommended_dishes',
  sourceUrlCount: 2,
  crawlableOfficialUrlCount: 1,
  retainedThirdPartyUrlCount: 1,
  cuisine: '日式',
  distanceMeters: 100,
  priorityScore: 999
};
const linksA = [
  { provider: 'official', url: 'https://example.com/menu#today', fields: ['name', 'dishes'], checkedAt: '2026-09-01' },
  { provider: 'Tabelog', url: 'https://tabelog.com/example/', fields: ['dishes', 'hours'], checkedAt: '2026-09-02' }
];
const fingerprintA = buildDishSourceFingerprint({ row: baseRow, lane: 'official_crawl', sourceLinks: linksA });
assert.match(fingerprintA, /^sha256:[0-9a-f]{64}$/);

const fingerprintEquivalent = buildDishSourceFingerprint({
  row: { ...baseRow, cuisine: '中餐', distanceMeters: 800, priorityScore: 1 },
  lane: 'official_crawl',
  sourceLinks: [
    { provider: 'Tabelog', url: 'https://tabelog.com/example/', fields: ['hours', 'dishes'], checkedAt: '2026-09-16' },
    { provider: 'official', url: 'https://example.com/menu', fields: ['dishes', 'name'], checkedAt: '2026-09-17' }
  ]
});
assert.equal(fingerprintEquivalent, fingerprintA,
  'source URL order, field order, checkedAt, cuisine, distance and priority must not change the fingerprint');

const fingerprintChanged = buildDishSourceFingerprint({
  row: { ...baseRow, sourceUrlCount: 3 },
  lane: 'official_crawl',
  sourceLinks: [...linksA, { provider: 'official', url: 'https://example.com/new-menu', fields: ['dishes'] }]
});
assert.notEqual(fingerprintChanged, fingerprintA, 'a meaningful bound-source change must change the fingerprint');

const sameLifecycle = reviewLifecycleDecision({
  status: 'candidate',
  reviewedAt: '2026-09-15',
  sourceFingerprint: fingerprintA,
  currentSourceFingerprint: fingerprintA,
  now
});
assert.equal(sameLifecycle.deferred, true);
assert.equal(sameLifecycle.activationReason, null);

const changedLifecycle = reviewLifecycleDecision({
  status: 'candidate',
  reviewedAt: '2026-09-15',
  sourceFingerprint: fingerprintA,
  currentSourceFingerprint: fingerprintChanged,
  now
});
assert.equal(changedLifecycle.deferred, false);
assert.equal(changedLifecycle.activationReason, 'source_changed');
assert.equal(changedLifecycle.reviewSourceFingerprint, fingerprintA);
assert.equal(changedLifecycle.currentSourceFingerprint, fingerprintChanged);

const legacyLifecycle = reviewLifecycleDecision({
  status: 'candidate',
  reviewedAt: '2026-09-15',
  sourceFingerprint: null,
  currentSourceFingerprint: fingerprintChanged,
  now
});
assert.equal(legacyLifecycle.deferred, true, 'legacy reviews without fingerprints must keep date cooldown behavior');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-review-cooldown-'));
try {
  const official = path.join(root, 'DISH-R-OFFICIAL');
  const discovery = path.join(root, 'DISH-R-DISCOVERY');
  fs.mkdirSync(official, { recursive: true });
  fs.mkdirSync(discovery, { recursive: true });
  fs.writeFileSync(path.join(official, 'S0.json'), JSON.stringify({
    marker: 'DISH-R-OFFICIAL', reviewedAt: '2026-09-15', records: [
      { googlePlaceId: 'official-candidate', status: 'candidate' },
      { googlePlaceId: 'official-accepted', status: 'accepted_evidence' },
      {
        googlePlaceId: 'official-fingerprint-same',
        status: 'candidate',
        fingerprintVersion: DISH_SOURCE_FINGERPRINT_VERSION,
        sourceFingerprint: fingerprintA
      },
      {
        googlePlaceId: 'official-fingerprint-changed',
        status: 'no_evidence',
        fingerprintVersion: DISH_SOURCE_FINGERPRINT_VERSION,
        sourceFingerprint: fingerprintA
      }
    ]
  }));
  fs.writeFileSync(path.join(discovery, 'S3.json'), JSON.stringify({
    marker: 'DISH-R-DISCOVERY', generatedAt: '2026-09-14T12:00:00Z', records: [
      { googlePlaceId: 'discovery-none', status: 'no_evidence' },
      { googlePlaceId: 'discovery-blocked', status: 'blocked' }
    ]
  }));

  const currentSourceFingerprintFor = (googlePlaceId) => {
    if (googlePlaceId === 'official-fingerprint-same') return fingerprintA;
    if (googlePlaceId === 'official-fingerprint-changed') return fingerprintChanged;
    return null;
  };
  const lifecycle = loadDishReviewLifecycle(root, { now, currentSourceFingerprintFor });
  assert.equal(lifecycle.cooldowns.size, 5,
    'legacy outcomes and unchanged fingerprint reviews must remain deferred');
  assert.equal(lifecycle.sourceChanged.size, 1, 'only changed fingerprint review should reactivate early');
  assert.equal(
    findDishReviewSourceChange(lifecycle.sourceChanged, 'official-fingerprint-changed', 'official_crawl')?.activationReason,
    'source_changed'
  );
  assert.equal(
    findDishReviewCooldown(lifecycle.cooldowns, 'official-fingerprint-same', 'official_crawl')?.reviewSourceFingerprint,
    fingerprintA
  );

  const cooldowns = loadDishReviewCooldowns(root, { now, currentSourceFingerprintFor });
  assert.equal(cooldowns.size, 5);
  assert.equal(findDishReviewCooldown(cooldowns, 'official-candidate', 'official_crawl')?.terminalStatus, 'candidate');
  assert.equal(findDishReviewCooldown(cooldowns, 'official-accepted', 'official_crawl')?.terminalStatus, 'accepted_evidence');
  assert.equal(findDishReviewCooldown(cooldowns, 'discovery-none', 'independent_source_discovery')?.retryAfter, '2026-11-13');
  assert.equal(findDishReviewCooldown(cooldowns, 'discovery-blocked', 'independent_source_discovery')?.retryAfter, '2026-10-14');
  assert.equal(findDishReviewCooldown(cooldowns, 'official-candidate', 'retained_source_mining'), null,
    'review cooldown is lane-specific and must not suppress a different evidence lane');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: 'pass',
  checks: 'terminal cooldown, lane isolation, stable source fingerprint and source-change reactivation'
}));
