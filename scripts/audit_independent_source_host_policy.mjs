#!/usr/bin/env node
import fs from 'node:fs';
import {
  INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
  isExcludedIndependentHost,
  normalizeHost
} from './independent_source_host_policy.mjs';

const INPUT = process.argv[2];
if (!INPUT) throw new Error('Usage: node scripts/audit_independent_source_host_policy.mjs <json-file>');

const doc = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const violations = [];
let checkedUrls = 0;

function checkUrl(row, field, raw) {
  if (!raw) return;
  let url;
  try {
    url = new URL(raw);
  } catch {
    violations.push({ googlePlaceId: row.googlePlaceId || null, field, raw, reason: 'invalid_url' });
    return;
  }
  checkedUrls += 1;
  const host = normalizeHost(url.hostname);
  if (isExcludedIndependentHost(host)) {
    violations.push({ googlePlaceId: row.googlePlaceId || null, field, raw, host, reason: 'excluded_host' });
  }
}

for (const row of doc.rows || []) {
  checkUrl(row, 'pageUrl', row.pageUrl);
  for (const raw of row.menuUrls || []) checkUrl(row, 'menuUrls', raw);
  for (const raw of row.candidateUrls || []) checkUrl(row, 'candidateUrls', raw);
  for (const raw of row.sourceWebsites || []) checkUrl(row, 'sourceWebsites', raw);
}

const summary = {
  independentSourceHostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
  rows: (doc.rows || []).length,
  checkedUrls,
  violations: violations.length
};
console.log(JSON.stringify(summary));
if (violations.length) {
  console.error('INDEPENDENT_SOURCE_HOST_POLICY_VIOLATIONS=' + JSON.stringify(violations.slice(0, 20)));
  process.exitCode = 1;
}
