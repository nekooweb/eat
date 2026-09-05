// Source-backed enrichment keyed by verified Google Place ID.
//
// Rules:
// - These rows enrich an already verified production identity; they MUST NOT admit
//   a restaurant into production by themselves.
// - Google Place ID is only the cross-source identity key. No Google Places
//   response content is stored here.
// - Keep factual fields concise and attach field-level provenance in sourceRefs.
// - Missing data stays missing; do not infer values.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-bondy-jimbocho',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '欧風カレー ボンディ 神保町本店',
    googlePlaceId: 'ChIJBefQ4hOMGGARIkZIs01cRlQ',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '咖喱',
    tags: ['咖喱'],
    lunch: [1000, 1999],
    dinner: [1000, 1999],
    dishes: ['欧風カレー'],
    openingHoursRaw: '月–金 11:00–22:00 (L.O.21:30); 土日祝 10:00–22:00 (L.O.21:30)',
    closedDays: [],
    closedNote: '年末年始休業',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13000439/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'dishes', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-gavial',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'ガヴィアル',
    googlePlaceId: 'ChIJASnkQRGMGGAREBT-v7jdmq4',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '咖喱',
    tags: ['咖喱'],
    lunch: [1000, 1999],
    dinner: [1000, 1999],
    dishes: [],
    openingHoursRaw: '月・水–日・祝 11:00–21:00 (L.O.20:30)',
    closedDays: ['火'],
    closedNote: '土日祝は売切れにより短縮営業の場合あり',
    hyakumeiten: true,
    hyakumeitenYear: 2026,
    hyakumeitenCategory: 'カレー',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13000358/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure', 'hyakumeiten']
    }]
  },
  {
    id: 'src-tabelog-mandara',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'マンダラ',
    googlePlaceId: 'ChIJBc2yYRGMGGARmQrnMef_2TM',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '印度菜',
    tags: ['印度菜', '印度咖喱'],
    lunch: [1000, 1999],
    dinner: [3000, 3999],
    dishes: [],
    openingHoursRaw: '月–金 11:00–15:00 (L.O.14:45), 17:00–23:00 (L.O.22:00); 土日祝 11:00–22:00 (L.O.21:00)',
    closedDays: [],
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13000442/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours']
    }]
  },
  {
    id: 'src-tabelog-sabouru2',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'さぼうる2',
    googlePlaceId: 'ChIJ-c9WERGMGGARhYoB-iRgKGQ',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '洋食',
    tags: ['洋食', '咖啡'],
    lunch: [1000, 1999],
    dinner: [1000, 1999],
    dishes: [],
    openingHoursRaw: '月–土・祝 11:00–19:30 (L.O.19:00)',
    closedDays: ['日'],
    closedNote: '祝日は不定休の場合あり',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13011604/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-khao',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'KHAO',
    googlePlaceId: 'ChIJNQnCOb-NGGARiB0LJimpocc',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '泰国菜',
    tags: ['泰国菜'],
    lunch: null,
    dinner: [15000, 19999],
    dishes: [],
    openingHoursRaw: '月・火・木–土・祝 18:00–21:30',
    closedDays: ['水', '日'],
    closedNote: '完全予約制',
    hyakumeiten: true,
    hyakumeitenYear: 2026,
    hyakumeitenCategory: 'アジア・エスニック',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13296304/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure', 'hyakumeiten']
    }]
  },
  {
    id: 'src-tabelog-kanda-brazil',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '神田伯剌西爾',
    googlePlaceId: 'ChIJMcHsGRGMGGAR6N5SJOHGdls',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '咖啡',
    tags: ['咖啡', '甜品'],
    lunch: [0, 999],
    dinner: [0, 999],
    dishes: [],
    openingHoursRaw: '月–土 11:00–21:00; 日祝 11:00–19:00',
    closedDays: [],
    hyakumeiten: true,
    hyakumeitenYear: 2026,
    hyakumeitenCategory: '喫茶店',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13011590/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'hyakumeiten']
    }]
  },
  {
    id: 'src-tabelog-yosuko-saikan',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '揚子江菜館',
    googlePlaceId: 'ChIJo_azaxGMGGAR0GBf-GC_pFc',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '中华',
    tags: ['中华'],
    lunch: [1000, 1999],
    dinner: null,
    dishes: [],
    openingHoursRaw: '毎日 11:30–22:00 (L.O.21:30)',
    closedDays: [],
    closedNote: '年末年始休業',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13000593/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-fukumen-tomo',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '覆麺 智',
    googlePlaceId: 'ChIJL85mABSMGGARZ5qPibIpDnk',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '拉面',
    tags: ['拉面', '油そば・まぜそば'],
    lunch: [1000, 1999],
    dinner: null,
    dishes: [],
    openingHoursRaw: '月–土 07:30–14:00',
    closedDays: ['日'],
    closedNote: '水曜は完全会員制; スープなくなり次第終了',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13054078/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  }
);
