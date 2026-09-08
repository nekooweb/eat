// Shared extractor for source-backed recommendation/menu evidence.
// Source pages may be Japanese or another source-native language. Canonical public
// dish labels are normalized to Chinese; this module NEVER infers dishes from
// cuisine, restaurant name, or brand alone.

export const RECOMMENDATION_MARKER = /おすすめ|オススメ|お勧め|名物|看板(?:メニュー)?|自慢|一押し|イチオシ|推し|人気\s*(?:no\.?\s*1|no1|1位)?|一番人気|売れ筋|必食|スペシャリテ|シグネチャー|signature|specialt(?:y|ies)|recommended|recommendation|best[ -]?seller|must[ -]?try|most[ -]?popular|house[ -]?special|chef(?:'s)?[ -]?recommend/i;
export const MENU_LINK_MARKER = /menu|menus|food|dish|cuisine|lunch|dinner|料理|お品書|御品書|メニュー|食事|おすすめ|名物|フード|コース|グランド(?:メニュー)?|アラカルト|ドリンク|商品|朝食|モーニング/i;

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
  // These three are supported by explicit menu descriptions, not inferred from cuisine.
  [/ズッパフォルテ/i, '那不勒斯辣味炖猪杂'],
  [/神経〆活魚|活魚神経〆|活魚神経締め/i, '神经处理鲜鱼'],
  [/釣り魚/i, '钓获鲜鱼'],
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
  [/濃厚つけ麺/i, '浓厚蘸面'],
  [/家系ラーメン|横浜家系/i, '横滨家系拉面'],
  [/塩生姜らー?麺|塩生姜ラーメン/i, '盐生姜拉面'],
  [/煮干し?ラーメン|煮干し?そば/i, '煮干拉面'],
  [/担々麺|担担麺/i, '担担面'],
  [/麻辣湯|マーラータン/i, '麻辣烫'],
  [/刀削麺/i, '刀削面'],
  [/バターチキン/i, '黄油鸡咖喱'],
  [/ビリヤニ/i, '印度香饭'],
  [/タンドリーチキン/i, '坦都里烤鸡'],
  [/ナン/i, '馕饼'],
  [/フォー/i, '越南河粉'],
  [/バインミー/i, '越南法棍'],
  [/バインセオ/i, '越南煎饼'],
  [/パエリア/i, '西班牙海鲜饭'],
  [/タコス/i, '塔可'],
  [/ケバブ/i, '烤肉夹饼'],
  [/小籠包|小龙包/i, '小笼包'],
  [/餃子|ぎょうざ|ギョーザ/i, '饺子'],
  [/炒飯|チャーハン/i, '炒饭'],
  [/麻婆豆腐/i, '麻婆豆腐'],
  [/酢豚/i, '糖醋里脊'],
  [/青椒肉絲/i, '青椒肉丝'],
  [/回鍋肉/i, '回锅肉'],
  [/エビチリ|海老チリ/i, '干烧虾仁'],
  [/北京ダック|北京烤鴨/i, '北京烤鸭'],
  [/寿司|鮨|すし/i, '寿司'],
  [/刺身|お造り/i, '刺身'],
  [/海鮮丼|海鮮どんぶり/i, '海鲜盖饭'],
  [/鉄火丼/i, '金枪鱼盖饭'],
  [/鰻重|うな重/i, '鳗鱼重'],
  [/うな丼|鰻丼/i, '鳗鱼盖饭'],
  [/焼き?鳥|やきとり/i, '烤鸡串'],
  [/焼き?とん|やきとん/i, '烤猪串'],
  [/串カツ|串揚げ/i, '炸串'],
  [/串焼き/i, '烤串'],
  [/焼肉|焼き肉/i, '烤肉'],
  [/牛タン/i, '牛舌'],
  [/すき焼き/i, '寿喜烧'],
  [/しゃぶしゃぶ/i, '涮涮锅'],
  [/もつ鍋/i, '牛杂锅'],
  [/水炊き/i, '日式鸡肉锅'],
  [/ちゃんこ/i, '相扑火锅'],
  [/おでん/i, '关东煮'],
  [/天ぷら|天婦羅/i, '天妇罗'],
  [/とんかつ|豚カツ/i, '炸猪排'],
  [/カツ丼/i, '炸猪排盖饭'],
  [/牛丼/i, '牛肉盖饭'],
  [/親子丼/i, '亲子盖饭'],
  [/豚丼/i, '猪肉盖饭'],
  [/うどん/i, '乌冬面'],
  [/そば|蕎麦/i, '荞麦面'],
  [/ラーメン|らーめん|らぁめん|中華そば/i, '拉面'],
  [/つけ麺/i, '蘸面'],
  [/カレー|カリー/i, '咖喱'],
  [/オムライス/i, '蛋包饭'],
  [/ハンバーグ/i, '汉堡排'],
  [/ステーキ/i, '牛排'],
  [/お好み焼き/i, '大阪烧'],
  [/たこ焼き/i, '章鱼烧'],
  [/焼きそば/i, '炒面'],
  [/パスタ|スパゲッティ/i, '意大利面'],
  [/ピザ|ピッツァ/i, '披萨'],
  [/ハンバーガー|バーガー/i, '汉堡'],
  [/サンドイッチ|サンド(?:$|\s|[、,。])/i, '三明治'],
  [/おにぎり|おむすび/i, '饭团'],
  [/パンケーキ/i, '松饼'],
  [/クレープ/i, '可丽饼'],
  [/プリン/i, '布丁'],
  [/ケーキ/i, '蛋糕'],
  [/アイスクリーム|ジェラート/i, '冰淇淋'],
  [/和菓子/i, '和果子'],
  [/豆花/i, '豆花'],
  [/だし巻き玉子|出汁巻き玉子|だし巻き卵/i, '日式高汤玉子烧'],
  [/唐揚げ|から揚げ|からあげ/i, '日式炸鸡'],
  [/鯖塩焼き|さば塩焼き/i, '盐烤鲭鱼'],
  [/焼き鯖|焼鯖/i, '烤鲭鱼'],
  [/生姜焼き/i, '姜烧猪肉'],
  [/牡蠣|カキ/i, '牡蛎'],
  [/まぐろ|マグロ|鮪/i, '金枪鱼'],
  [/鯖|さば|サバ/i, '鲭鱼'],
  [/鰯|いわし|イワシ/i, '沙丁鱼'],
  [/鰹|かつお|カツオ/i, '鲣鱼'],
  [/海鮮|魚介/i, '海鲜'],
  [/サラダ/i, '沙拉'],
  [/フライドポテト|ポテトフライ/i, '炸薯条'],
  [/コーヒー|珈琲/i, '咖啡'],
  [/カフェラテ|カフェラッテ|ラテ/i, '拿铁'],
  [/紅茶|ティー/i, '红茶'],
  [/抹茶/i, '抹茶'],
  [/パフェ/i, '芭菲'],
  [/シュークリーム/i, '泡芙'],
  [/クロワッサン/i, '可颂'],
  [/バゲット/i, '法棍'],
  [/トースト/i, '吐司']
];

