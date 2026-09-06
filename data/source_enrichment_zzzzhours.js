// Reviewed official-hours patch for source-backed production identities.
// Only explicit current branch facts are retained. No inference from a bare
// interval is allowed without source evidence for the regular closure pattern.
window.RESTAURANTS.push(
  {
    id: 'src-official-hours-daisyo-suisan-suidobashi',
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '大庄水産 水道橋店',
    googlePlaceId: 'ChIJs1zmzD-MGGAR_TWUpga5JUs',
    source: 'official',
    sourceOnly: true,
    address: '東京都千代田区神田三崎町2丁目8-7 庄や第1ビル1階',
    openingHoursRaw: '毎日 11:30–23:30',
    closedDays: ['無休'],
    closedNote: '年中無休',
    sourceRefs: [{
      provider: 'official',
      url: 'https://search.daisyo.co.jp/shop.php?shop_cd=1922',
      checkedAt: '2026-09-06',
      fields: ['name', 'address', 'hours', 'closure']
    }]
  }
);
