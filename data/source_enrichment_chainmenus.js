// Brand-level official menu claims for exact production Place IDs.
// These rows intentionally use `representative`/`signature` semantics rather than
// strict recommendation semantics. Availability can vary by branch; the public
// field is a representative specialty, not a promise of current stock.

const CHAIN_MENU_CHECKED_AT = '2026-09-06';

const chainMenuRows = [
  // TULLY'S COFFEE — stable core drink shown on the official product menu.
  ['ChIJH8GYiROMGGARAjxscGAOoIA','タリーズコーヒー 神保町店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJqxsi-ECMGGAR9MgoPJ4JWHw','タリーズコーヒー 飯田橋ガーデンエアタワー店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJHc25sgSMGGARAqITOEMtNxk','タリーズコーヒー 淡路町靖国通り店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJM1B1zgWMGGAR04DJYO1QtR0','タリーズコーヒー 神田橋本郷通り店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJCRf6uziMGGARPOpXUziKe7s','タリーズコーヒー','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJVwXD9E6NGGARkHzeYVBeacw','タリーズコーヒー 住友不動産秋葉原ファーストビル・テラス店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],

  // Starbucks — official menu describes this as a standard espresso beverage.
  ['ChIJOWqVHj-MGGARZd0fgS_r3tI','スターバックス コーヒー 東京ドームシティ ミーツポート店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJ2WGN9heMGGARIpk8EbXf8b4','スターバックス コーヒー 順天堂医院店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJy5iG5ECMGGARnUtzLDHlU3o','スターバックス コーヒー 飯田橋アイガーデンテラス店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJNfqy4EaMGGAR51sW_7PltDQ','スターバックス','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],

  // Doutor — current official Milano Sandwich menu.
  ['ChIJj2u4pwSMGGARkTHj4PP1MEA','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJDVdSfmmMGGARn19s9XYBdOY','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJd50aRRyMGGARvomrfrvV6ZY','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJb1NJHRSMGGARQHQ71gBl4Dg','ドトールコーヒーショップ 神保町白山通り店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJq-tfOBGMGGARFR9OxPRRFrc','ドトールコーヒーショップ 神保町駅前店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJpevAiRSMGGARJ3j_AniCivM','ドトールコーヒーショップ 神保町三丁目店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],

  // Torikizoku — official menu explicitly calls Momokizokuyaki a signature item.
  ['ChIJ2-3vOBGMGGARfV2l_yc58W0','鳥貴族 神保町店','https://torikizoku.co.jp/menu/yakitori/',['もも貴族焼(たれ)'],[{nameJa:'もも貴族焼(たれ)',nameZh:'招牌鸡腿贵族烧（酱汁）',kind:'signature'}]],
  ['ChIJE0-B9UOMGGARWVhWjJKsoq4','鳥貴族','https://torikizoku.co.jp/menu/yakitori/',['もも貴族焼(たれ)'],[{nameJa:'もも貴族焼(たれ)',nameZh:'招牌鸡腿贵族烧（酱汁）',kind:'signature'}]],

  // Hanamaru Udon — official menu identifies kake udon as a representative Sanuki style.
  ['ChIJVyqVQxGMGGARAMwOpJAO12U','はなまるうどん 神保町店','https://www.hanamaruudon.com/menu/index.html',['かけ'],[{nameJa:'かけ',nameZh:'汤汁乌冬面',kind:'representative'}]],
  ['ChIJ5YT9g0CMGGARiXS-Am4vk1M','はなまるうどん 水道橋西口店','https://www.hanamaruudon.com/menu/index.html',['かけ'],[{nameJa:'かけ',nameZh:'汤汁乌冬面',kind:'representative'}]],

  // Royal Host — official menu calls the Black x Black hamburger a house specialty.
  ['ChIJCQOApBGMGGARtd0fPNBMuHc','ロイヤルホスト 神田神保町店','https://www.royalhost.jp/menu/grand/kurokuro_hamburg/black-black-hamburger-steak.html',['黒×黒ハンバーグ'],[{nameJa:'黒×黒ハンバーグ',nameZh:'黑×黑汉堡肉排',kind:'signature'}]],

  // CoCo Ichibanya — base curry is the stable core of the official ordering flow.
  ['ChIJ72nZrlqNGGARuIt0IyoUDiU','カレーハウスCoCo壱番屋 水道橋外堀通り店','https://www.ichibanya.co.jp/menu/order.html',['ポークカレー'],[{nameJa:'ポークカレー',nameZh:'猪肉咖喱',kind:'representative'}]],

  // Tsujita — official menu states these are signature / popular products and lists serving stores.
  ['ChIJq6qfygSMGGARJgbpmoWLoUg','つじ田 神田御茶ノ水店','https://tsukemen-tsujita.com/menu/noukoutsukemen/',['濃厚つけ麺'],[{nameJa:'濃厚つけ麺',nameZh:'浓厚蘸面',kind:'signature'}]],
  ['ChIJNRfophqMGGARU_M1YQ8LZPo','成都正宗担々麺 つじ田','https://tsukemen-tsujita.com/menu/masamunetantanmen-shirunashi/',['正宗担々麺 汁なし'],[{nameJa:'正宗担々麺 汁なし',nameZh:'正宗干拌担担面',kind:'representative'}]]
];

window.RESTAURANTS.push(...chainMenuRows.map(([googlePlaceId,name,sourceUrl,dishes]) => ({
  id:`src-chainmenu-${googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,
  profile:'TOKYO',
  area:'地区1️⃣',
  name,
  googlePlaceId,
  source:'official',
  sourceOnly:true,
  dishes,
  sourceRefs:[{provider:'official',url:sourceUrl,checkedAt:CHAIN_MENU_CHECKED_AT,fields:['dishes']}]
})));

window.FEATURED_DISHES ||= [];
window.FEATURED_DISHES.push(...chainMenuRows.map(([googlePlaceId,_name,sourceUrl,_legacy,dishes]) => ({
  googlePlaceId,
  dishes,
  sourceUrl,
  checkedAt:CHAIN_MENU_CHECKED_AT
})));
