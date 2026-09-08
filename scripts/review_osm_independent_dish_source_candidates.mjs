#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(DATA, 'osm_independent_dish_source_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'reviewed_osm_independent_dish_sources.json');
const TIMEOUT_MS = Math.max(2000, Math.min(15000, Number(process.env.OSM_SOURCE_REVIEW_TIMEOUT_MS || 7000)));
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.OSM_SOURCE_REVIEW_CONCURRENCY || 8)));
const MAX_HTML_CHARS = 1_200_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-osm-source-review/1.1 (+https://github.com/nekooweb/eat)';
const FOOD_TYPES = new Set([
  'restaurant', 'foodestablishment', 'cafeorcoffeeshop', 'bakery', 'barorpub',
  'fastfoodrestaurant', 'icecreamshop', 'localbusiness'
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/株式会社|有限会社|合同会社/g, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function nameSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const short = Math.min(x.length, y.length);
    const long = Math.max(x.length, y.length);
    if (short >= 4) return Math.max(0.87, short / long);
  }
  function grams(text) {
    if (text.length < 2) return [text];
    const out = [];
    for (let i = 0; i < text.length - 1; i += 1) out.push(text.slice(i, i + 2));
    return out;
  }
  const left = grams(x);
  const right = grams(y);
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);
  let overlap = 0;
  for (const token of right) {
    const count = counts.get(token) || 0;
    if (!count) continue;
    overlap += 1;
    counts.set(token, count - 1);
  }
  return (2 * overlap) / (left.length + right.length);
}

function excludedHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return true;
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(h)) return true;
  if (/(^|\.)google\./.test(h) || /googleusercontent\.com$/.test(h)) return true;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(h)) return true;
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(h)) return true;
  if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$|supleks\.jp$/.test(h)) return true;
  return false;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || excludedHost(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function hostKey(value) {
  const url = value instanceof URL ? value : safeUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./, '') : '';
}

function hostCompatible(a, b) {
  const x = hostKey(a);
  const y = hostKey(b);
  return Boolean(x && y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)));
}

function pathSpecific(value) {
  const url = value instanceof URL ? value : safeUrl(value);
  if (!url) return false;
  return Boolean(url.pathname.replace(/\/+$/, '') || url.search);
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}

function visibleText(html) {
  return decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTitle(html) {
  const og = String(html || '').match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
    || String(html || '').match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i)?.[1]
    || '';
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return clean(decodeEntities(og || title).replace(/<[^>]+>/g, ' '));
}

function walkJson(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const item of Object.values(value)) walkJson(item, visit);
}

function objectAddress(value) {
  if (!value) return '';
  if (typeof value === 'string') return clean(value);
  if (typeof value !== 'object') return '';
  return clean([
    value.postalCode, value.addressRegion, value.addressLocality,
    value.streetAddress, value.name
  ].filter(Boolean).join(' '));
}

function structuredFacts(html) {
  const facts = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    try {
      const data = JSON.parse(decodeEntities(match[1]).trim());
      walkJson(data, (obj) => {
        const types = (Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']])
          .map((value) => clean(value).toLowerCase());
        if (!types.some((type) => FOOD_TYPES.has(type))) return;
        const geo = obj.geo && typeof obj.geo === 'object' ? obj.geo : {};
        const lat = Number(geo.latitude);
        const lng = Number(geo.longitude);
        facts.push({
          types,
          name: clean(obj.name),
          address: objectAddress(obj.address),
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          url: clean(obj.url || obj['@id'])
        });
      });
    } catch {
      // Invalid JSON-LD is not source-review evidence.
    }
  }
  return facts;
}

function normalizeAddress(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/東京都|tokyo|〒\s*\d{3}[-ー－]?\d{4}/gi, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function addressAgreement(a, b) {
  const x = normalizeAddress(a);
  const y = normalizeAddress(b);
  if (!x || !y) return false;
  if (x.length >= 8 && y.includes(x)) return true;
  if (y.length >= 8 && x.includes(y)) return true;
  const max = Math.min(x.length, y.length, 16);
  for (let size = max; size >= 8; size -= 1) {
    for (let i = 0; i <= x.length - size; i += 1) {
      if (y.includes(x.slice(i, i + size))) return true;
    }
  }
  return false;
}

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const value = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return sandbox.window;
}

