#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const roots = [
  path.join(ROOT, '.github', 'workflows'),
  path.join(ROOT, 'scripts')
];

const directFiles = [
  path.join(ROOT, 'app.js'),
  path.join(ROOT, 'index.html')
];

const forbidden = [
  { label: 'legacy Google data API secret name', pattern: /GOOGLE_MAP_API/g },
  { label: 'legacy Google data API secret name', pattern: /GOOGLE_MAPS_API_KEY/g },
  { label: 'Google Maps embed key variable', pattern: /GOOGLE_MAPS_EMBED_KEY/g },
  { label: 'Google Places endpoint', pattern: /places\.googleapis\.com/gi },
  { label: 'Google Area Insights endpoint', pattern: /areainsights\.googleapis\.com/gi }
];

const indexForbidden = [
  { label: 'Google Maps embed meta configuration', pattern: /google-maps-embed-key/gi },
  { label: 'Google Maps embed placeholder', pattern: /__GOOGLE_MAPS_EMBED_KEY__/g },
  { label: 'Google Maps embed endpoint', pattern: /maps\/embed\/v1/gi }
];

const self = path.resolve(fileURLToPath(import.meta.url));
const hits = [];
let filesScanned = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) inspect(full);
  }
}

function recordMatches(file, text, rule) {
  rule.pattern.lastIndex = 0;
  for (const match of text.matchAll(rule.pattern)) {
    const before = text.slice(0, match.index).split('\n');
    hits.push({
      file: path.relative(ROOT, file),
      line: before.length,
      rule: rule.label,
      token: match[0]
    });
  }
}

function inspect(file) {
  if (path.resolve(file) === self) return;
  if (!/\.(?:html|ya?ml|mjs|js|py|sh)$/i.test(file)) return;
  filesScanned += 1;
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) recordMatches(file, text, rule);

  const relative = path.relative(ROOT, file).replaceAll('\\', '/');
  if (relative === 'index.html') {
    for (const rule of indexForbidden) recordMatches(file, text, rule);
  }
}

for (const root of roots) walk(root);
for (const file of directFiles) {
  if (fs.existsSync(file)) inspect(file);
}

if (hits.length) {
  console.error(JSON.stringify({ paidDataApiPolicy: 'failed', filesScanned, hits }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  paidDataApiPolicy: 'pass',
  mapMode: 'leaflet_openstreetmap',
  googleMapsUsage: 'external_navigation_only',
  filesScanned,
  hits: 0
}, null, 2));