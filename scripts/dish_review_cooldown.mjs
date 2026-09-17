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

export function loadDishReviewCooldowns(reviewRoot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const cooldownDays = options.cooldownDays || {};
  const active = new Map();

  for (const file of reviewFiles(reviewRoot)) {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lane = MARKER_TO_LANE[document.marker];
    if (!lane || !Array.isArray(document.records)) continue;
    const reviewedAt = document.reviewedAt || document.generatedAt || null;

    for (const record of document.records) {
      const googlePlaceId = String(record.googlePlaceId || '').trim();
      if (!googlePlaceId) continue;
      const decision = reviewCooldownDecision({
        status: record.status,
        reviewedAt,
        now,
        cooldownDays
      });
      if (!decision) continue;

      const key = keyOf(googlePlaceId, lane);
      const candidate = {
        googlePlaceId,
        lane,
        ...decision,
        reviewFile: path.relative(path.dirname(reviewRoot), file).split(path.sep).join('/')
      };
      const previous = active.get(key);
      if (!previous || candidate.lastReviewedAt > previous.lastReviewedAt) active.set(key, candidate);
    }
  }
  return active;
}

export function findDishReviewCooldown(cooldowns, googlePlaceId, lane) {
  return cooldowns.get(keyOf(googlePlaceId, lane)) || null;
}
