(() => {
  const DIMENSIONS = Object.freeze([
    Object.freeze({ id: 'cuisineStyle', label: '菜系风格' }),
    Object.freeze({ id: 'foodType', label: '主营食物' }),
    Object.freeze({ id: 'venueType', label: '店铺类型' })
  ]);

  const CONCEPTS = Object.freeze([
    // Cuisine style. Composite source categories remain standalone concepts instead of being split.
    { id: 'style-japanese', dimension: 'cuisineStyle', label: '日式', aliases: ['日式', '和食', '日本料理'] },
    { id: 'style-chinese', dimension: 'cuisineStyle', label: '中餐', aliases: ['中华', '中華', '中華料理', '中餐'] },
    { id: 'style-sichuan', dimension: 'cuisineStyle', label: '川菜', parentId: 'style-chinese', aliases: ['四川菜', '川菜'] },
    { id: 'style-taiwanese', dimension: 'cuisineStyle', label: '台湾料理', aliases: ['台湾菜', '台湾料理'] },
    { id: 'style-korean', dimension: 'cuisineStyle', label: '韩式', aliases: ['韩国菜', '韓国料理', '韩式'] },
    { id: 'style-indian', dimension: 'cuisineStyle', label: '印度料理', aliases: ['印度料理', '印度菜', 'インド料理', 'Indian restaurant'] },
    { id: 'style-thai', dimension: 'cuisineStyle', label: '泰式', aliases: ['泰国菜', '泰式', 'タイ料理'] },
    { id: 'style-italian', dimension: 'cuisineStyle', label: '意大利料理', aliases: ['意大利菜', '意大利料理', 'イタリアン'] },
    { id: 'style-french', dimension: 'cuisineStyle', label: '法国料理', aliases: ['法餐', '法国菜', '法国料理', 'フレンチ'] },
    { id: 'style-western', dimension: 'cuisineStyle', label: '西式', aliases: ['西式', '西餐', '洋食'] },
    { id: 'style-okinawan', dimension: 'cuisineStyle', label: '冲绳菜', aliases: ['冲绳菜', '冲绳料理', '沖縄料理'] },
    { id: 'style-italian-french-unsplit', dimension: 'cuisineStyle', label: '意法料理（未细分）', aliases: ['イタリアン・フレンチ'] },
    { id: 'style-asian-unsplit', dimension: 'cuisineStyle', label: '亚洲料理（未细分）', aliases: ['亚洲料理', 'アジア・エスニック料理'] },
    { id: 'style-creative', dimension: 'cuisineStyle', label: '创意料理', aliases: ['創作料理'] },
    { id: 'style-vietnamese', dimension: 'cuisineStyle', label: '越南料理', aliases: ['越南菜'] },
    { id: 'style-international-unsplit', dimension: 'cuisineStyle', label: '各国料理（未细分）', aliases: ['各国料理'] },
    { id: 'style-spanish', dimension: 'cuisineStyle', label: '西班牙料理', aliases: ['西班牙菜'] },
    { id: 'style-american', dimension: 'cuisineStyle', label: '美式', aliases: ['美式'] },

    // Main food type. Parent/child relations exist only inside this dimension.
    { id: 'food-noodles', dimension: 'foodType', label: '面类', aliases: ['面食', '面类'] },
    { id: 'food-ramen', dimension: 'foodType', label: '拉面', parentId: 'food-noodles', aliases: ['拉面', 'ラーメン', 'らーめん'] },
    { id: 'food-udon', dimension: 'foodType', label: '乌冬', parentId: 'food-noodles', aliases: ['乌冬', '乌冬面', 'うどん', '饂飩'] },
    { id: 'food-soba', dimension: 'foodType', label: '荞麦面', parentId: 'food-noodles', aliases: ['荞麦面', '蕎麦', 'そば'] },
    { id: 'food-sushi', dimension: 'foodType', label: '寿司', aliases: ['寿司', '鮨', 'すし'] },
    { id: 'food-curry', dimension: 'foodType', label: '咖喱', aliases: ['咖喱', 'カレー', 'カリー'] },
    { id: 'food-indian-curry', dimension: 'foodType', label: '印度咖喱', parentId: 'food-curry', aliases: ['印度咖喱'] },
    { id: 'food-yakiniku', dimension: 'foodType', label: '烤肉', aliases: ['烤肉', '烧肉', '焼肉'] },
    { id: 'food-yakiniku-horumon-unsplit', dimension: 'foodType', label: '烤肉·内脏（未细分）', aliases: ['焼肉・ホルモン'] },
    { id: 'food-yakitori', dimension: 'foodType', label: '烧鸟', aliases: ['烧鸟', '焼鳥', '焼き鳥', 'やきとり'] },
    { id: 'food-hamburger', dimension: 'foodType', label: '汉堡', aliases: ['汉堡', 'ハンバーガー'] },
    { id: 'food-hamburg-steak', dimension: 'foodType', label: '汉堡排', aliases: ['汉堡排', 'ハンバーグ'] },
    { id: 'food-okonomiyaki-monja', dimension: 'foodType', label: '御好烧·文字烧', aliases: ['お好み焼き・もんじゃ'] },
    { id: 'food-seafood', dimension: 'foodType', label: '海鲜', aliases: ['海鲜', '海鮮'] },
    { id: 'food-dessert', dimension: 'foodType', label: '甜品', aliases: ['甜品', 'スイーツ'] },
    { id: 'food-steak', dimension: 'foodType', label: '牛排', aliases: ['牛排', 'ステーキ'] },
    { id: 'food-bread-bakery-unsplit', dimension: 'foodType', label: '面包·烘焙（未细分）', aliases: ['面包・烘焙'] },
    { id: 'food-pizza', dimension: 'foodType', label: '披萨', aliases: ['披萨'] },
    { id: 'food-tempura', dimension: 'foodType', label: '天妇罗', aliases: ['天妇罗'] },
    { id: 'food-biryani', dimension: 'foodType', label: '比里亚尼', aliases: ['ビリヤニ'] },
    { id: 'food-tonkatsu', dimension: 'foodType', label: '炸猪排', aliases: ['炸猪排'] },
    { id: 'food-sandwich', dimension: 'foodType', label: '三明治', aliases: ['サンドイッチ'] },

    // Venue type. Composite cafe/sweets remains unsplit and does not imply cafe + dessert.
    { id: 'venue-izakaya', dimension: 'venueType', label: '居酒屋', aliases: ['居酒屋'] },
    { id: 'venue-bar', dimension: 'venueType', label: '酒吧', aliases: ['酒吧', 'バー・カクテル'] },
    { id: 'venue-dining-bar', dimension: 'venueType', label: '餐酒馆', aliases: ['餐酒馆', 'ダイニングバー', 'ダイニングバー・バル'] },
    { id: 'venue-cafe', dimension: 'venueType', label: '咖啡店', aliases: ['咖啡', '咖啡馆', '咖啡店', '喫茶店', 'カフェ'] },
    { id: 'venue-cafe-sweets-unsplit', dimension: 'venueType', label: '咖啡·甜品（未细分）', aliases: ['カフェ・スイーツ'] },
    { id: 'venue-bakery', dimension: 'venueType', label: '烘焙店', aliases: ['烘焙店', '面包店', 'ベーカリー'] },
    { id: 'venue-fast-food', dimension: 'venueType', label: '快餐', aliases: ['快餐', 'ファストフード'] },
    { id: 'venue-party', dimension: 'venueType', label: '聚会餐饮', aliases: ['聚会餐饮', 'カラオケ・パーティ'] },
    { id: 'venue-shokudo', dimension: 'venueType', label: '食堂', aliases: ['食堂'] }
  ].map((concept) => Object.freeze({ ...concept, aliases: Object.freeze([...concept.aliases]) })));

  const GENERIC_SOURCE_VALUES = new Set(['', '餐厅', 'restaurant', 'その他グルメ']);
  const conceptById = new Map(CONCEPTS.map((concept) => [concept.id, concept]));

  function normalizeSourceValue(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ')
      .toLocaleLowerCase('en-US');
  }

  const aliasToConceptId = new Map();
  for (const concept of CONCEPTS) {
    for (const alias of concept.aliases) {
      const key = normalizeSourceValue(alias);
      if (aliasToConceptId.has(key) && aliasToConceptId.get(key) !== concept.id) {
        throw new Error(`Classification alias collision: ${alias}`);
      }
      aliasToConceptId.set(key, concept.id);
    }
  }

  function sourceValues(restaurant) {
    const values = [];
    if (restaurant && restaurant.cuisine != null) values.push(restaurant.cuisine);
    if (Array.isArray(restaurant?.tags)) values.push(...restaurant.tags);
    const unique = new Map();
    for (const value of values) {
      const normalized = normalizeSourceValue(value);
      if (!normalized || GENERIC_SOURCE_VALUES.has(normalized)) continue;
      if (!unique.has(normalized)) unique.set(normalized, String(value).normalize('NFKC').trim());
    }
    return [...unique.values()];
  }

  function directConceptIds(restaurant) {
    const ids = new Set();
    for (const value of sourceValues(restaurant)) {
      const id = aliasToConceptId.get(normalizeSourceValue(value));
      if (id) ids.add(id);
    }
    return ids;
  }

  function addAncestors(ids) {
    const effective = new Set(ids);
    for (const id of ids) {
      let current = conceptById.get(id);
      const visited = new Set([id]);
      while (current?.parentId) {
        if (visited.has(current.parentId)) throw new Error(`Classification parent cycle at ${current.parentId}`);
        visited.add(current.parentId);
        effective.add(current.parentId);
        current = conceptById.get(current.parentId);
      }
    }
    return effective;
  }

  function classifyRestaurant(restaurant) {
    const directIds = directConceptIds(restaurant);
    const effectiveIds = addAncestors(directIds);
    return Object.freeze({
      directIds: Object.freeze([...directIds]),
      effectiveIds: Object.freeze([...effectiveIds])
    });
  }

  function hasEffectiveConcept(restaurant, conceptId) {
    return classifyRestaurant(restaurant).effectiveIds.includes(conceptId);
  }

  function directLabels(restaurant) {
    return classifyRestaurant(restaurant).directIds
      .map((id) => conceptById.get(id)?.label)
      .filter(Boolean);
  }

  function primaryDisplayLabel(restaurant) {
    const cuisineKey = normalizeSourceValue(restaurant?.cuisine);
    if (!cuisineKey || GENERIC_SOURCE_VALUES.has(cuisineKey)) return '';
    const conceptId = aliasToConceptId.get(cuisineKey);
    return conceptId ? conceptById.get(conceptId)?.label || '' : String(restaurant.cuisine).normalize('NFKC').trim();
  }

  function conceptCounts(restaurants) {
    const counts = new Map(CONCEPTS.map((concept) => [concept.id, 0]));
    for (const restaurant of restaurants || []) {
      const effective = new Set(classifyRestaurant(restaurant).effectiveIds);
      for (const id of effective) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }

  function conceptsForDimension(dimension, counts = null) {
    return CONCEPTS
      .filter((concept) => concept.dimension === dimension)
      .filter((concept) => !counts || (counts.get(concept.id) || 0) > 0);
  }

  function resolveConceptToken(token) {
    if (conceptById.has(token)) return token;
    return aliasToConceptId.get(normalizeSourceValue(token)) || null;
  }

  window.EAT_CLASSIFICATION = Object.freeze({
    version: 'classification-v2-20260918',
    dimensions: DIMENSIONS,
    concepts: CONCEPTS,
    normalizeSourceValue,
    classifyRestaurant,
    hasEffectiveConcept,
    directLabels,
    primaryDisplayLabel,
    conceptCounts,
    conceptsForDimension,
    resolveConceptToken
  });
})();
