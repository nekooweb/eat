// Small zero-Google featured-dish continuation after Pass 2.
// In the canonical combined loader these patches augment an existing official
// row. In standalone report loaders the shard creates a minimal official row so
// coverage/audit tooling can inspect the file without depending on load order.

const FEATURED_PASS3_CHECKED_AT = '2026-09-06';

const featuredPass3 = [
  ['ChIJTTQAOBGMGGARXRYbp0wUyAM','カフェ・ベローチェ 神保町店','https://c-united.co.jp/veloce/products/hotdrink/coffee/',['ブレンドコーヒー'],[
    {nameJa:'ブレンドコーヒー',nameZh:'招牌混合咖啡',kind:'representative'}
  ]],
  ['ChIJyb94PwOMGGARtDDndNvDe9Y','カフェ・ベローチェ','https://c-united.co.jp/veloce/products/hotdrink/coffee/',['ブレンドコーヒー'],[
    {nameJa:'ブレンドコーヒー',nameZh:'招牌混合咖啡',kind:'representative'}
  ]],
  ['ChIJd7fvogSMGGARfHdtBLSTq_k',"Domino's Pizza 淡路町",'https://www.dominos.jp/menu-pizza/1602',['ドミノ・デラックス'],[
    {nameJa:'ドミノ・デラックス',nameZh:'Domino豪华披萨',kind:'representative'}
  ]],
  ['ChIJS9VGpBuMGGAR1hMANtBU8Ws','YEBISU BAR 御茶ノ水店','https://www.ginzalion.jp/shop/brand/yebisubar/shop64.html',['「YEBISU BAR」の肉豆富','真鯛のフィッシュ＆チップス'],[
    {nameJa:'「YEBISU BAR」の肉豆富',nameZh:'YEBISU BAR肉豆腐',kind:'signature'},
    {nameJa:'真鯛のフィッシュ＆チップス',nameZh:'真鲷炸鱼薯条',kind:'signature'}
  ]]
];

function mergePass3Strings(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean))];
}

window.RESTAURANTS ||= [];
window.FEATURED_DISHES ||= [];
for (const [googlePlaceId,name,sourceUrl,legacyDishes,dishes] of featuredPass3) {
  const ref = {provider:'official',url:sourceUrl,checkedAt:FEATURED_PASS3_CHECKED_AT,fields:['dishes']};
  let row = [...window.RESTAURANTS].reverse().find((item) =>
    item && item.googlePlaceId === googlePlaceId && item.source === 'official' && item.sourceOnly);

  if (row) {
    row.dishes = mergePass3Strings(row.dishes, legacyDishes).slice(0, 4);
    row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
    if (!row.sourceRefs.some((item) => item.url === sourceUrl && (item.fields || []).includes('dishes'))) {
      row.sourceRefs.push(ref);
    }
  } else {
    // Standalone report loaders evaluate each source shard in isolation. This
    // fallback makes the shard self-contained; the canonical combined loader
    // will take the augmentation path above because its official rows already
    // exist before this `zz` shard is loaded.
    row = {
      id:`src-featured-pass3-${googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,
      profile:'TOKYO', area:'地区1️⃣', name, googlePlaceId,
      source:'official', sourceOnly:true, dishes:[...legacyDishes], sourceRefs:[ref]
    };
    window.RESTAURANTS.push(row);
  }

  if (!window.FEATURED_DISHES.some((item) => item.googlePlaceId === googlePlaceId)) {
    window.FEATURED_DISHES.push({googlePlaceId,dishes,sourceUrl,checkedAt:FEATURED_PASS3_CHECKED_AT});
  }
}
