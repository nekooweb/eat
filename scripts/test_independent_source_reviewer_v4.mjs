#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INDEPENDENT_SOURCE_HOST_POLICY_VERSION } from './independent_source_host_policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return {
    rows: sandbox.window.GOOGLE_INVENTORY_RESTAURANTS || [],
    stats: sandbox.window.GOOGLE_INVENTORY_STATS || {}
  };
}

const runtime = loadRuntime();
if (runtime.stats.catalogTotal !== 2804 || runtime.stats.inventoryTotal !== runtime.rows.length || runtime.rows.length < 2) {
  throw new Error('v4 reviewer regression requires current complete runtime');
}

const [first, second] = runtime.rows;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-reviewer-v4-test-'));
const input = path.join(dir, 'candidates.json');
const output = path.join(dir, 'reviewed.json');

const plan = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  policy: {
    proposalOnly: true,
    identityBindingChanges: 0,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtime.rows.length,
    proposalRows: 2
  },
  rows: [
    {
      googlePlaceId: first.googlePlaceId,
      name: first.name,
      pageUrl: 'https://hitosara.com/0000000000/',
      candidateUrls: ['https://hitosara.com/0000000000/'],
      menuUrls: [],
      candidateProvider: 'Overture Maps',
      candidateProviderId: 'synthetic-banned',
      candidateDistanceMeters: 1,
      nameSimilarity: 1,
      proposalScore: 1,
      proposalState: 'review_high_confidence_overture_website_candidate'
    },
    {
      googlePlaceId: second.googlePlaceId,
      name: second.name,
      pageUrl: 'https://merchant.example/',
      candidateUrls: ['https://merchant.example/'],
      menuUrls: ['https://merchant.example/menu/dinner'],
      candidateProvider: 'Overture Maps',
      candidateProviderId: 'synthetic-menu-root',
      candidateDistanceMeters: 1,
      nameSimilarity: 1,
      proposalScore: 1,
      // Keep this medium so the strict v3 engine performs zero live requests in this regression.
      proposalState: 'review_overture_website_candidate'
    }
  ]
};

fs.writeFileSync(input, JSON.stringify(plan, null, 2) + '\n');
const result = spawnSync(process.execPath, [path.join(HERE, 'review_independent_dish_source_candidates_v4.mjs'), input, output], {
  cwd: ROOT,
  env: process.env,
  encoding: 'utf8',
  timeout: 60_000,
  maxBuffer: 8 * 1024 * 1024
});
try {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${result.stdout || ''}\n${result.stderr || ''}`.trim());
  const reviewed = JSON.parse(fs.readFileSync(output, 'utf8'));
  const policy = reviewed.policy || {};
  const summary = reviewed.summary || {};
  if (policy.centralHostPolicyEnforcedInsideReviewer !== true
    || policy.independentSourceHostPolicyVersion !== INDEPENDENT_SOURCE_HOST_POLICY_VERSION
    || policy.candidateInputSanitizedBeforeStrictPageReview !== true
    || policy.reviewedOutputHostAuditedBeforeWrite !== true) {
    throw new Error('v4 reviewer central-policy contract missing');
  }
  if (summary.originalProposalRowsBeforeHostSanitize !== 2 || summary.sanitizedProposalRows !== 1) {
    throw new Error(`unexpected v4 sanitize counts: ${JSON.stringify(summary)}`);
  }
  if (summary.hostPolicyDroppedRows !== 1 || summary.hostPolicyRemovedUrlValues !== 2) {
    throw new Error(`banned direct-review candidate was not removed: ${JSON.stringify(summary)}`);
  }
  if (summary.reviewRootAugmentedRows !== 1) {
    throw new Error('explicit menu URL did not enter sanitized review roots');
  }
  if (Number(summary.reviewedRows || 0) !== 0 || Number(summary.newApprovedRows || 0) !== 0) {
    throw new Error('synthetic v4 regression unexpectedly executed/approved a live review target');
  }
  console.log(JSON.stringify({
    status: 'pass',
    hostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
    sanitizedProposalRows: summary.sanitizedProposalRows,
    hostPolicyDroppedRows: summary.hostPolicyDroppedRows,
    reviewRootAugmentedRows: summary.reviewRootAugmentedRows,
    liveReviewedRows: summary.reviewedRows || 0
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
