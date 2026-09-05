#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const TARGET = process.argv[2] || path.join(DATA, 'source_enrichment_zzlocatorauto.js');

function loadResolutionIds() {
  const files = fs.readdirSync(DATA)
    .filter((name) => /^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(name))
    .sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(DATA, file), 'utf8'), sandbox, { filename:file });
  }
  return new Set((sandbox.window.SOURCE_RESOLUTIONS || []).map((row) => row.googlePlaceId).filter(Boolean));
}

const text = fs.readFileSync(TARGET, 'utf8');
const match = text.match(/const locatorTemplatePatches = (\[[\s\S]*?\]);\nfor \(const patch of locatorTemplatePatches\)/);
if (!match) throw new Error('Could not locate locatorTemplatePatches JSON array.');
const patches = JSON.parse(match[1]);
const resolutionIds = loadResolutionIds();
const filtered = patches.filter((row) => !resolutionIds.has(row.googlePlaceId));
const removed = patches.filter((row) => resolutionIds.has(row.googlePlaceId));
const updated = text.replace(match[1], JSON.stringify(filtered, null, 2));
fs.writeFileSync(TARGET, updated, 'utf8');
console.log(JSON.stringify({ before:patches.length, after:filtered.length, removed:removed.map((row)=>({googlePlaceId:row.googlePlaceId,name:row.name})) }));
