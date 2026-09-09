const EXACT_EXCLUDED_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'tiktok.com',
  'tabelog.com',
  'hotpepper.jp',
  'googleusercontent.com',
  'openstreetmap.org',
  'gnavi.co.jp',
  'retty.me',
  'foursquare.com',
  'autoreserve.com',
  'ekiten.jp',
  'loco.yahoo.co.jp',
  'paypaygourmet.yahoo.co.jp',
  'restaurant.ikyu.com',
  'bar-navi.suntory.co.jp',
  'hitosara.com',
  'localplace.jp',
  'demae-can.com',
  'epark.jp',
  'ubereats.com',
  'wolt.com'
]);

export const INDEPENDENT_SOURCE_HOST_POLICY_VERSION = 1;

export function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isExcludedIndependentHost(value) {
  const host = normalizeHost(value);
  if (!host) return true;
  for (const domain of EXACT_EXCLUDED_HOSTS) {
    if (hostMatches(host, domain)) return true;
  }
  if (/(^|\.)google\.[a-z.]+$/i.test(host)) return true;
  if (/(^|\.)tripadvisor\.[a-z.]+$/i.test(host)) return true;
  if (/(^|\.)yelp\.[a-z.]+$/i.test(host)) return true;
  return false;
}

export function safeIndependentUrl(value, { requireHttps = false } = {}) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (requireHttps && url.protocol !== 'https:') return null;
    url.hash = '';
    if (isExcludedIndependentHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function filterIndependentUrls(values, options = {}) {
  const input = Array.isArray(values) ? values : [values];
  const output = [];
  const seen = new Set();
  for (const value of input) {
    if (!value) continue;
    const url = safeIndependentUrl(value, options);
    if (!url) continue;
    const text = url.toString();
    if (seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

export function excludedIndependentHostFamilies() {
  return [...EXACT_EXCLUDED_HOSTS].sort();
}
