#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const ACCEPTED_STATUS = 'accepted_evidence';
const TERMINAL_STATUSES = new Set(['accepted_evidence', 'candidate', 'no_evidence', 'blocked']);
const GOOGLE_HOST_RE = /(^|\.)google\.|googleusercontent\.com$|maps\.app\.goo\.gl$/u;

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function isoDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function loadTaxonomy(root) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'classification.js'), 'utf8'), context, {
    filename: 'classification.js'
  });
  if (!context.window.EAT_CLASSIFICATION) throw new Error('classification.js did not expose EAT_CLASSIFICATION');
  return context.window.EAT_CLASSIFICATION;
}

function validateSourceUrl(value) {
  const raw = clean(value);
  if (!raw) throw new Error('accepted classification evidence requires sourceUrl');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid classification evidence sourceUrl: ${raw}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`unsupported classification evidence URL protocol: ${raw}`);
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  if (GOOGLE_HOST_RE.test(host)) throw new Error(`Google/navigation URL cannot be classification evidence: ${raw}`);
  return url.toString();
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
}

export function materializeClassificationEntityOverlay(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const inputPath = path.resolve(root, options.input || 'data/classification_entity_reviewed.json');
  const taxonomy = loadTaxonomy(root);
  const knownConceptIds = new Set(taxonomy.concepts.map((concept) => concept.id));
  const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  if (document.schemaVersion !== 1) throw new Error('classification reviewed artifact schemaVersion must be 1');
  if (document.marker !== 'CLASSIFICATION-ENTITY-REVIEWED') throw new Error('classification reviewed artifact marker mismatch');
  if (document.centralReviewCompleted !== true) throw new Error('classification reviewed artifact must be central-reviewed');
  if (!Array.isArray(document.records)) throw new Error('classification reviewed artifact records must be an array');

  const seenPlaceIds = new Set();
  const rows = [];
  for (const record of document.records) {
    const googlePlaceId = clean(record?.googlePlaceId);
    if (!googlePlaceId) throw new Error('reviewed classification record requires googlePlaceId');
    if (seenPlaceIds.has(googlePlaceId)) throw new Error(`duplicate reviewed classification Place ID: ${googlePlaceId}`);
    seenPlaceIds.add(googlePlaceId);

    const status = clean(record?.status);
    if (!TERMINAL_STATUSES.has(status)) throw new Error(`invalid reviewed classification status for ${googlePlaceId}: ${status}`);
    if (status !== ACCEPTED_STATUS) continue;

    if (record?.identity?.state !== 'verified') {
      throw new Error(`accepted classification requires verified branch identity: ${googlePlaceId}`);
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(clean(record?.sourceFingerprint))) {
      throw new Error(`accepted classification requires sourceFingerprint: ${googlePlaceId}`);
    }
    if (!isoDate(record?.reviewedAt)) {
      throw new Error(`accepted classification requires ISO reviewedAt: ${googlePlaceId}`);
    }

    const conceptIds = sortedUnique((Array.isArray(record?.proposedConceptIds) ? record.proposedConceptIds : [])
      .map(clean)
      .filter(Boolean));
    if (!conceptIds.length) throw new Error(`accepted classification requires proposedConceptIds: ${googlePlaceId}`);
    for (const conceptId of conceptIds) {
      if (!knownConceptIds.has(conceptId)) throw new Error(`unknown classification concept ${conceptId} for ${googlePlaceId}`);
    }

    const evidence = Array.isArray(record?.categoryEvidence) ? record.categoryEvidence : [];
    if (!evidence.length) throw new Error(`accepted classification requires categoryEvidence: ${googlePlaceId}`);
    const evidenceConceptIds = new Set();
    const provenance = evidence.map((item, index) => {
      if (item?.evidenceScope !== 'exact_branch') {
        throw new Error(`accepted classification evidence must be exact_branch: ${googlePlaceId}#${index}`);
      }
      const sourceText = clean(item?.sourceText);
      if (!sourceText) throw new Error(`accepted classification evidence requires sourceText: ${googlePlaceId}#${index}`);
      const checkedAt = clean(item?.checkedAt);
      if (!isoDate(checkedAt)) throw new Error(`accepted classification evidence requires ISO checkedAt: ${googlePlaceId}#${index}`);
      const evidenceIds = sortedUnique((Array.isArray(item?.proposedConceptIds) ? item.proposedConceptIds : [])
        .map(clean)
        .filter(Boolean));
      if (!evidenceIds.length) throw new Error(`classification evidence requires proposedConceptIds: ${googlePlaceId}#${index}`);
      for (const conceptId of evidenceIds) {
        if (!knownConceptIds.has(conceptId)) throw new Error(`unknown evidence concept ${conceptId} for ${googlePlaceId}`);
        evidenceConceptIds.add(conceptId);
      }
      return {
        provider: clean(item?.provider) || 'unknown',
        sourceUrl: validateSourceUrl(item?.sourceUrl),
        checkedAt,
        sourceText,
        conceptIds: evidenceIds
      };
    });

    for (const conceptId of conceptIds) {
      if (!evidenceConceptIds.has(conceptId)) {
        throw new Error(`accepted concept lacks supporting categoryEvidence: ${googlePlaceId} -> ${conceptId}`);
      }
    }

    rows.push({
      googlePlaceId,
      conceptIds,
      reviewedAt: clean(record.reviewedAt),
      sourceFingerprint: clean(record.sourceFingerprint),
      provenance
    });
  }

  rows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId, 'en'));
  return {
    schemaVersion: 1,
    marker: 'CLASSIFICATION-ENTITY-OVERLAY',
    generatedFrom: path.relative(root, inputPath).replaceAll(path.sep, '/'),
    rows
  };
}

function stableSerialize(overlay) {
  const lines = [
    'window.EAT_CLASSIFICATION_ENTITY_OVERLAY = Object.freeze({',
    `  schemaVersion: ${overlay.schemaVersion},`,
    `  marker: ${JSON.stringify(overlay.marker)},`,
    `  generatedFrom: ${JSON.stringify(overlay.generatedFrom)},`,
    '  rows: Object.freeze(['
  ];
  for (const row of overlay.rows) lines.push(`    Object.freeze(${JSON.stringify(row)}),`);
  lines.push('  ])', '});', '');
  return lines.join('\n');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : 'data/classification_entity_overlay.js';
  const overlay = materializeClassificationEntityOverlay();
  const rendered = stableSerialize(overlay);
  const outputPath = path.resolve(DEFAULT_ROOT, output);
  if (check) {
    if (!fs.existsSync(outputPath)) throw new Error(`classification overlay missing: ${output}`);
    if (fs.readFileSync(outputPath, 'utf8') !== rendered) {
      throw new Error(`classification overlay is stale: ${output}`);
    }
  } else {
    fs.writeFileSync(outputPath, rendered, 'utf8');
  }
  console.log(JSON.stringify({
    status: 'pass',
    acceptedRows: overlay.rows.length,
    output
  }));
}
