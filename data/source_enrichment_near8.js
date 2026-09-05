// Source-backed Area1 enrichment batch: remaining usable sources inside ~300 m.
// All Place IDs are current Google-QC canonical identities.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-jinbo', profile:'TOKYO', area:'地区1️⃣',
    name:'神房', googlePlaceId:'ChIJ18cV4xOMGGARjNGyZdh33Ik',
    source:'Tabelog', sourceOnly:true, cuisine:'海鲜', tags:['海鲜','居酒屋'],
    lunch:[1000,1999], dinner:[4000,4999], closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13218314/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-kingken-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'キング軒 神保町店', googlePlaceId:'ChIJ5xWMolyNGGARAMCqKahm6eE',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','汁なし担担麺'],
    lunch:[0,999], dinner:[0,999],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13197662/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-front-du-chaton', profile:'TOKYO', area:'地区1️⃣',
    name:'Front du CHATON', googlePlaceId:'ChIJOeeMRyuNGGARKnRqvu0io-E',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','咖啡'],
    lunch:[1000,1999], dinner:null,
    openingHoursRaw:'月–金 11:30–17:00', closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13246767/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-official-doutor-jimbocho-hakusan', profile:'TOKYO', area:'地区1️⃣',
    name:'ドトールコーヒーショップ 神保町白山通り店', googlePlaceId:'ChIJb1NJHRSMGGARQHQ71gBl4Dg',
    source:'official', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    openingHoursRaw:'月–金 07:00–20:00; 日祝 08:00–18:00',
    closedDays:['土'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://shop.doutor.co.jp/doutor/spot/detail?code=1010062',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-bistro-liberte', profile:'TOKYO', area:'地区1️⃣',
    name:'Bistro Liberté', googlePlaceId:'ChIJbTOaERGMGGARRbVxba8mOck',
    source:'Tabelog', sourceOnly:true, cuisine:'法餐', tags:['法餐','ビストロ'],
    lunch:[0,999], dinner:[3000,3999],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13286582/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-official-tullys-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'タリーズコーヒー 神保町店', googlePlaceId:'ChIJH8GYiROMGGARAjxscGAOoIA',
    source:'official', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    openingHoursRaw:'月–金 07:00–20:00; 土 08:00–19:00; 日 09:00–19:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://shop.tullys.co.jp/detail/1000007',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-angolo', profile:'TOKYO', area:'地区1️⃣',
    name:'クッチーナ イタリアーナ アンゴロ', googlePlaceId:'ChIJx2dgmBaMGGAR6YeTasAD2mk',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','パスタ'],
    openingHoursRaw:'月–金 11:30–15:00, 18:00–23:00', closedDays:['土','日'], closedNote:null,
    suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13050525/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-kissako', profile:'TOKYO', area:'地区1️⃣',
    name:'きっさこ', googlePlaceId:'ChIJ93J8IxSMGGARFrVeeNZYq-g',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店'],
    lunch:[0,999], dinner:null,
    openingHoursRaw:'火–金 12:00–17:00; 土日祝 12:00–18:00',
    closedDays:['月'], closedNote:'ほか不定休あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13041560/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-kaneichi', profile:'TOKYO', area:'地区1️⃣',
    name:'かねいち', googlePlaceId:'ChIJ____DxGMGGARxguBsW1lnd0',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式','うなぎ'],
    lunch:[3000,3999], dinner:[4000,4999],
    openingHoursRaw:'月・火・水・金 11:00–14:00, 17:00–21:00; 木・土 11:00–14:00',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13011607/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-nibantei', profile:'TOKYO', area:'地区1️⃣',
    name:'日本式カレー 弐番亭', googlePlaceId:'ChIJNeiJsjqNGGARUwCL2ZS0u34',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','炸猪排'],
    lunch:[1000,1999], dinner:[1000,1999], closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13309507/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-official-pharos-coffee', profile:'TOKYO', area:'地区1️⃣',
    name:'Pharos Coffee', googlePlaceId:'ChIJgaPNVhCMGGARILh-OhDkTn8',
    source:'official', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    openingHoursRaw:'11:00–18:00', closedDays:[], closedNote:'不定休',
    sourceRefs:[{provider:'official',url:'https://pharoscoffee.com/zh/policies/legal-notice',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-bettola-sanbal', profile:'TOKYO', area:'地区1️⃣',
    name:'BETTOLA SANBAL', googlePlaceId:'ChIJFY6dSxCMGGAR61a2qrCEco0',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','バル','披萨'],
    lunch:[1000,1999], dinner:[3000,3999],
    openingHoursRaw:'月–金 11:30–15:00, 17:30–23:30; 土 11:30–21:30',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13157895/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-hasebe', profile:'TOKYO', area:'地区1️⃣',
    name:'はせ部', googlePlaceId:'ChIJERaIURCMGGARR8O1VFT7n_U',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式'],
    lunch:[0,999], dinner:null, closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13080710/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-bakery-abe', profile:'TOKYO', area:'地区1️⃣',
    name:'ベーカリーアベ', googlePlaceId:'ChIJvXBmsxWMGGARUOTkEM1RFlk',
    source:'Tabelog', sourceOnly:true, cuisine:'面包・烘焙', tags:['面包・烘焙','サンドイッチ'],
    lunch:[0,999], dinner:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13030933/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-jimbocho-gyoza-xiaolongbao', profile:'TOKYO', area:'地区1️⃣',
    name:'神保町餃子小籠包', googlePlaceId:'ChIJh3wLk6SNGGARTMTGIUTky3E',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','饺子','小籠包'],
    lunch:[0,999], dinner:[2000,2999], dishes:['餃子','小籠包'],
    openingHoursRaw:'月–金 11:00–15:00, 17:00–22:00; 日祝 11:00–20:00',
    closedDays:['土'], closedNote:'土曜は15名以上の貸切予約のみ',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13272999/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','dishes','hours','closure']}]
  }
);
