// Generated from trusted official store/branch locator templates.
// Exact Place-ID + official-page identity agreement is required; ambiguous schedules are omitted.
const LOCATOR_TEMPLATE_CHECKED_AT = "2026-09-06";
const locatorTemplatePatches = [
  {
    "googlePlaceId": "ChIJCRf6uziMGGARPOpXUziKe7s",
    "name": "タリーズコーヒー",
    "sourceUrl": "https://shop.tullys.co.jp/detail/1710899?utm_source=google&utm_medium=gbp&utm_campaign=map",
    "address": null,
    "openingHoursRaw": "日曜日 09:00-21:00; 月曜日 09:00-21:00; 火曜日 09:00-21:00; 水曜日 09:00-21:00; 木曜日 09:00-21:00; 金曜日 09:00-21:00; 土曜日 09:00-21:00",
    "closedDays": [],
    "knownDays": 7,
    "currentKnownDays": 1
  },
  {
    "googlePlaceId": "ChIJhXD3-AaMGGARbLVQPEtml80",
    "name": "上島珈琲店",
    "sourceUrl": "https://shop.ufs.co.jp/ufs/spot/detail?code=3691",
    "address": null,
    "openingHoursRaw": "平日 07:00-21:00",
    "closedDays": [
      "土日祝"
    ],
    "knownDays": 8,
    "currentKnownDays": 5
  },
  {
    "googlePlaceId": "ChIJVwXD9E6NGGARkHzeYVBeacw",
    "name": "タリーズコーヒー 住友不動産秋葉原ファーストビル・テラス店",
    "sourceUrl": "https://shop.tullys.co.jp/detail/1003115?utm_source=google&utm_medium=gbp&utm_campaign=map",
    "address": null,
    "openingHoursRaw": "日曜日 07:00-21:00; 月曜日 07:00-22:00; 火曜日 07:00-22:00; 水曜日 07:00-22:00; 木曜日 07:00-22:00; 金曜日 07:00-22:00; 土曜日 07:00-22:00",
    "closedDays": [],
    "knownDays": 7,
    "currentKnownDays": 7
  }
];
for (const patch of locatorTemplatePatches) {
  const fields=['name']; if(patch.address)fields.push('address'); if(patch.openingHoursRaw)fields.push('hours');
  const ref={provider:'official',url:patch.sourceUrl,checkedAt:LOCATOR_TEMPLATE_CHECKED_AT,fields};
  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);
  if(!row){row={id:`src-locator-template-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}
  row.name=patch.name; if(patch.address)row.address=patch.address;
  if(patch.openingHoursRaw){row.openingHoursRaw=patch.openingHoursRaw;row.closedDays=patch.closedDays||[];row.closedNote=null;}
  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; const owned=new Set(fields); row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>!owned.has(field))}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);
}
