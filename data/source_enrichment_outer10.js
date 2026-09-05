// Source-backed enrichment for the tenth Area1 production batch.
// Exact branch identity is anchored by the current canonical Google Place ID.

window.RESTAURANTS.push(
  {
    id:'src-official-renoir-kanda-awajicho', profile:'TOKYO', area:'地区1️⃣', name:'ルノアール 神田淡路町店',
    googlePlaceId:'ChIJG4bwugSMGGARuz8X6hPQM8Y', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','喫茶店'], address:'東京都千代田区神田小川町1-1 山甚ビル B1F',
    lunch:[0,999], dinner:[0,999], dishes:[],
    openingHoursRaw:'月–金 07:30–19:50; 土・祝 10:00–17:50', closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://renoir-kandaawajicho.jp/access.html',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13087022/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-tabelog-kansuitei', profile:'TOKYO', area:'地区1️⃣', name:'ひろしま酒蔵 歓粋亭',
    googlePlaceId:'ChIJA3cvTRuMGGAR_HiDac9G6Do', source:'Tabelog', sourceOnly:true,
    cuisine:'海鲜', tags:['海鲜','居酒屋','广岛料理'], address:'東京都千代田区神田淡路町1-1 神田クレストビル 1F',
    lunch:[1000,1999], dinner:[5000,5999], dishes:['カキフライ','小いわし天婦羅','穴子白焼き'],
    openingHoursRaw:'月–金 11:30–14:00, 17:00–23:00（L.O.22:00）', closedDays:['土','日','祝'], closedNote:'土曜日は貸切予約のみ応相談。お盆・年末年始休業あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13112878/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-official-renoir-suidobashi-west', profile:'TOKYO', area:'地区1️⃣', name:'喫茶室ルノアール 水道橋西口店',
    googlePlaceId:'ChIJr8i9lkCMGGARIQjvEBFKvXc', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','喫茶店'], address:'東京都千代田区神田三崎町3-6-13 山京中央ビル 1F',
    dishes:[], openingHoursRaw:'月–土 07:30–22:00; 日祝 08:00–22:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.ginza-renoir.co.jp/shopsearch/shops/tokyo/chiyoda-ku/suidobashi-nishiguchi.html',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']}]
  },
  {
    id:'src-tabelog-gugan', profile:'TOKYO', area:'地区1️⃣', name:'Jazz Bar Gugan',
    googlePlaceId:'ChIJFSK1jQSMGGAR65B_QUQSRBk', source:'Tabelog', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','ジャズバー'], address:'東京都千代田区神田司町2-17-17 タイイチビル B1F',
    dinner:[2000,2999], dishes:[], openingHoursRaw:'月–金 18:00–23:30', closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13161189/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget']},{provider:'official',url:'https://bar-navi.suntory.co.jp/shop/0X00111275/',checkedAt:'2026-09-05',fields:['hours','closure']}]
  },
  {
    id:'src-tabelog-portera', profile:'TOKYO', area:'地区1️⃣', name:'イタリアンバル ポルテラ',
    googlePlaceId:'ChIJfSpPjASMGGARUu9xPUFK1Rk', source:'Tabelog', sourceOnly:true,
    cuisine:'意大利菜', tags:['意大利菜','ワインバー','バル'], address:'東京都千代田区神田司町2-17 タイイチビル 1F',
    lunch:[1000,1999], dinner:[5000,5999], dishes:[], openingHoursRaw:'月–土 11:00–14:00, 17:00–23:00; 祝 11:00–14:30, 17:00–23:00',
    closedDays:['日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13198681/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-ura-bona', profile:'TOKYO', area:'地区1️⃣', name:'URA ぼなっ',
    googlePlaceId:'ChIJNUnNthmNGGARxGdieB978uM', source:'Tabelog', sourceOnly:true,
    cuisine:'咖喱', tags:['咖喱','居酒屋'], address:'東京都文京区本郷3-36-9 白米ビル 2F',
    lunch:[0,999], dinner:[3000,3999], dishes:[], openingHoursRaw:'月–土 11:30–14:30, 17:00–22:30', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131004/13150517/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-gyusho', profile:'TOKYO', area:'地区1️⃣', name:'和牛焼肉 牛正',
    googlePlaceId:'ChIJ6X2dkgSMGGARx4ZIQvpQm6w', source:'Tabelog', sourceOnly:true,
    cuisine:'烤肉', tags:['烤肉','和牛'], address:'東京都千代田区神田司町2-17 あけぼのビル 2F',
    lunch:[1000,1999], dinner:[6000,7999], dishes:['A5和牛','厚切りタン'],
    openingHoursRaw:'月–金 11:30–13:30, 17:00–23:00; 土 17:00–23:00', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13054579/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-mimasuya', profile:'TOKYO', area:'地区1️⃣', name:'みますや',
    googlePlaceId:'ChIJD0ZKkQSMGGARmP9uEaruIAo', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','日本料理','老铺'], address:'東京都千代田区神田司町2-15-2',
    lunch:[1000,1999], dinner:[3000,3999], dishes:['さくら刺身','肉豆腐'],
    openingHoursRaw:'月–金 11:30–13:30, 17:00–22:30; 土 17:00–22:30', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13000643/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-official-tullys-awajicho-yasukuni', profile:'TOKYO', area:'地区1️⃣', name:'タリーズコーヒー 淡路町靖国通り店',
    googlePlaceId:'ChIJHc25sgSMGGARAqITOEMtNxk', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都千代田区神田淡路町1-1-1',
    dishes:[], openingHoursRaw:'毎日 08:00–20:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://shop.tullys.co.jp/detail/1460181',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']}]
  },
  {
    id:'src-tabelog-tullys-kandabashi-hongo', profile:'TOKYO', area:'地区1️⃣', name:'タリーズコーヒー 神田橋本郷通り店',
    googlePlaceId:'ChIJM1B1zgWMGGAR04DJYO1QtR0', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都千代田区内神田1-2-8 楠本第2ビル 1F',
    lunch:[0,999], dinner:[0,999], dishes:[], openingHoursRaw:'月–金 07:00–21:00; 土 08:00–19:00; 日祝 09:00–19:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13090590/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  },
  {
    id:'src-tabelog-jidoriya-kanda', profile:'TOKYO', area:'地区1️⃣', name:'ぢどり屋 神田店',
    googlePlaceId:'ChIJX4pJHwKMGGARyKR-5lGfPYA', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','鸡肉料理','もつ鍋'], address:'東京都千代田区神田司町2-17 あけぼのビル 4F',
    dinner:[3000,3999], dishes:['七輪焼き'], openingHoursRaw:'月–金 17:00–22:00（L.O.21:00）', closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13045544/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-toyozumi-hongo', profile:'TOKYO', area:'地区1️⃣', name:'豊住',
    googlePlaceId:'ChIJcSkHaT2MGGAR0KV1Q0mBPhE', source:'Tabelog', sourceOnly:true,
    cuisine:'食堂', tags:['食堂','定食'], address:'東京都文京区本郷2-11-10',
    lunch:[0,999], dinner:[1000,1999], dishes:['定食'], openingHoursRaw:'月–金 12:00–14:00, 17:00–21:00; 土日 12:00–14:00',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131004/13082979/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  },
  {
    id:'src-official-biryani-osawa', profile:'TOKYO', area:'地区1️⃣', name:'ビリヤニ大澤',
    googlePlaceId:'ChIJMXNbfZCNGGARA2fy1rGY0KA', source:'official', sourceOnly:true,
    cuisine:'印度菜', tags:['印度菜','ビリヤニ','百名店'], address:'東京都千代田区内神田1-15-12 サトウビル B1F',
    lunch:[2000,2999], dinner:[4000,4999], dishes:['マトンビリヤニ','チキンビリヤニ'],
    openingHoursRaw:'完全予約制・不定休。最新営業日は公式カレンダー/SNS参照', closedDays:[], closedNote:'不定休・完全予約制',
    sourceRefs:[{provider:'official',url:'https://osawa.biriyani.co.jp/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours','closure']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13262438/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-tabelog-aikawa-tsukasamachi', profile:'TOKYO', area:'地区1️⃣', name:'あい川 司町店',
    googlePlaceId:'ChIJLf0tjASMGGARSDTzYIiYzno', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', tags:['日式','日本料理'], address:'東京都千代田区神田司町2-17-18',
    lunch:[1000,1999], dinner:[6000,7999], dishes:[], openingHoursRaw:'月–金 11:30–13:00, 17:30–21:30（L.O.21:00）',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13057919/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-official-cappuccetto-rosso', profile:'TOKYO', area:'地区1️⃣', name:'カプチェット・ロッソ',
    googlePlaceId:'ChIJJZS1WhuMGGARi3Ec1n031R4', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','意大利菜','バル'], address:'東京都千代田区神田淡路町2-1 クオリア御茶ノ水 1F',
    lunch:[1000,1999], dinner:[2000,2999], dishes:['ローストビーフ','自家製ミートソースオムライス'],
    openingHoursRaw:'月・土・日・祝 11:30–18:00（L.O.17:30）; 火–金・祝前 11:30–21:00（L.O.20:30）', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://cappuccettorosso.owst.jp/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13197545/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-official-rec-coffee-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'REC COFFEE 水道橋店',
    googlePlaceId:'ChIJd34FSnuNGGARgax6PuL4j_E', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','スペシャルティコーヒー'], address:'東京都千代田区神田三崎町3-10-1',
    dishes:[], openingHoursRaw:'月–金 07:30–20:00; 土日祝 09:00–19:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://rec-coffee.com/pages/coffee-shop-suidobashi',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']}]
  },
  {
    id:'src-official-dominos-awajicho', profile:'TOKYO', area:'地区1️⃣', name:"Domino's Pizza 淡路町",
    googlePlaceId:'ChIJd7fvogSMGGARfHdtBLSTq_k', source:'official', sourceOnly:true,
    cuisine:'披萨', tags:['披萨','外卖','外送'], address:'東京都千代田区神田小川町1-11',
    dinner:[2000,2999], dishes:['ピザ'], openingHoursRaw:'月–金 11:00–00:00; 土日 10:30–00:00', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.dominos.jp/store/87234',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours']},{provider:'Tabelog',url:'https://tabelog.com/tokyo/C13101/C36044/rstLst/pizza/',checkedAt:'2026-09-05',fields:['budget']}]
  },
  {
    id:'src-official-devilcraft-corner', profile:'TOKYO', area:'地区1️⃣', name:'DevilCraft - The Corner',
    googlePlaceId:'ChIJ8YrMy7qNGGARLO2JDbagXNo', source:'official', sourceOnly:true,
    cuisine:'披萨', tags:['披萨','クラフトビール','酒吧'], address:'東京都千代田区内神田1-15-10',
    dishes:['シカゴピザ'], openingHoursRaw:'火–木 17:00–22:30; 金 17:00–23:00; 土 12:00–22:00', closedDays:['日','月'], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.devilcraft.jp/the-corner/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-official-starbucks-iidabashi-igarden', profile:'TOKYO', area:'地区1️⃣', name:'スターバックス コーヒー 飯田橋アイガーデンテラス店',
    googlePlaceId:'ChIJy5iG5ECMGGARnUtzLDHlU3o', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都千代田区飯田橋3-10-9 アイガーデンテラス',
    dishes:[], openingHoursRaw:'月–金 07:00–21:00; 土日祝 07:00–19:00', closedDays:[], closedNote:'不定休',
    sourceRefs:[{provider:'official',url:'https://store.starbucks.co.jp/detail-448/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  }
);
