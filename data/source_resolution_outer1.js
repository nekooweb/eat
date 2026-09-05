// Reviewed source conflicts for the first newly admitted outer-Area1 batch.
// These rows do not alter Google-verified production status. They prevent stale
// or branch-mismatched durable sources from being attached as factual metadata.

window.SOURCE_RESOLUTIONS = window.SOURCE_RESOLUTIONS || [];
window.SOURCE_RESOLUTIONS.push(
  {
    name: 'マクドナルド',
    googlePlaceId: 'ChIJiWFVAT-MGGARfA-dnOR9DFk',
    status: 'ambiguous',
    reason: 'The OSM source coordinates correspond to the historical 水道橋店 around 神田三崎町2-20-10, whose Tabelog page is explicitly closed. McDonald’s current official nearby listing is 水道橋外堀通り店 at 文京区後楽1-1-17, a different branch/address. Do not attach either branch page to this Place ID until the source-to-branch identity is reconciled.',
    checkedAt: '2026-09-05',
    refs: [
      'https://tabelog.com/tokyo/A1310/A131003/13112500/',
      'https://map.mcdonalds.co.jp/map/13687',
      'https://www.openstreetmap.org/node/2234402546'
    ]
  },
  {
    name: 'Shisha Bar & Cafe Iwashiclub',
    googlePlaceId: 'ChIJAQBDfj-MGGARm6PeHKXOCrs',
    status: 'ambiguous',
    reason: 'The exact 神田三崎町2-19-4 branch address is consistent across independent sources, but current-status evidence conflicts: Tabelog marks いわしくらぶ 東京支店 closed while a specialist directory still publishes current hours and the Google QC identity remains operational. Keep the Place ID as the Google-primary identity but do not use either status as durable factual enrichment until the conflict is rechecked.',
    checkedAt: '2026-09-05',
    refs: [
      'https://tabelog.com/tokyo/A1310/A131003/13306743/',
      'https://www.japanshishatimes.jp/shishacafe/book-shisha-iwashi-club',
      'https://www.openstreetmap.org/node/12355343683'
    ]
  }
);
