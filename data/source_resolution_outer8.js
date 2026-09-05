// Status conflicts identified while reviewing the eighth Area1 batch.
// Do not preserve stale branch metadata when the current business identity has
// changed or a durable source explicitly reports closure.

window.SOURCE_RESOLUTIONS = window.SOURCE_RESOLUTIONS || [];
window.SOURCE_RESOLUTIONS.push(
  {
    name:'鶏ヤロー',
    googlePlaceId:'ChIJoYoxhsyNGGAR66ND6TKWqJk',
    status:'ambiguous',
    reason:'The OSM identity is the former 水道橋 鶏ヤロー location. Current Tabelog evidence says the location changed to 均タロー, while the legacy 鶏ヤロー page still contains later user activity. The current Google Place ID/name must be rechecked before renaming or attaching either branch record.',
    checkedAt:'2026-09-05',
    refs:[
      'https://tabelog.com/tokyo/A1310/A131003/13292220/',
      'https://tabelog.com/tokyo/A1310/A131003/13263953/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJoYoxhsyNGGAR66ND6TKWqJk'
    ]
  },
  {
    name:'水道橋酒場',
    googlePlaceId:'ChIJ3V0Foz-MGGAR1z_vpZkS6QU',
    status:'ambiguous',
    reason:'The exact 神田三崎町2-10-5 Tabelog branch states that it closed on March 24, while the Google QC record in production remains operational. Do not attach old hours/budget as current data until Google status is reconciled.',
    checkedAt:'2026-09-05',
    refs:[
      'https://tabelog.com/tokyo/A1310/A131003/13251210/',
      'https://www.google.com/maps/search/?api=1&query_place_id=ChIJ3V0Foz-MGGAR1z_vpZkS6QU'
    ]
  }
);
