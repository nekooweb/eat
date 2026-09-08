#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const BASIC_PATH = path.join(DATA, 'google_basic_source_matches.json');
const OSM_PATH = path.join(DATA, 'area1_osm.js');

function loadOsmRows() {
  const sandbox = { window: { RESTAURANTS: [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(OSM_PATH, 'utf8'), sandbox, { filename: OSM_PATH });
  return sandbox.window.RESTAURANTS || [];
}

function safeIndependentHttps(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return null;
    if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(host)) return null;
    if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return null;
    if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return null;
    if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(host)) return null;
    if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(host)) return null;
    if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const basic = JSON.parse(fs.readFileSync(BASIC_PATH, 'utf8'));
const osmRows = loadOsmRows();
if (basic.inventoryCount !== 2804 || basic.summary?.basicReadyTotal !== 1415) {
  throw new Error('Bound OSM website refresh requires frozen 2,804 / public 1,415 basic baseline');
}

const osmById = new Map(osmRows.filter((row) => row?.id).map((row) => [String(row.id), row]));
let boundOsmRows = 0;
let boundOsmRowsFoundInSnapshot = 0;
let boundOsmRowsWithRetainedWebsite = 0;
let rowsChanged = 0;
let websitesAdded = 0;
let rejectedWebsiteValues = 0;
const changedPlaceIds = [];

for (const row of basic.rows || []) {
  if (row.provider !== 'OpenStreetMap') continue;
  boundOsmRows += 1;
  const osm = osmById.get(String(row.providerId || ''));
  if (!osm) continue;
  boundOsmRowsFoundInSnapshot += 1;
  const raw = Array.isArray(osm.sourceWebsites) ? osm.sourceWebsites : [];
  if (raw.length) boundOsmRowsWithRetainedWebsite += 1;
  const accepted = [];
  for (const value of raw) {
    const url = safeIndependentHttps(value);
    if (url) accepted.push(url);
    else rejectedWebsiteValues += 1;
  }
  if (!accepted.length) continue;
  const before = Array.isArray(row.websites) ? row.websites.filter(Boolean) : [];
  const merged = [...new Set([...before, ...accepted])];
  if (merged.length === before.length && merged.every((value, index) => value === before[index])) continue;
  row.websites = merged;
  rowsChanged += 1;
  websitesAdded += merged.filter((value) => !before.includes(value)).length;
  changedPlaceIds.push(row.googlePlaceId);
}

basic.policy = {
  ...(basic.policy || {}),
  retainedOsmWebsiteOverlay: true,
  retainedOsmWebsiteOverlayRule: 'existing-bound-osm-provider-id-website-v1',
  retainedOsmWebsiteOverlayIdentityChanges: 0,
  retainedOsmWebsiteOverlayPaidApiCalls: 0,
  retainedOsmWebsiteOverlayGoogleDisplayPayloadUsed: false,
  retainedOsmWebsiteOverlayExistingBindingsOnly: true,
  retainedOsmWebsiteOverlayIndependentHttpsOnly: true
};
basic.summary = {
  ...(basic.summary || {}),
  retainedOsmWebsiteOverlay: {
    boundOsmRows,
    boundOsmRowsFoundInSnapshot,
    boundOsmRowsWithRetainedWebsite,
    rowsChanged,
    websitesAdded,
    rejectedWebsiteValues
  }
};
basic.lastRetainedOsmWebsiteOverlay = {
  checkedAt: new Date().toISOString().slice(0, 10),
  rowsChanged,
  websitesAdded,
  changedPlaceIds: changedPlaceIds.sort()
};

fs.writeFileSync(BASIC_PATH, JSON.stringify(basic, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  catalogTotal: basic.inventoryCount,
  publicRuntimeTotal: basic.summary.basicReadyTotal,
  boundOsmRows,
  boundOsmRowsFoundInSnapshot,
  boundOsmRowsWithRetainedWebsite,
  rowsChanged,
  websitesAdded,
  rejectedWebsiteValues,
  identityChanges: 0,
  paidGoogleDataApiCalls: 0
}));
