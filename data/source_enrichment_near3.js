// Source-backed Area1 enrichment batch: third near-core pass.
// Place IDs are taken from the current Google-QC canonical identity set.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-kuriya-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'厨 神保町本店', googlePlaceId:'ChIJ40toFcqNGGARg-HT_n1RPRk',
    source:'Tabelog', sourceOnly:true, cuisine:'洋食', tags:['洋食','汉堡','ワインバー'],
    lunch:[1000,1999], dinner:[6000,7999],
    openingHoursRaw:'月–金 11:00–15:00 (L.O.14:30), 17:00–23:00 (料理L.O.22:00/ドリンクL.O.22:30); 土 11:00–15:00 (L.O.14:30), 17:00–21:00 (料理L.O.20:00/ドリンクL.O.20:30)',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13253277/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-kissho-bunsendo', profile:'TOKYO', area:'地区1️⃣',
    name:'橘昌 文銭堂', googlePlaceId:'ChIJ0_vaEhGMGGAR8zPLZw2iAas',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','和菓子'],
    openingHoursRaw:'月–土 10:00–18:00', closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13054935/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-rikiya-shoten', profile:'TOKYO', area:'地区1️⃣',
    name:'力也商店', googlePlaceId:'ChIJJQtsNtCNGGARXHMI26d4tG4',
    source:'Tabelog', sourceOnly:true, cuisine:'冲绳菜', tags:['冲绳菜','居酒屋'],
    lunch:null, dinner:[4000,4999],
    openingHoursRaw:'月–金 18:00–23:00; 土 18:00–22:00',
    closedDays:['日','祝'], closedNote:'土曜は不定営業のため来店前確認推奨',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13235012/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-uotama', profile:'TOKYO', area:'地区1️⃣',
    name:'魚玉', googlePlaceId:'ChIJpSBgsBaMGGARRUpLmaFtDFc',
    source:'Tabelog', sourceOnly:true, cuisine:'海鲜', tags:['海鲜','食堂'],
    openingHoursRaw:'月–木 11:00–14:30, 17:00–20:30; 金 11:00–14:30',
    closedDays:['土','日','祝'], closedNote:null, suppressFields:['budget'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13006524/',checkedAt:'2026-09-05',fields:['name','cuisine','hours','closure']}]
  },
  {
    id:'src-tabelog-asobi-cafe', profile:'TOKYO', area:'地区1️⃣',
    name:'アソビCafe', googlePlaceId:'ChIJNwRqpBaMGGAR07TdHcGkY5w',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','ダイニングバー'],
    lunch:[1000,1999], dinner:[2000,2999],
    openingHoursRaw:'月–金 17:00–23:00; 土日祝 12:00–22:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13212933/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-luncheon', profile:'TOKYO', area:'地区1️⃣',
    name:'ランチョン', googlePlaceId:'ChIJc5NiOxGMGGAR0PMWjP7od20',
    source:'Tabelog', sourceOnly:true, cuisine:'洋食', tags:['洋食','ビアホール','ヨーロッパ料理'],
    lunch:[1000,1999], dinner:[3000,3999], dishes:['日替わりランチ','ステーキランチ'],
    openingHoursRaw:'火–金・祝 11:30–21:30; 土 11:30–20:30',
    closedDays:['月','日'], closedNote:null,
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000241/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000241/dtlmenu/lunch/',checkedAt:'2026-09-05',fields:['dishes']}
    ]
  },
  {
    id:'src-tabelog-kyoeido', profile:'TOKYO', area:'地区1️⃣',
    name:'スマトラカレー 共栄堂', googlePlaceId:'ChIJc5NiOxGMGGARL8jOKrnIR5c',
    source:'Tabelog', sourceOnly:true, cuisine:'咖喱', tags:['咖喱','洋食','甜品'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–土・祝 11:00–20:00 (L.O.19:45)',
    closedDays:['日'], closedNote:'祝日は不定休の場合あり',
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'カレー TOKYO',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13000596/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure','hyakumeiten']}]
  },
  {
    id:'src-tabelog-tentoyo-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'浅草割烹 天とよ 神保町店', googlePlaceId:'ChIJ6-JxGJyNGGARhu0YEPhV3mc',
    source:'Tabelog', sourceOnly:true, cuisine:'天妇罗', tags:['天妇罗','居酒屋','海鲜'],
    lunch:[1000,1999], dinner:[4000,4999], dishes:['天丼','天ぷら盛り合わせ'],
    openingHoursRaw:'月–金 11:30–15:00, 17:00–23:00; 土 11:30–15:00, 17:00–21:00',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13229844/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-katsuo-ga-noboru-made', profile:'TOKYO', area:'地区1️⃣',
    name:'鰹が昇るまで', googlePlaceId:'ChIJJdyitLiNGGARk0wEjxFkuKM',
    source:'Tabelog', sourceOnly:true, cuisine:'面食', tags:['面食','油そば・まぜそば','担々麺'],
    lunch:[1000,1999], dinner:[1000,1999], openingHoursRaw:'毎日 11:00–22:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13290110/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-sushisho', profile:'TOKYO', area:'地区1️⃣',
    name:'すし庄', googlePlaceId:'ChIJhe6RUq6NGGARfoxLiDaF1tg',
    source:'Tabelog', sourceOnly:true, cuisine:'寿司', tags:['寿司'],
    lunch:null, dinner:[8000,9999], openingHoursRaw:'月–金 18:00–23:00',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13023809/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-senfu-jimbocho', profile:'TOKYO', area:'地区1️⃣',
    name:'四川料理刀削麺 川府 神保町店', googlePlaceId:'ChIJ-c9WERGMGGARFQx2dyqYVWo',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','四川菜','刀削麺'],
    lunch:[0,999], dinner:[3000,3999], openingHoursRaw:'毎日 11:00–15:00, 17:00–23:30',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13146994/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-narimitsu', profile:'TOKYO', area:'地区1️⃣',
    name:'成光', googlePlaceId:'ChIJ1delkxOMGGARiM8Ggy7fYXA',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','拉面','饺子'],
    lunch:[0,999], dinner:[1000,1999],
    openingHoursRaw:'月–金 11:15–15:00, 17:00–21:30; 土 11:15–15:00',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13011355/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-cafe-lish', profile:'TOKYO', area:'地区1️⃣',
    name:'Cafe Lish', googlePlaceId:'ChIJMYM_ELeNGGAR4_Rjpux4b9k',
    source:'Tabelog', sourceOnly:true, cuisine:'咖啡', tags:['咖啡','洋食','甜品'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13287276/',checkedAt:'2026-09-05',fields:['name','cuisine']}]
  },
  {
    id:'src-tabelog-ceppo', profile:'TOKYO', area:'地区1️⃣',
    name:'Ceppo', googlePlaceId:'ChIJnTJ7MRGMGGARVIDIwJx2cW0',
    source:'Tabelog', sourceOnly:true, cuisine:'意大利菜', tags:['意大利菜','ビストロ'],
    lunch:null, dinner:[6000,7999], closedDays:['日','月'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13169978/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-kinonedo', profile:'TOKYO', area:'地区1️⃣',
    name:'きのね堂', googlePlaceId:'ChIJPcGWk7KNGGARIfPAha9epnw',
    source:'Tabelog', sourceOnly:true, cuisine:'甜品', tags:['甜品','洋菓子'],
    lunch:[0,999], dinner:null,
    openingHoursRaw:'主に水曜 12:30頃–19:00頃', closedDays:[],
    closedNote:'営業日・時間は変動するため公式Instagram要確認',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13269308/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-tempura-imoya', profile:'TOKYO', area:'地区1️⃣',
    name:'天ぷら いもや', googlePlaceId:'ChIJPSDFpBaMGGARWDz82FWucKc',
    source:'Tabelog', sourceOnly:true, cuisine:'天妇罗', tags:['天妇罗','食堂'],
    lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月・火・木・金 11:30–14:00, 17:00–18:00',
    closedDays:['水','土','日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13131365/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-karyu-hanten', profile:'TOKYO', area:'地区1️⃣',
    name:'華龍飯店', googlePlaceId:'ChIJN5EKuxaMGGARdzq4uUuYpog',
    source:'Tabelog', sourceOnly:true, cuisine:'中华', tags:['中华','四川菜','居酒屋'],
    lunch:[0,999], dinner:[3000,3999], closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13102649/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure']}]
  },
  {
    id:'src-tabelog-folk-burgers', profile:'TOKYO', area:'地区1️⃣',
    name:'folk burgers&beers', googlePlaceId:'ChIJzdH-Ym2NGGARNTgMz5QhTvw',
    source:'Tabelog', sourceOnly:true, cuisine:'汉堡', tags:['汉堡','ビアバー','パブ'],
    lunch:[1000,1999], dinner:[2000,2999], closedDays:['月','火'], closedNote:null,
    hyakumeiten:true, hyakumeitenYear:2026, hyakumeitenCategory:'ハンバーガー',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13224811/',checkedAt:'2026-09-05',fields:['name','cuisine','budget','closure','hyakumeiten']}]
  }
);
