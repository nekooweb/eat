// Source-backed enrichment for the fourth Area1 production batch.
// Names are exact branch identities and are attached only by verified Google
// Place ID. Durable facts come from the cited Tabelog/official source pages.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-masan-gyoza-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '馬さん餃子酒場 神保町店',
    googlePlaceId: 'ChIJI8w3quWNGGARwA5PTpq8BUw', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '居酒屋', '饺子'],
    address: '東京都千代田区神田神保町2-17',
    lunch: [0, 999], dinner: [2000, 2999], dishes: ['黒豚餃子'],
    openingHoursRaw: '毎日 11:00–02:00（L.O. 01:30）',
    closedDays: [], closedNote: '不定休。1月1日–3日は休業',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13212433/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-kagahiro-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '神保町 加賀廣',
    googlePlaceId: 'ChIJBc2yYRGMGGARNcv-48_fEuw', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋', 'もつ焼き'],
    address: '東京都千代田区神田神保町2-17-11 集英社共同ビル 1F',
    dinner: [3000, 3999], dishes: [],
    openingHoursRaw: '月–土 17:30–23:00',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13047908/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-craft-beer-market-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'CRAFT BEER MARKET 神保町店',
    googlePlaceId: 'ChIJS4nF7xOMGGARFzUis-fRspU', source: 'official', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧', '精酿啤酒', 'ビストロ'],
    address: '東京都千代田区神田神保町2-11-15 OB神保町ビル 1F',
    dishes: ['ローストチキン'],
    openingHoursRaw: '月–金 11:30–14:00, 17:00–23:00; 土 15:00–23:00',
    closedDays: ['日', '祝'], closedNote: '日曜を含む連休は連休最終日が定休日',
    sourceRefs: [{provider:'official',url:'https://www.craftbeermarket.jp/jimbocho/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-daikinboshi-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '大金星 神保町店',
    googlePlaceId: 'ChIJU502rBaMGGAR4hZgBJHS7Ys', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋'],
    address: '東京都千代田区神田神保町1-14-12',
    dinner: [3000, 3999], dishes: [],
    openingHoursRaw: '月–土 17:00–03:00; 日祝 17:00–23:00',
    closedDays: [], closedNote: '年末年始は休業あり',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13108085/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-bar-plat-honten',
    profile: 'TOKYO', area: '地区1️⃣', name: 'Bar Plat 本店',
    googlePlaceId: 'ChIJtbiQrhaMGGARQdyy8bco94Y', source: 'Tabelog', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧'],
    address: '東京都千代田区神田神保町1-14-4 ミツワ神保町ビル B1F',
    dinner: [5000, 5999], dishes: [],
    openingHoursRaw: '月–土 19:00–04:00',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13045433/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-bar-37c-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'Bar 37℃',
    googlePlaceId: 'ChIJAQBZcxSMGGARUdzEjQ6AtTc', source: 'Tabelog', sourceOnly: true,
    cuisine: '酒吧', tags: ['酒吧'],
    address: '東京都千代田区神田神保町2-4 第30弥生ビル 2F',
    dishes: [],
    openingHoursRaw: '月–木 19:00–00:00（L.O. 23:30）; 金・祝前日 19:00–02:00（L.O. 01:30）',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13220440/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id: 'src-official-torikizoku-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '鳥貴族 神保町店',
    googlePlaceId: 'ChIJ2-3vOBGMGGARfV2l_yc58W0', source: 'official', sourceOnly: true,
    cuisine: '烧鸟', tags: ['烧鸟', '居酒屋'],
    address: '東京都千代田区神田神保町1-8 FUNDES神保町 5F',
    dishes: [],
    openingHoursRaw: '毎日 17:00–04:00',
    closedDays: [], closedNote: null,
    sourceRefs: [{provider:'official',url:'https://map.torikizoku.co.jp/detail/526/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']}]
  },
  {
    id: 'src-tabelog-okan-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'おかん',
    googlePlaceId: 'ChIJPwqvuBOMGGARlZrEgZIL-pM', source: 'Tabelog', sourceOnly: true,
    cuisine: '日式', tags: ['日式', 'きりたんぽ', '居酒屋'],
    address: '東京都千代田区一ツ橋2-6-2 日本教育会館 B1F',
    dinner: [1000, 1999], dishes: ['きりたんぽ'],
    openingHoursRaw: '月–金 11:30–13:30, 17:00–21:30（L.O. 20:30）',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13021354/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-keichan-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: '大衆酒場 けいちゃん 神保町店',
    googlePlaceId: 'ChIJk8bIIBGMGGARU0MztWZkDEc', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋', '串揚げ', '烧酒吧'],
    address: '東京都千代田区神田神保町1-2-10 第3日東ビル 1F',
    dinner: [3000, 3999], dishes: [],
    openingHoursRaw: '月–土 16:00–00:00',
    closedDays: ['日'], closedNote: '日曜の団体・貸切は店舗に要相談',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13115384/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-atsumori-jimbocho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'あつ盛',
    googlePlaceId: 'ChIJlfvjSWuNGGAR4N9r9wSbuSI', source: 'Tabelog', sourceOnly: true,
    cuisine: '居酒屋', tags: ['居酒屋', '立ち飲み'],
    address: '東京都千代田区神田神保町3-2-1 サンライトビル 1F',
    lunch: [1000, 1999], dinner: [2000, 2999], dishes: [],
    openingHoursRaw: '月 17:30–00:00; 火–金 11:30–14:00, 17:00–00:00; 土日 14:00–22:00',
    closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13249017/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  }
);
