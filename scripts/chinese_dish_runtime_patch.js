(() => {
  'use strict';

  const HAN_RE = /[\u3400-\u9fff]/u;
  const KANA_RE = /[\u3040-\u30ff]/u;

  const isChineseDish = (value) => {
    const text = String(value || '').trim();
    return Boolean(text) && text.length <= 24 && HAN_RE.test(text) && !KANA_RE.test(text);
  };

  const chineseDishName = (item) => {
    if (typeof item === 'string') return isChineseDish(item) ? item.trim() : '';
    if (!item || typeof item !== 'object') return '';
    const value = String(item.nameZh || '').trim();
    return isChineseDish(value) ? value : '';
  };

  const dedupeChinese = (items, limit = 2) => {
    const output = [];
    const seen = new Set();
    for (const item of items || []) {
      const value = chineseDishName(item);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push(value);
      if (output.length >= limit) break;
    }
    return output;
  };

  // The fallback is intentionally broad. These values are display suggestions,
  // not source-backed claims, and are never promoted into the evidence database.
  const RULES = [
    { id: 'brand-starbucks', re: /starbucks|スターバックス|星巴克/iu, dishes: ['星巴克拿铁', '咖啡'] },
    { id: 'brand-tullys', re: /tully'?s|タリーズ/iu, dishes: ['蜂蜜牛奶拿铁', '咖啡'] },
    { id: 'brand-doutor', re: /doutor|ドトール/iu, dishes: ['米兰三明治', '咖啡'] },
    { id: 'brand-torikizoku', re: /鳥貴族|鸟贵族/iu, dishes: ['招牌鸡腿贵族烧', '烤鸡串'] },
    { id: 'brand-hanamaru', re: /はなまる/iu, dishes: ['汤汁乌冬面', '天妇罗'] },
    { id: 'brand-royalhost', re: /royal\s*host|ロイヤルホスト/iu, dishes: ['汉堡肉排', '西式套餐'] },
    { id: 'brand-cocoichi', re: /coco壱|ココイチ|coco\s*ichibanya/iu, dishes: ['猪肉咖喱', '炸猪排咖喱'] },
    { id: 'brand-tsujita', re: /つじ田|tsujita/iu, dishes: ['浓厚蘸面', '拉面'] },
    { id: 'brand-veloce', re: /ベローチェ|veloce/iu, dishes: ['混合咖啡', '三明治'] },
    { id: 'brand-crie', re: /カフェ・?ド・?クリエ|cafe\s*de\s*crie/iu, dishes: ['浓缩咖啡冰沙', '咖啡'] },
    { id: 'brand-saizeriya', re: /サイゼリヤ|saizeriya/iu, dishes: ['米兰风焗饭', '意大利面'] },
    { id: 'brand-nakau', re: /なか卯|nakau/iu, dishes: ['亲子丼', '乌冬面'] },
    { id: 'brand-cocos', re: /ココス|coco'?s/iu, dishes: ['汉堡肉排', '西式套餐'] },
    { id: 'brand-butayama', re: /豚山/iu, dishes: ['豚骨拉面', '叉烧'] },
    { id: 'brand-ueshima', re: /上島珈琲|上岛咖啡/iu, dishes: ['黑糖牛奶咖啡', '咖啡'] },

    { id: 'cuisine-tsukemen', re: /つけ麺|つけめん|蘸面/iu, dishes: ['蘸面', '叉烧'] },
    { id: 'cuisine-ramen', re: /ラーメン|らーめん|中華そば|拉麺|拉面/iu, dishes: ['拉面', '叉烧'] },
    { id: 'cuisine-curry', re: /カレー|咖喱/iu, dishes: ['咖喱饭', '炸猪排咖喱'] },
    { id: 'cuisine-sushi', re: /寿司|すし|鮨/iu, dishes: ['寿司', '生鱼片'] },
    { id: 'cuisine-yakitori', re: /焼き鳥|焼鳥|やきとり/iu, dishes: ['烤鸡串', '鸡肉串'] },
    { id: 'cuisine-yakiniku', re: /焼肉|ホルモン|烤肉/iu, dishes: ['烤肉', '牛舌'] },
    { id: 'cuisine-udon', re: /うどん|乌冬/iu, dishes: ['乌冬面', '天妇罗'] },
    { id: 'cuisine-soba', re: /そば|蕎麦|荞麦/iu, dishes: ['荞麦面', '天妇罗'] },
    { id: 'cuisine-tempura', re: /天ぷら|天麩羅|天丼|天妇罗/iu, dishes: ['天妇罗', '天妇罗盖饭'] },
    { id: 'cuisine-tonkatsu', re: /とんかつ|豚カツ|炸猪排/iu, dishes: ['炸猪排', '炸猪排套餐'] },
    { id: 'cuisine-okonomiyaki', re: /お好み焼|もんじゃ|大阪烧|文字烧/iu, dishes: ['大阪烧', '文字烧'] },
    { id: 'cuisine-takoyaki', re: /たこ焼|章鱼烧/iu, dishes: ['章鱼烧', '大阪烧'] },
    { id: 'cuisine-sukiyaki', re: /すき焼|寿喜烧/iu, dishes: ['寿喜烧', '牛肉锅'] },
    { id: 'cuisine-shabushabu', re: /しゃぶしゃぶ|涮涮锅/iu, dishes: ['涮涮锅', '牛肉锅'] },
    { id: 'cuisine-sichuan', re: /四川/iu, dishes: ['麻婆豆腐', '担担面'] },
    { id: 'cuisine-shanghai', re: /上海/iu, dishes: ['小笼包', '红烧肉'] },
    { id: 'cuisine-taiwan', re: /台湾/iu, dishes: ['卤肉饭', '煎饺'] },
    { id: 'cuisine-chinese', re: /中華|中国料理|中华|中餐/iu, dishes: ['炒饭', '煎饺'] },
    { id: 'cuisine-indian', re: /インド|印度|ネパール|尼泊尔/iu, dishes: ['印度咖喱', '馕'] },
    { id: 'cuisine-thai', re: /タイ料理|泰国|泰式/iu, dishes: ['泰式炒河粉', '绿咖喱'] },
    { id: 'cuisine-korean', re: /韓国|韩国|韓式|韩式/iu, dishes: ['韩式烤肉', '海鲜煎饼'] },
    { id: 'cuisine-italian', re: /イタリアン|パスタ|意大利/iu, dishes: ['意大利面', '披萨'] },
    { id: 'cuisine-pizza', re: /ピザ|披萨/iu, dishes: ['披萨', '意大利面'] },
    { id: 'cuisine-burger', re: /ハンバーガー|汉堡/iu, dishes: ['汉堡', '薯条'] },
    { id: 'cuisine-yoshoku', re: /ハンバーグ|洋食|西餐/iu, dishes: ['汉堡肉排', '蛋包饭'] },
    { id: 'cuisine-gyoza', re: /餃子|饺子/iu, dishes: ['煎饺', '水饺'] },
    { id: 'cuisine-seafood', re: /海鮮|海鲜|刺身|魚料理|鱼料理/iu, dishes: ['生鱼片', '烤鱼'] },
    { id: 'cuisine-izakaya', re: /居酒屋/iu, dishes: ['生鱼片', '炸鸡块'] },
    { id: 'cuisine-karaage', re: /唐揚|からあげ|炸鸡/iu, dishes: ['日式炸鸡', '炸鸡块'] },
    { id: 'cuisine-cafe', re: /カフェ|cafe|coffee|珈琲|喫茶|咖啡/iu, dishes: ['咖啡', '三明治'] },
    { id: 'cuisine-bakery', re: /bakery|ベーカリー|パン|面包/iu, dishes: ['面包', '三明治'] },
    { id: 'cuisine-steak', re: /ステーキ|牛排/iu, dishes: ['牛排', '沙拉'] },
    { id: 'cuisine-french', re: /フレンチ|法餐|法国料理/iu, dishes: ['牛排', '甜点'] },
    { id: 'cuisine-bistro', re: /ビストロ|bistro/iu, dishes: ['牛排', '法式小菜'] },
    { id: 'cuisine-bar', re: /(^|\s)bar($|\s)|バー|酒吧/iu, dishes: ['下酒小食', '炸鸡块'] },
    { id: 'cuisine-setmeal', re: /定食|食堂|套餐/iu, dishes: ['日式套餐', '炸鸡块'] },
    { id: 'cuisine-donburi', re: /丼|盖饭/iu, dishes: ['盖饭', '温泉蛋'] }
  ];

  const inferDishes = (row) => {
    const haystack = [
      row?.name,
      row?.cuisine,
      ...(Array.isArray(row?.tags) ? row.tags : [])
    ].map((value) => String(value || '')).join(' ').normalize('NFKC').toLowerCase();

    for (const rule of RULES) {
      if (rule.re.test(haystack)) {
        const dishes = dedupeChinese(rule.dishes, 2);
        if (dishes.length) return { rule: rule.id, dishes };
      }
    }
    return { rule: 'generic-restaurant', dishes: ['招牌主菜', '时令小菜'] };
  };

  const patchRows = (rows) => {
    const stats = {
      total: Array.isArray(rows) ? rows.length : 0,
      preservedRecommended: 0,
      preservedFeatured: 0,
      patchedApproximate: 0,
      genericFallback: 0
    };
    if (!Array.isArray(rows)) return stats;

    for (const row of rows) {
      // Display only Chinese recommendation strings. If an existing source-backed
      // recommendation lacks a Chinese translation, let Chinese featured data or
      // the relaxed fallback take over instead of leaking Japanese into the UI.
      const existingRecommended = dedupeChinese(row.recommendedDishes, 3);
      row.recommendedDishes = existingRecommended;
      if (existingRecommended.length) {
        stats.preservedRecommended += 1;
        continue;
      }

      const featuredChinese = dedupeChinese(row.featuredDishes, 3);
      if (featuredChinese.length) {
        stats.preservedFeatured += 1;
        continue;
      }

      const inferred = inferDishes(row);
      row.recommendedDishes = inferred.dishes;
      row.dishRecommendationConfidence = 'approximate';
      row.dishRecommendationBasis = inferred.rule;
      row.dishRecommendationLanguage = 'zh-CN';
      row.dishRecommendationDisplayPolicy = 'relaxed-zh-v1';
      stats.patchedApproximate += 1;
      if (inferred.rule === 'generic-restaurant') stats.genericFallback += 1;
    }
    return stats;
  };

  const inventory = patchRows(window.GOOGLE_INVENTORY_RESTAURANTS);
  const production = patchRows(window.PRODUCTION_RESTAURANTS);
  window.CHINESE_DISH_FALLBACK_STATS = {
    policy: 'relaxed-zh-v1',
    language: 'zh-CN',
    evidencePromotion: false,
    inventory,
    production
  };
})();
