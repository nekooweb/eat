// Reviewed non-bindable/status-conflict outcomes for the tenth Area1 batch.
// Current Google identity is retained, but conflicting or uncertain durable
// source status is not promoted into normal production metadata.

window.SOURCE_RESOLUTIONS = window.SOURCE_RESOLUTIONS || [];
window.SOURCE_RESOLUTIONS.push(
  {
    name:'あがらっし',
    googlePlaceId:'ChIJJZS1WhuMGGARg97yhh0fUU8',
    status:'listing_hold',
    reason:'The exact 神田淡路町2-1 branch is currently marked 掲載保留 by Tabelog because operation status cannot be confirmed. A July 2025 review shows recent historical operation, while Google QC still reports the Place ID as operational. Keep identity only until a current branch source resolves the conflict.',
    checkedAt:'2026-09-05',
    refs:[
      'https://tabelog.com/tokyo/A1310/A131002/13050054/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJJZS1WhuMGGARg97yhh0fUU8'
    ]
  },
  {
    name:'町田商店 水道橋店',
    googlePlaceId:'ChIJKQlfZLaNGGARTe95b99jJXE',
    status:'ambiguous',
    reason:'The official chain site contains a 2026-08-25 reopening notice after the July fire, but the current branch presentation has recently carried temporary-closure state while Google QC remains operational. Do not copy potentially transitional hours/status into durable production fields until the branch page stabilizes.',
    checkedAt:'2026-09-05',
    refs:[
      'https://shop.machidashoten.com/japan/detail/112114/',
      'https://www.machidashoten.com/news',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJKQlfZLaNGGARTe95b99jJXE'
    ]
  }
);
