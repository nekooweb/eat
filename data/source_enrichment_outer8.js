// Source-backed enrichment for the eighth Area1 production batch.
// Exact branch binding requires the current source location to agree with the
// verified Google Place ID and OSM identity.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-sankichi-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'やきとん三吉 水道橋店',
    googlePlaceId:'ChIJ8e-ZpD-MGGARlhssPvB1eI0', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','もつ焼き','烧鸟'], address:'東京都千代田区神田三崎町2-10-3',
    dinner:[2000,2999], dishes:['和豚やきとん','やきとり','バカ盛りポテトフライ'],
    openingHoursRaw:'月–金 16:00–00:00; 土日祝 15:00–00:00', closedDays:[], closedNote:'年末年始休業あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13240031/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-kushidaore-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'串だおれ 水道橋店',
    googlePlaceId:'ChIJY-3aoj-MGGARb4QOongT588', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','串揚げ','烧鸟'], address:'東京都千代田区神田三崎町2-11-10 白菊ビル 1F',
    lunch:[2000,2999], dinner:[2000,2999], dishes:['串カツ','串揚げ'],
    openingHoursRaw:'月–金 15:00–23:00; 土日祝 12:00–23:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13171063/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']},{provider:'official',url:'https://www.kushidaore.com/',checkedAt:'2026-09-05',fields:['name']}]
  },
  {
    id:'src-tabelog-shinnosuke-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'信之助',
    googlePlaceId:'ChIJcSqL8hmMGGARyrmObTSDsy8', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','牛タン'], address:'東京都千代田区神田駿河台2-4-4 御茶ノ水西脇ビル B1F',
    dinner:[1000,1999], dishes:['牛タン','熟成牛ステーキ丼'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13199614/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes']}]
  },
  {
    id:'src-tabelog-ebizu-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'えびず 御茶ノ水店',
    googlePlaceId:'ChIJT_TH7BmMGGARFPtKt6M3yqk', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','铁板烧'], address:'東京都千代田区神田駿河台2-4-14 ウィーンビル B1F',
    dinner:[2000,2999], dishes:['えびず焼き','鉄板出汁巻き玉子','茶水ブラック焼きそば'],
    openingHoursRaw:'月–金 17:00–23:30; 土日祝 16:00–23:00', closedDays:[], closedNote:'無休。12月30日–1月3日休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13283082/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-saburoso-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'サブロッソ',
    googlePlaceId:'ChIJeSgEJxqMGGAR2zkERvefTW4', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','日本料理'], address:'東京都千代田区神田駿河台2-10-5',
    lunch:[0,999], dinner:[4000,4999], dishes:['刺身盛り合わせ','牛もつ煮込み','三色丼'],
    openingHoursRaw:'月–金 11:30–13:00, 18:00–23:00; 土 17:00–22:00', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13057066/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-kouta-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'和食屋 こう太',
    googlePlaceId:'ChIJdyF1YQmNGGARvDDeU1cwyv4', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜'], address:'東京都千代田区神田駿河台2-6-11 第87ビル B1F',
    dinner:[4000,4999], dishes:['刺身盛り合わせ','のどぐろ塩焼き','大山鶏のすき焼き'],
    openingHoursRaw:'月–木 16:00–01:00; 金 16:00–02:00; 土日祝 12:00–00:00', closedDays:[], closedNote:'年末年始休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13286363/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-rejiya-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'Re時屋',
    googlePlaceId:'ChIJ0XebMyCNGGAR8WL746mu114', source:'Tabelog', sourceOnly:true,
    cuisine:'烧鸟', tags:['烧鸟','串烧'], address:'東京都千代田区神田三崎町2-21-9 田島ビル 1F',
    dinner:[3000,3999], dishes:['焼き鳥','串焼き'], openingHoursRaw:'月–土 17:00–23:00（L.O. 22:00）',
    closedDays:['日','祝'], closedNote:'ランチ営業は現在休止',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13044561/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-kushiyaki-niwa', profile:'TOKYO', area:'地区1️⃣', name:'串焼 庭 本格ハルビン',
    googlePlaceId:'ChIJZ7Pq3gSMGGARqzSYizyRXm0', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','肉料理','串烧'], address:'東京都千代田区神田小川町1-7-9 1F',
    dinner:[2000,2999], dishes:['串焼き'], openingHoursRaw:'17:00–23:30', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13201390/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours']}]
  }
);
