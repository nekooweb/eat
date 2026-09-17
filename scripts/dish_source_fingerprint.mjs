#!/usr/bin/env node
import crypto from 'node:crypto';

export const DISH_SOURCE_FINGERPRINT_VERSION = 1;

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function normalizeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function normalizeDishSourceLinks(sourceLinks = []) {
  const normalized = [];
  for (const link of Array.isArray(sourceLinks) ? sourceLinks : []) {
    const url = normalizeUrl(link?.url || link?.sourceUrl);
    if (!url) continue;
    normalized.push({
      provider: text(link?.provider).toLowerCase(),
      url,
      fields: sortedUnique((Array.isArray(link?.fields) ? link.fields : []).map((field) => text(field).toLowerCase()))
    });
  }
  const byStableKey = new Map();
  for (const item of normalized) {
    const key = JSON.stringify(item);
    if (!byStableKey.has(key)) byStableKey.set(key, item);
  }
  return [...byStableKey.values()].sort((a, b) =>
    a.provider.localeCompare(b.provider)
    || a.url.localeCompare(b.url)
    || JSON.stringify(a.fields).localeCompare(JSON.stringify(b.fields)));
}

export function buildDishSourceFingerprintInput({ row = {}, lane = '', sourceLinks = [] } = {}) {
  return {
    fingerprintVersion: DISH_SOURCE_FINGERPRINT_VERSION,
    googlePlaceId: text(row.googlePlaceId),
    lane: text(lane),
    nextAction: text(row.nextAction),
    sourceBindings: normalizeDishSourceLinks(sourceLinks),
    sourceCounts: {
      sourceUrlCount: Number(row.sourceUrlCount || 0),
      crawlableOfficialUrlCount: Number(row.crawlableOfficialUrlCount || 0),
      retainedThirdPartyUrlCount: Number(row.retainedThirdPartyUrlCount || 0)
    }
  };
}

export function buildDishSourceFingerprint(options = {}) {
  const payload = buildDishSourceFingerprintInput(options);
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `sha256:${digest}`;
}