async function fetchHtml(rawUrl) {
  const source = safeUrl(rawUrl);
  if (!source) throw new Error('invalid or excluded source URL');
  const response = await fetch(source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = safeUrl(response.url);
  if (!finalUrl || !hostCompatible(source, finalUrl)) throw new Error('cross-site or excluded redirect');
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`non-html ${contentType}`);
  return { finalUrl: finalUrl.toString(), html: (await response.text()).slice(0, MAX_HTML_CHARS) };
}

function reviewPage(proposal, runtime, fetched) {
  const title = pageTitle(fetched.html);
  const text = visibleText(fetched.html).slice(0, 240000);
  const facts = structuredFacts(fetched.html);
  const titleSimilarity = nameSimilarity(runtime.name, title);
  const factMatches = facts.map((fact) => ({ fact, similarity: nameSimilarity(runtime.name, fact.name) }))
    .sort((a, b) => b.similarity - a.similarity);
  const structuredSimilarity = Number(factMatches[0]?.similarity || 0);
  const nameEvidence = structuredSimilarity >= 0.92 || titleSimilarity >= 0.92;

  const locationSignals = [];
  if (Number.isFinite(runtime.lat) && Number.isFinite(runtime.lng)) {
    for (const fact of facts) {
      if (!Number.isFinite(fact.lat) || !Number.isFinite(fact.lng)) continue;
      const distance = haversine(runtime.lat, runtime.lng, fact.lat, fact.lng);
      if (distance <= 100) locationSignals.push(`structured_geo_${Math.round(distance)}m`);
    }
  }
  for (const fact of facts) {
    if (addressAgreement(runtime.address, fact.address)) locationSignals.push('structured_address_agreement');
  }
  if (runtime.address && addressAgreement(runtime.address, text)) locationSignals.push('visible_address_agreement');
  if (proposal.candidateAddress && addressAgreement(proposal.candidateAddress, text)) locationSignals.push('osm_address_visible_agreement');

  const specific = pathSpecific(fetched.finalUrl);
  const proposalDistance = Number(proposal.candidateDistanceMeters);
  const proposalSimilarity = Number(proposal.nameSimilarity || 0);
  const exactSpecificException = specific
    && structuredSimilarity >= 0.98
    && proposalSimilarity >= 0.99
    && Number.isFinite(proposalDistance) && proposalDistance <= 10;
  const approved = nameEvidence && (locationSignals.length > 0 || exactSpecificException);

  const signals = [];
  if (structuredSimilarity >= 0.92) signals.push(`structured_name_similarity_${structuredSimilarity.toFixed(3)}`);
  if (titleSimilarity >= 0.92) signals.push(`title_name_similarity_${titleSimilarity.toFixed(3)}`);
  if (specific) signals.push('path_specific_page');
  signals.push(...locationSignals);
  if (exactSpecificException) signals.push('exact_osm_specific_structured_exception');

  let reason = 'approved';
  if (!nameEvidence) reason = 'no_strong_page_name_evidence';
  else if (!locationSignals.length && !exactSpecificException) {
    reason = specific ? 'specific_page_missing_location_confirmation' : 'generic_root_missing_location_confirmation';
  }

  return {
    approved,
    reason,
    finalUrl: fetched.finalUrl,
    title: title.slice(0, 160),
    structuredFacts: facts.length,
    titleNameSimilarity: Number(titleSimilarity.toFixed(3)),
    structuredNameSimilarity: Number(structuredSimilarity.toFixed(3)),
    locationSignals: [...new Set(locationSignals)],
    reviewSignals: [...new Set(signals)]
  };
}

