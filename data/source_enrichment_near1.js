// Source-backed Area1 enrichment batch: near-core restaurants.
// Every row is enrichment-only and attaches only to an already Google-verified
// Place ID in the canonical builder.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-muang-thai',
    profile: 'TOKYO', area: '地区1️⃣', name: 'Muang Thai',
    googlePlaceId: 'ChIJm-7w4ROMGGARYgjpD4sSnmg', source: 'Tabelog', sourceOnly: true,
    cuisine: '泰国菜', tags: ['泰国菜', '印度咖喱', 'ダイニングバー'],
    lunch: [1000, 1999], dinner: [4000, 4999], dishes: [],
    openingHoursRaw: '月–金 11:00–15:00 (L.O.14:30), 18:00–23:00 (L.O.22:00)',
    closedDays: ['土', '日', '祝'], closedNote: '年末年始休業あり',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13278576/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-rusi-indo-biryani-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'ルシ インドビリヤニ 神保町店',
    googlePlaceId: 'ChIJ1wo3VRGNGGARAhTBPExaJlI', source: 'Tabelog', sourceOnly: true,
    cuisine: '印度菜', tags: ['印度菜', '印度咖喱', 'ビリヤニ'],
    lunch: [1000, 1999], dinner: [2000, 2999], dishes: [],
    openingHoursRaw: '月–金 11:00–15:00 (L.O.14:30), 17:30–23:00 (L.O.22:00); 土祝 11:00–15:00 (L.O.14:30), 17:30–22:00 (L.O.21:30); 日 11:00–15:00 (L.O.14:30), 17:30–21:30 (L.O.21:00)',
    closedDays: [], closedNote: '不定休',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13308625/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-chahan-ichi',
    profile: 'TOKYO', area: '地区1️⃣', name: '炒飯屋 一',
    googlePlaceId: 'ChIJK-a1ABSMGGARCKSw0bG0MbM', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '炒飯', '饺子'],
    dishes: ['元祖エビ炒飯'],
    openingHoursRaw: '毎日 11:00–23:00', closedDays: [], closedNote: null,
    // Tabelog's direct budget still says <=999 while 2026 menu/review examples
    // include >1000 yen dishes, so do not propagate the stale legacy budget.
    suppressFields: ['budget'],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13181599/',checkedAt:'2026-09-05',fields:['name','cuisine','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-kamezado',
    profile: 'TOKYO', area: '地区1️⃣', name: '亀澤堂',
    googlePlaceId: 'ChIJ-ZwOThGMGGARjup-1Xwamsk', source: 'Tabelog', sourceOnly: true,
    cuisine: '甜品', tags: ['甜品', '和菓子', 'どら焼き', '大福'],
    lunch: [0, 999], dinner: null, dishes: [],
    openingHoursRaw: '月–金 09:30–18:00; 土 10:00–18:00',
    closedDays: ['日'], closedNote: null,
    hyakumeiten: true, hyakumeitenYear: 2023, hyakumeitenCategory: '和菓子・甘味処 TOKYO',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13021812/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  },
  {
    id: 'src-tabelog-menya-fukumashi',
    profile: 'TOKYO', area: '地区1️⃣', name: '横浜家系ラーメン 麺家 福増',
    googlePlaceId: 'ChIJi5u1tneNGGARfvILlFasCqI', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', '家系ラーメン'],
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '毎日 10:00–23:00', closedDays: ['第4日'], closedNote: '第4日曜日定休',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13287049/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-jazz-big-boy',
    profile: 'TOKYO', area: '地区1️⃣', name: 'Jazz Big Boy',
    googlePlaceId: 'ChIJhwFmahGMGGARrvegvD-kfvk', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖啡', tags: ['咖啡', 'バー', 'ジャズ'],
    openingHoursRaw: '火–金 13:00–17:00, 19:00–22:30; 土 13:00–18:00',
    closedDays: ['月', '日', '祝', '第2土', '第4土'], closedNote: null,
    suppressFields: ['budget'],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13058508/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id: 'src-tabelog-yojinbo-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '用心棒',
    googlePlaceId: 'ChIJD3fzDhSMGGAR-AJRIU0bV-s', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面'], dishes: [],
    openingHoursRaw: '月–金 11:00–15:00, 17:00–21:00; 土祝 11:00–15:45',
    closedDays: ['日'], closedNote: null,
    // Direct budget and current review spend bands disagree; keep it out until
    // menu-level price reconciliation is complete.
    suppressFields: ['budget'],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13085246/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id: 'src-tabelog-kidoan-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '㐂道庵 神保町店',
    googlePlaceId: 'ChIJP1TwxlaNGGARahugxCrynBo', source: 'Tabelog', sourceOnly: true,
    cuisine: '荞麦面', tags: ['荞麦面', '乌冬'],
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '月–金 11:30–15:30, 17:00–21:30',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13231771/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-boys-curry',
    profile: 'TOKYO', area: '地区1️⃣', name: 'ボーイズカレー',
    googlePlaceId: 'ChIJIeIjchSMGGARssRDzwpDNuM', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖喱', tags: ['咖喱', '汉堡', '洋食'],
    lunch: [1000, 1999], dinner: null, dishes: ['カレー付き生姜焼き'],
    openingHoursRaw: '月–金 11:00–15:00', closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13042687/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-sanko-en-hakusan',
    profile: 'TOKYO', area: '地区1️⃣', name: '中華料理 餃子の店 三幸園 白山通り店',
    googlePlaceId: 'ChIJ4ymkbRGMGGARIv2mv2Uyrhw', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '饺子'],
    lunch: [0, 999], dinner: [1000, 1999], dishes: ['餃子', 'チャーハン'],
    openingHoursRaw: '月–金 11:00–02:00 (L.O.01:30); 日 11:00–22:00 (L.O.21:30)',
    closedDays: ['土', '祝'], closedNote: null,
    hyakumeiten: true, hyakumeitenYear: 2021, hyakumeitenCategory: '餃子',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006530/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','dishes','hours','closure','hyakumeiten']}]
  },
  {
    id: 'src-tabelog-kazuma-coffee-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '壹眞珈琲店 神保町店',
    googlePlaceId: 'ChIJLfEVOBGMGGARSgVXcaRddlY', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖啡', tags: ['咖啡', '喫茶店'],
    openingHoursRaw: '月–金 11:30–22:00; 土 12:00–22:00; 日祝 12:00–21:00',
    closedDays: [], closedNote: null,
    // Current item prices/review spend often exceed the page's old <=999 direct
    // budget, so exclude the legacy budget until menu-level reconciliation.
    suppressFields: ['budget'],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006533/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id: 'src-tabelog-tsuruhachi',
    profile: 'TOKYO', area: '地区1️⃣', name: '鶴八',
    googlePlaceId: 'ChIJ4V3UcxSMGGAR6WFCu53DN_k', source: 'Tabelog', sourceOnly: true,
    cuisine: '寿司', tags: ['寿司'],
    lunch: [15000, 19999], dinner: [20000, 29999], dishes: [],
    openingHoursRaw: '月–土 17:00–21:00', closedDays: ['日', '祝'], closedNote: null,
    hyakumeiten: true, hyakumeitenYear: 2021, hyakumeitenCategory: '寿司 TOKYO',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000419/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  }
);
