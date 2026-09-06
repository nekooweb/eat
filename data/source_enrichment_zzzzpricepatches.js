// Reviewed official-menu price patches.
//
// During the normal canonical build these patches merge into an already-bound
// official row for the exact production Place ID. Audit/report scripts may load
// this shard in isolation, so the compatibility path below creates a minimal
// official source row only inside that isolated load context. No production
// identity is created by this file.
//
// `menu_derived` evidence is intentionally lower priority than an explicit
// branch budget/average-spend range.

const OFFICIAL_MENU_PRICE_CHECKED_AT = '2026-09-06';

const officialMenuPricePatches = [
  {
    googlePlaceId: 'ChIJ81Ua8xCMGGARMrzeHYIaVbg',
    name: '神田たまごけん神保町店',
    sourceUrl: 'https://tamagoken.com/shop/jinbocho/',
    lunch: [990, 1490],
    dinner: [990, 1490],
    fields: ['lunchBudget', 'dinnerBudget'],
    priceEvidenceClass: 'menu_derived',
    derivation: {
      method: 'current-core-main-menu-range',
      observedYen: [990, 990, 990, 1150, 1490],
      note: 'Current branch page lists the same core omelette-rice menu during continuous 11:00-20:00 opening hours; seasonal/limited items are excluded from the representative range.'
    }
  },
  {
    googlePlaceId: 'ChIJe49KxxWMGGAR4qS4zBvOWr8',
    name: 'シリ バラジ',
    sourceUrl: 'https://sri-balaji.com/pdf/lunch_suidobashi.pdf',
    lunch: [800, 1400],
    fields: ['lunchBudget'],
    priceEvidenceClass: 'menu_derived',
    derivation: {
      method: 'complete-lunch-set-range',
      observedYen: [800, 900, 1400],
      note: 'Official Suidobashi lunch PDF lists three complete lunch sets at 800, 900 and 1400 yen.'
    }
  }
];

for (const patch of officialMenuPricePatches) {
  let row = [...window.RESTAURANTS].reverse().find((item) =>
    item
    && item.googlePlaceId === patch.googlePlaceId
    && item.source === 'official'
    && item.sourceOnly
  );

  if (!row) {
    row = {
      id: `src-official-menu-price-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g, '')}`,
      profile: 'TOKYO',
      area: '地区1️⃣',
      name: patch.name,
      googlePlaceId: patch.googlePlaceId,
      source: 'official',
      sourceOnly: true,
      sourceRefs: []
    };
    window.RESTAURANTS.push(row);
  }

  if (patch.lunch) row.lunch = patch.lunch;
  if (patch.dinner) row.dinner = patch.dinner;
  row.priceDerivations = Array.isArray(row.priceDerivations) ? row.priceDerivations : [];
  row.priceDerivations.push({
    sourceUrl: patch.sourceUrl,
    checkedAt: OFFICIAL_MENU_PRICE_CHECKED_AT,
    evidenceClass: patch.priceEvidenceClass,
    ...patch.derivation
  });

  const owned = new Set(patch.fields);
  row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
  row.sourceRefs = row.sourceRefs
    .map((ref) => {
      if (!ref || ref.provider !== 'official') return ref;
      const remaining = (ref.fields || []).filter((field) => !owned.has(field));
      return remaining.length ? { ...ref, fields: remaining } : null;
    })
    .filter(Boolean);
  row.sourceRefs.push({
    provider: 'official',
    url: patch.sourceUrl,
    checkedAt: OFFICIAL_MENU_PRICE_CHECKED_AT,
    fields: patch.fields,
    priceEvidenceClass: patch.priceEvidenceClass,
    derivationMethod: patch.derivation.method
  });
}
