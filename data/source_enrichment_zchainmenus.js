// Official brand-menu patches keyed by exact production Place ID.
// This shard sorts after the ordinary source_enrichment shards and augments an
// existing official row when one exists. That keeps the invariant of one
// official enrichment row per Place ID while allowing store pages to own
// address/hours and brand-menu pages to own dishes.
//
// `representative` means a stable/core item from the current official menu.
// `signature` is reserved for items the official source describes as a house
// specialty / 名物 / 看板. `recommended` is used only for explicit popular or
// recommended wording. Availability can still vary by branch.

const CHAIN_MENU_CHECKED_AT = '2026-09-06';

const chainMenuPatches = [
  // TULLY'S COFFEE
  ['ChIJH8GYiROMGGARAjxscGAOoIA','タリーズコーヒー 神保町店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJqxsi-ECMGGAR9MgoPJ4JWHw','タリーズコーヒー 飯田橋ガーデンエアタワー店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJHc25sgSMGGARAqITOEMtNxk','タリーズコーヒー 淡路町靖国通り店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJM1B1zgWMGGAR04DJYO1QtR0','タリーズコーヒー 神田橋本郷通り店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJCRf6uziMGGARPOpXUziKe7s','タリーズコーヒー','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],
  ['ChIJVwXD9E6NGGARkHzeYVBeacw','タリーズコーヒー 住友不動産秋葉原ファーストビル・テラス店','https://www.tullys.co.jp/menu/drink/coffee/honey_m.html',['ハニーミルクラテ'],[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}]],

  // Starbucks
  ['ChIJOWqVHj-MGGARZd0fgS_r3tI','スターバックス コーヒー 東京ドームシティ ミーツポート店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJ2WGN9heMGGARIpk8EbXf8b4','スターバックス コーヒー 順天堂医院店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJy5iG5ECMGGARnUtzLDHlU3o','スターバックス コーヒー 飯田橋アイガーデンテラス店','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],
  ['ChIJNfqy4EaMGGAR51sW_7PltDQ','スターバックス','https://menu.starbucks.co.jp/4524785000230',['スターバックス ラテ'],[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}]],

  // Doutor
  ['ChIJj2u4pwSMGGARkTHj4PP1MEA','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJDVdSfmmMGGARn19s9XYBdOY','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJd50aRRyMGGARvomrfrvV6ZY','ドトールコーヒーショップ','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJb1NJHRSMGGARQHQ71gBl4Dg','ドトールコーヒーショップ 神保町白山通り店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJq-tfOBGMGGARFR9OxPRRFrc','ドトールコーヒーショップ 神保町駅前店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],
  ['ChIJpevAiRSMGGARJ3j_AniCivM','ドトールコーヒーショップ 神保町三丁目店','https://www.doutor.co.jp/app/dcs/menu/list/milano.html',['ミラノサンドA'],[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}]],

  // Torikizoku / Hanamaru / Royal Host / CoCo Ichibanya / Tsujita
  ['ChIJ2-3vOBGMGGARfV2l_yc58W0','鳥貴族 神保町店','https://torikizoku.co.jp/menu/yakitori/',['もも貴族焼(たれ)'],[{nameJa:'もも貴族焼(たれ)',nameZh:'招牌鸡腿贵族烧（酱汁）',kind:'signature'}]],
  ['ChIJE0-B9UOMGGARWVhWjJKsoq4','鳥貴族','https://torikizoku.co.jp/menu/yakitori/',['もも貴族焼(たれ)'],[{nameJa:'もも貴族焼(たれ)',nameZh:'招牌鸡腿贵族烧（酱汁）',kind:'signature'}]],
  ['ChIJVyqVQxGMGGARAMwOpJAO12U','はなまるうどん 神保町店','https://www.hanamaruudon.com/menu/index.html',['かけ'],[{nameJa:'かけ',nameZh:'汤汁乌冬面',kind:'representative'}]],
  ['ChIJ5YT9g0CMGGARiXS-Am4vk1M','はなまるうどん 水道橋西口店','https://www.hanamaruudon.com/menu/index.html',['かけ'],[{nameJa:'かけ',nameZh:'汤汁乌冬面',kind:'representative'}]],
  ['ChIJCQOApBGMGGARtd0fPNBMuHc','ロイヤルホスト 神田神保町店','https://www.royalhost.jp/menu/grand/kurokuro_hamburg/black-black-hamburger-steak.html',['黒×黒ハンバーグ'],[{nameJa:'黒×黒ハンバーグ',nameZh:'黑×黑汉堡肉排',kind:'signature'}]],
  ['ChIJ72nZrlqNGGARuIt0IyoUDiU','カレーハウスCoCo壱番屋 水道橋外堀通り店','https://www.ichibanya.co.jp/menu/order.html',['ポークカレー'],[{nameJa:'ポークカレー',nameZh:'猪肉咖喱',kind:'representative'}]],
  ['ChIJq6qfygSMGGARJgbpmoWLoUg','つじ田 神田御茶ノ水店','https://tsukemen-tsujita.com/menu/noukoutsukemen/',['濃厚つけ麺'],[{nameJa:'濃厚つけ麺',nameZh:'浓厚蘸面',kind:'signature'}]],
  ['ChIJNRfophqMGGARU_M1YQ8LZPo','成都正宗担々麺 つじ田','https://tsukemen-tsujita.com/menu/masamunetantanmen-shirunashi/',['正宗担々麺 汁なし'],[{nameJa:'正宗担々麺 汁なし',nameZh:'正宗干拌担担面',kind:'representative'}]],

  // Additional current official-brand menu coverage.
  ['ChIJW4ph90OMGGARdlhIHYAGMRw','カフェ・ド・クリエ','https://c-united.co.jp/crie/drink/',['ソルベージュ®エスプレッソ'],[{nameJa:'ソルベージュ®エスプレッソ',nameZh:'浓缩咖啡冰沙',kind:'representative'}]],
  ['ChIJK-zPABCMGGARny83K5PNya0','まぐろ市場','https://www.giraud.co.jp/maguro-ichiba-u/',['海鮮丼'],[{nameJa:'海鮮丼',nameZh:'海鲜盖饭',kind:'representative'}]],
  ['ChIJ-YkEWBeMGGARfOUCHahbddE','ナポリの下町食堂','https://www.giraud.co.jp/napoli',['ズッパフォルテ'],[{nameJa:'ズッパフォルテ',nameZh:'那不勒斯辣味内脏炖汤',kind:'signature'}]],
  ['ChIJB2nh4jiMGGARJuDAY_TVfJA','サイゼリヤ','https://www.saizeriya.co.jp/concept/',['ミラノ風ドリア'],[{nameJa:'ミラノ風ドリア',nameZh:'米兰风焗饭',kind:'signature'}]],
  ['ChIJF37yb0GMGGAR0xtmmas5qQI','なか卯','https://www.nakau.co.jp/jp/menu/category/1.html',['親子丼'],[{nameJa:'親子丼',nameZh:'亲子丼',kind:'representative'}]],
  ['ChIJq30xaxyMGGARHPVzI5YnVow','ココス','https://www.cocos-jpn.co.jp/menu/grand/hamburg/',['濃厚ビーフシチューの包み焼きハンバーグ'],[{nameJa:'濃厚ビーフシチューの包み焼きハンバーグ',nameZh:'浓厚牛肉炖汤锡纸包汉堡肉排',kind:'signature'}]],
  ['ChIJV3V4uRSNGGARPSLntvfs_ME','ラーメン豚山 神保町店','https://butayama.com/menu',['小ラーメン'],[{nameJa:'小ラーメン',nameZh:'小份豚山拉面',kind:'representative'}]],
  ['ChIJ70UfMRCMGGARvCAQcEhynic','HASSO CAFFE with PRONTO','https://www.pronto.co.jp/cafe/cafefood/',['ナスとベーコンのトマトソース'],[{nameJa:'ナスとベーコンのトマトソース',nameZh:'茄子培根番茄意面',kind:'recommended'}]],
  ['ChIJAQC0dESMGGAR0VQTphLwmdw','てけてけ','https://www.teke-teke.com/oshinagaki',['正直塩つくね'],[{nameJa:'正直塩つくね',nameZh:'招牌盐味鸡肉丸串',kind:'signature'}]],
  ['ChIJSdEMKDmMGGARyiy9F60mMLk','ジョナサン','https://delivery.skylark.co.jp/brand/item/product_JS00432502',['タンドリーチキン＆メキシカンピラフ'],[{nameJa:'タンドリーチキン＆メキシカンピラフ',nameZh:'唐杜里烤鸡配墨西哥风味香饭',kind:'representative'}]],
  ['ChIJhXD3-AaMGGARbLVQPEtml80','上島珈琲店','https://www.ueshima-coffee-ten.jp/menu/coffee/milk-coffee-kokutou/',['ミルク珈琲（黒糖）'],[{nameJa:'ミルク珈琲（黒糖）',nameZh:'黑糖牛奶咖啡',kind:'recommended'}]],
  ['ChIJs1zmzD-MGGAR_TWUpga5JUs','大庄水産 水道橋店','https://www.daisyo.co.jp/whatsnew/new_img/enkai/enkai_syousai_tpl.php?ID=1955&banner_party_cd=157',['ぶっかけ寿司こぼれ盛り'],[{nameJa:'ぶっかけ寿司こぼれ盛り',nameZh:'名物满溢海鲜寿司',kind:'signature'}]]
];

