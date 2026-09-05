// Reviewed brand-menu templates already represented in committed enrichment.
// These templates may be reused only for exact production identities that are
// independently source-backed and not blocked by a source-resolution state.
export const FEATURED_TEMPLATES = [
  { key:'tullys', re:/^タリーズコーヒー/u, source:'https://www.tullys.co.jp/menu/drink/coffee/honey_m.html', legacy:['ハニーミルクラテ'], featured:[{nameJa:'ハニーミルクラテ',nameZh:'蜂蜜牛奶拿铁',kind:'representative'}] },
  { key:'starbucks', re:/^スターバックス(?: コーヒー)?/u, source:'https://menu.starbucks.co.jp/4524785000230', legacy:['スターバックス ラテ'], featured:[{nameJa:'スターバックス ラテ',nameZh:'星巴克拿铁',kind:'representative'}] },
  { key:'doutor', re:/^ドトールコーヒーショップ/u, source:'https://www.doutor.co.jp/app/dcs/menu/list/milano.html', legacy:['ミラノサンドA'], featured:[{nameJa:'ミラノサンドA',nameZh:'米兰三明治A',kind:'representative'}] },
  { key:'torikizoku', re:/^鳥貴族/u, source:'https://torikizoku.co.jp/menu/yakitori/', legacy:['もも貴族焼(たれ)'], featured:[{nameJa:'もも貴族焼(たれ)',nameZh:'招牌鸡腿贵族烧（酱汁）',kind:'signature'}] },
  { key:'hanamaru', re:/^はなまるうどん/u, source:'https://www.hanamaruudon.com/menu/index.html', legacy:['かけ'], featured:[{nameJa:'かけ',nameZh:'汤汁乌冬面',kind:'representative'}] },
  { key:'royalhost', re:/^ロイヤルホスト/u, source:'https://www.royalhost.jp/menu/grand/kurokuro_hamburg/black-black-hamburger-steak.html', legacy:['黒×黒ハンバーグ'], featured:[{nameJa:'黒×黒ハンバーグ',nameZh:'黑×黑汉堡肉排',kind:'signature'}] },
  { key:'cocoichibanya', re:/^カレーハウスCoCo壱番屋/u, source:'https://www.ichibanya.co.jp/menu/order.html', legacy:['ポークカレー'], featured:[{nameJa:'ポークカレー',nameZh:'猪肉咖喱',kind:'representative'}] },
  { key:'tsujita', re:/^つじ田(?: |$)/u, source:'https://tsukemen-tsujita.com/menu/noukoutsukemen/', legacy:['濃厚つけ麺'], featured:[{nameJa:'濃厚つけ麺',nameZh:'浓厚蘸面',kind:'signature'}] },
  { key:'cafe_veloce', re:/^カフェ[・･]ベローチェ/u, source:'https://c-united.co.jp/veloce/drink/', legacy:['ブレンドコーヒー'], featured:[{nameJa:'ブレンドコーヒー',nameZh:'混合咖啡',kind:'representative'}] },
  { key:'cafe_de_crie', re:/^カフェ[・･]ド[・･]クリエ/u, source:'https://c-united.co.jp/crie/drink/', legacy:['ソルベージュ®エスプレッソ'], featured:[{nameJa:'ソルベージュ®エスプレッソ',nameZh:'浓缩咖啡冰沙',kind:'representative'}] },
  { key:'saizeriya', re:/^サイゼリヤ/u, source:'https://www.saizeriya.co.jp/concept/', legacy:['ミラノ風ドリア'], featured:[{nameJa:'ミラノ風ドリア',nameZh:'米兰风焗饭',kind:'signature'}] },
  { key:'nakau', re:/^なか卯/u, source:'https://www.nakau.co.jp/jp/menu/category/1.html', legacy:['親子丼'], featured:[{nameJa:'親子丼',nameZh:'亲子丼',kind:'representative'}] },
  { key:'cocos', re:/^ココス/u, source:'https://www.cocos-jpn.co.jp/menu/grand/hamburg/', legacy:['濃厚ビーフシチューの包み焼きハンバーグ'], featured:[{nameJa:'濃厚ビーフシチューの包み焼きハンバーグ',nameZh:'浓厚牛肉炖汤锡纸包汉堡肉排',kind:'signature'}] },
  { key:'butayama', re:/^(?:ラーメン)?豚山/u, source:'https://butayama.com/menu', legacy:['小ラーメン'], featured:[{nameJa:'小ラーメン',nameZh:'小份豚山拉面',kind:'representative'}] },
  { key:'ueshima', re:/^上島珈琲店/u, source:'https://www.ueshima-coffee-ten.jp/menu/coffee/milk-coffee-kokutou/', legacy:['ミルク珈琲（黒糖）'], featured:[{nameJa:'ミルク珈琲（黒糖）',nameZh:'黑糖牛奶咖啡',kind:'recommended'}] }
];
