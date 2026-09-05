// Source-backed enrichment for the sixth Area1 production batch.
// Branch facts are attached only to the verified Google Place ID for the exact
// current business. Tabelog/official sources provide durable metadata.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-zai135-jimbocho', profile:'TOKYO', area:'地区1️⃣', name:'座135 神保町店',
    googlePlaceId:'ChIJufenb1iNGGARHcVIujzaKDw', source:'Tabelog', sourceOnly:true,
    cuisine:'中华', tags:['中华','居酒屋','烧鸟'], address:'東京都千代田区神田小川町3-10 2F',
    lunch:[0,999], dinner:[1000,1999], dishes:['焼き餃子'],
    openingHoursRaw:'月日 11:00–00:00; 火 11:00–00:00; 水木土 11:00–04:00; 金 11:00–04:00',
    closedDays:[], closedNote:'年中無休',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13255328/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-masuya-jimbocho', profile:'TOKYO', area:'地区1️⃣', name:'升屋 神保町店',
    googlePlaceId:'ChIJAyFF7RCMGGAR4GWsDukH454', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','牛排','日本料理'], address:'東京都千代田区神田小川町3-10 新駿河台ビル B1F',
    lunch:[0,999], dinner:[4000,4999], dishes:['山形牛ステーキ'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13028656/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes']}]
  },
  {
    id:'src-tabelog-pine-jimbocho', profile:'TOKYO', area:'地区1️⃣', name:'PINE',
    googlePlaceId:'ChIJq69o7BCMGGARIEbWmqwEt9w', source:'Tabelog', sourceOnly:true,
    cuisine:'西式', tags:['西式','汉堡排','酒吧'], address:'東京都千代田区神田小川町3-10',
    lunch:[1000,1999], dishes:['ハンバーグ'],
    openingHoursRaw:'月–金 11:30–14:30, 18:00–00:00; 土 18:00–00:00', closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13035265/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-morichan-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'ホルモン焼肉 モリちゃん 御茶ノ水店',
    googlePlaceId:'ChIJi_Zh7BCMGGARcHWiiqKKE64', source:'Tabelog', sourceOnly:true,
    cuisine:'烤肉', tags:['烤肉','ホルモン','居酒屋'], address:'東京都千代田区神田小川町3-10-11',
    lunch:[0,999], dinner:[4000,4999], dishes:[],
    openingHoursRaw:'月–金 11:30–15:30, 17:30–22:30; 土日 11:30–15:30, 15:30–22:30',
    closedDays:[], closedNote:'通常定休日なし。12月31日–1月1日休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13022363/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-osaketo-jimbocho', profile:'TOKYO', area:'地区1️⃣', name:'和食日和 おさけと 神保町',
    googlePlaceId:'ChIJvyDKWN7hGGARrFkY0C5a9Kw', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','海鲜','居酒屋','日本酒'], address:'東京都千代田区神田錦町3-16 五十嵐ビル 1F',
    lunch:[1000,1999], dinner:[8000,9999], dishes:['お造里','宇和島流鯛めし'],
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13226799/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','closure']}]
  },
  {
    id:'src-tabelog-neverland-cafe', profile:'TOKYO', area:'地区1️⃣', name:'ネバーランド カフェ',
    googlePlaceId:'ChIJZ6B6S2uMGGAR1FZFUTrzDm8', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','酒吧'], address:'東京都千代田区九段南1-4-3',
    lunch:[0,999], dinner:[3000,3999], dishes:[], openingHoursRaw:'月–金 11:00–22:30（L.O. 22:00）',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130906/13026190/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-kazuichi', profile:'TOKYO', area:'地区1️⃣', name:'酒菜家かずいち',
    googlePlaceId:'ChIJ9TDnyQ-MGGARG-nByNz8I0E', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','创作料理','海鲜'], address:'東京都千代田区神田錦町3-17 寺村ビル 1F',
    lunch:[1000,1999], dishes:[], openingHoursRaw:'月 17:30–23:00; 火–土 11:30–13:00, 17:30–23:00',
    closedDays:['日','祝'], closedNote:'土曜日は不定休あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13135894/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-nishikiya', profile:'TOKYO', area:'地区1️⃣', name:'にしき家',
    googlePlaceId:'ChIJN0bDyw-MGGARk68z6gE_YsE', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','日式'], address:'東京都千代田区神田錦町3-17',
    lunch:[1000,1999], dinner:[4000,4999], dishes:['肉豆腐定食'],
    openingHoursRaw:'月–金 11:30–13:15, 17:30–22:00', closedDays:['土','日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13079097/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-okat­teya-kudanshita'.replace('­',''), profile:'TOKYO', area:'地区1️⃣', name:'おかってや 九段下店',
    googlePlaceId:'ChIJzzrWJWuMGGARXDyRYYR1JJ0', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','日本料理'], address:'東京都千代田区九段北1-3-11 九段久保山ビル 1F',
    lunch:[0,999], dinner:[2000,2999], dishes:['刺身'], openingHoursRaw:'月–金 11:30–14:00, 17:00–23:00',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13035541/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-official-pub-santrian', profile:'TOKYO', area:'地区1️⃣', name:'パブサントリアン',
    googlePlaceId:'ChIJcduc-w2MGGAR8yEbOf1jp7g', source:'official', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','パブレストラン'], address:'東京都千代田区一ツ橋1-1-1 パレスサイドビル B1F',
    dinner:[1000,1999], dishes:[], openingHoursRaw:'平日 11:30–14:30, 17:30–23:30; 土曜はパーティーのみ',
    closedDays:['日','祝'], closedNote:'通常土曜営業はパーティーのみ',
    sourceRefs:[{provider:'official',url:'https://www.mai-b.co.jp/restrant/b1/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1302/A130201/13108246/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-official-gond', profile:'TOKYO', area:'地区1️⃣', name:'Indian Street Food & Bar GOND',
    googlePlaceId:'ChIJoUfFe9KNGGARFzs_SomCDXE', source:'official', sourceOnly:true,
    cuisine:'印度菜', tags:['印度菜','酒吧'], address:'東京都千代田区神田駿河台3-5-15 荒井ビル 1F',
    dishes:[], openingHoursRaw:'月–金 11:30–15:00, 17:00–22:00; 土日祝 11:30–15:30, 17:00–21:30',
    closedDays:[], closedNote:'年末年始休業あり',
    sourceRefs:[{provider:'official',url:'https://gondtokyo.com/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-official-kurasuke', profile:'TOKYO', area:'地区1️⃣', name:'飛騨居酒屋 蔵助',
    googlePlaceId:'ChIJXx3AlhqMGGARpPWLfvZyAoA', source:'official', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','日本料理','飞騨料理'], address:'東京都千代田区神田駿河台3-5-15 荒井ビル 2F',
    dinner:[5000,5999], dishes:[], openingHoursRaw:'月–金 11:30–14:00, 17:00–23:15; 土 17:00–23:15',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.kurasuke.jp/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13155297/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-official-hachiku-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'居酒屋 破竹',
    googlePlaceId:'ChIJC2yhZOeNGGAR-4zyNEEEQoc', source:'official', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','日本酒'], address:'東京都千代田区神田三崎町2-8-7 中林ビル 1F',
    lunch:[1000,1999], dinner:[4000,4999], dishes:['牛もつ煮込み','刺身'],
    openingHoursRaw:'月–木 11:30–14:00, 17:00–23:00; 金土日祝 17:00–23:00', closedDays:[], closedNote:'年中無休表記あり',
    sourceRefs:[{provider:'official',url:'https://hachiku-japan.com/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13266496/',checkedAt:'2026-09-05',fields:['budget','hours','closure']}]
  },
  {
    id:'src-official-daisyo-suisan-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'大庄水産 水道橋店',
    googlePlaceId:'ChIJs1zmzD-MGGAR_TWUpga5JUs', source:'official', sourceOnly:true,
    cuisine:'海鲜', tags:['海鲜','居酒屋'], address:'東京都千代田区神田三崎町2-8-7 庄や第1ビル 1F',
    dishes:[], openingHoursRaw:'11:30–23:30（ランチ～15:00）', closedDays:[], closedNote:'定休日なし',
    sourceRefs:[{provider:'official',url:'https://search.daisyo.co.jp/shop.php?shop_cd=1922',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-tabelog-wine-bar-gd', profile:'TOKYO', area:'地区1️⃣', name:"wine bar g'd",
    googlePlaceId:'ChIJj8EhhXmNGGAR5xsU2hNWTtw', source:'Tabelog', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','ワインバー'], address:'東京都千代田区神田駿河台3-3-3 K&T.T駿河台ビルディング 2F',
    dishes:[], openingHoursRaw:'月–金 17:00–23:30; 土 17:00–21:00', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13310616/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-tabelog-gaburichicken-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'がブリチキン。水道橋店',
    googlePlaceId:'ChIJ8SkTyj-MGGAR831cxKM3YPU', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','炸鸡','スポーツバー'], address:'東京都千代田区神田三崎町2-9-6 利久堂ビル 1F',
    dinner:[2000,2999], dishes:['からあげ','骨付鳥'], openingHoursRaw:'月–金 17:00–00:00; 土日祝 15:00–00:00',
    closedDays:[], closedNote:'不定休。月1回月曜休業あり、12月31日–1月3日休業',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13204250/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-keels-bar', profile:'TOKYO', area:'地区1️⃣', name:"KEEL'S BAR",
    googlePlaceId:'ChIJS7UVxsKNGGARjVnNllW2Xvw', source:'Tabelog', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','ビアバー','ビアホール','ヨーロッパ料理'], address:'東京都千代田区神田駿河台2-1-20 お茶の水ユニオンビル 1F',
    lunch:[1000,1999], dinner:[3000,3999], dishes:[], openingHoursRaw:'月–金 11:30–14:30, 17:00–23:00; 土 11:30–21:00',
    closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13293541/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  }
);
