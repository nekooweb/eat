# Minimal OSM source payload policy — 2026-09-08

## Purpose

`data/area1_osm.js` is a retained OpenStreetMap source-candidate snapshot, not a public restaurant record and not an identity authority. It must contain only source-native facts that are consumed by current identity/source/field review code.

The OSM snapshot must not be padded to resemble the legacy `RESTAURANTS` runtime schema.

## Allowed serialized fields

Required compatibility/source fields:

- `id`
- `profile`
- `area`
- `name`
- `cuisine`
- `distanceMeters`
- `lat`
- `lng`
- `source`
- `sourceId`

Optional fields are emitted only when non-empty:

- `openingHoursRaw`
- `address`
- `sourceWebsites`
- `sourcePhones`
- `sourcePracticalTags`
- `curatedOverlap` (only when true)

## Explicitly removed payload bloat

The OSM serializer must not emit legacy/default/runtime placeholders that are not OSM facts:

- `distance`
- `tags`
- `lunch`
- `dinner`
- `dishes`
- `closedDays`
- `googlePlaceId`
- `googleStatus`
- `hyakumeiten`
- `randomWeight`

Empty optional arrays/objects/strings are also omitted.

Identity state and Google Place ID are added only by reviewed overlays downstream. OSM generation itself performs zero identity promotions.

## Website retention

OSM `website` / `contact:website` values are retained only as candidate independent source URLs. Known social, map, review, restaurant-directory and aggregator families are excluded at serialization time, including Google, OpenStreetMap, Tabelog, Hot Pepper, Gurunavi, Retty, Tripadvisor, Yelp, Foursquare, Yahoo Loco/PayPay Gourmet, AutoReserve, Ekiten, Ikyu Restaurant, Suntory Bar-Navi and Supleks.

A retained website is still not an approved source binding. The separate strict page reviewer must confirm the restaurant page before it can be used as reviewed source evidence.

## Practical-tag retention

Only values that the strict downstream resolver can interpret without inference are kept:

- `payment:credit_cards=yes|no`
- named card-scheme tags only when explicitly `yes`
- `internet_access=wlan|no`
- `wheelchair=yes|no`
- `smoking=no|yes|separated|isolated|outside|dedicated`

Examples deliberately not promoted automatically include `wheelchair=limited`, vague card/payment tags, parking inference, or unsupported practical metadata.

## Validated refresh result

Refresh run `34201719737` generated 1,273 Area1 OSM candidates and passed the lean-payload allowlist check.

- independent website rows: 108 / 108 retained values
- phone rows: 157 / 158 retained phone values
- practical-tag rows: 236 / 314 retained strict tag values
- identity fields serialized: 0
- identity promotions: 0
- forbidden/default payload keys present: 0
- paid Google data API calls: 0

The same run re-reviewed the eight remaining high-confidence OSM website proposals. Zero passed the strict page-level identity/currentness review, so repeated identical OSM website passes are considered saturated and must not be presented as a meaningful identity-completion strategy.
