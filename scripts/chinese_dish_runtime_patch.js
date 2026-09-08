(() => {
  'use strict';

  const POLICY = 'strict-source-zh-v1';
  const HAN_RE = /[\u3400-\u9fff]/u;
  const KANA_RE = /[\u3040-\u30ff]/u;
  const APPROXIMATE_FIELDS = [
    'dishRecommendationConfidence',
    'dishRecommendationBasis',
    'dishRecommendationQualityTier',
    'dishRecommendationLanguage',
    'dishRecommendationDisplayPolicy'
  ];

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

  const dedupeRecommended = (items, limit = 3) => {
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

  const dedupeFeatured = (items, limit = 3) => {
    const output = [];
    const seen = new Set();
    for (const item of items || []) {
      const key = chineseDishName(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(item);
      if (output.length >= limit) break;
    }
    return output;
  };

  const sanitizeRows = (rows) => {
    const stats = {
      total: Array.isArray(rows) ? rows.length : 0,
      rowsWithRecommended: 0,
      rowsWithFeaturedOnly: 0,
      rowsWithoutDishEvidence: 0,
      strippedRecommendedItems: 0,
      strippedFeaturedItems: 0,
      removedApproximateMetadataRows: 0
    };
    if (!Array.isArray(rows)) return stats;

    for (const row of rows) {
      const rawRecommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [];
      const rawFeatured = Array.isArray(row.featuredDishes) ? row.featuredDishes : [];
      const recommended = dedupeRecommended(rawRecommended, 3);
      const featured = dedupeFeatured(rawFeatured, 3);

      stats.strippedRecommendedItems += Math.max(0, rawRecommended.length - recommended.length);
      stats.strippedFeaturedItems += Math.max(0, rawFeatured.length - featured.length);

      row.recommendedDishes = recommended;
      row.featuredDishes = featured;

      let removedApproximateMetadata = false;
      for (const field of APPROXIMATE_FIELDS) {
        if (!Object.hasOwn(row, field)) continue;
        delete row[field];
        removedApproximateMetadata = true;
      }
      if (removedApproximateMetadata) stats.removedApproximateMetadataRows += 1;

      if (recommended.length) stats.rowsWithRecommended += 1;
      else if (featured.length) stats.rowsWithFeaturedOnly += 1;
      else stats.rowsWithoutDishEvidence += 1;
    }
    return stats;
  };

  const inventory = sanitizeRows(window.GOOGLE_INVENTORY_RESTAURANTS);
  const production = sanitizeRows(window.PRODUCTION_RESTAURANTS);

  window.CHINESE_DISH_FALLBACK_STATS = {
    policy: POLICY,
    language: 'zh-CN',
    evidencePromotion: false,
    approximateRecommendationsAllowed: false,
    genericFallbackAllowed: false,
    inventory,
    production
  };
})();
