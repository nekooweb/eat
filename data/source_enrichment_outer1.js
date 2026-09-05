// Source-backed enrichment for the first newly admitted outer-Area1 batch.
// Each row is attached by exact Google Place ID to a production identity that
// already passed Google QC. Durable factual fields below come from the cited
// independent source, not from persisted Google Place details.

window.RESTAURANTS.push(
  {
    id: 'src-official-sasajin-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'そば酒房 笹陣 お茶の水店',
    googlePlaceId: 'ChIJ_5AELhqMGGARx5K_W6T4VQo', source: 'official', sourceOnly: true,
    cuisine: '荞麦面', tags: ['荞麦面', '居酒屋'],
    address: '東京都千代田区神田駿河台4-3 お茶の水サンクレール B1F',
    openingHoursRaw: '平日 11:00–14:30, 16:00–21:45; 土 11:00–15:00',
    closedDays: ['日', '祝'], closedNote: '年末年始休業',
    sourceRefs: [{provider:'official',url:'https://s-clair.com/shop/130',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id: 'src-tabelog-shanghai-hanten-suidobashi',
    profile: 'TOKYO', area: '地区1️⃣', name: '上海飯店',
    googlePlaceId: 'ChIJQ7aufj-MGGAR-NTeQP2lniU', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '中華料理'],
    address: '東京都千代田区神田三崎町2-19-9 大曽根ビル 1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: ['ロース丼'],
    openingHoursRaw: '毎日 11:00–22:30', closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13073568/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours']}]
  },
  {
    id: 'src-tabelog-taiwan-sakaba-kudanshita',
    profile: 'TOKYO', area: '地区1️⃣', name: '中華ダイニング 台湾酒場',
    googlePlaceId: 'ChIJF3cSy0GMGGARwvwIZmKFgm4', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '台湾料理', '饺子'],
    address: '東京都千代田区飯田橋2-5-3 スカイコート九段下 1F',
    lunch: [0, 999], dinner: [3000, 3999], dishes: ['石焼麻婆豆腐'],
    openingHoursRaw: '月–金 11:00–15:00, 17:00–23:30; 土日祝 17:00–23:30',
    closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130906/13209012/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours']}]
  },
  {
    id: 'src-tabelog-senpinshan-kudanshita',
    profile: 'TOKYO', area: '地区1️⃣', name: '純中国伝統料理四川料理 芊品香',
    googlePlaceId: 'ChIJCx3eSUCMGGAR3rd2s4J8pyw', source: 'Tabelog', sourceOnly: true,
    cuisine: '中华', tags: ['中华', '四川料理', '刀削麺'],
    address: '東京都千代田区飯田橋2-16-4 九段下コート 1F',
    lunch: [0, 999], dinner: [4000, 4999], dishes: ['刀削麺'],
    // The current page contains internally inconsistent Sunday/holiday hour text,
    // so schedule/closure are intentionally left unset pending reconciliation.
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130906/13189568/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes']}]
  },
  {
    id: 'src-tabelog-karin-lanzhou-beef-noodles',
    profile: 'TOKYO', area: '地区1️⃣', name: '花臨蘭州牛肉麺',
    googlePlaceId: 'ChIJe1GlRU6NGGARIvyAuXYJamg', source: 'Tabelog', sourceOnly: true,
    cuisine: '拉面', tags: ['拉面', '中华', '蘭州牛肉麺'],
    address: '東京都千代田区神田三崎町3-4-8 山田ビル 1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: ['蘭州牛肉麺'],
    openingHoursRaw: '毎日 10:30–22:00', closedDays: [], closedNote: '年末年始休業',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13287589/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id: 'src-tabelog-cleante-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'カフェダイニング クレアンテ 御茶ノ水店',
    googlePlaceId: 'ChIJu8q72Q2NGGARBN4O5hwNfps', source: 'Tabelog', sourceOnly: true,
    cuisine: '咖啡', tags: ['咖啡', 'パスタ', 'ピザ'],
    address: '東京都千代田区神田駿河台4-3 お茶の水ビルディング B1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '月–金 11:00–21:00; 土日祝 11:00–18:00',
    closedDays: [], closedNote: '施設に準ずる',
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13244285/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id: 'src-tabelog-okinawaken-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'おきなわ軒',
    googlePlaceId: 'ChIJ20wrgRmMGGARluo4JoLb8Q8', source: 'Tabelog', sourceOnly: true,
    cuisine: '冲绳料理', tags: ['冲绳料理', '沖縄料理'],
    address: '東京都千代田区神田駿河台4-5-2 友利ビル 2–3F',
    lunch: [0, 999], dinner: [2000, 2999], dishes: [],
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13023878/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget']}]
  },
  {
    id: 'src-tabelog-soup-stock-ochanomizu',
    profile: 'TOKYO', area: '地区1️⃣', name: 'スープストックトーキョー お茶の水店',
    googlePlaceId: 'ChIJuXVmKxqMGGARCRq6B6mN_BE', source: 'Tabelog', sourceOnly: true,
    cuisine: '汤品', tags: ['汤品', 'スープ'],
    address: '東京都千代田区神田駿河台4-3 新お茶の水ビルディング 1F',
    lunch: [1000, 1999], dinner: [1000, 1999], dishes: [],
    openingHoursRaw: '月–金 08:00–20:30; 土日祝 09:00–20:00',
    closedDays: [], closedNote: null,
    sourceRefs: [{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13019243/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  }
);
