// Conservative current-hours patches from trusted official store locator pages.
// This z-shard augments an existing official enrichment row where possible,
// preserving the one-official-row-per-Place-ID source-binding invariant.
// Temporary/news language is rejected before this file is generated.
const LOCATOR_HOURS_CHECKED_AT = "2026-09-06";
const locatorHourPatches = [
  { googlePlaceId:"ChIJ4SygCUSMGGAR5k9kG84PJi8", name:"しゃぶしゃぶ温野菜", sourceUrl:"https://map.reins.co.jp/onyasai/detail/353571229", openingHoursRaw:"2026/09/06 日曜日 11:30~23:00 2026/09/07 月曜日 17:00~23:00 2026/09/08 火曜日 17:00~23:00 2026/09/09 水曜日 17:00~23:00 2026/09/10 木曜日 17:00~23:00 2026/09/11 金曜日 17:00~23:00 2026/09/12 土曜日 11:30~23:00 ※ラストオーダーは、閉店時間の60分前となっております。 Google マップで混雑状況をみる メニュー 〔休日昼営業〕 通常メニュー 決済方法 クレジットカード QRコード決済 電子マネー 交通系電子マネー 備考 駐車場:なし 座席数:82席 キッズルーム:なし Googleマップでみる TOP メニュー しゃぶしゃぶ食べ放題 しゃぶしゃぶ御膳 ランチ 食べ飲み放題 テイクアウト キッズ ドリンク 単品メニュー 店舗検索 展開地域一覧 温野菜のこだわり 公式アプリの紹介 お知らせ 産地・アレルギー情報 各種決済サービス 店舗検索 展開地域一覧 温野菜のこだわり 公式アプリの紹介 お知らせ 産地・アレルギー情報 各" },
  { googlePlaceId:"ChIJCRf6uziMGGARPOpXUziKe7s", name:"タリーズコーヒー", sourceUrl:"https://shop.tullys.co.jp/detail/1710899?utm_source=google&utm_medium=gbp&utm_campaign=map", openingHoursRaw:"日曜日 09:00~21:00 月曜日 09:00~21:00 火曜日 09:00~21:00 水曜日 09:00~21:00 木曜日 09:00~21:00 金曜日 09:00~21:00 土曜日 09:00~21:00 ※全日15分前ラストオーダー Google マップで混雑状況をみる View congestion on Google Map お知らせ 2026.09.02 - 2026.09.15 \\東京都限定/ 「OIMOラテ × ほっこり大学芋」「OIMO シェイクール × ほっこり大学芋」が本日発売!濃厚な紅はるかのソースをベースに使用した、ご当地限定ドリンクです。 続きを読む お知らせ一覧をみる 電子マネー 交通系電子マネー 楽天Edy QUICPay iD クレジットカード VISAカード MasterCard QRコード決済 メルペイ メニュー デカフェ・ エスプレッソ 設備 Tully’s Wi-Fi 禁煙 Tully’s Wi-Fiの詳細はこちら その他サービス タリーズカード ドリンクチケット タリーズカードの詳細はこちら デリバリー Uber Eats 近隣" },
  { googlePlaceId:"ChIJJ8_bnU6NGGARsXyvg0mnXI0", name:"つじ田", sourceUrl:"https://tsukemen-tsujita.com/shop/?id=0010019", openingHoursRaw:"月〜日:11:00〜21:30 Googleマップで混雑状況をみる" },
  { googlePlaceId:"ChIJV3V4uRSNGGARPSLntvfs_ME", name:"ラーメン豚山 神保町店", sourceUrl:"https://shop.butayama.com/detail/112110/?utm_source=gbp?utm_medium=organic", openingHoursRaw:"月〜日 11:00〜22:30 Googleマップで混雑状況をみる" },
  { googlePlaceId:"ChIJhXD3-AaMGGARbLVQPEtml80", name:"上島珈琲店", sourceUrl:"https://shop.ufs.co.jp/ufs/spot/detail?code=3691", openingHoursRaw:"平日 07:00~21:00" }
];

for (const patch of locatorHourPatches) {
  const ref = { provider:'official', url:patch.sourceUrl, checkedAt:LOCATOR_HOURS_CHECKED_AT, fields:['hours'] };
  let row = [...window.RESTAURANTS].reverse().find((item) => item && item.googlePlaceId === patch.googlePlaceId && item.source === 'official' && item.sourceOnly);
  if (row) {
    row.openingHoursRaw = patch.openingHoursRaw;
    row.closedDays = [];
    row.closedNote = null;
    row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
    row.sourceRefs = row.sourceRefs.filter((item) => !(item.provider === 'official' && (item.fields || []).includes('hours')));
    row.sourceRefs.push(ref);
  } else {
    window.RESTAURANTS.push({ id:`src-locator-hours-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`, profile:'TOKYO', area:'地区1️⃣', name:patch.name, googlePlaceId:patch.googlePlaceId, source:'official', sourceOnly:true, openingHoursRaw:patch.openingHoursRaw, closedDays:[], closedNote:null, sourceRefs:[ref] });
  }
}
