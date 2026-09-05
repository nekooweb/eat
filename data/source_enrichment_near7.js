// Source-backed Area1 enrichment batch: seventh near-core pass.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-gobal-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'炭火ビストロ ゴーバル 神保町店', googlePlaceId:'ChIJYX9ENRSMGGARAfxcN1MYUbA',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','ビストロ','ワインバー'],
    lunch:null, dinner:[4000,4999],
    openingHoursRaw:'月–土 17:00–23:00 (L.O.22:30); 日祝 16:00–22:00 (L.O.21:30)',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13204470/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-esperia', profile:'TOKYO', area:'地区1️⃣',
    name:'ダイニングカフェ エスペリア', googlePlaceId:'ChIJn5xxcxSMGGAR96cXs_TcOG4',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','ダイニングバー','ビアホール'],
    lunch:null, dinner:[3000,3999],
    openingHoursRaw:'月–金 16:00–23:00; 土 16:00–22:00',
    closedDays:['日','祝'], closedNote:'ランチ営業休止中; 日祝は貸切PARTYのみ営業の場合あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13031623/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-veloce-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'カフェ・ベローチェ 神保町店', googlePlaceId:'ChIJTTQAOBGMGGARXRYbp0wUyAM',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'毎日 07:00–21:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13060209/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-doutor-jimbocho-ekimae', profile:'TOKYO', area:'地区1️⃣',
    name:'ドトールコーヒーショップ 神保町駅前店', googlePlaceId:'ChIJq-tfOBGMGGARFR9OxPRRFrc',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店'],
    lunch:[0,999], dinner:[0,999],
    openingHoursRaw:'月–金 06:45–22:00; 土日祝 07:45–20:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13060188/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-doutor-jimbocho-3chome', profile:'TOKYO', area:'地区1️⃣',
    name:'ドトールコーヒーショップ 神保町三丁目店', googlePlaceId:'ChIJpevAiRSMGGARJ3j_AniCivM',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13086827/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-mcdonalds-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'マクドナルド 神保町店', googlePlaceId:'ChIJjY134BCMGGAR9h4cOpHB94U',
    source:'Tabelog', sourceOnly:true, cuisine:'汉堡', tags:['汉堡','快餐'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13050526/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-ichigendo-kasaoka-ramen', profile:'TOKYO', area:'地区1️⃣',
    name:'笠岡ラーメン 一元堂 神保町店', googlePlaceId:'ChIJFyagDQCNGGARWdwB4nwh47g',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面','油そば・まぜそば'],
    lunch:[1000,1999], dinner:[1000,1999], openingHoursRaw:'毎日 10:00–23:00 (L.O.22:45)',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13295091/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-soup-deli', profile:'TOKYO', area:'地区1️⃣',
    name:'SOUP DELI', googlePlaceId:'ChIJBxe2VhSMGGARNDL1zRW0H4c',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','洋食','咖啡'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13048252/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-otonari-coffee', profile:'TOKYO', area:'地区1️⃣',
    name:'オトナリ珈琲', googlePlaceId:'ChIJV4pHSp2NGGAR2iMXFA3cf5U',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    openingHoursRaw:'月 13:00–18:00; 火–金・日 12:00–19:00; 土 12:00–20:00',
    closedDays:[], closedNote:'不定休; 店頭の月間スケジュール要確認',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13266569/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-styles-cakes', profile:'TOKYO', area:'地区1️⃣',
    name:'スタイルズケイクス＆カンパニー', googlePlaceId:'ChIJA-B1wBCMGGARiJOAkIDd08I',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','ケーキ'],
    lunch:[1000,1999], dinner:[1000,1999], closedDays:['水','土','日','祝'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2023, hyakumeitenCategory:'スイーツ TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13125138/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-ramen-jiro-kanda-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'ラーメン二郎 神田神保町店', googlePlaceId:'ChIJ_____xSMGGARX2t1iIjgdT0',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面'],
    lunch:[1000,1999], dinner:[1000,1999], openingHoursRaw:'月–土 11:00–17:30',
    closedDays:['日','祝'], closedNote:'売り切れ終了',
    hyakumeiten:true, hyakumeitenYear:2019, hyakumeitenCategory:'ラーメン TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13216512/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-menmen-kamezo', profile:'TOKYO', area:'地区1️⃣',
    name:'めんめん かめぞう', googlePlaceId:'ChIJtSRayRWMGGARUty8oeFifZk',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面'],
    lunch:[0,999], dinner:[0,999], closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13049895/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-kanyoro', profile:'TOKYO', area:'地区1️⃣',
    name:'漢陽楼', googlePlaceId:'ChIJpVal6RCMGGARhEt46_ytuDs',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','飲茶・点心'],
    lunch:[1000,1999], dinner:null,
    openingHoursRaw:'月–金 11:30–15:00 (L.O.14:00), 17:00–21:30 (L.O.20:30)',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000599/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-pastajin', profile:'TOKYO', area:'地区1️⃣',
    name:'パスタ人', googlePlaceId:'ChIJAyFF7RCMGGARvcRXulVGW24',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','パスタ'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'月–金 11:30–14:30',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13123638/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  }
);
