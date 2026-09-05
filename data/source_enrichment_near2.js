// Source-backed Area1 enrichment batch: second near-core pass.
// Tabelog rows are keyed to existing verified Google Place IDs; ambiguous or
// internally conflicting fields are intentionally omitted/suppressed.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-rakugo-cafe', profile:'TOKYO', area:'地区1️⃣',
    name:'らくごカフェ', googlePlaceId:'ChIJf3qh_BOMGGARX-8IW1kbae4',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13093941/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-ootoya-kanda-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'大戸屋 神田神保町店', googlePlaceId:'ChIJg6zdBxSMGGAR6sOeTmTTces',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式','食堂'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–金 10:00–22:00; 土日 10:00–21:30',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13035658/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-hanamaru-udon-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'はなまるうどん 神保町店', googlePlaceId:'ChIJVyqVQxGMGGARAMwOpJAO12U',
    source:'Tabelog', sourceOnly:true, cuisine:'乌冬', tags:['乌冬','面食'],
    lunch:[0,999], dinner:[0,999],
    openingHoursRaw:'月–金 10:00–22:00; 土日祝 10:00–21:00',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13156192/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-morihachi-tokyo', profile:'TOKYO', area:'地区1️⃣',
    name:'森八 東京店', googlePlaceId:'ChIJrwdZuYyMGGARU69Kv9A4_wE',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','和菓子'],
    openingHoursRaw:'毎日 10:00–18:30', closedDays:[], closedNote:'年始休みあり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13259070/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-buta-daigaku-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'豚大学 神保町校舎', googlePlaceId:'ChIJTTQAOBGMGGARqZjri8Wchto',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式','豚丼','丼'],
    openingHoursRaw:'月–金 11:00–22:00; 土日祝 11:00–18:00',
    closedDays:[], closedNote:'年末年始休業', suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13160504/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-jimbocho-uokin-ni', profile:'TOKYO', area:'地区1️⃣',
    name:'神保町魚金 弐 すずらん通り店', googlePlaceId:'ChIJ___7bBGMGGARjNjDRPbORIk',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式','海鲜','居酒屋'],
    lunch:[1000,1999], dinner:[4000,4999], dishes:['刺身盛り合わせ'],
    openingHoursRaw:'月–金 11:30–23:00 (料理L.O.22:15/ドリンクL.O.22:40); 土日祝 15:00–23:00 (料理L.O.22:15/ドリンクL.O.22:40)',
    closedDays:[], closedNote:'年末年始休業',
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13221122/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13221122/dtlmenu/',checkedAt:'2026-09-05',fields:['dishes']}
    ]
  },
  {
    id:'src-tabelog-alcazar-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'アルカサール 神保町店', googlePlaceId:'ChIJmQ23FBGMGGARixDUK2b6vlE',
    source:'Tabelog', sourceOnly:true, cuisine:'牛排', tags:['牛排','汉堡','鉄板焼き'],
    lunch:[3000,3999], dinner:[3000,3999], openingHoursRaw:'毎日 11:00–22:00 (L.O.21:30)',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13029964/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-klein-blue', profile:'TOKYO', area:'地区1️⃣',
    name:'クラインブルー', googlePlaceId:'ChIJN5V-FRGMGGARXJPDpzGFr44',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店','バー'],
    lunch:[0,999], dinner:[1000,1999], openingHoursRaw:'月–土 11:00–00:00',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006554/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-genpachi', profile:'TOKYO', area:'地区1️⃣',
    name:'げんぱち', googlePlaceId:'ChIJ88kY7BOMGGARlcxHyHJELCM',
    source:'Tabelog', sourceOnly:true, cuisine:'洋食', tags:['洋食'],
    lunch:[0,999], dinner:null,
    openingHoursRaw:'月–金 11:30–15:00 (L.O.14:30), 18:00–22:00 (L.O.21:30)',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13011365/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-sangam-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'サンガム 神保町店', googlePlaceId:'ChIJeQcEbRGMGGARIUn31LI6_co',
    source:'Tabelog', sourceOnly:true, cuisine:'印度菜', tags:['印度菜','咖喱','居酒屋'],
    lunch:[1000,1999], dinner:[3000,3999], openingHoursRaw:'毎日 11:00–23:00',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13180530/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-taco-bell-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'タコベル 神保町店', googlePlaceId:'ChIJ2XRaORGMGGARr46tS5SgYE0',
    source:'Tabelog', sourceOnly:true, cuisine:'墨西哥菜', tags:['墨西哥菜','タコス','快餐'],
    lunch:[0,999], dinner:null,
    openingHoursRaw:'月–金 10:30–21:00; 土日祝 10:30–20:00',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13216291/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours']}]
  },
  {
    id:'src-tabelog-siddique-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'シディーク 神保町店', googlePlaceId:'ChIJcfDfiROMGGAR2wrDakeXIwI',
    source:'Tabelog', sourceOnly:true, cuisine:'印度菜', tags:['印度菜','パキスタン料理'],
    lunch:[0,999], dinner:[1000,1999],
    // Current page still labels the displayed schedule as a temporary COVID-era
    // change, so the source is bound but the schedule is not promoted.
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13023820/',checkedAt:'2026-09-05',fields:['name','cuisine','budget']}]
  },
  {
    id:'src-tabelog-kongoan-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'こんごう庵 神保町店', googlePlaceId:'ChIJhYC5NhGMGGARYMx7p3ySob8',
    source:'Tabelog', sourceOnly:true, cuisine:'荞麦面', tags:['荞麦面','海鲜','居酒屋'],
    lunch:[0,999], dinner:[4000,4999], closedDays:[], closedNote:'年末年始休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13030009/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-daimaruyaki-sabo', profile:'TOKYO', area:'地区1️⃣',
    name:'大丸やき茶房', googlePlaceId:'ChIJj9ssjxOMGGAROjlItEqEn-o',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','和菓子','たい焼き・大判焼き','咖啡'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'月–金 10:00–17:30',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006439/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-shanghai-tei-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'上海庭 神保町店', googlePlaceId:'ChIJt79NDhGMGGARiFL_6DFaR9g',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','居酒屋','飲茶・点心'],
    lunch:[0,999], dinner:[3000,3999], closedDays:[], closedNote:'無休',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13141576/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  }
);
