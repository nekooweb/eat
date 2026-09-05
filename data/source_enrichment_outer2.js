// Source-backed enrichment for the second newly admitted outer-Area1 batch.
// Exact Google Place IDs attach these facts only to already verified production
// identities. Durable fields come from the cited Tabelog/official branch pages.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-ramen-fumiya-hongo',
    profile: 'TOKYO', area: '地区1️⃣', name: 'らーめん登楽 ふみや',
    googlePlaceId: 'ChIJGYuQvz2MGGAR3Gin5Ku7PrA', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', 'つけ麺'],
    address: '東京都文京区本郷2-3-13',
    lunch: [0, 999], dinner: [0, 999],
    openingHoursRaw: '月–金 11:30–15:00, 18:30–21:30',
    closedDays: ['土', '日', '祝'], closedNote: 'スープがなくなり次第終了',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13051550/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-kissa-hotaka',
    profile: 'TOKYO', area: '地区1️⃣', name: '喫茶 穂高',
    googlePlaceId: 'ChIJ4ePngBmMGGARu5LUFztq7tI', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖啡', tags: ['咖啡', '喫茶店'],
    address: '東京都千代田区神田駿河台4-5-3 御茶ノ水穂高ビル 1F',
    lunch: [0, 999],
    openingHoursRaw: '月–土 08:00–19:00',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13006537/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-taipei-suidobashi',
    profile: 'TOKYO', area: '地区1️⃣', name: '台北',
    googlePlaceId: 'ChIJQ7aufj-MGGARdknUqae7iTo', source: 'Tabelog', sourceOnly: true,
    cuisine: '台湾料理', tags: ['台湾料理', '中华'],
    address: '東京都千代田区神田三崎町2-19-9 MMビル 1F',
    lunch: [1000, 1999], dinner: [2000, 2999], dishes: ['水餃子'],
    openingHoursRaw: '火–日 11:00–14:00, 16:30–23:30',
    closedDays: ['月'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13011063/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-official-hanamaru-suidobashi-west',
    profile: 'TOKYO', area: '地区1️⃣', name: 'はなまるうどん 水道橋西口店',
    googlePlaceId: 'ChIJ5YT9g0CMGGARiXS-Am4vk1M', source: 'official', sourceOnly: true,
    cuisine: '乌冬面', tags: ['乌冬面', '天ぷら', '咖喱'],
    address: '東京都千代田区神田三崎町3-7-1 水道橋フロント B1F',
    lunch: [0, 999], dinner: [0, 999],
    openingHoursRaw: '毎日 10:00–22:30（L.O. 閉店30分前）',
    closedDays: [], closedNote: null,
    sourceRefs: [
      {provider:'official',url:'https://stores.hanamaruudon.com/hanamaru/spot/detail?code=1151',checkedAt:'2026-09-05',fields:['name','address','hours']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13142792/',checkedAt:'2026-09-05',fields:['cuisine','budget']}
    ]
  },
  {
    id: 'src-official-little-mermaid-shin-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'リトルマーメイド 新御茶ノ水店',
    googlePlaceId: 'ChIJZ6SQLBqMGGARplk-lI9Quc0', source: 'official', sourceOnly: true,
    cuisine: '面包・烘焙', tags: ['面包・烘焙', '咖啡'],
    address: '東京都千代田区神田駿河台4-3 新御茶ノ水ビル B1F',
    lunch: [0, 999], dinner: [0, 999],
    openingHoursRaw: '月–金 07:30–20:00; 土 07:30–18:00',
    closedDays: ['日', '祝'], closedNote: null,
    sourceRefs: [
      {provider:'official',url:'https://s-clair.com/shop/134',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13167702/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  },
  {
    id: 'src-tabelog-naoji-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: '新潟発祥 なおじ 御茶ノ水店',
    googlePlaceId: 'ChIJ38OBKhqMGGARv2PCpjtd6uI', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', '油そば', '燕三条系'],
    address: '東京都千代田区神田駿河台4-5-2',
    lunch: [0, 999], dishes: ['背脂中華そば'],
    openingHoursRaw: '毎日 11:00–23:00', closedDays: [], closedNote: null,
    sourceRefs: [
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13212651/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','dishes']},
      {provider:'official',url:'https://www.naoji.jp/',checkedAt:'2026-09-05',fields:['name']}
    ]
  },
  {
    id: 'src-tabelog-curry-johnny-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'カレー屋ジョニー',
    googlePlaceId: 'ChIJB_WeKhqMGGAR4IwXOJ-iUCk', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖喱', tags: ['咖喱'],
    address: '東京都千代田区神田駿河台4-5',
    lunch: [0, 999], dinner: [0, 999],
    openingHoursRaw: '月–金 11:00–22:00; 土日 11:00–21:00',
    closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13035298/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  },
  {
    id: 'src-tabelog-mala-sichuan-ogawamachi',
    profile: 'TOKYO', area: '地区1️⃣', name: '麻辣四川',
    googlePlaceId: 'ChIJeSvAydGNGGARI3MmVMxkkKg', source: 'Tabelog', sourceOnly: true,
    cuisine: '川菜', tags: ['川菜', '中华', '居酒屋'],
    address: '東京都千代田区神田美土代町9-17 日宝神田淡路町ビル 1F',
    lunch: [0, 999], dinner: [3000, 3999],
    openingHoursRaw: '月–土・祝 11:00–14:30, 17:00–23:00',
    closedDays: ['日'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13252164/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-coco-suidobashi-sotobori',
    profile: 'TOKYO', area: '地区1️⃣', name: 'カレーハウスCoCo壱番屋 水道橋外堀通り店',
    googlePlaceId: 'ChIJ72nZrlqNGGARuIt0IyoUDiU', source: 'official', sourceOnly: true,
    cuisine: '咖喱', tags: ['咖喱'],
    address: '東京都文京区後楽1-1-15 梅澤ビル 1F',
    openingHoursRaw: '毎日 11:00–23:00（L.O.）', closedDays: [], closedNote: null,
    sourceRefs: [{provider:'official',url:'https://tenpo.ichibanya.co.jp/map/2938/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']}]
  },
  {
    id: 'src-official-neki-kanda-ogawamachi',
    profile: 'TOKYO', area: '地区1️⃣', name: '広島県府中市アンテナショップNEKI',
    googlePlaceId: 'ChIJVVWVxQSMGGARepPjnzW2-Cg', source: 'official', sourceOnly: true,
    cuisine: '御好烧', tags: ['御好烧', '鉄板焼き', '居酒屋'],
    address: '東京都千代田区神田小川町1-3-1 NBF小川町ビルディング 1F',
    lunch: [0, 999], dinner: [3000, 3999], dishes: ['備後府中焼き'],
    openingHoursRaw: '月火木金土 11:30–14:30, 17:00–21:30; 日祝 11:30–16:30',
    closedDays: ['水'], closedNote: '年末年始・臨時休業あり',
    sourceRefs: [
      {provider:'official',url:'https://www.neki-hiroshimafuchu.com/info/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13212071/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  }
);
