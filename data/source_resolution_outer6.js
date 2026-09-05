// Reviewed terminal/source-conflict outcomes for the sixth Area1 batch.
// These rows retain the Google-verified canonical identity but prevent stale or
// non-current branch pages from being treated as durable current metadata.

window.SOURCE_RESOLUTIONS = window.SOURCE_RESOLUTIONS || [];
window.SOURCE_RESOLUTIONS.push(
  {
    name:'SHOT BAR Lucy',
    googlePlaceId:'ChIJVVUk7xCMGGARMyh51ujPs50',
    status:'no_current_usable_source',
    reason:'Current 2026 fighting-game event listings confirm that Shot Bar Lucy is still being used as an operating venue, but exact-name searches did not locate a current Tabelog page or a stable restaurant-official page suitable for durable branch fields. Keep the verified identity and do not infer address/hours from older event pages.',
    checkedAt:'2026-09-05',
    refs:[
      'https://fugutabetai.com/blog/2025/12/29/2026-q1-fighting-game-events-in-tokyo/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJVVUk7xCMGGARMyh51ujPs50'
    ]
  },
  {
    name:'目利きの銀次 神保町駿河台下店',
    googlePlaceId:'ChIJd8Cn8nONGGARfEd-8dsiXdc',
    status:'listing_hold',
    reason:'The exact Tabelog branch is currently listing-hold / operation unconfirmed. Monte Rosa has a historical official opening announcement for the same branch, but current exact-branch official-store evidence was not found. Do not promote historical opening facts to current durable hours/status while Google QC remains operational.',
    checkedAt:'2026-09-05',
    refs:[
      'https://tabelog.com/tokyo/A1310/A131003/13249562/',
      'https://www.monteroza.co.jp/brand_news/gin/20200817news/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJd8Cn8nONGGARfEd-8dsiXdc'
    ]
  },
  {
    name:'鳥福',
    googlePlaceId:'ChIJr_sIJGuMGGARzvXnOsUQGP8',
    status:'ambiguous',
    reason:'The exact 水道橋 鳥福 official DD Group page explicitly states that the branch has closed, while the current Google QC identity remains operational in production. This status conflict must be reconciled before durable current branch metadata is attached.',
    checkedAt:'2026-09-05',
    refs:[
      'https://www.dd-holdings.jp/shops/torifuku/suidobashi',
      'https://tabelog.com/tokyo/A1310/A131003/13117853/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJr_sIJGuMGGARzvXnOsUQGP8'
    ]
  }
);
