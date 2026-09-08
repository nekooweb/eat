# 2026-09-08 enrichment rounds and source routing

This log tracks the post-OSM-saturation enrichment rounds. The frozen catalog remains 2,804 Google Place IDs. Paid Google data APIs remain prohibited.

## Starting point

- Public named runtime: 1,417 rows.
- Catalog identity-only remainder: 1,387 rows in the frontend inventory snapshot; strict SQLite identity-only count is tracked independently.
- OSM repeated website discovery is saturated: the retained 1,273-POI snapshot produced only 8 strict website proposals and 0/8 passed current-page review.
- OSM source payload is now lean: compatibility/default restaurant fields and third-party directory URLs are excluded before persistence.

## Current round

Use reviewed official identities as roots, then follow only a bounded number of explicit HTTPS detail links on the same host. Root identity must be reconfirmed before link discovery and each detail page must independently reconfirm the retained restaurant identity before any field claim is emitted. Raw HTML is not persisted; immutable page snapshots retain final URL, retrieval time, content hash and parser version.

Target fields: address, coordinates, cuisine, hours, telephone; generic Schema.org `priceRange` is retained only as raw evidence and never mapped to lunch/dinner without explicit meal semantics.

The detail-link detector accepts visible Japanese/English labels, safe `title`/`aria-label` metadata, and explicit store/access/location/hours/contact/info path or query hints. It does not crawl arbitrary same-host links.
