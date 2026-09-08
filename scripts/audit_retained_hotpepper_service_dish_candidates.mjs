#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES, RECOMMENDATION_MARKER } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function dishMatches(text, limit = 6) {
  const value = cleanText(text);
  const out = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = value.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    out.push({ nameZh, sourceToken: match[0] });
    if (out.length >= limit) break;
  }
  return out;
}

const FIELDS = [
  'shopDetail',
  'wedding',
  'otherEquipment',
  'course',
  'allYouCanEat',
  'allYouCanDrink',
  'children'
];

const GENERIC_SERVICE_ONLY = /^(?:あり|なし|利用可|利用不可|要相談|不可|営業していない|お子様連れOK|未確認)(?:\s*[：:].*)?$/;

function main() {
  const win = loadWindowFile('hotpepper_rich_metadata.js');
  const rich = win.HOTPEPPER_RICH_METADATA || {};
  const rows = Array.isArray(rich.rows) ? rich.rows : [];

  const summary = {
    rows: rows.length,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    fields: {},
    candidateRows: 0,
    candidateTexts: 0,
    recommendationCandidateTexts: 0,
    uniqueCandidatePlaces: 0,
    sampleCandidates: []
  };
  const candidatePlaces = new Set();

  for (const field of FIELDS) {
    summary.fields[field] = {
      populated: 0,
      nonGeneric: 0,
      dishCandidateTexts: 0,
      recommendationCandidateTexts: 0,
      dishTokens: {}
    };
  }

  for (const row of rows) {
    let rowHasCandidate = false;
    for (const field of FIELDS) {
      const text = cleanText(row.sourceServiceText?.[field]);
      if (!text) continue;
      const stats = summary.fields[field];
      stats.populated += 1;
      if (!GENERIC_SERVICE_ONLY.test(text)) stats.nonGeneric += 1;
      const matches = dishMatches(text);
      if (!matches.length) continue;

      rowHasCandidate = true;
      candidatePlaces.add(row.googlePlaceId);
      summary.candidateTexts += 1;
      stats.dishCandidateTexts += 1;
      const recommendation = RECOMMENDATION_MARKER.test(text);
      if (recommendation) {
        summary.recommendationCandidateTexts += 1;
        stats.recommendationCandidateTexts += 1;
      }
      for (const match of matches) {
        stats.dishTokens[match.nameZh] = (stats.dishTokens[match.nameZh] || 0) + 1;
      }
      if (summary.sampleCandidates.length < 30) {
        summary.sampleCandidates.push({
          googlePlaceId: row.googlePlaceId,
          name: row.hotpepperName,
          field,
          recommendation,
          dishes: matches.map((item) => item.nameZh),
          sourceTokens: matches.map((item) => item.sourceToken),
          text: text.slice(0, 180)
        });
      }
    }
    if (rowHasCandidate) summary.candidateRows += 1;
  }

  summary.uniqueCandidatePlaces = candidatePlaces.size;
  for (const stats of Object.values(summary.fields)) {
    stats.dishTokens = Object.fromEntries(
      Object.entries(stats.dishTokens).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
