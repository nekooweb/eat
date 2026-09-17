#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

export const MARKER_TO_LANE = Object.freeze({
  'DISH-R-OFFICIAL': 'official_crawl',
  'DISH-R-RETAINED': 'retained_source_mining',
  'DISH-R-DISCOVERY': 'independent_source_discovery',
  'DISH-F-SOURCE': 'official_or_retained_featured'
});

export const DEFAULT_COOLDOWN_DAYS = Object.freeze({
  accepted_evidence: 30,
  candidate: 30,
  no_evidence: 60,
  blocked: 30
});

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizedFingerprint(value) {
  const fingerprint = String(value || '').trim();
  return /^sha256:[0-9a-f]{64}$/u.test(fingerprint) ? fingerprint : null;
}

export function cooldownDaysForStatus(status, overrides = {}) {
  const merged = { ...DEFAULT_COOLDOWN_DAYS, ...overrides };
  const days = Number(merged[status]);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

export function reviewCooldownDecision({ status, reviewedAt, now = new Date(), cooldownDays = {} }) {
  const days = cooldownDaysForStatus(status, cooldownDays);
  const reviewed = dateOnly(reviewedAt);
  if (!days || !reviewed) return null;
  const retry = addDays(reviewed, days);
  if (retry.getTime() <= now.getTime()) return null;
  return {
    terminalStatus: status,
    lastReviewedAt: reviewed.toISOString().slice(0, 10),
    retryAfter: retry.toISOString().slice(0, 10),
    cooldownDays: days
  };
}

export function reviewLifecycleDecision({
  status,
  reviewedAt,
  sourceFingerprint,
  currentSourceFingerprint,
  now = new Date(),
  cooldownDays = {}
}) {
  const reviewedFingerprint = normalizedFingerprint(sourceFingerprint);
  const currentFingerprint = normalizedFingerprint(currentSourceFingerprint);
  const cooldown = reviewCooldownDecision({ status, reviewedAt, now, cooldownDays });

  if (reviewedFingerprint && currentFingerprint && reviewedFingerprint !== currentFingerprint) {
    return {
      deferred: false,
      activationReason: 'source_changed',
      terminalStatus: status,
      lastReviewedAt: dateOnly(reviewedAt)?.toISOString().slice(0, 10) || null,
      retryAfter: cooldown?.retryAfter || null,
      cooldownDays: cooldownDaysForStatus(status, cooldownDays),
      reviewSourceFingerprint: reviewedFingerprint,
      currentSourceFingerprint: currentFingerprint
    };
  }

  if (cooldown) {
    return {
      deferred: true,
      activationReason: null,
      ...cooldown,
      reviewSourceFingerprint: reviewedFingerprint,
      currentSourceFingerprint: currentFingerprint
    };
  }

  return {
    deferred: false,
    activationReason: 'cooldown_expired',
    terminalStatus: status,
    lastReviewedAt: dateOnly(reviewedAt)?.toISOString().slice(0, 10) || null,
    retryAfter: null,
    cooldownDays: cooldownDaysForStatus(status, cooldownDays),
    reviewSourceFingerprint: reviewedFingerprint,
    currentSourceFingerprint: currentFingerprint
  };
}

function reviewFiles(reviewRoot) {
  const files = [];
  for (const marker of Object.keys(MARKER_TO_LANE)) {
    const dir = path.join(reviewRoot, marker);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (/^S\d+\.json$/u.test(name)) files.push(path.join(dir, name));
    }
  }
  return files;
}

function keyOf(googlePlaceId, lane) {
  return `${lane}\u0000${googlePlaceId}`;
}

export function loadDishReviewLifecycle(reviewRoot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const cooldownDays = options.cooldownDays || {};
  const currentSourceFingerprintFor = typeof options.currentSourceFingerprintFor === 'function'
    ? options.currentSourceFingerprintFor
    : () => null;
  const latest = new Map();

  for (const file of reviewFiles(reviewRoot)) {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lane = MARKER_TO_LANE[document.marker];
    if (!lane || !Array.isArray(document.records)) continue;

    for (const record of document.records) {
      const googlePlaceId = String(record.googlePlaceId || '').trim();
      if (!googlePlaceId) continue;
      const reviewedAt = record.reviewedAt || document.reviewedAt || document.generatedAt || null;
      const reviewedDate = dateOnly(reviewedAt);
      const key = keyOf(googlePlaceId, lane);
      const candidate = {
        googlePlaceId,
        lane,
        status: record.status,
        reviewedAt,
        reviewedTime: reviewedDate?.getTime() ?? Number.NEGATIVE_INFINITY,
        sourceFingerprint: record.sourceFingerprint || null,
        fingerprintVersion: Number(record.fingerprintVersion || 0) || null,
        reviewFile: path.relative(path.dirname(reviewRoot), file).split(path.sep).join('/')
      };
      const previous = latest.get(key);
      if (!previous || candidate.reviewedTime > previous.reviewedTime) latest.set(key, candidate);
    }
  }

  const cooldowns = new Map();
  const sourceChanged = new Map();
  for (const [key, review] of latest.entries()) {
    const currentSourceFingerprint = currentSourceFingerprintFor(review.googlePlaceId, review.lane) || null;
    const decision = reviewLifecycleDecision({
      status: review.status,
      reviewedAt: review.reviewedAt,
      sourceFingerprint: review.sourceFingerprint,
      currentSourceFingerprint,
      now,
      cooldownDays
    });
    const entry = {
      googlePlaceId: review.googlePlaceId,
      lane: review.lane,
      terminalStatus: decision.terminalStatus,
      lastReviewedAt: decision.lastReviewedAt,
      retryAfter: decision.retryAfter,
      cooldownDays: decision.cooldownDays,
      reviewFile: review.reviewFile,
      fingerprintVersion: review.fingerprintVersion,
      reviewSourceFingerprint: decision.reviewSourceFingerprint,
      currentSourceFingerprint: decision.currentSourceFingerprint
    };
    if (decision.deferred) cooldowns.set(key, entry);
    else if (decision.activationReason === 'source_changed') {
      sourceChanged.set(key, { ...entry, activationReason: 'source_changed' });
    }
  }

  return { cooldowns, sourceChanged };
}

export function loadDishReviewCooldowns(reviewRoot, options = {}) {
  return loadDishReviewLifecycle(reviewRoot, options).cooldowns;
}

export function findDishReviewCooldown(cooldowns, googlePlaceId, lane) {
  return cooldowns.get(keyOf(googlePlaceId, lane)) || null;
}

export function findDishReviewSourceChange(sourceChanged, googlePlaceId, lane) {
  return sourceChanged.get(keyOf(googlePlaceId, lane)) || null;
}
