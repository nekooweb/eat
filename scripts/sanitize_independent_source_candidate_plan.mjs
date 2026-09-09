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
let reviewRootAugmentedRows = 0;
const rows = [];

for (const row of source.rows || []) {
  const originalPage = row.pageUrl || null;
  const originalCandidateUrls = Array.isArray(row.candidateUrls) ? row.candidateUrls.filter(Boolean) : [];
  const originalMenuUrls = Array.isArray(row.menuUrls) ? row.menuUrls.filter(Boolean) : [];
  const originalValues = [originalPage, ...originalCandidateUrls, ...originalMenuUrls].filter(Boolean);

  // Count only values actually rejected by URL/host policy. Duplicate valid roots are
  // not removals; the previous metric compared raw count with a deduplicated set and
  // therefore falsely reported one removal per ordinary pageUrl/candidateUrl duplicate.
  removedUrlValues += originalValues.filter((raw) => !safeIndependentUrl(raw)).length;

  const page = safeIndependentUrl(originalPage)?.toString() || null;
  const sanitizedCandidateUrls = filterIndependentUrls(originalCandidateUrls);
  const menuUrls = filterIndependentUrls(originalMenuUrls);

  // v3 network review historically reads candidateUrls + pageUrl. Preserve explicit
  // branch/menu URLs as review roots by adding allowed menu URLs to the temporary
  // sanitized candidateUrls while retaining menuUrls separately for provenance.
  const candidateUrls = filterIndependentUrls([...sanitizedCandidateUrls, ...menuUrls]);
  const menuRootAdded = menuUrls.some((url) => !sanitizedCandidateUrls.includes(url));
  if (menuRootAdded) reviewRootAugmentedRows += 1;

  const available = [...new Set([page, ...candidateUrls, ...menuUrls].filter(Boolean))];
  if (!available.length) {
    droppedRows += 1;
    continue;
  }

  const nextPage = page || sanitizedCandidateUrls[0] || menuUrls[0] || null;
  const candidateHosts = [...new Set(available.map((value) => normalizeHost(new URL(value).hostname)))];
  const hostPolicyChanged = nextPage !== originalPage
    || sanitizedCandidateUrls.length !== originalCandidateUrls.length
    || menuUrls.length !== originalMenuUrls.length
    || JSON.stringify(candidateHosts) !== JSON.stringify(row.candidateHosts || []);
  if (hostPolicyChanged) changedRows += 1;

  rows.push({
    ...row,
    pageUrl: nextPage,
    candidateUrls,
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
    excludedHostsMayNotReachNetworkReviewer: true,
    explicitMenuUrlsIncludedInNetworkReviewRoots: true
  },
  summary: {
    ...(source.summary || {}),
    originalProposalRows,
    proposalRows: rows.length,
    hostPolicyDroppedRows: droppedRows,
    hostPolicyChangedRows: changedRows,
    hostPolicyRemovedUrlValues: removedUrlValues,
    reviewRootAugmentedRows
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
  reviewRootAugmentedRows,
  independentSourceHostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION
}));
