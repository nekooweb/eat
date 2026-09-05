// Source-backed enrichment for the fifth Area1 production batch.
// Exact branch identity is anchored by verified Google Place ID and current
// Tabelog/official branch evidence. Old OSM display names are updated only when
// the current branch source and location clearly agree.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-yamajo-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'やまじょう',
    googlePlaceId: 'ChIJd8apsBaMGGARzv3OY4yTguI', source: 'Tabelog', sourceOnly: true,
    cuisine: '日式', tags: ['日式', '日本料理'],
    address: '東京都千代田区神田神保町1-32-2 南部ビル 1F',
    dinner: [5000, 5999], dishes: [],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13078215/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget']}]
  },
  {
    id: 'src-official-lepique-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: "Bordeaux Wine Bar L'EPIQUE",
    googlePlaceId: 'ChIJ691AFxGMGGARcy68k9PycGc', source: 'official', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧', 'ワインバー', 'ボルドーワイン'],
    address: '東京都千代田区神田神保町1-7-1 1F',
    dishes: [],
    openingHoursRaw: '月–金 16:00–23:30（L.O. 23:00）; 土 14:00–21:30（L.O. 21:00）',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [{provider:'official',url:'https://sa-astre.com/shop',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id: 'src-tabelog-mori-butchers-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '森のブッチャーズ',
    googlePlaceId: 'ChIJR3odlBOMGGARX9J4ZOk7jB0', source: 'Tabelog', sourceOnly: true,
    cuisine: '西式', tags: ['西式', 'バル', 'ビストロ', '居酒屋'],
    address: '東京都千代田区一ツ橋2-6-5',
    dinner: [4000, 4999], dishes: ['ローストビーフ'],
    openingHoursRaw: '月–木 11:30–14:30（L.O. 14:00）, 17:00–23:00; 金土 11:30–14:30（L.O. 14:00）, 17:00–23:30',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13165724/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']},
      {provider:'official',url:'https://www.jgroup.jp/brand/2291/',checkedAt:'2026-09-05',fields:['name','address']}
    ]
  },
  {
    id: 'src-tabelog-zaraku-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '個室居酒屋 座楽 神保町店',
    googlePlaceId: 'ChIJu556IxSMGGAR5GmHiqGpLLo', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋', '海鲜', '烧鸟'],
    address: '東京都千代田区神田神保町2-24-8',
    lunch: [0, 999], dinner: [3000, 3999], dishes: ['神威豚ロース塩麹グリル'],
    openingHoursRaw: '毎日 13:00–00:00',
    closedDays: [], closedNote: '定休日なし',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13179916/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-beer-pub-8taps',
    profile: 'TOKYO', area: '地区1️⃣', name: 'BEER PUB 8taps',
    googlePlaceId: 'ChIJG1HzOhGMGGARbc3MsTlAYkA', source: 'Tabelog', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧', 'ビアバー', 'スポーツバー', 'バル'],
    address: '東京都千代田区神田神保町1-6-1 タキイ東京ビル B1F',
    dinner: [3000, 3999], dishes: [],
    openingHoursRaw: '月–土 16:00–23:30（料理L.O. 22:30、ドリンクL.O. 23:00）; 日祝 15:00–22:00（料理L.O. 21:00、ドリンクL.O. 21:30）',
    closedDays: [], closedNote: '不定休',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13179608/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-hachi-tokyo-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '八-HACHI-東京',
    googlePlaceId: 'ChIJVTDQnxaMGGAR2dkRFZBb7bY', source: 'official', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '居酒屋', 'ビアバー', '饺子'],
    address: '東京都千代田区神田神保町1-42-3 コンフォリア神田神保町 1F',
    dishes: ['焼き餃子', '海老餃子', 'しそ餃子'],
    openingHoursRaw: '平日 11:30–15:00（L.O. 14:30）, 17:00–23:00（フードL.O. 22:00、ドリンクL.O. 22:30）; 土日祝 12:00–, 17:00–22:00（L.O. 21:30）',
    closedDays: [], closedNote: '不定休',
    sourceRefs: [{provider:'official',url:'https://beer-hachi.tokyo/Shop',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-hachi-tokyo-budget',
    profile: 'TOKYO', area: '地区1️⃣', name: '八-HACHI-東京',
    googlePlaceId: 'ChIJVTDQnxaMGGAR2dkRFZBb7bY', source: 'Tabelog', sourceOnly: true,
    lunch: [0, 999], dinner: [3000, 3999],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13188393/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id: 'src-tabelog-hyoroku-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '兵六',
    googlePlaceId: 'ChIJAQCf4hCMGGARuudoP7m6-Nw', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋', '烧酒吧'],
    address: '東京都千代田区神田神保町1-3',
    dinner: [2000, 2999], dishes: [],
    openingHoursRaw: '月–金 17:00–22:00（L.O. 21:10）',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13018780/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-toritake-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '焼鳥 酉たけ',
    googlePlaceId: 'ChIJ95nhlhaMGGARIziH3PEAOqY', source: 'Tabelog', sourceOnly: true,
    cuisine: '烧鸟', tags: ['烧鸟', '串烧', '居酒屋'],
    address: '東京都千代田区神田神保町1-46',
    dinner: [5000, 5999], dishes: [],
    openingHoursRaw: '月–金 17:00–23:00（料理L.O. 22:00、ドリンクL.O. 22:30）; 土 17:00–22:00（料理L.O. 21:00、ドリンクL.O. 21:30）',
    closedDays: ['日', '祝'], closedNote: '第一土曜日・第三土曜日も定休',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13169956/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-stylish-bar-o-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '神保町 Stylish Bar o',
    googlePlaceId: 'ChIJeyhzHCqNGGAR0xIHxa7pEM0', source: 'official', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧', 'カラオケ'],
    address: '東京都千代田区神田神保町1-19-1 KTビル 3F',
    dishes: [],
    openingHoursRaw: '20:00–05:00',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'official',url:'https://r.goope.jp/jinbocho/about',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  }
);
