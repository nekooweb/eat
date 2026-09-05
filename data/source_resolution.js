// Source-resolution ledger for production identities that have been researched
// but do not currently have a trustworthy source suitable for factual enrichment.
//
// These records do not enter canonical production and do not contribute factual
// restaurant fields. They exist so source discovery can reach an auditable 100%
// without forcing stale, ambiguous or unavailable listings into enrichment.

window.SOURCE_RESOLUTIONS = [
  {
    googlePlaceId: 'ChIJjSI8ARGMGGARkjGDVK4O_5g',
    name: 'キッチン グラン',
    status: 'listing_hold',
    reason: 'Tabelog currently marks the restaurant as 掲載保留 because its operating status cannot be confirmed; do not use the listing as a current factual enrichment source.',
    checkedAt: '2026-09-05',
    refs: [
      'https://tabelog.com/tokyo/A1310/A131003/13006408/'
    ]
  }
];
