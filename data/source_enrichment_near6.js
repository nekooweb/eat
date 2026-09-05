// Source-backed Area1 enrichment batch: sixth near-core pass.
// Place IDs below are the current Google-QC canonical identities, not stale
// historical/manual IDs.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-sengokushi-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'四川料理 川国志 神保町店', googlePlaceId:'ChIJNRdnDRGMGGAReEOlgaAWYB8',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','四川菜'],
    lunch:[0,999], dinner:null, closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13177561/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-stmarc-jimbocho-suzuran', profile:'TOKYO', area:'地区1️⃣',
    name:'サンマルクカフェ 神保町すずらん通り店', googlePlaceId:'ChIJd40yEACNGGAR4P046X_ux2U',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','面包・烘焙','甜品'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'毎日 07:00–22:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13136579/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-boro', profile:'TOKYO', area:'地区1️⃣',
    name:'喫茶トお酒 襤褸', googlePlaceId:'ChIJbTtuHuiNGGARBrcnzLyb6kg',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','喫茶店','バー'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'火・水・木・日・祝 11:30–19:00; 金・土 11:30–23:00',
    closedDays:['月'], closedNote:'月曜祝日は営業し翌火曜振替休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13293133/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-kanda-katsumoto', profile:'TOKYO', area:'地区1️⃣',
    name:'つけそば 神田 勝本', googlePlaceId:'ChIJBduY0RaMGGAR3fbXTTSTyHg',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面','つけ麺'],
    dishes:['清湯つけそば'], openingHoursRaw:'月–土 10:00–18:00; 日 10:00–17:00',
    closedDays:[], closedNote:'年末年始休業あり', suppressFields:['budget'],
    hyakumeiten:true, hyakumeitenYear:2025, hyakumeitenCategory:'ラーメン TOKYO',
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13192433/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure','hyakumeiten']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13192433/dtlmenu/',checkedAt:'2026-09-05',fields:['dishes']}
    ]
  },
  {
    id:'src-tabelog-karayoshi-kanda-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'から好し 神田神保町店', googlePlaceId:'ChIJKZqeBRGMGGARKItTirr1QhE',
    source:'Tabelog', sourceOnly:true, cuisine:'日式', tags:['日式','からあげ','丼','弁当'],
    lunch:[0,999], dinner:[0,999], openingHoursRaw:'毎日 10:30–23:00 (L.O.22:30)',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13244181/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-kiwaya-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'俺の創作らぁめん 極や 神田 神保町店', googlePlaceId:'ChIJ0_2CIRGMGGARZxuMcOPWxwk',
    source:'Tabelog', sourceOnly:true, cuisine:'拉面', tags:['拉面','つけ麺','担々麺'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–土 11:00–00:00; 日祝 11:00–23:00', closedDays:[], closedNote:'無休',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13132295/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-hinoya-curry-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'日乃屋カレー 神保町店', googlePlaceId:'ChIJpf-1IRGMGGAR5tvlV1sec3A',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱'],
    lunch:[1000,1999], dinner:[1000,1999], openingHoursRaw:'毎日 11:00–22:00',
    closedDays:[], closedNote:'無休',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13197956/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-ono-grill-tokyo', profile:'TOKYO', area:'地区1️⃣',
    name:'Ono Grill Tokyo', googlePlaceId:'ChIJq1Gv1cKNGGARTwACmZuHycs',
    source:'Tabelog', sourceOnly:true, cuisine:'夏威夷菜', tags:['夏威夷菜','ダイニングバー'],
    lunch:[1000,1999], dinner:[5000,5999], closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13285182/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  }
);
