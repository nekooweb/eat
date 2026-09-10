# 2026-09-10 — Official menu root/subdomain discovery policy

## Problem

The official recommendation collector starts only from already-bound source URLs, but its menu-link discovery previously required the discovered menu URL to have exactly the same hostname as the bound page.

That is stricter than the identity/source boundary and loses legitimate official menu transitions such as:

- `shop.ringerhut.jp` -> `www.ringerhut.jp`
- `store-info.skylark.co.jp` -> `www.skylark.co.jp`

Both patterns occur when a chain separates store-location pages from its main menu site.

## Narrow policy

Added `scripts/official_menu_domain_policy.mjs`.

A discovered menu URL is accepted only when its normalized hostname is:

1. exactly the bound hostname;
2. the parent/root of the bound hostname; or
3. a child of the bound root hostname.

`www.` is normalized away for comparison.

Sibling subdomains are deliberately not trusted automatically. For example, `shop.example.com -> menu.example.com` remains rejected because neither hostname is the other's root/parent. Lookalike and unrelated domains are also rejected.

This is not a registrable-domain/eTLD+1 allowlist and does not authorize arbitrary same-brand or same-site crawling. The root URL must already have entered the collector through the existing reviewed/bound source path.

## Collector change

Both HTML anchor menu discovery and schema.org `hasMenu/menu` discovery now use the same narrow root/subdomain policy instead of exact-host equality.

All existing limits remain unchanged:

- HTTP(S) only;
- menu semantics required for anchor discovery;
- no guessed menu paths;
- bounded menu links;
- bounded pages per site;
- no Google/Tabelog/Hot Pepper/social direct crawl;
- strict R/F semantic rules unchanged;
- zero paid Google data API.

## Regression

Added `scripts/test_official_menu_domain_policy.mjs` and wired it into PR Review. The test covers:

- Ringer Hut store subdomain -> root menu domain: allowed;
- Skylark store-info subdomain -> root menu domain: allowed;
- exact host and root -> child: allowed;
- sibling subdomains: rejected;
- suffix/lookalike domains: rejected;
- malformed URLs: rejected;
- both collector call sites must use the shared policy;
- the old exact-host-only predicate must not return.

## Expected effect

This PR changes collection reach, not current stored restaurant evidence by itself. A later controlled source-backed collection run can quantify how many of the current official-crawl gaps become reachable. Any newly collected dishes still pass the existing recommendation/menu semantic extraction, full-retention evidence merge, runtime rebuild, and zero-paid-API audits before publication.
