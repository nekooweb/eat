// Source-backed Area1 enrichment batch: ninth source-index pass.
// Priority in this phase is trustworthy branch/source binding. Fields are added
// only where the current source is internally consistent.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-jikihaku-udon', profile:'TOKYO', area:'地区1️⃣',
    name:'讃岐うどん直白', googlePlaceId:'ChIJQTxsJxaMGGARdyF-M7gR6bc',
    source:'Tabelog', sourceOnly:true, cuisine:'乌冬', tags:['乌冬','天妇罗'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13171457/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-tommys-pudding-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'トミーズプリン工房 神保町店', googlePlaceId:'ChIJr7EfgCeNGGAR3aE5Q103oO4',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','プリン'],
    openingHoursRaw:'毎日 10:00–20:00', closedDays:[], closedNote:'年末年始休業あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13272278/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-shintoki-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'西安麺荘秦唐記 神保町店', googlePlaceId:'ChIJrZPAHBGMGGARWdRF8_mbt6w',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','刀削麺','西安料理'],
    lunch:[0,999], dinner:[2000,2999], openingHoursRaw:'11:00–15:00, 17:00–23:00',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13244048/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-sendai-curry', profile:'TOKYO', area:'地区1️⃣',
    name:'仙臺', googlePlaceId:'ChIJwRi1pRGMGGARJyR3uUtBkyc',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','洋食'],
    lunch:[0,999], dinner:[0,999],
    openingHoursRaw:'月–金 11:00–20:00; 土 11:00–14:30', closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13186446/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-on-a-slow-boat-to', profile:'TOKYO', area:'地区1️⃣',
    name:'On A Slow Boat To...', googlePlaceId:'ChIJbWr6ypONGGARaig4eoL9K5Y',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店'],
    openingHoursRaw:'水 11:30–18:00; 木金 11:30–22:00; 土 11:30–17:00',
    closedDays:['月','火','日'], closedNote:null, suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13258039/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-buta-yama-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'ラーメン豚山', googlePlaceId:'ChIJBT8rVBCMGGAR1gNQtDPfUac',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13257631/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-kanda-tamagoken-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'神田たまごけん 神保町店', googlePlaceId:'ChIJl3xmPRGMGGAR5WpouLG_Ops',
    source:'Tabelog', sourceOnly:true, cuisine:'洋食', tags:['洋食','オムライス'],
    suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13220133/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-higo-ichimonjiya', profile:'TOKYO', area:'地区1️⃣',
    name:'肥後一文字や', googlePlaceId:'ChIJTbae_NRMGGARC-uynz0tNo8',
    source:'Tabelog', sourceOnly:true, cuisine:'荞麦面', tags:['荞麦面','乌冬','天妇罗'],
    lunch:[0,999], dinner:null, closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13126581/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-beppinsha-ochanomizu', profile:'TOKYO', area:'地区1️⃣',
    name:'カリー&ワイン ビストロべっぴん舎', googlePlaceId:'ChIJ___nqhCMGGARf9ccSyY57Tc',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','ワインバー'],
    openingHoursRaw:'火・木・金・土・日・祝 11:00–15:30', closedDays:['月','水'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'カレー TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13198751/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-official-tullys-jimbocho-mitsui', profile:'TOKYO', area:'地区1️⃣',
    name:'タリーズコーヒー 神保町三井ビルディング店', googlePlaceId:'ChIJeffr8O-NGGARx3yAYSZmLZI',
    source:'official', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    openingHoursRaw:'月–金 07:30–20:00; 土日 08:00–19:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://shop.tullys.co.jp/detail/1000109',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-koseto-coffee', profile:'TOKYO', area:'地区1️⃣',
    name:'古瀬戸珈琲店', googlePlaceId:'ChIJN2_TghCMGGARZogJRWLdqzM',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–金 12:00–20:00; 土日祝 13:00–19:00', closedDays:[], closedNote:'不定休; Instagram要確認',
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'喫茶店',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13006272/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-restaurant-calorie', profile:'TOKYO', area:'地区1️⃣',
    name:'レストランカロリー', googlePlaceId:'ChIJryjlkhWMGGAROc7dEWX4Vpg',
    source:'Tabelog', sourceOnly:true, cuisine:'洋食', tags:['洋食','咖喱'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月・火・水・金・土・日 11:00–16:00; 祝 11:00–18:00', closedDays:['木'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13000602/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-moritaro-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'ラーメン盛太郎', googlePlaceId:'ChIJ9_Rh0hWMGGAROA5JXZbvqY8',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面'],
    openingHoursRaw:'月–金 11:00–15:00, 18:00–21:00; 土祝 11:00–15:00',
    closedDays:['日'], closedNote:null, suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13235542/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-maji-curry-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'MAJI CURRY 神田神保町店', googlePlaceId:'ChIJVQ4T48yMGGAR4N5mn69oiqc',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','食堂','印度菜'],
    lunch:[1000,1999], dinner:[1000,1999],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13219557/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-ethiopia-honten', profile:'TOKYO', area:'地区1️⃣',
    name:'カリーライス専門店エチオピア 本店', googlePlaceId:'ChIJO5cs9Jd8GGARVFTSP-uy8qg',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','印度菜'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–土 10:10–22:00; 日祝 10:00–21:00', closedDays:[], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'カレー TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000638/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-sarafan', profile:'TOKYO', area:'地区1️⃣',
    name:'ロシア料理 サラファン', googlePlaceId:'ChIJcwz06xWMGGARJ1WcCVfj4Jc',
    source:'Tabelog', sourceOnly:true, cuisine:'俄国菜', tags:['俄国菜','洋食'],
    lunch:[1000,1999], dinner:[4000,4999], closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000613/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-cafe-hinata-ya', profile:'TOKYO', area:'地区1️⃣',
    name:'Cafe HINATA-YA', googlePlaceId:'ChIJBR9K9pWNGGARwC9RQq3TEvA',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','咖啡'],
    lunch:[1000,1999], dinner:null, closedDays:['日','祝'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'カレー TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13057210/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure','hyakumeiten']}]
  }
);
