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
  },
  {
    id: 'src-tabelog-jimbocho-kai',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '神保町 可以',
    googlePlaceId: 'ChIJu3R8ABSMGGARyqJOpMmNvns',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '拉面',
    tags: ['拉面', 'つけ麺'],
    dishes: ['煮干し中華そば', '生姜醤油ラーメン'],
    openingHoursRaw: '毎日 11:00–20:00',
    closedDays: [],
    closedNote: '臨時休業は公式Xで告知される場合あり',
    suppressFields: ['budget'],
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13105204/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'dishes', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-jimbocho-shokuniku-center',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '神保町食肉センター',
    googlePlaceId: 'ChIJ-bzjHhSMGGAR_TggBs245LY',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '烤肉',
    tags: ['烤肉', 'ホルモン', '居酒屋'],
    lunch: [0, 999],
    dinner: [3000, 3999],
    dishes: [],
    openingHoursRaw: '毎日 11:30–14:30, 17:00–22:30',
    closedDays: [],
    closedNote: '年末年始を除き年中無休; 毎月1日はランチ休業',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13111568/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-kitchen-nankai-jimbocho',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'キッチン南海 神保町店',
    googlePlaceId: 'ChIJbTOaERGMGGAR0Me4b7PxZ7o',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '洋食',
    tags: ['洋食', '炸猪排', '咖喱'],
    lunch: [0, 999],
    dinner: [0, 999],
    dishes: ['カツカレー', 'しょうが焼き'],
    openingHoursRaw: '月–土 11:15–15:00, 17:00–19:30',
    closedDays: ['日', '祝'],
    closedNote: '売り切れ次第終了',
    hyakumeiten: true,
    hyakumeitenYear: 2025,
    hyakumeitenCategory: '洋食 EAST',
    sourceRefs: [
      {
        provider: 'Tabelog',
        url: 'https://tabelog.com/tokyo/A1310/A131003/13249021/',
        checkedAt: '2026-09-05',
        fields: ['name', 'cuisine', 'budget', 'hours', 'closure', 'hyakumeiten']
      },
      {
        provider: 'Tabelog',
        url: 'https://tabelog.com/tokyo/A1310/A131003/13249021/dtlmenu/',
        checkedAt: '2026-09-05',
        fields: ['dishes']
      }
    ]
  },
  {
    id: 'src-tabelog-ebimaru-ramen',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '海老丸らーめん',
    googlePlaceId: 'ChIJV4goyRWMGGARKjwdXMoOJp0',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '拉面',
    tags: ['拉面', 'ビストロ', 'バル'],
    lunch: [1000, 1999],
    dinner: [1000, 1999],
    dishes: ['元祖海老丸らーめん', '海老丸カルボナーラ'],
    openingHoursRaw: '月–金 11:30–15:00, 18:00–22:30 (L.O.22:00); 土日祝 11:30–20:00 (L.O.19:30)',
    closedDays: [],
    closedNote: '不定休; 行列状況により早めに終了する場合あり',
    sourceRefs: [
      {
        provider: 'Tabelog',
        url: 'https://tabelog.com/tokyo/A1310/A131003/13212911/',
        checkedAt: '2026-09-05',
        fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
      },
      {
        provider: 'Tabelog',
        url: 'https://tabelog.com/tokyo/A1310/A131003/13212911/dtlmenu/',
        checkedAt: '2026-09-05',
        fields: ['dishes']
      }
    ]
  },
  {
    id: 'src-tabelog-men-dining-totoko',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '麺ダイニング ととこ',
    googlePlaceId: 'ChIJAyFF7RCMGGARs2NclD5HYHI',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '拉面',
    tags: ['拉面', '居酒屋', 'オーガニック'],
    lunch: [0, 999],
    dinner: [1000, 1999],
    dishes: [],
    openingHoursRaw: '月–土 11:00–22:30 (L.O.22:00); 日 11:00–15:00',
    closedDays: [],
    closedNote: '年中無休',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13144370/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-cantina-suidobashi',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '欲張りバル CANTINA',
    googlePlaceId: 'ChIJhxn3rgiNGGARsGxcKSDDzQg',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '意大利菜',
    tags: ['意大利菜', 'バル', '居酒屋'],
    lunch: [1000, 1999],
    dinner: [4000, 4999],
    dishes: ['丸ごとワタリガニのトマトクリーム', 'ティラミス'],
    openingHoursRaw: '月–金・祝前後 11:30–15:00 (L.O.14:30), 17:00–23:45 (料理L.O.22:45/ドリンクL.O.23:15); 土日祝 11:30–23:45 (料理L.O.22:45/ドリンクL.O.23:15)',
    closedDays: [],
    closedNote: '無休',
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13266325/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'dishes', 'hours', 'closure']
    }]
  },
  {
    id: 'src-tabelog-tomita-shoten',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '冨田書店',
    googlePlaceId: 'ChIJU9y48_SNGGARq4CT_81eSgw',
    source: 'Tabelog',
    sourceOnly: true,
    cuisine: '意大利菜',
    tags: ['意大利菜', 'ビストロ', '居酒屋'],
    lunch: [0, 999],
    dinner: [4000, 4999],
    dishes: [],
    openingHoursRaw: '月–金 17:00–23:00 (料理L.O.22:00/ドリンクL.O.22:30); 土日祝 11:30–23:00 (料理L.O.22:00/ドリンクL.O.22:30)',
    closedDays: [],
    closedNote: null,
    sourceRefs: [{
      provider: 'Tabelog',
      url: 'https://tabelog.com/tokyo/A1310/A131003/13158592/',
      checkedAt: '2026-09-05',
      fields: ['name', 'cuisine', 'budget', 'hours', 'closure']
    }]
  }
);
