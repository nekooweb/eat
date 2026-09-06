import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_IDENTITY_ADMISSION = 'legacy_google_qc';
export const CATALOG_IDENTITY_ADMISSION = 'catalog_multisource_reviewed';
export const AREA1_CENTER_LAT = 35.6959;
export const AREA1_CENTER_LNG = 139.7576;
export const AREA1_MAX_DISTANCE_M = 1200;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const r = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function loadCatalogAdmissionPayload(dataDir) {
  const file = path.join(dataDir, 'catalog_admissions.json');
  if (!fs.existsSync(file)) return { schemaVersion: 1, rows: [], rejectedReviewPairs: [] };
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(payload.rows)) throw new Error('catalog_admissions.json rows must be an array');
  return payload;
}

export function buildCatalogAdmissionRoots(dataDir, profile, area) {
  const payload = loadCatalogAdmissionPayload(dataDir);
  const seen = new Set();
  const roots = [];

  for (const row of payload.rows) {
    const placeId = String(row.googlePlaceId || '').trim();
    if (!placeId) throw new Error('catalog admission lacks googlePlaceId compatibility key');
    if (seen.has(placeId)) throw new Error(`duplicate catalog admission: ${placeId}`);
    seen.add(placeId);
    if (row.admissionMode !== 'historical-id+multisource-reviewed') {
      throw new Error(`unsupported catalog admission mode: ${placeId}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.reviewedAt || '')) {
      throw new Error(`catalog admission lacks review date: ${placeId}`);
    }
    if (!row.evidence?.hotpepperId || !row.evidence?.osmCandidateId || !row.evidence?.overtureId) {
      throw new Error(`catalog admission lacks three-source identity evidence: ${placeId}`);
    }
    if (!/^https:\/\//.test(row.evidence?.currentnessUrl || '')) {
      throw new Error(`catalog admission lacks currentness URL: ${placeId}`);
    }
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
      throw new Error(`catalog admission lacks coordinates: ${placeId}`);
    }
    const distanceMeters = haversineMeters(
      AREA1_CENTER_LAT,
      AREA1_CENTER_LNG,
      row.lat,
      row.lng
    );
    if (!Number.isFinite(distanceMeters) || distanceMeters > AREA1_MAX_DISTANCE_M) {
      throw new Error(`catalog admission outside Area1: ${placeId} -> ${distanceMeters}`);
    }

    roots.push({
      id: `catalog-admission-${placeId}`,
      profile,
      area,
      name: String(row.name || '').trim(),
      googlePlaceId: placeId,
      source: 'catalog_admission',
      sourceOnly: false,
      identityAdmission: CATALOG_IDENTITY_ADMISSION,
      admissionReviewedAt: row.reviewedAt,
      admissionMode: row.admissionMode,
      address: String(row.address || '').trim(),
      cuisine: String(row.cuisine || '餐厅').trim() || '餐厅',
      tags: row.cuisine ? [row.cuisine] : [],
      lat: row.lat,
      lng: row.lng,
      distanceMeters,
      admissionEvidence: {
        hotpepperId: row.evidence.hotpepperId,
        osmCandidateId: row.evidence.osmCandidateId,
        overtureId: row.evidence.overtureId,
        currentnessUrl: row.evidence.currentnessUrl,
        currentnessProvider: row.evidence.currentnessProvider || null
      }
    });
  }
  return { payload, roots, admittedIds: new Set(roots.map((row) => row.googlePlaceId)) };
}

export function isLegacyIdentityRow(row) {
  return Boolean(row?.googlePlaceId && row.googleStatus === 'verified');
}

export function isCatalogIdentityRow(row) {
  return Boolean(row?.googlePlaceId && row.identityAdmission === CATALOG_IDENTITY_ADMISSION);
}
