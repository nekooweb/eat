#!/usr/bin/env node
import fs from 'node:fs';
import {
  INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
  filterIndependentUrls,
  normalizeHost,
  safeIndependentUrl
} from './independent_source_host_policy.mjs';

const INPUT = process.argv[2];
const OUTPUT = process.argv[3];
if (!INPUT || !OUTPUT) {
  throw new Error('Usage: node scripts/sanitize_independent_source_candidate_plan.mjs <input.json> <output.json>');
}

const source = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
if (source.policy?.proposalOnly !== true || source.policy?.identityBindingChanges !== 0) {
  throw new Error('Independent-source candidate sanitizer requires proposal-only input');
}

let droppedRows = 0;
let changedRows = 0;
let removedUrlValues = 0;
const rows = [];

for (const row of source.rows || []) {
  const originalPage = row.pageUrl || null;
  const originalCandidateUrls = Array.isArray(row.candidateUrls) ? row.candidateUrls.filter(Boolean) : [];
  const originalMenuUrls = Array.isArray(row.menuUrls) ? row.menuUrls.filter(Boolean) : [];
  const originalValues = [originalPage, ...originalCandidateUrls, ...originalMenuUrls].filter(Boolean);

  const page = safeIndependentUrl(originalPage)?.toString() || null;
  const candidateUrls = filterIndependentUrls(originalCandidateUrls);
  const menuUrls = filterIndependentUrls(originalMenuUrls);
  const available = [...new Set([page, ...candidateUrls, ...menuUrls].filter(Boolean))];
  removedUrlValues += Math.max(0, originalValues.length - available.length);

  if (!available.length) {
    droppedRows += 1;
    continue;
  }

  const nextPage = page || candidateUrls[0] || menuUrls[0] || null;
  const candidateHosts = [...new Set(available.map((value) => normalizeHost(new URL(value).hostname)))];
  const changed = nextPage !== originalPage
    || candidateUrls.length !== originalCandidateUrls.length
    || menuUrls.length !== originalMenuUrls.length
    || JSON.stringify(candidateHosts) !== JSON.stringify(row.candidateHosts || []);
  if (changed) changedRows += 1;

  rows.push({
    ...row,
    pageUrl: nextPage,
    ...(Object.hasOwn(row, 'candidateUrls') ? { candidateUrls } : {}),
    ...(Object.hasOwn(row, 'menuUrls') ? { menuUrls } : {}),
    candidateHosts
  });
}

const originalProposalRows = Number(source.summary?.proposalRows ?? (source.rows || []).length);
const payload = {
  ...source,
  policy: {
    ...(source.policy || {}),
    hostSanitizedBeforeNetworkReview: true,
    independentSourceHostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
    excludedHostsMayNotReachNetworkReviewer: true
  },
  summary: {
    ...(source.summary || {}),
    originalProposalRows,
    proposalRows: rows.length,
    hostPolicyDroppedRows: droppedRows,
    hostPolicyChangedRows: changedRows,
    hostPolicyRemovedUrlValues: removedUrlValues
  },
  rows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  originalProposalRows,
  proposalRows: rows.length,
  hostPolicyDroppedRows: droppedRows,
  hostPolicyChangedRows: changedRows,
  hostPolicyRemovedUrlValues: removedUrlValues,
  independentSourceHostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION
}));
