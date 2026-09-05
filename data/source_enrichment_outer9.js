// Source-backed enrichment for the ninth Area1 production batch.
// Each record binds durable branch facts only to the exact verified Google Place ID.

window.RESTAURANTS.push(
  {
    id:'src-tabelog-bar-cocopelli', profile:'TOKYO', area:'地区1️⃣', name:'Bar Cocopelli',
    googlePlaceId:'ChIJP2sO_hqMGGARiEwxREIq7yY', source:'Tabelog', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧'], address:'東京都千代田区神田淡路町1-15 藤掛ビル 1F',
    dinner:[3000,3999], dishes:[],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13166642/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget']}]
  },
  {
    id:'src-tabelog-gyoza-sakaba-kichi', profile:'TOKYO', area:'地区1️⃣', name:'餃子酒場・吉',
    googlePlaceId:'ChIJ17dALKONGGARwpbTKxQ1_Mw', source:'Tabelog', sourceOnly:true,
    cuisine:'中华', tags:['中华','居酒屋','饺子','创作料理'], address:'東京都千代田区神田三崎町3-6-1 BACHビル 1F',
    lunch:[0,999], dinner:[3000,3999], dishes:['手作り餃子'],
    openingHoursRaw:'毎日 11:00–14:30, 16:30–23:30', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13272984/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours']}]
  },
  {
    id:'src-tabelog-chachaya', profile:'TOKYO', area:'地区1️⃣', name:'ちゃちゃ屋',
    googlePlaceId:'ChIJTR05wn-OGGAR86zxWe0jeoY', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋'], address:'東京都千代田区神田小川町1-4-1 三谷ビル B1F',
    dinner:[3000,3999], dishes:[], openingHoursRaw:'月–金 11:00–14:00, 17:00–23:00',
    closedDays:['土','日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13306794/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-doraku-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'個室居酒屋 道らく 水道橋店',
    googlePlaceId:'ChIJPWoXokCNGGARxeHVQaeFwAw', source:'Tabelog', sourceOnly:true,
    cuisine:'居酒屋', tags:['居酒屋','海鲜','烧鸟'], address:'東京都千代田区神田三崎町3-7-12 原田ビル 2F',
    dinner:[2000,2999], dishes:[], openingHoursRaw:'毎日 11:00–00:00', closedDays:[], closedNote:'定休日なし',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131003/13229596/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-hananowan', profile:'TOKYO', area:'地区1️⃣', name:'イタリア風食彩 幸三郎 花乃碗',
    googlePlaceId:'ChIJkYyE7gSMGGARNuyvrhRFIiw', source:'Tabelog', sourceOnly:true,
    cuisine:'意大利菜', tags:['意大利菜'], address:'東京都千代田区神田美土代町11-8 SK美土代町ビル B1F',
    lunch:[1000,1999], dinner:[10000,14999], dishes:[], closedDays:['日','祝'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13011650/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','closure']}]
  },
  {
    id:'src-official-goemon-suidobashi', profile:'TOKYO', area:'地区1️⃣', name:'洋麺屋五右衛門 水道橋店',
    googlePlaceId:'ChIJOYGoSUWNGGAR4GmnaQ1aRuU', source:'official', sourceOnly:true,
    cuisine:'意大利菜', tags:['意大利菜','意面'], address:'東京都千代田区神田三崎町3-7-12 清話會ビル 1F',
    dishes:['スパゲッティ'], openingHoursRaw:'11:30–21:30（L.O. 21:00）', closedDays:[], closedNote:null,
    sourceRefs:[{provider:'official',url:'https://www.yomenya-goemon.com/store/kanto/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours']}]
  },
  {
    id:'src-official-starbucks-tokyo-dome-meets-port', profile:'TOKYO', area:'地区1️⃣', name:'スターバックス コーヒー 東京ドームシティ ミーツポート店',
    googlePlaceId:'ChIJB3s29-CoGGARCoMkZKkfk4Y', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都文京区後楽1-3-61 東京ドームシティ ミーツポート 1F',
    dishes:[], openingHoursRaw:'07:00–22:30', closedDays:[], closedNote:'不定休',
    sourceRefs:[{provider:'official',url:'https://store.starbucks.co.jp/detail-770/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-tabelog-ethiopia-curry-kitchen-sola-city', profile:'TOKYO', area:'地区1️⃣', name:'エチオピア カリーキッチン 御茶ノ水ソラシティ店',
    googlePlaceId:'ChIJ-zWJWBeMGGAR3xjpbC2T0F4', source:'Tabelog', sourceOnly:true,
    cuisine:'咖喱', tags:['咖喱','印度菜','便当'], address:'東京都千代田区神田駿河台4-6 御茶ノ水ソラシティ B1F',
    lunch:[1000,1999], dinner:[1000,1999], dishes:['カリー'],
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13154753/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes']}]
  },
  {
    id:'src-tabelog-new-yorkers-cafe-surugadai4', profile:'TOKYO', area:'地区1️⃣', name:"NEW YORKER'S Cafe 駿河台4丁目店",
    googlePlaceId:'ChIJe16F5T6MGGARu6gbV4qNbKg', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','喫茶店'], address:'東京都千代田区神田駿河台4-1-1 ウエルトンビル 1F',
    lunch:[0,999], dinner:[0,999], dishes:[], openingHoursRaw:'月–金 07:00–22:00; 土 08:00–22:00; 日祝 08:00–21:30',
    closedDays:[], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13086953/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours']}]
  },
  {
    id:'src-tabelog-tsukemen-kinryu', profile:'TOKYO', area:'地区1️⃣', name:'つけめん金龍',
    googlePlaceId:'ChIJ-WvcokyNGGAR5Q17zKd9JNA', source:'Tabelog', sourceOnly:true,
    cuisine:'拉面', tags:['拉面','つけ麺'], address:'東京都千代田区神田司町2-15-16 サトウビル 1F',
    lunch:[1000,1999], dinner:[1000,1999], dishes:['つけめん'], openingHoursRaw:'10:45–15:00, 17:30–20:30',
    closedDays:[], closedNote:'臨時休業日は月ごとに変動',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13259807/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','dishes','hours','closure']}]
  },
  {
    id:'src-tabelog-fukusui', profile:'TOKYO', area:'地区1️⃣', name:'中華料理 福すい',
    googlePlaceId:'ChIJ1jsaSRyMGGARv45t1JZQHhs', source:'Tabelog', sourceOnly:true,
    cuisine:'中华', tags:['中华','拉面'], address:'東京都千代田区神田小川町1-11-37',
    dishes:[], openingHoursRaw:'月–金 11:30–14:30', closedDays:['土','日'], closedNote:null,
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13126286/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-official-hannari', profile:'TOKYO', area:'地区1️⃣', name:'京おばんざい はんなり',
    googlePlaceId:'ChIJr5QuYhuMGGAR21Sb2mQr-Jc', source:'official', sourceOnly:true,
    cuisine:'日式', tags:['日式','京料理','おばんざい'], address:'東京都千代田区神田淡路町1-9 ニューお茶の水ビル 1F',
    lunch:[1000,1999], dinner:[6000,7999], dishes:['おばんざい'], openingHoursRaw:'11:30–13:30, 17:00–22:30',
    closedDays:[], closedNote:null,
    sourceRefs:[
      {provider:'official',url:'https://www.han-nari.net/',checkedAt:'2026-09-05',fields:['name','cuisine','address','dishes','hours']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13109015/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  },
  {
    id:'src-official-sujya-kanda', profile:'TOKYO', area:'地区1️⃣', name:'スジャ食堂 神田店',
    googlePlaceId:'ChIJ73a1cnuNGGAR35wziPY-IgE', source:'official', sourceOnly:true,
    cuisine:'韩国菜', tags:['韩国菜','居酒屋'], address:'東京都千代田区神田小川町1-1-15 D&F御茶ノ水ビル 2F',
    lunch:[0,999], dinner:[3000,3999], dishes:['石焼ビビンパ','サムゲタン','純豆腐チゲ'],
    openingHoursRaw:'月–金 11:00–15:00, 17:00–23:00; 土 11:00–15:00, 17:00–22:00', closedDays:['日','祝'], closedNote:null,
    sourceRefs:[
      {provider:'official',url:'https://sujya-kanda-yoyaku.com/',checkedAt:'2026-09-05',fields:['name','address','hours','dishes']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13288068/',checkedAt:'2026-09-05',fields:['cuisine','budget','closure']}
    ]
  },
  {
    id:'src-official-starbucks-juntendo', profile:'TOKYO', area:'地区1️⃣', name:'スターバックス コーヒー 順天堂医院店',
    googlePlaceId:'ChIJW2z0riGMGGARlBIaNWR1Mxc', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都文京区本郷3-1-3 順天堂大学医学部附属順天堂医院 1号館',
    dishes:[], openingHoursRaw:'月–土 07:00–20:00; 日祝 10:00–19:00', closedDays:[], closedNote:'第2土曜日は短縮営業の場合あり。臨時変更あり',
    sourceRefs:[{provider:'official',url:'https://store.starbucks.co.jp/detail-600/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-tabelog-cafe33-kitanomaru', profile:'TOKYO', area:'地区1️⃣', name:'CAFÉ 33',
    googlePlaceId:'ChIJ9Q63Zw-NGGARa1bDnK2msUA', source:'Tabelog', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡','披萨'], address:'東京都千代田区北の丸公園1-1',
    lunch:[0,999], dinner:[0,999], dishes:[], openingHoursRaw:'毎日 09:00–17:00',
    closedDays:[], closedNote:'北の丸公園の営業およびイベントにより変更あり',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130906/13273995/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-tabelog-siam-celadon-sola-city', profile:'TOKYO', area:'地区1️⃣', name:'サイアムセラドン 御茶ノ水ソラシティ店',
    googlePlaceId:'ChIJl3Zm6geNGGARnYCcTIghebg', source:'Tabelog', sourceOnly:true,
    cuisine:'泰国菜', tags:['泰国菜','ダイニングバー','居酒屋'], address:'東京都千代田区神田駿河台4-6 御茶ノ水ソラシティ B1F',
    lunch:[1000,1999], dinner:[3000,3999], dishes:[], openingHoursRaw:'月–金 11:00–23:00; 土日祝 11:00–22:00',
    closedDays:[], closedNote:'施設休館日に準ずる',
    sourceRefs:[{provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13154169/',checkedAt:'2026-09-05',fields:['name','cuisine','address','budget','hours','closure']}]
  },
  {
    id:'src-official-yebisu-bar-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'YEBISU BAR 御茶ノ水店',
    googlePlaceId:'ChIJu2TBYReMGGARVgzqtqdAyz4', source:'official', sourceOnly:true,
    cuisine:'酒吧', tags:['酒吧','ビアバー'], address:'東京都千代田区神田駿河台4-6 御茶ノ水ソラシティ B1F',
    dishes:[], openingHoursRaw:'月–木 11:30–22:00; 金 11:30–22:30; 土 11:30–22:00; 日祝 11:30–21:00',
    closedDays:[], closedNote:'年末年始休業あり',
    sourceRefs:[{provider:'official',url:'https://www.ginzalion.jp/shop/brand/yebisubar/shop64.html',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']}]
  },
  {
    id:'src-official-yanaka-coffee-kanda', profile:'TOKYO', area:'地区1️⃣', name:'やなか珈琲店 神田店',
    googlePlaceId:'ChIJw3SZsRuMGGAR6FeN-M5KZ74', source:'official', sourceOnly:true,
    cuisine:'咖啡', tags:['咖啡'], address:'東京都千代田区神田淡路町1-1',
    lunch:[0,999], dinner:[0,999], dishes:[], openingHoursRaw:'月–金 10:00–20:00; 土日祝 11:00–19:00',
    closedDays:[], closedNote:'定休日なし',
    sourceRefs:[
      {provider:'official',url:'https://www.yanaka-coffeeten.com/shop/',checkedAt:'2026-09-05',fields:['name','cuisine','address','hours','closure']},
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13030735/',checkedAt:'2026-09-05',fields:['budget']}
    ]
  }
);
