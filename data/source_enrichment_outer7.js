// Source-backed enrichment for the seventh Area1 production batch.
// Current names replace stale OSM display names only when exact location and
// verified Google Place ID agree with the branch source.

window.RESTAURANTS.push(
  {
    id:'src-official-rodriguez-kudanshita', profile:'TOKYO', area:'地区1️⃣', name:'鉄板ダイニング ロドリゲス 九段下店',
    googlePlaceId:'ChIJVSfB8NCNGGARrfeHyHk0p94', source:'official', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','铁板烧','ダイニングバー'], address:'東京都千代田区九段北1-10-5 サンブリッジ九段ビル B1F',
    dinner:[3000,3999], dishes:['桃豚鉄板料理'], openingHoursRaw:'月–土 17:00–03:00（L.O. 02:00）',
    closedDays:['日','祝'], closedNote:'年末年始休業。日祝は武道館イベント時に営業する場合あり',
    sourceRefs:[{provider:'official',url:'https://rodriguez-kudanshita.com/index.html',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130906/13041230/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-official-naru-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'JAZZ HOUSE NARU',
    googlePlaceId:'ChIJ09Mm5xmMGGAR6drOCC8NmEA', source:'official', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','ジャズクラブ','咖喱'], address:'東京都千代田区神田駿河台2-1 十字屋ビル B1F',
    dinner:[3000,4999], dishes:['欧風カレー'], openingHoursRaw:'通常ライブ 18:00–22:00; 日 13:30–17:00; 月火限定カレーランチ 11:30–14:00 L.O.',
    closedDays:[], closedNote:'公演日程により変動',
    sourceRefs:[{provider:'official',url:'https://visit-chiyoda.tokyo/app/spot/detail/1011',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours']},{provider:'official',url:'https://ocha-naru.com/',checkedAt:'2026-09-05',fields:['name']}]
  },
  {
    id:'src-tabelog-torimasu-surugadai', profile:'TOKYO', area:'地区1️⃣', name:'鳥益',
    googlePlaceId:'ChIJzQVI5xqMGGAR88irvCKhTyk', source:'Tabelog', sourceOnly:true,
    cuisine:'烧鸟', tags:['烧鸟'], address:'東京都千代田区神田駿河台3-1 川庄ビル 2F',
    dinner:[10000,14999], dishes:[], openingHoursRaw:'月–金 17:30–21:30; 土 17:30–21:00',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13064380/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-ichigoya-surugadai', profile:'TOKYO', area:'地区1️⃣', name:'葡萄酒場 ICHIGOYA',
    googlePlaceId:'ChIJzQVI5xqMGGARt9mInzgGLIg', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','ワインバー'], address:'東京都千代田区神田駿河台3-1 川庄ビル 2F',
    lunch:[2000,2999], dinner:[3000,3999], dishes:[], openingHoursRaw:'月–土 17:00–23:00',
    closedDays:['日','祝'], closedNote:'4名以上の予約で日祝営業の場合あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13021503/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-yakiniku-gaku-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'焼肉ホルモンがく 水道橋本店',
    googlePlaceId:'ChIJ2VjLuz-MGGARGC3YKL-wO0Q', source:'Tabelog', sourceOnly:true,
    cuisine:'烤肉', tags:['烤肉','ホルモン'], address:'東京都千代田区神田三崎町2-11-13 MMビルII 1F',
    dinner:[6000,7999], dishes:['上レバー','盛岡冷麺'], openingHoursRaw:'月–金 16:00–02:00; 土日祝 11:00–15:00, 16:00–02:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13153349/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-ironishiki', profile:'TOKYO', area:'地区1️⃣', name:'いろにしき',
    googlePlaceId:'ChIJs04xOgWMGGARBBNCOV1b-9o', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','牛排'], address:'東京都千代田区神田錦町1-14-11 伊東ビル 1F',
    lunch:[0,999], dinner:[4000,4999], dishes:[], openingHoursRaw:'月–金 11:30–14:30, 17:00–23:00',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13203058/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-nagomi-kukku', profile:'TOKYO', area:'地区1️⃣', name:'なごみ 駆々',
    googlePlaceId:'ChIJ70HROtqNGGARLeoqNcrVbq8', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','日本料理','食堂'], address:'東京都千代田区神田駿河台3-1-5 川庄ビル 3F',
    lunch:[0,999], dinner:[2000,2999], dishes:['刺身'], openingHoursRaw:'月–金 11:00–15:00, 17:00–23:00; 土 11:00–15:00, 17:00–21:00',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13222020/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-iseji-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'おでん やきとり 伊勢路 水道橋店',
    googlePlaceId:'ChIJX_rO9EONGGARNRk8x0A8Atg', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','关东煮','烧鸟'], address:'東京都千代田区神田三崎町2-10-1',
    dinner:[2000,2999], dishes:['おでん','やきとり'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13260927/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes']}]
  },
  {
    id:'src-official-yokayoka-ogawamachi', profile:'TOKYO', area:'地区1️⃣', name:'博多野菜巻き串 九州うまいもん よかよか 小川町店',
    googlePlaceId:'ChIJIagAawCNGGARvwW9Z6rmvS0', source:'official', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','博多料理','九州料理','野菜巻き串','もつ鍋'], address:'東京都千代田区神田小川町2-2-7 2F',
    lunch:[501,1000], dinner:[3001,4000], dishes:['野菜巻き串','もつ鍋'],
    openingHoursRaw:'月–金 11:30–14:00, 16:30–22:30; 土祝 11:30–14:00, 16:00–22:00', closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://yokayokaogawamati.owst.jp/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-official-madume-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'釣宿酒場 マヅメ 御茶ノ水店',
    googlePlaceId:'ChIJMSFgyZGNGGARh283HSyqqJc', source:'official', sourceOnly:true,
    cuisine:'海鲜', tags:['海鲜','居酒屋','寿司'], address:'東京都千代田区神田駿河台2-4-1',
    lunch:[1000,1999], dinner:[3000,3999], dishes:['釣り魚','神経〆活魚','本気のトロ鉄火巻き'],
    openingHoursRaw:'月–金 11:30–14:30, 17:00–23:00; 土 16:00–22:00', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.dynacjapan.com/brands/madume/shops/ochanomizu/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13273030/',checkedAt:'2026-09-05',fields:['budget','hours']}]
  }
);
