// Source facts for explicitly reviewed catalog admissions.
// These rows do not create identities by themselves; data/catalog_admissions.json
// is the separate admission ledger. Google Place ID is compatibility-key only.
window.RESTAURANTS.push(...[
  {
    id:'src-catalog-hotpepper-zion',profile:'TOKYO',area:'地区1️⃣',name:'大手町ZION',
    googlePlaceId:'ChIJy7PtkAaMGGARsKefDexKN-4',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J001116639',cuisine:'意大利菜',tags:['意大利菜','居酒屋'],
    dinner:[3001,4000],dishes:[],
    address:'東京都千代田区内神田1-5-16 アルテ大手町1F',
    openingHoursRaw:'月～土、祝日、祝前日: 17:00～22:30',closedDays:['日'],
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ001116639/?vos=nhppalsa000016',checkedAt:'2026-09-06',fields:['name','address','dinnerBudget','hours'],sourceNativeId:'J001116639',priceEvidenceClass:'explicit_range'},
      {provider:'official',url:'https://otemachizion.owst.jp/',checkedAt:'2026-09-06',fields:['name','address','cuisine','hours','closure','currentness']}
    ]
  },
  {
    id:'src-catalog-hotpepper-basecamp',profile:'TOKYO',area:'地区1️⃣',name:'BASE CAMP',
    googlePlaceId:'ChIJ0yEYvTONGGARdrgMhFNR7oA',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J003465000',cuisine:'咖啡',tags:['咖啡','洋食'],
    lunch:[2001,3000],dinner:[3001,4000],dishes:['自家製燻製'],
    address:'東京都千代田区神田三崎町2-22-8 梨本ビル1F',
    openingHoursRaw:'月 17:00–23:30; 火～木 11:30–14:00, 17:00–23:30; 金 17:00–23:30',closedDays:['土','日'],
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ003465000/?vos=nhppalsa000016',checkedAt:'2026-09-06',fields:['name','address','lunchBudget','dinnerBudget'],sourceNativeId:'J003465000',priceEvidenceClass:'explicit_range',evidenceField:'budget.average',evidenceText:'ランチ2001～3000円/ディナー3001～4000円'},
      {provider:'official',url:'https://www.cafe-basecamp.com/about/',checkedAt:'2026-09-06',fields:['name','address','cuisine','hours','closure','currentness']},
      {provider:'official',url:'https://www.cafe-basecamp.com/menu/',checkedAt:'2026-09-06',fields:['dishes']}
    ]
  },
  {
    id:'src-catalog-hotpepper-701',profile:'TOKYO',area:'地区1️⃣',name:'701',
    googlePlaceId:'ChIJLdDA4HiNGGARCcHyQmvL0OI',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J003581555',cuisine:'意大利菜',tags:['意大利菜','法国菜'],
    dinner:[10001,12000],dishes:[],
    address:'東京都千代田区外神田2-1-3 東進ビル新館1F',
    openingHoursRaw:'水～日、祝日: 11:30～15:00, 18:00～22:00',closedDays:['月','火'],
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ003581555/?vos=nhppalsa000016',checkedAt:'2026-09-06',fields:['name','address','cuisine','dinnerBudget','hours'],sourceNativeId:'J003581555',priceEvidenceClass:'explicit_range'},
      {provider:'official',url:'https://ochanomizu-701.foodre.jp/',checkedAt:'2026-09-06',fields:['name','address','closure','currentness']}
    ]
  },
  {
    id:'src-catalog-hotpepper-lyfe',profile:'TOKYO',area:'地区1️⃣',name:'LYFE -酒と飯と-',
    googlePlaceId:'ChIJe-72fACNGGARqtnxQaA1-dg',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J003806900',cuisine:'居酒屋',tags:['居酒屋','日式'],
    dinner:[3001,4000],dishes:[],
    address:'東京都千代田区神田錦町2-4-1 ダヴィンチ小川町1F',
    openingHoursRaw:'月～金 11:00～15:00, 17:00～23:00; 土 17:00～23:00',
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ003806900/?vos=nhppalsa000016',checkedAt:'2026-09-06',fields:['name','address','cuisine','dinnerBudget','hours'],sourceNativeId:'J003806900',priceEvidenceClass:'explicit_range'},
      {provider:'recent_operational_listing',url:'https://job.inshokuten.com/kanto/work/detail/87899?assistLinkCode=11',checkedAt:'2026-09-06',fields:['name','address','currentness']}
    ]
  },
  {
    id:'src-catalog-hotpepper-brochette',profile:'TOKYO',area:'地区1️⃣',name:'焼鳥ブロシェット 飯田橋',
    googlePlaceId:'ChIJc3y8okOMGGARcvEFuVzOJY8',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J001066087',cuisine:'日式',tags:['日式','烧鸟'],
    dinner:[3001,4000],dishes:[],
    address:'東京都千代田区富士見2-2-10',
    openingHoursRaw:'月～日、祝日、祝前日: 18:00～23:00',closedDays:[],
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ001066087/',checkedAt:'2026-09-06',fields:['name','address','cuisine','dinnerBudget','hours','closure'],sourceNativeId:'J001066087',priceEvidenceClass:'explicit_range'},
      {provider:'TableCheck',url:'https://www.tablecheck.com/en/yakitori-brochette-iidabashi',checkedAt:'2026-09-06',fields:['name','address','cuisine','currentness']}
    ]
  },
  {
    id:'src-catalog-hotpepper-sapana',profile:'TOKYO',area:'地区1️⃣',name:'SAPANA 水道橋西口店',
    googlePlaceId:'ChIJN9mduz-MGGAR53bCFr3JZro',source:'Hot Pepper',sourceOnly:true,
    hotpepperId:'J001126936',cuisine:'亚洲・民族',tags:['亚洲・民族','印度菜','泰国菜','越南菜','尼泊尔菜'],
    dinner:[3001,4000],dishes:[],
    address:'東京都千代田区神田三崎町2-20-8 FUNDES水道橋1F',
    openingHoursRaw:'月～日 06:00～翌6:00',closedDays:[],
    sourceRefs:[
      {provider:'Hot Pepper',url:'https://www.hotpepper.jp/strJ001126936/?vos=nhppalsa000016',checkedAt:'2026-09-06',fields:['name','address','dinnerBudget','hours'],sourceNativeId:'J001126936',priceEvidenceClass:'explicit_range'},
      {provider:'official',url:'https://www.sapana-group.com/%E6%B0%B4%E9%81%93%E6%A9%8B%E8%A5%BF%E5%8F%A3%E5%BA%97',checkedAt:'2026-09-06',fields:['name','address','cuisine','hours','closure','currentness']}
    ]
  }
]);
