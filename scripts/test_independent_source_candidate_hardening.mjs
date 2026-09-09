#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const output = path.join(os.tmpdir(), `eat-weak-source-hardening-${process.pid}.json`);
const MIN_NAME_SIMILARITY = 0.45;
const KNOWN_COLOCATED_FALSE_POSITIVE_IDS = new Set([
  'ChIJ7UdXoEOMGGARtvLt39mMWRk', // たまりば飯田橋店 -> nearby Torikizoku in audit
  'ChIJ653a_raNGGARTTmzcG148NY'  // はなくま -> nearby Renoir in audit
]);

function bannedHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (/hitosara\.com$|localplace\.jp$|demae-can\.com$|epark\.jp$|ubereats\.com$|wolt\.com$/.test(h)) return true;
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.|yelp\.|foursquare\.com$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (h === 'loco.yahoo.co.jp' || h === 'paypaygourmet.yahoo.co.jp' || h === 'restaurant.ikyu.com' || h === 'bar-navi.suntory.co.jp') return true;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(h)) return true;
  return /tabelog\.com$|hotpepper\.jp$|googleusercontent\.com$/.test(h) || /(^|\.)google\./.test(h);
}

function assertCandidateHosts(rows, label) {
  for (const row of rows || []) {
    for (const host of row.candidateHosts || []) {
      if (bannedHost(host)) throw new Error(`${label} leaked excluded third-party host ${host} for ${row.googlePlaceId}`);
    }
  }
}

const standard = JSON.parse(fs.readFileSync(path.join(DATA, 'independent_dish_source_candidates.json'), 'utf8'));
assertCandidateHosts(standard.rows, 'standard plan');

const run = spawnSync(process.execPath, [path.join(HERE, 'build_weak_nearby_independent_source_candidates.mjs'), output], {
  cwd: ROOT,
  env: {
    ...process.env,
    WEAK_SOURCE_MAX_DISTANCE_M: '15',
    WEAK_SOURCE_AMBIGUITY_GAP_M: '6',
    WEAK_SOURCE_MIN_NAME_SIMILARITY: String(MIN_NAME_SIMILARITY)
  },
  encoding: 'utf8',
  timeout: 60_000,
  maxBuffer: 4 * 1024 * 1024
});
if (run.error) throw run.error;
if (run.status !== 0) throw new Error(`${run.stdout || ''}\n${run.stderr || ''}`.trim());

const weak = JSON.parse(fs.readFileSync(output, 'utf8'));
try { fs.unlinkSync(output); } catch {}
const policy = weak.policy || {};
const summary = weak.summary || {};
if (weak.schemaVersion !== 2) throw new Error('weak source hardening schema version missing');
if (policy.proposalOnly !== true || policy.networkRequests !== 0 || policy.paidGoogleDataApiCalls !== 0 || policy.identityBindingChanges !== 0) {
  throw new Error('weak source hardening crossed offline proposal boundary');
}
if (policy.proximityOnlyBindingAllowed !== false || policy.proximityOnlyProposalAllowed !== false) {
  throw new Error('proximity-only candidate regression');
}
if (policy.minimumNameSimilarityRequiredForProposal !== true || Number(policy.minimumNameSimilarity) !== MIN_NAME_SIMILARITY) {
  throw new Error('minimum name-similarity contract missing');
}
if (policy.finalPageNameAndLocationReviewRequired !== true || policy.dishEvidencePromotionBeforeIdentityReviewAllowed !== false) {
  throw new Error('final strict page review boundary missing');
}
if (summary.catalogTotal !== 2804 || summary.publicRuntimeTotal <= 0 || summary.currentIndependentDishSourceGap <= 0) {
  throw new Error('weak source hardening catalog contract failed');
}
if (Number(summary.minimumNameSimilarity) !== MIN_NAME_SIMILARITY) throw new Error('weak summary minimum name similarity mismatch');
if (Number(summary.lowNameSimilarityRejected || 0) <= 0) throw new Error('hardening did not reject any low-name-similarity nearby candidates');
if ((weak.rows || []).some((row) => Number(row.nameSimilarity) < MIN_NAME_SIMILARITY)) throw new Error('weak plan contains sub-threshold name similarity');
if ((weak.rows || []).some((row) => KNOWN_COLOCATED_FALSE_POSITIVE_IDS.has(row.googlePlaceId))) throw new Error('known co-located wrong-store proposal escaped hardening');
assertCandidateHosts(weak.rows, 'weak plan');

console.log(JSON.stringify({
  status: 'pass',
  standardProposalRows: Number(standard.summary?.proposalRows || (standard.rows || []).length),
  weakProposalRows: Number(summary.proposalRows || 0),
  weakLowNameSimilarityRejected: Number(summary.lowNameSimilarityRejected || 0),
  weakAmbiguousNearby: Number(summary.ambiguousNearby || 0),
  minimumNameSimilarity: MIN_NAME_SIMILARITY,
  knownCoLocatedFalsePositivesBlocked: KNOWN_COLOCATED_FALSE_POSITIVE_IDS.size,
  expandedAggregatorHostsBlocked: true
}));
