#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.doesNotMatch(app, /NII_REFERENCE/, 'The private Area1 reference must not ship in public JavaScript');
assert.doesNotMatch(app, /L\.circleMarker\s*\(/, 'The overview map must not render a private reference marker');
assert.match(app, /const bounds = \[\];/, 'Overview bounds must be based only on result restaurants');
assert.match(app,
  /budget === 'under1000'[\s\S]*?priceMatches\(price, 0, 999\)/,
  'The <=999 budget band must use the same interval-overlap rule as the other bands');
assert.match(index, /app\.js\?v=20260917-quality1/, 'The public page must bust the app.js cache for this release');

console.log(JSON.stringify({ status: 'pass', checks: 'private anchor absent, restaurant-only bounds, consistent budget overlap, cache bust' }));
