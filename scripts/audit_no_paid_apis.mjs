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

const forbidden = [
  { label: 'legacy Google data API secret name', pattern: /GOOGLE_MAP_API/g },
  { label: 'legacy Google data API secret name', pattern: /GOOGLE_MAPS_API_KEY/g },
  { label: 'Google Places endpoint', pattern: /places\.googleapis\.com/gi },
  { label: 'Google Area Insights endpoint', pattern: /areainsights\.googleapis\.com/gi }
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

function inspect(file) {
  if (path.resolve(file) === self) return;
  if (!/\.(?:ya?ml|mjs|js|py|sh)$/i.test(file)) return;
  filesScanned += 1;
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) {
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
}

for (const root of roots) walk(root);

if (hits.length) {
  console.error(JSON.stringify({ paidDataApiPolicy: 'failed', filesScanned, hits }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ paidDataApiPolicy: 'pass', filesScanned, hits: 0 }, null, 2));
