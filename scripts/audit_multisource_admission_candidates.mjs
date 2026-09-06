#!/usr/bin/env node
import fs from 'node:fs';

const queue = JSON.parse(fs.readFileSync('data/area1_enrichment_queue.json', 'utf8'));
const hp = JSON.parse(fs.readFileSync('data/hotpepper_catalog_facts.json', 'utf8'));
const hpById = new Map((hp.rows || []).map((row) => [row.googlePlaceId, row]));

function norm(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:店|本店|支店|restaurant|cafe|café|bar|the)/gi, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(value) {
  const s = norm(value);
  if (!s) return new Set();
  if (s.length === 1) return new Set([s]);
  const out = new Set();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a, b) {
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const x of aa) if (bb.has(x)) common += 1;
  return Number(((2 * common) / (aa.size + bb.size)).toFixed(3));
}

function haversine(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const r = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

const selected = (queue.items || []).filter((item) => item.queue === 'inventory_multisource_loaded_review');
const rows = selected.map((item) => {
  const source = hpById.get(item.googlePlaceId);
  if (!source) throw new Error(`missing Hot Pepper facts for ${item.googlePlaceId}`);
  const facts = source.facts || {};
  const osm = item.openCandidate || {};
  const overture = item.overtureSupport || {};
  const hpName = facts.name || null;
  const osmName = osm.name || null;
  const overtureName = overture.name || null;
  const hpOsmDistanceMeters = haversine(facts.lat, facts.lng, osm.lat, osm.lng);
  const hpOsmNameSimilarity = dice(hpName, osmName);
  const hpOvertureNameSimilarity = dice(hpName, overtureName);
  const strong = Boolean(
    source.binding?.confidence === 'high'
    && ['A_priority_review', 'B_blocker_review'].includes(overture.triage)
    && overture.crossSourceConfidence === 'high'
    && hpOsmDistanceMeters !== null
    && hpOsmDistanceMeters <= 80
    && hpOsmNameSimilarity >= 0.65
    && hpOvertureNameSimilarity >= 0.65
    && osm.historicalQcStatus !== 'closed_permanently'
  );
  return {
    googlePlaceId: item.googlePlaceId,
    historicalQcStatus: osm.historicalQcStatus,
    hotpepper: {
      id: source.hotpepperId,
      confidence: source.binding?.confidence || null,
      combinedScore: source.binding?.combinedScore ?? null,
      name: hpName,
      address: facts.address || null,
      lat: facts.lat ?? null,
      lng: facts.lng ?? null,
      genre: facts.genre?.name || facts.genre || null,
      budget: facts.budget?.name || null,
      openingHoursText: facts.openingHoursText || null,
      url: facts.urls?.pc || facts.urls?.mobile || null
    },
    osm: {
      id: osm.sourceCandidateId || null,
      confidence: osm.confidence || null,
      name: osmName,
      address: osm.address || null,
      lat: osm.lat ?? null,
      lng: osm.lng ?? null,
      historicalDistanceMeters: osm.distanceMeters ?? null,
      historicalNameSimilarity: osm.nameSimilarity ?? null
    },
    overture: {
      id: overture.overtureId || null,
      triage: overture.triage || null,
      crossSourceConfidence: overture.crossSourceConfidence || null,
      name: overtureName,
      basicCategory: overture.basicCategory || null,
      websites: overture.websites || null,
      brand: overture.brand || null,
      distanceToOsmMeters: overture.distanceToOsmMeters ?? null,
      nameSimilarityToOsm: overture.nameSimilarity ?? null,
      combinedScore: overture.combinedScore ?? null
    },
    reviewMetrics: {
      hpOsmDistanceMeters,
      hpOsmNameSimilarity,
      hpOvertureNameSimilarity,
      strongThreeSourceCandidate: strong
    }
  };
});

rows.sort((a, b) =>
  Number(b.reviewMetrics.strongThreeSourceCandidate) - Number(a.reviewMetrics.strongThreeSourceCandidate)
  || (b.overture.combinedScore || 0) - (a.overture.combinedScore || 0)
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

console.log(JSON.stringify({
  count: rows.length,
  strongThreeSourceCandidates: rows.filter((row) => row.reviewMetrics.strongThreeSourceCandidate).length,
  policy: {
    auditOnly: true,
    automaticAdmission: false,
    historicalGoogleDisplayPayloadUsed: false,
    paidApiCalls: 0
  },
  rows
}, null, 2));
