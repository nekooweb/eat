#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2] || '_audit/google_official_site_candidates.json';
const output = process.argv[3] || '_audit/google_official_site_priority.json';

const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = Array.isArray(payload.results) ? payload.results : [];

const priority = rows
  .filter((row) => {
    const page = row.page || {};
    return page.ok
      && page.nameMatched
      && page.hostClass === 'candidate-official'
      && typeof page.verifiedUrl === 'string'
      && /^https:\/\//.test(page.verifiedUrl);
  })
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    existingGaps: row.existingGaps || [],
    verifiedUrl: row.page.verifiedUrl,
    title: row.page.title || null,
    structuredFacts: row.page.structuredFacts || [],
    recommendationSnippets: row.page.recommendationSnippets || [],
    priceSnippets: row.page.priceSnippets || [],
    menuLinks: row.page.menuLinks || [],
    reviewSignals: {
      structured: Boolean(row.page.structuredFacts?.length),
      recommendation: Boolean(row.page.recommendationSnippets?.length),
      price: Boolean(row.page.priceSnippets?.length),
      menu: Boolean(row.page.menuLinks?.length)
    }
  }))
  .sort((a, b) => {
    const signalCount = (row) => Object.values(row.reviewSignals).filter(Boolean).length;
    return signalCount(b) - signalCount(a)
      || a.distanceMeters - b.distanceMeters
      || a.name.localeCompare(b.name, 'ja');
  });

const summary = {
  sourceRows: rows.length,
  highConfidenceHttps: priority.length,
  withStructuredFacts: priority.filter((row) => row.reviewSignals.structured).length,
  withRecommendationSignals: priority.filter((row) => row.reviewSignals.recommendation).length,
  withPriceSignals: priority.filter((row) => row.reviewSignals.price).length,
  withMenuLinks: priority.filter((row) => row.reviewSignals.menu).length,
  gapCounts: priority.reduce((acc, row) => {
    for (const gap of row.existingGaps) acc[gap] = (acc[gap] || 0) + 1;
    return acc;
  }, {})
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ summary, rows: priority }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
