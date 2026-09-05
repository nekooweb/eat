// Source-backed enrichment for the third newly admitted outer-Area1 batch.
// All rows attach by exact Google Place ID to identities that already passed
// production QC. Long-lived factual fields come from the cited independent
// branch sources rather than persisted Google Place details.

window.RESTAURANTS.push(
  {
    id: 'src-tabelog-shinpachi-suidobashi',
    profile: 'TOKYO', area: '地区1️⃣', name: '炭火焼干物定食 しんぱち食堂 水道橋店',
    googlePlaceId: 'ChIJec8ecFmNGGARaeQ3omYHyKE', source: 'Tabelog', sourceOnly: true,
    cuisine: '日式', tags: ['日式', '定食', '烤鱼'],
    address: '東京都千代田区神田三崎町3-7-14 たかのビル 1F',
    lunch: [0, 999], dinner: [0, 999], dishes: ['炭火焼干物定食'],
    openingHoursRaw: '毎日 07:00–23:00', closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13246540/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours']}]
  },
  {
    id: 'src-tabelog-kosuzu-awajicho',
    profile: 'TOKYO', area: '地区1️⃣', name: '小料理 小鈴',
    googlePlaceId: 'ChIJAQAAZBuMGGARiAS9STYZnRk', source: 'Tabelog', sourceOnly: true,
    cuisine: '日式', tags: ['日式', '日本料理', '小料理'],
    address: '東京都千代田区神田淡路町1-11-8 淡路町UKビル 1F',
    lunch: [1000, 1999], dinner: [5000, 5999], dishes: [],
    openingHoursRaw: '月–金 11:30–14:00, 17:00–23:00',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13212276/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-yatagarasu-chikarabo',
    profile: 'TOKYO', area: '地区1️⃣', name: 'トーキョーニューミクスチャーヌードル 八咫烏 CHIKARABO',
    googlePlaceId: 'ChIJIw3yvWqMGGARbCCkAr5tCB4', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面'],
    address: '東京都千代田区神田三崎町3-7-13 三大ビル B1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '月火土 11:00–15:00; 水木金 11:00–15:00, 18:00–21:00',
    closedDays: ['日', '祝'], closedNote: '夏季・年末年始は店舗告知を確認',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13276447/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-ramen-matoi-ogawamachi',
    profile: 'TOKYO', area: '地区1️⃣', name: 'らーめん まとい',
    googlePlaceId: 'ChIJX3i3ShuMGGARayUJUCjlJ9w', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', 'つけ麺'],
    address: '東京都千代田区神田小川町1-4 三谷ビル 1F',
    lunch: [0, 999], dinner: [0, 999], dishes: [],
    openingHoursRaw: '月–金 11:30–14:00, 17:30–21:00',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13024446/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-tullys-iidabashi-garden-air-tower',
    profile: 'TOKYO', area: '地区1️⃣', name: 'タリーズコーヒー 飯田橋ガーデンエアタワー店',
    googlePlaceId: 'ChIJqxsi-ECMGGAR9MgoPJ4JWHw', source: 'official', sourceOnly: true,
    cuisine: '咖啡', tags: ['咖啡', '咖啡馆'],
    address: '東京都千代田区飯田橋3-10-10 飯田橋ガーデンエアタワー 1F',
    openingHoursRaw: '月–金 07:00–20:00',
    closedDays: ['土', '日'], closedNote: 'ラストオーダーは閉店30分前',
    sourceRefs: [{provider:'official',url:'https://shop.tullys.co.jp/detail/1000113',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id: 'src-official-tenkaippin-suidobashi',
    profile: 'TOKYO', area: '地区1️⃣', name: '天下一品 水道橋店',
    googlePlaceId: 'ChIJe0Nwg0CMGGAR49Bu9pWI0TI', source: 'official', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', '饺子', '中华'],
    address: '東京都千代田区神田三崎町3-7-13 田中ビル 1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '毎日 11:00–24:00（L.O. 23:50）', closedDays: [], closedNote: null,
    sourceRefs: [
      {provider:'official',url:'https://www.tenkaippin.co.jp/shop/878/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13019265/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  },
  {
    id: 'src-tabelog-arbol-awajicho',
    profile: 'TOKYO', area: '地区1️⃣', name: 'ARBOL',
    googlePlaceId: 'ChIJAWkjMjeNGGARFZUitfRPUvo', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华'],
    address: '東京都千代田区神田淡路町2-23-7',
    lunch: [1000, 1999], dinner: [8000, 9999], dishes: [],
    openingHoursRaw: '月–金 11:30–15:00, 17:00–23:00; 土 11:30–15:00, 17:00–21:00',
    closedDays: ['日'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13247563/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-official-tsujita-kanda-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'つじ田 神田御茶ノ水店',
    googlePlaceId: 'ChIJq6qfygSMGGARJgbpmoWLoUg', source: 'official', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', 'つけ麺'],
    address: '東京都千代田区神田小川町1-4 和田ビル 1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '平日 10:30–22:30; 土日祝 10:30–21:30',
    closedDays: [], closedNote: null,
    sourceRefs: [
      {provider:'official',url:'https://tsukemen-tsujita.com/shop/?id=0010001',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13020599/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  },
  {
    id: 'src-tabelog-md-bakery-science-tokyo',
    profile: 'TOKYO', area: '地区1️⃣', name: 'MD Bakery',
    googlePlaceId: 'ChIJge8QphmMGGARCt0jMR1hgao', source: 'Tabelog', sourceOnly: true,
    cuisine: '面包・烘焙', tags: ['面包・烘焙', '咖啡'],
    address: '東京都文京区湯島1-5-45 東京科学大学C棟 1F',
    openingHoursRaw: '月–金 09:00–17:00',
    closedDays: ['土', '日'], closedNote: null,
    sourceRefs: [
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13305145/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},
      {provider:'official',url:'https://www.isct.ac.jp/ja/news/awfqldid9g2v',checkedAt:'2026-09-05',fields:['name','cuisine','address']}
    ]
  },
  {
    id: 'src-tabelog-tokinoniwa-kanda',
    profile: 'TOKYO', area: '地区1️⃣', name: '季の庭 神田店',
    googlePlaceId: 'ChIJtRVuPxuMGGARS3pDVvNhcGk', source: 'Tabelog', sourceOnly: true,
    cuisine: '日式', tags: ['日式', '日本料理', '食堂'],
    address: '東京都千代田区神田淡路町1-11-3',
    lunch: [1000, 1999], dinner: [4000, 4999], dishes: [],
    openingHoursRaw: '月–金 11:30–14:00, 17:00–22:30',
    closedDays: ['土', '日', '祝'], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13118620/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  }
);
