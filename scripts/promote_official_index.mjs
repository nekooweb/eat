#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2] || '_seed/google_official_site_candidates.json';
const output = process.argv[3] || 'data/official_candidate_index.json';
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const checkedAt = process.env.OFFICIAL_INDEX_CHECKED_AT || '2026-09-06';
const blockedHosts = [
  'pokepara.jp', 'tabelog.com', 'hotpepper.jp', 'gnavi.co.jp', 'retty.me',
  'tripadvisor.', 'yelp.', 'facebook.com', 'instagram.com', 'x.com',
  'twitter.com', 'maps.google.', 'google.com'
];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

const records = [];
for (const row of raw.results || []) {
  const page = row.page || {};
  const pageUrl = String(page.verifiedUrl || '');
  if (!(row.discoveryStatus === 'fetched'
    && page.ok
    && page.hostClass === 'candidate-official'
    && page.nameMatched
    && pageUrl.startsWith('https://'))) continue;
  const host = hostOf(pageUrl);
  if (!host || blockedHosts.some((needle) => host.includes(needle))) continue;
  const menuUrls = [];
  for (const item of page.menuLinks || []) {
    const url = String(item?.url || '');
    if (!url.startsWith('https://') || hostOf(url) !== host) continue;
    if (!menuUrls.includes(url)) menuUrls.push(url);
    if (menuUrls.length >= 8) break;
  }
  records.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    pageUrl,
    menuUrls,
    checkedAt
  });
}
records.sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));
const body = {
  generatedFrom: 'independent final website fetches after transient Google website discovery',
  checkedAt,
  records
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(body, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ records: records.length, menuUrls: records.reduce((n, row) => n + row.menuUrls.length, 0) }));