async function main() {
  const candidates = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const runtimeWindow = loadRuntime();
  const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
    ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
  const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
  if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length < 1) {
    throw new Error('OSM strict review requires a non-empty current runtime over the frozen 2,804-ID catalog');
  }
  if (candidates.policy?.proposalOnly !== true || candidates.policy?.identityBindingChanges !== 0
    || candidates.policy?.osmIdentityFieldsSerialized !== false) {
    throw new Error('OSM candidate input must remain minimal and proposal-only');
  }
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
  const targets = (candidates.rows || []).filter((row) =>
    row.proposalState === 'review_high_confidence_osm_website_candidate'
    && row.candidateProvider === 'OpenStreetMap'
    && runtimeById.has(row.googlePlaceId)
  );

  let cursor = 0;
  const audit = [];
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= targets.length) return;
      const proposal = targets[index];
      const runtime = runtimeById.get(proposal.googlePlaceId);
      const urls = [...new Set([...(proposal.candidateUrls || []), proposal.pageUrl].filter(Boolean))].slice(0, 2);
      let best = null;
      const errors = [];
      for (const url of urls) {
        try {
          const fetched = await fetchHtml(url);
          const review = reviewPage(proposal, runtime, fetched);
          if (!best || Number(review.approved) > Number(best.approved)
            || review.reviewSignals.length > best.reviewSignals.length) best = review;
          if (review.approved) break;
        } catch (error) {
          errors.push(`${url}: ${error?.message || error}`);
        }
      }
      audit.push({
        googlePlaceId: proposal.googlePlaceId,
        name: runtime.name,
        candidateProviderId: proposal.candidateProviderId,
        proposalPageUrl: proposal.pageUrl,
        proposalNameSimilarity: proposal.nameSimilarity,
        proposalDistanceMeters: proposal.candidateDistanceMeters,
        proposalScore: proposal.proposalScore,
        approved: Boolean(best?.approved),
        reason: best?.reason || 'fetch_failed',
        finalUrl: best?.finalUrl || null,
        title: best?.title || null,
        structuredFacts: best?.structuredFacts || 0,
        titleNameSimilarity: best?.titleNameSimilarity || 0,
        structuredNameSimilarity: best?.structuredNameSimilarity || 0,
        locationSignals: best?.locationSignals || [],
        reviewSignals: best?.reviewSignals || [],
        errors: errors.slice(0, 2)
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, targets.length)) }, () => worker()));
  audit.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

  const rows = audit.filter((row) => row.approved && row.finalUrl).map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    reviewState: 'strict_auto',
    sourceWebsites: [row.finalUrl],
    checkedAt: CHECKED_AT,
    candidateProvider: 'OpenStreetMap',
    candidateProviderId: row.candidateProviderId,
    reviewSignals: row.reviewSignals,
    proposalDistanceMeters: row.proposalDistanceMeters,
    proposalNameSimilarity: row.proposalNameSimilarity,
    pageTitle: row.title
  }));

  const reasonCounts = {};
  for (const row of audit) reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + 1;
  const summary = {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    proposalRows: Number(candidates.summary?.proposalRows || 0),
    highConfidenceInputRows: targets.length,
    reviewedRows: audit.length,
    approvedRows: rows.length,
    rejectedRows: audit.length - rows.length,
    fetchErrorRows: audit.filter((row) => row.errors.length).length,
    reasonCounts
  };

  const payload = {
    schemaVersion: 2,
    checkedAt: CHECKED_AT,
    policy: {
      strictAutoOnly: true,
      sourceOverlayOnly: true,
      candidateProvider: 'OpenStreetMap retained POI website tags',
      liveNetworkRequests: true,
      paidGoogleDataApiCalls: 0,
      googleDisplayPayloadUsed: false,
      identityBindingChanges: 0,
      runtimeNameMutationAllowed: false,
      runtimeCoordinateMutationAllowed: false,
      runtimeIdentityMutationAllowed: false,
      dishEvidenceCreatedByReview: false,
      genericBrandHomepageAloneAccepted: false,
      strongPageNameEvidenceRequired: true,
      genericRootRequiresLocationConfirmation: true,
      crossSiteRedirectAllowed: false,
      onlyHighConfidenceProposalStateReviewed: true,
      thirdPartyAggregatorUrlsExcluded: true
    },
    summary,
    rows,
    audit
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
