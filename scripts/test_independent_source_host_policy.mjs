#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  isExcludedIndependentHost,
  safeIndependentUrl
} from './independent_source_host_policy.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-independent-host-policy-'));
const input = path.join(tempDir, 'input.json');
const output = path.join(tempDir, 'output.json');

for (const host of [
  'hitosara.com', 'www.localplace.jp', 'sp.demae-can.com', 'epark.jp',
  'www.ubereats.com', 'wolt.com', 'restaurant.ikyu.com', 'maps.google.com'
]) {
  if (!isExcludedIndependentHost(host)) throw new Error(`expected excluded host: ${host}`);
}
for (const url of [
  'https://example-restaurant.jp/menu',
  'https://shop.owst.jp/',
  'https://example.gorp.jp/'
]) {
  if (!safeIndependentUrl(url)) throw new Error(`expected independent URL: ${url}`);
}

const plan = {
  schemaVersion: 3,
  policy: { proposalOnly: true, identityBindingChanges: 0 },
  summary: { catalogTotal: 2804, publicRuntimeTotal: 1422, proposalRows: 5 },
  rows: [
    {
      googlePlaceId: 'drop-hitosara',
      pageUrl: 'https://hitosara.com/0000000000/',
      menuUrls: [],
      candidateHosts: ['hitosara.com']
    },
    {
      googlePlaceId: 'keep-official-drop-delivery',
      pageUrl: 'https://merchant.example/menu',
      menuUrls: ['https://www.ubereats.com/store/example'],
      candidateHosts: ['merchant.example', 'ubereats.com']
    },
    {
      googlePlaceId: 'replace-page-with-menu',
      pageUrl: 'https://localplace.jp/t000000000/',
      menuUrls: ['https://restaurant.example.jp/menu'],
      candidateHosts: ['localplace.jp', 'restaurant.example.jp']
    },
    {
      googlePlaceId: 'keep-owst',
      pageUrl: 'https://sample.owst.jp/',
      menuUrls: [],
      candidateHosts: ['sample.owst.jp']
    },
    {
      googlePlaceId: 'keep-page-plus-explicit-menu-root',
      pageUrl: 'https://merchant-two.example/',
      candidateUrls: ['https://merchant-two.example/'],
      menuUrls: ['https://merchant-two.example/menu/dinner'],
      candidateHosts: ['merchant-two.example']
    }
  ]
};
fs.writeFileSync(input, JSON.stringify(plan, null, 2));

const run = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts', 'sanitize_independent_source_candidate_plan.mjs'),
  input,
  output
], { cwd: ROOT, encoding: 'utf8' });
if (run.status !== 0) throw new Error(`sanitizer failed: ${run.stderr || run.stdout}`);

const sanitized = JSON.parse(fs.readFileSync(output, 'utf8'));
if (sanitized.summary.originalProposalRows !== 5) throw new Error('original proposal count lost');
if (sanitized.summary.proposalRows !== 4) throw new Error(`unexpected sanitized proposal count: ${sanitized.summary.proposalRows}`);
if (sanitized.summary.hostPolicyDroppedRows !== 1) throw new Error('excluded-only row was not dropped');
if (sanitized.summary.hostPolicyRemovedUrlValues !== 3) throw new Error(`removal metric must count actual rejected values only: ${sanitized.summary.hostPolicyRemovedUrlValues}`);
if (sanitized.summary.reviewRootAugmentedRows !== 2) throw new Error(`explicit menu roots were not tracked: ${sanitized.summary.reviewRootAugmentedRows}`);
if (sanitized.policy.hostSanitizedBeforeNetworkReview !== true) throw new Error('sanitizer policy flag missing');
if (sanitized.policy.explicitMenuUrlsIncludedInNetworkReviewRoots !== true) throw new Error('menu-root review contract missing');

const byId = new Map(sanitized.rows.map((row) => [row.googlePlaceId, row]));
if (byId.has('drop-hitosara')) throw new Error('Hitosara-only row escaped sanitizer');
if ((byId.get('keep-official-drop-delivery')?.menuUrls || []).length !== 0) throw new Error('delivery URL escaped sanitizer');
if (byId.get('replace-page-with-menu')?.pageUrl !== 'https://restaurant.example.jp/menu') throw new Error('allowed menu URL did not replace excluded page root');
if (!(byId.get('replace-page-with-menu')?.candidateUrls || []).includes('https://restaurant.example.jp/menu')) throw new Error('replacement menu URL was not exposed to v3 review roots');
if (byId.get('keep-owst')?.pageUrl !== 'https://sample.owst.jp/') throw new Error('merchant-hosted page was removed');
const explicitMenuRow = byId.get('keep-page-plus-explicit-menu-root');
if (!(explicitMenuRow?.candidateUrls || []).includes('https://merchant-two.example/menu/dinner')) throw new Error('explicit allowed menu URL was ignored by network review roots');
if ((explicitMenuRow?.candidateUrls || []).filter((url) => url === 'https://merchant-two.example/').length !== 1) throw new Error('valid duplicate root was not deduplicated safely');

const audit = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts', 'audit_independent_source_host_policy.mjs'),
  output
], { cwd: ROOT, encoding: 'utf8' });
if (audit.status !== 0) throw new Error(`host audit failed: ${audit.stderr || audit.stdout}`);

console.log(JSON.stringify({
  status: 'pass',
  sanitizedRows: sanitized.rows.length,
  hostPolicyRemovedUrlValues: sanitized.summary.hostPolicyRemovedUrlValues,
  reviewRootAugmentedRows: sanitized.summary.reviewRootAugmentedRows
}));