function mergeUniqueStrings(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean))];
}

function addDishClaim(googlePlaceId, name, sourceUrl, legacyDishes) {
  const ref = { provider:'official', url:sourceUrl, checkedAt:CHAIN_MENU_CHECKED_AT, fields:['dishes'] };
  // This file intentionally sorts last. Prefer augmenting an existing official
  // row so source binding remains one provider row per Place ID.
  let row = [...window.RESTAURANTS].reverse().find((item) =>
    item && item.googlePlaceId === googlePlaceId && item.source === 'official' && item.sourceOnly);
  if (row) {
    row.dishes = mergeUniqueStrings(row.dishes, legacyDishes).slice(0, 4);
    row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
    if (!row.sourceRefs.some((item) => item.url === sourceUrl && (item.fields || []).includes('dishes'))) {
      row.sourceRefs.push(ref);
    }
  } else {
    row = {
      id:`src-chainmenu-${googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,
      profile:'TOKYO', area:'地区1️⃣', name, googlePlaceId,
      source:'official', sourceOnly:true, dishes:[...legacyDishes], sourceRefs:[ref]
    };
    window.RESTAURANTS.push(row);
  }
}

window.FEATURED_DISHES ||= [];
for (const [googlePlaceId,name,sourceUrl,legacyDishes,dishes] of chainMenuPatches) {
  addDishClaim(googlePlaceId, name, sourceUrl, legacyDishes);
  if (!window.FEATURED_DISHES.some((row) => row.googlePlaceId === googlePlaceId)) {
    window.FEATURED_DISHES.push({ googlePlaceId, dishes, sourceUrl, checkedAt:CHAIN_MENU_CHECKED_AT });
  }
}
