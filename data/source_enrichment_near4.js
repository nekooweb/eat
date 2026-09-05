// Source-backed Area1 enrichment batch: fourth near-core pass.
// When Tabelog direct-budget fields conflict across current views/aggregates, the
// source identity is kept but budget propagation is deliberately suppressed.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-passage-bis', profile:'TOKYO', area:'地区1️⃣',
    name:'PASSAGE bis!', googlePlaceId:'ChIJP0OnFSaNGGARMDw_hTS2-XY',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    lunch:[1000,1999], dinner:[1000,1999],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13288605/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-taprobane-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'スパイシービストロ タップロボーン 神保町店', googlePlaceId:'ChIJ06Y7zmmNGGARO-ajG7EusUA',
    source:'Tabelog', sourceOnly:true, cuisine:'斯里兰卡菜', tags:['斯里兰卡菜','咖喱','ダイニングバー'],
    openingHoursRaw:'毎日 11:30–15:30, 17:30–23:30 (L.O.22:30)',
    closedDays:[], closedNote:'不定休', suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13245676/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-jimbocho-yakisoba-mikasa', profile:'TOKYO', area:'地区1️⃣',
    name:'神保町 やきそば みかさ', googlePlaceId:'ChIJ93J8IxSMGGARcOixOZM4jwQ',
    source:'Tabelog', sourceOnly:true, cuisine:'面食', tags:['面食','焼きそば'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'月–土・祝 11:00–20:30', closedDays:['日'],
    closedNote:'麺売り切れ次第終了; 臨時休業は公式Xで告知',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13163715/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-milonga-nueva', profile:'TOKYO', area:'地区1️⃣',
    name:'ミロンガ ヌオーバ', googlePlaceId:'ChIJrZPAHBGMGGARF6oPSXb-Ciw',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店'],
    openingHoursRaw:'月・火・木・金 11:30–22:30 (L.O.22:00); 土日祝 11:30–19:00 (L.O.18:30)',
    closedDays:['水'], closedNote:null, suppressFields:['budget'],
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'喫茶店',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13281958/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-ladrio', profile:'TOKYO', area:'地区1️⃣',
    name:'ラドリオ', googlePlaceId:'ChIJrZPAHBGMGGARge1vNIrQh80',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店','バー'],
    closedDays:['火'], closedNote:null, suppressFields:['budget'],
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'喫茶店',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006555/',checkedAt:'2026-09-05',fields:['name','cuisine','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-kinwa', profile:'TOKYO', area:'地区1️⃣',
    name:'中国料理 錦和', googlePlaceId:'ChIJ2yzmKgCNGGARujgyaVuRhy8',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','居酒屋','飲茶・点心'],
    lunch:[1000,1999], dinner:[3000,3999],
    openingHoursRaw:'月–土・祝 11:00–15:00, 17:00–23:30 (料理L.O.22:30/ドリンクL.O.23:00)',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13306664/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-tea-house-takano', profile:'TOKYO', area:'地区1️⃣',
    name:'ティーハウスタカノ', googlePlaceId:'ChIJrZPAHBGMGGAR3vwzAn7neFc',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','サンドイッチ','紅茶'],
    lunch:[1000,1999], dinner:[1000,1999], closedDays:['日'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2025, hyakumeitenCategory:'カフェ EAST',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000643/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-kanda-gyozaya', profile:'TOKYO', area:'地区1️⃣',
    name:'神田餃子屋 本店', googlePlaceId:'ChIJB5R3HBCMGGAReQWzC9wHBQU',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','饺子'],
    openingHoursRaw:'月–金 11:30–22:00 (L.O.21:30); 土日祝 11:30–20:00 (L.O.19:30)',
    closedDays:[], closedNote:null, suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13025041/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-higekan', profile:'TOKYO', area:'地区1️⃣',
    name:'ひげ勘', googlePlaceId:'ChIJfx9Z3BOMGGARF9DCcdAljCg',
    source:'Tabelog', sourceOnly:true, cuisine:'寿司', tags:['寿司','海鲜'],
    lunch:[1000,1999], dinner:null,
    openingHoursRaw:'月–金 11:45–14:00', closedDays:['土','日','祝'],
    closedNote:'現在夜営業休業中; 売り切れ次第終了',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13248049/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  }
);