export function translateDishText(value) {
  const text = normalizePlainText(value).slice(0, 240);
  if (!text) return null;
  const names = [];
  for (const [pattern, nameZh] of DISH_RULES) {
    if (pattern.test(text) && !names.includes(nameZh)) names.push(nameZh);
    if (names.length >= 3) break;
  }
  return names.length ? names : null;
}

export function extractStrictRecommendationsFromText(text, limit = 3) {
  const normalized = normalizePlainText(text).slice(0, 600);
  if (!normalized || !RECOMMENDATION_MARKER.test(normalized)) return [];
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = normalized.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({
      nameZh,
      nameOriginal: match[0],
      rule: pattern.source,
      evidenceSnippet: normalized.slice(0, 90)
    });
    if (output.length >= limit) break;
  }
  return output;
}

export function extractStrictRecommendationsFromHtml(html, limit = 3) {
  const blocks = htmlToTextBlocks(html);
  const output = [];
  const seen = new Set();
  for (let i = 0; i < blocks.length; i += 1) {
    if (!RECOMMENDATION_MARKER.test(blocks[i])) continue;
    const context = [blocks[i - 1], blocks[i], blocks[i + 1], blocks[i + 2]]
      .filter(Boolean)
      .join(' ')
      .slice(0, 420);
    for (const match of extractStrictRecommendationsFromText(context, limit)) {
      if (seen.has(match.nameZh)) continue;
      seen.add(match.nameZh);
      output.push({ ...match, evidenceSnippet: context.slice(0, 90) });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function menuItems(value, output = [], depth = 0) {
  if (depth > 8 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) menuItems(item, output, depth + 1);
    return output;
  }
  if (typeof value !== 'object') return output;
  const rawType = value['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.some((type) => String(type || '').toLowerCase() === 'menuitem')) {
    const translated = translateDishText(value.name || value.description || '');
    if (translated?.length) {
      output.push({
        nameZh: translated[0],
        nameOriginal: String(value.name || value.description || '').slice(0, 100),
        rule: 'jsonld-menuitem'
      });
    }
  }
  for (const child of Object.values(value)) menuItems(child, output, depth + 1);
  return output;
}

export function extractStructuredMenuItems(html, limit = 6) {
  const items = [];
  const scripts = String(html || '').match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    if (!raw) continue;
    try {
      menuItems(JSON.parse(raw), items);
    } catch {
      // malformed JSON-LD is not evidence
    }
  }
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.nameZh || seen.has(item.nameZh)) return false;
    seen.add(item.nameZh);
    return true;
  }).slice(0, limit);
}
