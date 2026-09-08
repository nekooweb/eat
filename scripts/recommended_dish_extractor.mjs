// Shared extractor for source-backed recommendation/menu evidence.
// Source pages may be Japanese or another source-native language. Canonical public
// dish labels are normalized to Chinese; this module NEVER infers dishes from
// cuisine, restaurant name, or brand alone.

export const RECOMMENDATION_MARKER = /おすすめ|オススメ|お勧め|名物|看板(?:メニュー)?|自慢|一押し|イチオシ|推し|人気\s*(?:no\.?\s*1|no1|1位)?|一番人気|売れ筋|必食|スペシャリテ|シグネチャー|signature|specialt(?:y|ies)|recommended|recommendation|best[ -]?seller|must[ -]?try|most[ -]?popular|house[ -]?special|chef(?:'s)?[ -]?recommend/i;
export const MENU_LINK_MARKER = /menu|food|dish|cuisine|lunch|dinner|料理|お品書|御品書|メニュー|食事|おすすめ|名物/i;

const ENTITY_MAP = new Map([
  ['&nbsp;', ' '], ['&#160;', ' '], ['&amp;', '&'], ['&quot;', '"'], ['&#34;', '"'],
  ['&#39;', "'"], ['&apos;', "'"], ['&lt;', '<'], ['&gt;', '>']
]);

function decodeEntities(value) {
  let out = String(value || '');
  for (const [from, to] of ENTITY_MAP) out = out.replaceAll(from, to);
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
  return out;
}

export function htmlToTextBlocks(html) {
  const text = decodeEntities(String(html || ''))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '\n')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/td|\/th|\/tr|\/section|\/article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function normalizePlainText(value) {
  return decodeEntities(String(value || ''))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Specific rules precede broad dish-family rules so the Chinese canonical label
// keeps useful source detail whenever the source-native text contains it.
export const DISH_RULES = [
  // Source-native Japanese normalization recovered from retained source evidence.
  [/もも貴族焼\s*[（(]?たれ[）)]?/i, '鸡腿贵族烧（酱汁）'],
  [/厚切上タン/i, '上等厚切牛舌'],
  [/厚切りタン/i, '厚切牛舌'],
  [/上レバー/i, '上等肝片'],
  [/スターバックス\s*ラテ/i, '星巴克拿铁'],
  [/ハニーミルクラテ/i, '蜂蜜牛奶拿铁'],
  [/ミルク珈琲\s*[（(]黒糖[）)]/i, '黑糖牛奶咖啡'],
  [/ブレンドコーヒー/i, '拼配咖啡'],
  [/ナスとベーコンのトマトソース/i, '茄子培根番茄酱意面'],
  [/バカ盛りポテトフライ/i, '超大份炸薯条'],
  [/小いわし天婦羅|小いわし天ぷら/i, '小沙丁鱼天妇罗'],
  [/牛もつ煮込み/i, '炖牛杂'],
  [/日替わりランチ/i, '每日午餐套餐'],
  [/サムゲタン/i, '参鸡汤'],
  [/石焼ビビンパ/i, '石锅拌饭'],
  [/純豆腐チゲ/i, '嫩豆腐锅'],
  [/ドミノ・デラックス/i, '达美乐豪华披萨'],
  [/のどぐろ塩焼き/i, '盐烤赤鯥'],
  [/丸ごとワタリガニのトマトクリーム/i, '整只梭子蟹番茄奶油意面'],
  [/野菜巻き串/i, '蔬菜卷串'],
  [/牛肉と豆腐の四川風煮込み/i, '川味牛肉炖豆腐'],
  [/本気のトロ鉄火巻き/i, '金枪鱼腩铁火卷'],
  [/きりたんぽ/i, '秋田烤米棒'],
  [/ロース丼/i, '里脊肉盖饭'],
  [/ローストチキン/i, '烤鸡'],
  [/(?:YEBISU BAR[^\s]*)?肉豆富|肉豆腐/i, '肉豆腐'],
  [/真鯛のフィッシュ[＆&]チップス/i, '真鲷炸鱼薯条'],
  [/神威豚ロース塩麹グリル/i, '盐麹烤神威猪里脊'],
  [/備後府中焼き/i, '备后府中烧'],
  [/お造里/i, '刺身'],
  [/宇和島流鯛めし/i, '宇和岛式鲷鱼饭'],
  [/七輪焼き/i, '七轮炭烤'],
  [/串焼き/i, '烤串'],
  [/おむすび/i, '饭团'],
  [/^かけ$/i, '清汤乌冬面'],
  [/カレー付き生姜焼き|生姜焼き.*カレー|curry.*ginger pork/i, '咖喱姜烧猪肉'],
  [/エビ炒飯|海老炒飯|えび炒飯|shrimp fried rice/i, '虾仁炒饭'],
  [/濃厚つけ麺|濃厚つけめん/i, '浓厚蘸面'],
  [/家系(?:ラーメン|らーめん)|横浜家系/i, '横滨家系拉面'],
  [/煮干し(?:ラーメン|らーめん)|煮干(?:ラーメン|らーめん)/i, '煮干拉面'],
  [/塩生姜(?:ラーメン|らーめん)/i, '盐味生姜拉面'],
  [/鶏白湯(?:ラーメン|らーめん)|chicken paitan/i, '鸡白汤拉面'],
  [/豚骨(?:ラーメン|らーめん)|tonkotsu ramen/i, '豚骨拉面'],
  [/バターチキン(?:カレー)?|butter chicken/i, '黄油鸡咖喱'],
  [/キーマ(?:カレー)?|keema curry/i, '肉末咖喱'],
  [/スープカレー|soup curry/i, '汤咖喱'],
  [/タンドリーチキン|tandoori chicken/i, '坦都里烤鸡'],
  [/ミールス|meals\b/i, '南印度米尔斯套餐'],
  [/マサラドーサ|ドーサ|masala dosa|dosa\b/i, '印度薄饼'],
  [/海南鶏飯|海南鸡饭|hainan(?:ese)? chicken rice/i, '海南鸡饭'],
  [/カオマンガイ|khao man gai/i, '泰式海南鸡饭'],
  [/トムヤムクン|tom yum/i, '冬阴功汤'],
  [/グリーンカレー|green curry/i, '泰式绿咖喱'],
  [/バインミー|banh mi/i, '越南法棍三明治'],
  [/バインセオ|banh xeo/i, '越南煎饼'],
  [/よだれ鶏|口水鶏/i, '口水鸡'],
  [/油淋鶏|油淋鸡/i, '油淋鸡'],
  [/エビチリ|海老チリ/i, '干烧虾仁'],
  [/刀削麺|刀削面/i, '刀削面'],
  [/焼き餃子|焼餃子/i, '煎饺'],
  [/水餃子|水饺/i, '水饺'],
  [/だし巻き(?:玉子|卵)|出汁巻き(?:玉子|卵)/i, '日式高汤玉子烧'],
  [/鯖(?:の)?塩焼き|塩鯖|焼き鯖/i, '盐烤鲭鱼'],
  [/生姜焼き|しょうが焼き/i, '姜烧猪肉'],
  [/焼きとん|やきとん/i, '烤猪肉串'],
  [/もつ焼き|もつ焼/i, '烤内脏'],
  [/水炊き|水炊/i, '鸡肉水炊锅'],
  [/ちゃんこ鍋|ちゃんこ/i, '相扑火锅'],
  [/おばんざい/i, '京都家常小菜'],
  [/牡蠣フライ|カキフライ/i, '炸牡蛎'],
  [/アジフライ|鯵フライ/i, '炸竹荚鱼'],
  [/穴子(?:丼|重)?/i, '星鳗料理'],
  [/ねぎま/i, '葱鸡肉串'],
  [/つくね/i, '鸡肉丸串'],
  [/マルゲリータ|margherita/i, '玛格丽特披萨'],
  [/カルボナーラ|carbonara/i, '卡邦尼意大利面'],
  [/ボロネーゼ|bolognese/i, '肉酱意大利面'],
  [/ペペロンチーノ|aglio.*olio|peperoncino/i, '蒜香辣椒意大利面'],
  [/リゾット|risotto/i, '意式烩饭'],
  [/ラザニア|lasagna/i, '千层面'],
  [/チーズタッカルビ|cheese dakgalbi/i, '芝士辣炒鸡'],
  [/ヤンニョムチキン|yangnyeom/i, '韩式甜辣炸鸡'],
  [/プルコギ|bulgogi/i, '韩式烤牛肉'],
  [/モンブラン|mont blanc/i, '蒙布朗蛋糕'],
  [/チーズケーキ|cheesecake/i, '芝士蛋糕'],
  [/ティラミス|tiramisu/i, '提拉米苏'],
  [/あんみつ/i, '日式蜜豆凉粉'],
  [/どら焼き|どら焼|dorayaki/i, '铜锣烧'],
  [/大福|daifuku/i, '大福'],
  [/ビリヤニ|biryani/i, '印度香饭'],
  [/焼き?鳥|やきとり|yakitori/i, '烤鸡串'],
  [/串揚げ|串カツ|kushiage/i, '炸串'],
  [/唐揚げ|から揚げ|からあげ|karaage/i, '日式炸鸡'],
  [/チキン南蛮/i, '南蛮鸡'],
  [/中華そば/i, '中华拉面'],
  [/つけ麺|つけめん|tsukemen/i, '蘸面'],
  [/担々麺|担担麺|担担面|tantanmen/i, '担担面'],
  [/油そば/i, '油拌面'],
  [/ラーメン|らーめん|拉麺|ramen/i, '拉面'],
  [/蕎麦|そば|soba/i, '荞麦面'],
  [/うどん|udon/i, '乌冬面'],
  [/カレー|カリー|咖喱|curry/i, '咖喱'],
  [/ナン|naan/i, '烤饼'],
  [/ステーキ|steak/i, '牛排'],
  [/ハンバーグ|hamburg steak/i, '汉堡排'],
  [/寿司|すし|鮨|sushi/i, '寿司'],
  [/刺身|お造り|sashimi/i, '刺身'],
  [/海鮮丼|海鲜丼/i, '海鲜盖饭'],
  [/うなぎ|鰻|鳗鱼|unagi/i, '鳗鱼'],
  [/天ぷら|天麩羅|tempura/i, '天妇罗'],
  [/とんかつ|豚カツ|tonkatsu/i, '炸猪排'],
  [/牛カツ/i, '炸牛排'],
  [/牛タン|gyutan/i, '牛舌'],
  [/焼肉|yakiniku/i, '烤肉'],
  [/ホルモン/i, '烤内脏'],
  [/しゃぶしゃぶ|shabu.?shabu/i, '涮涮锅'],
  [/すき焼き|すきやき|sukiyaki/i, '寿喜烧'],
  [/もつ鍋/i, '牛杂锅'],
  [/餃子|饺子|gyoza/i, '饺子'],
  [/小籠包|小笼包|xiaolongbao/i, '小笼包'],
  [/麻婆豆腐|mapo/i, '麻婆豆腐'],
  [/炒飯|チャーハン|炒饭|fried rice/i, '炒饭'],
  [/回鍋肉|回锅肉/i, '回锅肉'],
  [/青椒肉絲|青椒肉丝/i, '青椒肉丝'],
  [/酢豚/i, '糖醋猪肉'],
  [/パスタ|スパゲッティ|pasta|spaghetti/i, '意大利面'],
  [/ピザ|ピッツァ|pizza/i, '披萨'],
  [/オムライス|omelette rice|omurice/i, '蛋包饭'],
  [/ドリア/i, '焗饭'],
  [/グラタン|gratin/i, '焗烤'],
  [/サンドイッチ|サンド|sandwich/i, '三明治'],
  [/ハンバーガー|バーガー|burger/i, '汉堡'],
  [/タコス|tacos?/i, '塔可'],
  [/ケバブ|kebab/i, '烤肉卷'],
  [/フォー|pho\b/i, '越南河粉'],
  [/ガパオ|gapao/i, '打抛饭'],
  [/パッタイ|pad thai/i, '泰式炒河粉'],
  [/サムギョプサル|samgyeopsal/i, '韩式烤五花肉'],
  [/チヂミ|jeon\b/i, '韩式煎饼'],
  [/冷麺|冷面/i, '冷面'],
  [/ビビンバ|bibimbap/i, '石锅拌饭'],
  [/お好み焼き?|okonomiyaki/i, '御好烧'],
  [/もんじゃ|monjayaki/i, '文字烧'],
  [/たこ焼き?|takoyaki/i, '章鱼烧'],
  [/おでん|oden\b/i, '关东煮'],
  [/親子丼|oyakodon/i, '亲子盖饭'],
  [/牛丼|gyudon/i, '牛肉饭'],
  [/天丼|tendon\b/i, '天妇罗盖饭'],
  [/カツ丼|katsudon/i, '炸猪排盖饭'],
  [/ローストビーフ|roast beef/i, '烤牛肉'],
  [/燻製|smoked/i, '烟熏料理'],
  [/クロワッサン|croissant/i, '可颂'],
  [/パンケーキ|pancake/i, '松饼'],
  [/フレンチトースト|french toast/i, '法式吐司'],
  [/ケーキ|cake/i, '蛋糕'],
  [/パフェ|parfait/i, '芭菲'],
  [/プリン|pudding|flan/i, '布丁'],
  [/クレープ|crepe/i, '可丽饼'],
  [/ジェラート|gelato/i, '意式冰淇淋']
];

export function translateDishText(raw) {
  const text = normalizePlainText(raw);
  if (!text) return null;
  for (const [pattern, nameZh] of DISH_RULES) {
    if (pattern.test(text)) return { nameZh, nameOriginal: text.slice(0, 80), rule: pattern.source };
  }
  // Already-Chinese short dish labels can be retained as-is when they contain no kana.
  if (/^[\u3400-\u9fffA-Za-z0-9·・&＋+\-\s]{1,24}$/u.test(text) && /[\u3400-\u9fff]/u.test(text) && !/[\u3040-\u30ff]/u.test(text)) {
    return { nameZh: text, nameOriginal: text, rule: 'already-chinese' };
  }
  return null;
}

function itemsFromText(text, limit = 3) {
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = String(text || '').match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (output.length >= limit) break;
  }
  return output;
}

export function extractStrictRecommendationsFromText(value, limit = 3) {
  const text = normalizePlainText(value);
  if (!text || !RECOMMENDATION_MARKER.test(text)) return [];
  return itemsFromText(text, limit);
}

export function extractStrictRecommendationsFromHtml(html, limit = 3) {
  const blocks = htmlToTextBlocks(html);
  const output = [];
  const seen = new Set();
  for (let i = 0; i < blocks.length; i += 1) {
    if (!RECOMMENDATION_MARKER.test(blocks[i])) continue;
    const context = blocks.slice(Math.max(0, i - 1), Math.min(blocks.length, i + 3)).join(' ').slice(0, 420);
    for (const item of itemsFromText(context, limit)) {
      if (seen.has(item.nameZh)) continue;
      seen.add(item.nameZh);
      output.push({ ...item, evidenceSnippet: context.slice(0, 90) });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function walkJson(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const item of Object.values(value)) walkJson(item, visit);
}

export function extractStructuredMenuItems(html, limit = 3) {
  const names = [];
  const seenRaw = new Set();
  const scriptRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(String(html || '')))) {
    try {
      const data = JSON.parse(decodeEntities(match[1]).trim());
      walkJson(data, (obj) => {
        const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
        if (!types.some((x) => String(x || '').toLowerCase() === 'menuitem')) return;
        const raw = String(obj.name || '').trim();
        if (raw && !seenRaw.has(raw)) { seenRaw.add(raw); names.push(raw); }
      });
    } catch {
      // Invalid JSON-LD is ignored; it is not evidence.
    }
  }
  const output = [];
  const seen = new Set();
  for (const raw of names) {
    const translated = translateDishText(raw);
    if (!translated || seen.has(translated.nameZh)) continue;
    seen.add(translated.nameZh);
    output.push({ ...translated, evidenceSnippet: raw.slice(0, 90) });
    if (output.length >= limit) break;
  }
  return output;
}
