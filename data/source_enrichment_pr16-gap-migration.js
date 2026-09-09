// Reviewed source-only facts recovered from legacy PR #16.
// Originally checked 2026-09-06; migrated 2026-09-09 into the current source graph.
// These rows cannot create identities: exact frozen Google Place IDs are compatibility keys only.
// Legacy RECOMMENDED_DISHES rows are intentionally NOT copied here; recommendation promotion remains separately reviewed.

window.RESTAURANTS.push(...[
  {
    id:'src-pr16-little-marco', profile:'TOKYO', area:'地区1️⃣', name:'トラットリア リトルマルコ',
    googlePlaceId:'ChIJu7qJqhyMGGARbJMAT8uPgtY', source:'official', sourceOnly:true,
    cuisine:'意大利菜', address:'東京都千代田区神田淡路町1-4-1 友泉淡路町ビル1F',
    lunch:[1001,2000], dinner:[4001,5000], dishes:['US産サーロインステーキ'],
    openingHoursRaw:'月–金 11:30–14:30, 17:00–23:00; 土 15:00–23:00', closedDays:['日','祝'],
    sourceRefs:[
      {provider:'official',url:'https://daiwa-j.com/brands/trattorialittlemarco/',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']},
      {provider:'official',url:'https://page.line.me/zgq3900x',checkedAt:'2026-09-06',fields:['budget']}
    ]
  },
  {
    id:'src-pr16-choice', profile:'TOKYO', area:'地区1️⃣', name:'神田 旬菜 ちょいす',
    googlePlaceId:'ChIJJ1RwYAOMGGARr5m-pugtpzE', source:'official', sourceOnly:true,
    cuisine:'居酒屋', address:'東京都千代田区神田須田町1-4 Y101ビルB1',
    openingHoursRaw:'月–金 17:00–23:30', closedDays:['土','日','祝'],
    sourceRefs:[
      {provider:'official',url:'https://choice.foodre.jp/',checkedAt:'2026-09-06',fields:['name','cuisine','address','hours','closure']}
    ]
  },
  {
    id:'src-pr16-botan', profile:'TOKYO', area:'地区1️⃣', name:'ぼたん',
    googlePlaceId:'ChIJ9zuhtByMGGARx4--ZNpSWJc', source:'official', sourceOnly:true,
    cuisine:'日式', address:'東京都千代田区神田須田町1-15',
    lunch:[10001,12000], dinner:[10001,12000], dishes:['鳥すきやき'],
    sourceRefs:[
      {provider:'official',url:'https://www.sukiyaki-botan.jp/honten',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes']},
      {provider:'official',url:'https://sukiyaki-botan.owst.jp/',checkedAt:'2026-09-06',fields:['budget']}
    ]
  },
  {
    id:'src-pr16-tokyo-mamehana', profile:'TOKYO', area:'地区1️⃣', name:'東京豆花工房',
    googlePlaceId:'ChIJT9HCuRyMGGARqIt735A6L1k', source:'curated', sourceOnly:true,
    cuisine:'台湾菜', address:'東京都千代田区神田須田町1-19', dishes:['原味豆花','東京豆花'],
    openingHoursRaw:'月・火・木–日・祝 11:30–19:00', closedDays:['水'],
    sourceRefs:[
      {provider:'Visit Chiyoda',url:'https://visit-chiyoda.tokyo/app/spot/detail/908',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-kanda-matsuya', profile:'TOKYO', area:'地区1️⃣', name:'神田まつや',
    googlePlaceId:'ChIJQ3MESwOMGGARX99d47o0V6k', source:'curated', sourceOnly:true,
    cuisine:'荞麦面', address:'東京都千代田区神田須田町1-13', dishes:['もりそば','かしわ南蛮そば'],
    openingHoursRaw:'月–金 11:00–20:30; 土・祝 11:00–19:30', closedDays:['日'],
    sourceRefs:[
      {provider:'Visit Chiyoda',url:'https://visit-chiyoda.tokyo/app/spot/detail/359',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-kanda-yabusoba', profile:'TOKYO', area:'地区1️⃣', name:'かんだやぶそば',
    googlePlaceId:'ChIJX-yVohyMGGARUTdpnpXyQNQ', source:'curated', sourceOnly:true,
    cuisine:'荞麦面', address:'東京都千代田区神田淡路町2-10', dishes:['そばとろ','鴨せいろうそば'],
    openingHoursRaw:'月・火・木–日・祝 11:30–20:30', closedDays:['水'],
    sourceRefs:[
      {provider:'Visit Chiyoda',url:'https://visit-chiyoda.tokyo/app/spot/detail/382',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-kanda-shinoda', profile:'TOKYO', area:'地区1️⃣', name:'神田志乃多寿司',
    googlePlaceId:'ChIJa-BaVhuMGGARouYQYPE4Zfo', source:'curated', sourceOnly:true,
    cuisine:'寿司', address:'東京都千代田区神田淡路町2-2', dishes:['稲荷寿司','のり巻'],
    openingHoursRaw:'月・水–日・祝 07:30–18:00', closedDays:['火'],
    sourceRefs:[
      {provider:'Visit Chiyoda',url:'https://visit-chiyoda.tokyo/app/spot/detail/365',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-yamaya-ochanomizu', profile:'TOKYO', area:'地区1️⃣', name:'博多もつ鍋やまや 御茶ノ水ワテラス店',
    googlePlaceId:'ChIJo5orgxyMGGARW6EJMAe0WOE', source:'official', sourceOnly:true,
    cuisine:'日式', address:'東京都千代田区神田淡路町2-105 ワテラスアネックス2階',
    dishes:['博多もつ鍋','名物 ごまさば'], openingHoursRaw:'毎日 11:00–15:00, 17:00–22:30', closedDays:[],
    sourceRefs:[
      {provider:'official',url:'https://www.restaurant-yamaya.com/brand/motsu/restaurant/ochanomizu_w',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-restaurant-morocco', profile:'TOKYO', area:'地区1️⃣', name:'RESTAURANT MOROCCO TOKYO',
    googlePlaceId:'ChIJjX2UEKaNGGARqhp9myAPFiw', source:'curated', sourceOnly:true,
    cuisine:'摩洛哥菜', address:'東京都千代田区内神田1-5-9', dishes:['タジン鍋','クスクス'],
    openingHoursRaw:'月–土 11:30–14:30, 17:30–23:00', closedDays:['日'],
    sourceRefs:[
      {provider:'Visit Chiyoda',url:'https://visit-chiyoda.tokyo/app/spot/detail/789',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-mannish', profile:'TOKYO', area:'地区1️⃣', name:'塩生姜らー麺専門店 MANNISH 淡路町本店',
    googlePlaceId:'ChIJ34CgHASMGGARG5poMVhiB1w', source:'Tabelog', sourceOnly:true,
    cuisine:'拉面', address:'東京都千代田区神田司町2-2-8 マガザン神田1F',
    lunch:[1000,1999], dinner:[1000,1999], dishes:['塩生姜らー麺'],
    openingHoursRaw:'月–金 11:00–23:00; 土・日・祝 11:00–15:00', closedDays:[],
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13231004/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget','hours','closure']},
      {provider:'Tokyo Ramen of the Year',url:'https://tokyoramenoftheyear.com/ja/shop/shop-00300',checkedAt:'2026-09-06',fields:['dishes']}
    ]
  },
  {
    id:'src-pr16-shoeitei', profile:'TOKYO', area:'地区1️⃣', name:'松榮亭',
    googlePlaceId:'ChIJC69wrxyMGGARRfwOxHOPJUc', source:'Tabelog', sourceOnly:true,
    cuisine:'洋食', address:'東京都千代田区神田淡路町2-8', lunch:[1000,1999], dinner:[1000,1999],
    openingHoursRaw:'月–土 11:00–14:30, 17:00–19:30', closedDays:['日','祝'],
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13000349/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget','hours','closure']}
    ]
  },
  {
    id:'src-pr16-el-chateo', profile:'TOKYO', area:'地区1️⃣', name:'エル・チャテオ・デル・プエンテ',
    googlePlaceId:'ChIJib0TiByMGGARoxZpQdO40dM', source:'Tabelog', sourceOnly:true,
    cuisine:'西班牙菜', address:'東京都千代田区神田淡路町2-9 JR高架下1 昌平橋',
    lunch:[1000,1999], dinner:[5000,5999],
    openingHoursRaw:'月–金 11:30–15:00, 17:00–23:00; 土 11:30–16:00, 17:00–23:00; 日・祝 12:00–21:00', closedDays:[],
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13040507/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget','hours','closure']}
    ]
  },
  {
    id:'src-pr16-kaijo-saikan', profile:'TOKYO', area:'地区1️⃣', name:'海上菜館',
    googlePlaceId:'ChIJH45U0y2NGGARFO8F9X8I1nA', source:'official', sourceOnly:true,
    cuisine:'中华', address:'東京都千代田区内神田1-7-8 大手町佐野ビルディングB1',
    dishes:['焼き餃子','パーコー麺'], openingHoursRaw:'月–金 11:00–14:00, 17:00–22:20', closedDays:['土','日','祝'],
    sourceRefs:[
      {provider:'official',url:'https://kaijyousaikan.foodre.jp/',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-awashell', profile:'TOKYO', area:'地区1️⃣', name:'泡貝',
    googlePlaceId:'ChIJZW-28RuMGGARyK-E3vgwKic', source:'official', sourceOnly:true,
    cuisine:'意大利菜', address:'東京都千代田区外神田2-1-6 宝生ビル1F',
    dishes:['シェルアンドチップス','生牡蠣'], openingHoursRaw:'毎日 11:30–15:00, 17:00–23:30', closedDays:[],
    sourceRefs:[
      {provider:'official',url:'https://awashell.com/',checkedAt:'2026-09-06',fields:['name','cuisine','address','dishes','hours','closure']}
    ]
  },
  {
    id:'src-pr16-bar-anami', profile:'TOKYO', area:'地区1️⃣', name:'BAR ANAMI',
    googlePlaceId:'ChIJlZV_LwqNGGARYv0gSCBaRi4', source:'curated', sourceOnly:true,
    cuisine:'酒吧', address:'東京都千代田区神田司町2-7-6 鈴木ビル1F', dinner:[3000,4999],
    sourceRefs:[
      {provider:'Suntory BAR-NAVI',url:'https://bar-navi.suntory.co.jp/shop/S000007547/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget']}
    ]
  },
  {
    id:'src-pr16-farine-kimuraya', profile:'TOKYO', area:'地区1️⃣', name:'ファリーヌ キムラヤ',
    googlePlaceId:'ChIJ62feckGMGGARv9xYxwMWrnU', source:'Tabelog', sourceOnly:true,
    cuisine:'面包・烘焙', address:'東京都千代田区飯田橋2-9-5 キムラヤビル1F', lunch:[0,999],
    openingHoursRaw:'月–金 06:30–18:00; 土 06:30–16:30', closedDays:['日','祝'],
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1309/A130905/13033057/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget','hours','closure']}
    ]
  },
  {
    id:'src-pr16-yatsudeya', profile:'TOKYO', area:'地区1️⃣', name:'八ツ手屋',
    googlePlaceId:'ChIJ0W7HkgOMGGARSdJEu-NnDB4', source:'Tabelog', sourceOnly:true,
    cuisine:'日式', address:'東京都千代田区神田司町2-16', lunch:[1000,1999],
    openingHoursRaw:'月–金 11:00–14:00', closedDays:['土','日','祝'],
    sourceRefs:[
      {provider:'Tabelog',url:'https://tabelog.com/tokyo/A1310/A131002/13000382/',checkedAt:'2026-09-06',fields:['name','cuisine','address','budget','hours','closure']}
    ]
  }
]);
