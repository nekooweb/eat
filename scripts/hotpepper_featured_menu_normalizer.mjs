// Curated Japanese -> zh-CN normalization used ONLY for exact-bound Hot Pepper
// h4 menu headings with an adjacent price cue on a revalidated /food/ or /menu/ page.
//
// This is intentionally separate from the global dish dictionary.  A match may
// become featured only; it can never become a recommendation without independent
// explicit recommendation semantics.

const RULES = [
  [/カーリーポテト/i, '卷曲薯条', 'curly-fries'],
  [/ゴーヤーの浅漬け/i, '浅渍苦瓜', 'pickled-goya'],
  [/鰹のたたき|カツオのたたき/i, '炙烤鲣鱼', 'katsuo-tataki'],
  [/ちくきゅう/i, '竹轮黄瓜', 'chikuwa-cucumber'],
  [/皿鉢料理/i, '高知皿钵料理', 'sawachi-cuisine'],
  [/ショコラ盛合せ|ショコラ盛り合わせ/i, '巧克力拼盘', 'chocolate-platter'],
  [/チーズ盛合せ|チーズ盛り合わせ/i, '奶酪拼盘', 'cheese-platter'],
  [/ドライフルーツ/i, '果干', 'dried-fruit'],
  [/レーズンバター/i, '葡萄干黄油', 'raisin-butter']
];

export const HOTPEPPER_FEATURED_MENU_RULES = RULES;

export function normalizeHotPepperFeaturedMenuHeading(value, limit = 5) {
  const text = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh, ruleId] of RULES) {
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({
      nameZh,
      nameOriginal: match[0],
      rule: ruleId,
      evidenceSnippet: text.slice(0, 120)
    });
    if (output.length >= limit) break;
  }
  return output;
}
