const KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  // Japan (the current catalog is Tokyo-focused).
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  // Common multi-label suffixes kept here to prevent future root-collapse mistakes
  // if the catalog expands beyond Japan. This is a safety guard, not a PSL parser.
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.nz', 'com.cn', 'net.cn', 'org.cn',
  'com.hk', 'com.sg', 'co.kr', 'com.tw'
]);

function normalizedHost(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value || ''));
    return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isHostAtOrBelow(host, root) {
  return Boolean(host && root && (host === root || host.endsWith(`.${root}`)));
}

function isOrganizationHost(host) {
  const labels = String(host || '').split('.').filter(Boolean);
  if (labels.length < 2) return false;
  const lastTwo = labels.slice(-2).join('.');
  if (KNOWN_MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) return labels.length >= 3;
  return true;
}

// A restaurant root URL is already an accepted/bound source before the collector
// reaches this policy. Menu discovery may therefore cross between that bound
// hostname and its organization root/parent (or a child of that root), but not
// between sibling subdomains and never to a public suffix, lookalike, or unrelated
// domain.
//
// Allowed examples:
//   shop.ringerhut.jp -> www.ringerhut.jp (normalized candidate root ringerhut.jp)
//   store-info.skylark.co.jp -> www.skylark.co.jp
//   example.com -> menu.example.com
// Rejected:
//   shop.example.com -> menu.example.com (siblings; neither is the other's root)
//   store.example.co.jp -> co.jp (public-suffix collapse)
//   example.com -> example.com.evil.test
//   example.com -> evil-example.com
export function sameBoundMenuDomainFamily(candidateValue, boundValue) {
  const candidate = normalizedHost(candidateValue);
  const bound = normalizedHost(boundValue);
  if (!candidate || !bound) return false;
  if (candidate === bound) return true;
  if (isHostAtOrBelow(candidate, bound)) return isOrganizationHost(bound);
  if (isHostAtOrBelow(bound, candidate)) return isOrganizationHost(candidate);
  return false;
}

export { normalizedHost, isOrganizationHost };
