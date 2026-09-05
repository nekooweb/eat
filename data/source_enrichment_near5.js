// Source-backed Area1 enrichment batch: fifth near-core pass.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-mirai-shokudo', profile:'TOKYO', area:'地区1️⃣',
    name:'未来食堂', googlePlaceId:'ChIJVVWVuBOMGGARR14mDlWkiS4', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','食堂','喫茶店'], lunch:[0,999], dinner:null,
    openingHoursRaw:'火–土 11:00–15:00', closedDays:['月','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13186907/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-menya33', profile:'TOKYO', area:'地区1️⃣',
    name:'麺屋33', googlePlaceId:'ChIJObdaJhSMGGARBxqfRHHcNEA', source:'Tabelog', sourceOnly:true,
    cuisine:'拉面', tags:['拉面','つけ麺'],
    openingHoursRaw:'月・火・水・金 11:00–21:00 (料理L.O.20:30); 土日祝 11:00–19:00 (料理L.O.18:50)',
    closedDays:['木'], closedNote:'月ごとに定休日変更あり; 公式Instagram要確認', suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13097807/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-avocafe', profile:'TOKYO', area:'地区1️⃣',
    name:'アボカフェ', googlePlaceId:'ChIJp23kJhGMGGARSBIhbni6bk4', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','ダイニングバー','創作料理'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13042695/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-mazilu-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'馬子禄 牛肉面 神保町店', googlePlaceId:'ChIJg96PHRGMGGARBK5mBzz9N04', source:'Tabelog', sourceOnly:true,
    cuisine:'拉面', tags:['拉面','蘭州牛肉麺'], lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–金 11:00–15:00, 17:00–20:30; 土日祝 11:00–20:30',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13212190/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-tainan-hanten-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'泰南飯店 神保町店', googlePlaceId:'ChIJPwqvuBOMGGARj6OzdsFEGrM', source:'Tabelog', sourceOnly:true,
    cuisine:'中华', tags:['中华'], closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13048086/',checkedAt:'2026-09-05',fields:['name','cuisine','closure']}]
  },
  {
    id:'src-tabelog-jazz-coffee-incus', profile:'TOKYO', area:'地区1️⃣',
    name:'JAZZ COFFEE INCUS', googlePlaceId:'ChIJEfklHACNGGAR0_iz81VJlnM', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','喫茶店'], lunch:[0,999], dinner:null,
    openingHoursRaw:'火–日 12:00–19:00 (L.O.18:00)', closedDays:['月'],
    closedNote:'火曜も連休になる場合あり; 公式Instagram要確認',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13307662/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-adirondack-cafe', profile:'TOKYO', area:'地区1️⃣',
    name:'アディロンダックカフェ', googlePlaceId:'ChIJJ53jJhGMGGARRdD4XNGtrFE', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','バー','汉堡'], lunch:[1000,1999], dinner:[2000,2999],
    openingHoursRaw:'月–木 12:00–15:00, 17:00–22:00; 金 12:00–15:00, 17:00–23:00; 土 12:00–23:00',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13102538/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-sabo-candle', profile:'TOKYO', area:'地区1️⃣',
    name:'茶房きゃんどる', googlePlaceId:'ChIJxaRNtlGNGGARSO4KOTp96Y0', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','喫茶店'], lunch:[0,999], dinner:null,
    openingHoursRaw:'月–金 10:00–19:00 (L.O.18:30)', closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006529/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-royal-host-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'ロイヤルホスト 神田神保町店', googlePlaceId:'ChIJCQOApBGMGGARtd0fPNBMuHc', source:'Tabelog', sourceOnly:true,
    cuisine:'洋食', tags:['洋食','ファミレス'], lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'毎日 08:00–22:00', closedDays:[], closedNote:'不定休',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13101053/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-alfine', profile:'TOKYO', area:'地区1️⃣',
    name:'アルフィーネ', googlePlaceId:'ChIJf4aggBSMGGARnRzv8ieddRo', source:'Tabelog', sourceOnly:true,
    cuisine:'意大利菜', tags:['意大利菜'], lunch:[0,999], dinner:[3000,3999],
    openingHoursRaw:'月–金 11:30–14:00, 17:00–21:00; 土 17:00–21:00',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13060500/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-omusubi-saga', profile:'TOKYO', area:'地区1️⃣',
    name:'おむすびさが', googlePlaceId:'ChIJP857rBGMGGARhVAFsAnb2S8', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','おにぎり'],
    openingHoursRaw:'月–金 17:00–23:00', closedDays:['土','日','祝'],
    closedNote:'現在は夜のみ営業', suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13041933/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-misachiya', profile:'TOKYO', area:'地区1️⃣',
    name:'みさち屋', googlePlaceId:'ChIJM_9L_BCMGGAR_bEtGkUWb8c', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','食堂','居酒屋'], lunch:null, dinner:[3000,3999],
    openingHoursRaw:'月–金 11:30–15:00, 17:00–23:30 (L.O.23:00); 土 11:30–21:30 (L.O.21:00)',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13190470/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-ikyo', profile:'TOKYO', area:'地区1️⃣',
    name:'伊峡', googlePlaceId:'ChIJE058LxGMGGARVJFg8C8dxNs', source:'Tabelog', sourceOnly:true,
    cuisine:'拉面', tags:['拉面'], lunch:[0,999], dinner:null,
    openingHoursRaw:'月–土 11:00–14:00', closedDays:['日','祝'], closedNote:'売切れ次第終了',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13235797/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-maruka', profile:'TOKYO', area:'地区1️⃣',
    name:'うどん 丸香', googlePlaceId:'ChIJyZAT2BCMGGAR3ORQ8u1l4Cs', source:'Tabelog', sourceOnly:true,
    cuisine:'乌冬', tags:['乌冬'], lunch:[0,999], dinner:[0,999],
    closedDays:['日','祝'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2024, hyakumeitenCategory:'うどん EAST',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000629/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-viet-ya-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'ベト屋 神保町店', googlePlaceId:'ChIJOQQ3ZwCNGGARr1lhaWGb9Lc', source:'Tabelog', sourceOnly:true,
    cuisine:'越南菜', tags:['越南菜'], lunch:[1000,1999], dinner:[2000,2999],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13301105/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-hachimaki', profile:'TOKYO', area:'地区1️⃣',
    name:'はちまき', googlePlaceId:'ChIJr3knVhCMGGARzV5mJJqG8_c', source:'Tabelog', sourceOnly:true,
    cuisine:'天妇罗', tags:['天妇罗','天丼','日式'], lunch:[1000,1999], dinner:[5000,5999],
    dishes:['天丼','穴子海老天丼'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13022740/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','dishes']}]
  },
  {
    id:'src-tabelog-manten-curry', profile:'TOKYO', area:'地区1️⃣',
    name:'ライスカレー まんてん', googlePlaceId:'ChIJITsXUxaMGGAREtKypQBMSXI', source:'Tabelog', sourceOnly:true,
    cuisine:'咖喱', tags:['咖喱'], lunch:[0,999], dinner:[0,999],
    dishes:['かつカレー','ジャンボカレー'],
    openingHoursRaw:'月–金 11:00–20:00; 土 11:00–16:00',
    closedDays:['日','祝','第2土','第4土'], closedNote:'売り切れ次第終了',
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'カレー TOKYO',
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000603/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000603/dtlmenu/',checkedAt:'2026-09-05',fields:['dishes']}
    ]
  }
);
