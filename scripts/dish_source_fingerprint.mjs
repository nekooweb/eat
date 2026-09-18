#!/usr/bin/env node
import crypto from 'node:crypto';

export const DISH_SOURCE_FINGERPRINT_VERSION = 1;

const DISH_RELEVANT_FIELDS = new Set([
  'dishes',
  'dish',
  'menu',
  'recommendeddishes',
  'recommended_dishes',
  'featureddishes',
  'featured_dishes'
]);

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function normalizeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|mc_cid|mc_eid)$/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw;
  }
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function dishRelevantFields(fields) {
  return sortedUnique((Array.isArray(fields) ? fields : [])
    .map((field) => text(field).toLowerCase())
    .filter((field) => DISH_RELEVANT_FIELDS.has(field)));
}

export function normalizeDishSourceLinks(sourceLinks = []) {
  const normalized = [];
  for (const link of Array.isArray(sourceLinks) ? sourceLinks : []) {
    const url = normalizeUrl(link?.url || link?.sourceUrl);
    if (!url) continue;
    normalized.push({
      provider: text(link?.provider).toLowerCase(),
      url,
      fields: dishRelevantFields(link?.fields)
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

function laneSourceSignals(row = {}, lane = '') {
  if (lane === 'official_crawl') {
    return { crawlableOfficialUrlCount: Number(row.crawlableOfficialUrlCount || 0) };
  }
  if (lane === 'retained_source_mining') {
    return { retainedThirdPartyUrlCount: Number(row.retainedThirdPartyUrlCount || 0) };
  }
  if (lane === 'official_or_retained_featured') {
    return {
      crawlableOfficialUrlCount: Number(row.crawlableOfficialUrlCount || 0),
      retainedThirdPartyUrlCount: Number(row.retainedThirdPartyUrlCount || 0)
    };
  }
  return { sourceUrlCount: Number(row.sourceUrlCount || 0) };
}

export function buildDishSourceFingerprintInput({ row = {}, lane = '', sourceLinks = [] } = {}) {
  return {
    fingerprintVersion: DISH_SOURCE_FINGERPRINT_VERSION,
    googlePlaceId: text(row.googlePlaceId),
    lane: text(lane),
    nextAction: text(row.nextAction),
    sourceBindings: normalizeDishSourceLinks(sourceLinks),
    laneSourceSignals: laneSourceSignals(row, lane)
  };
}

export function buildDishSourceFingerprint(options = {}) {
  const payload = buildDishSourceFingerprintInput(options);
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `sha256:${digest}`;
}
