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

// A restaurant root URL is already an accepted/bound source before the collector
// reaches this policy. Menu discovery may therefore cross between that bound
// hostname and its parent/root (or a child of that root), but not between sibling
// subdomains and never to a lookalike/unrelated domain.
//
// Allowed examples:
//   shop.ringerhut.jp -> www.ringerhut.jp (normalized candidate root ringerhut.jp)
//   store-info.skylark.co.jp -> www.skylark.co.jp
//   example.com -> menu.example.com
// Rejected:
//   shop.example.com -> menu.example.com (siblings; neither is the other's root)
//   example.com -> example.com.evil.test
//   example.com -> evil-example.com
export function sameBoundMenuDomainFamily(candidateValue, boundValue) {
  const candidate = normalizedHost(candidateValue);
  const bound = normalizedHost(boundValue);
  if (!candidate || !bound) return false;
  return isHostAtOrBelow(candidate, bound) || isHostAtOrBelow(bound, candidate);
}

export { normalizedHost };
