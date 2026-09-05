// Generated only from explicit labelled fields on current direct official pages.
// Menu-item prices are never converted into restaurant budget ranges.
const EXPLICIT_FIELDS_CHECKED_AT = "2026-09-06";
const explicitFieldPatches = [
  {
    "googlePlaceId": "ChIJDUGL7RCMGGARErPxhJ7bXgc",
    "name": "ヒナタ屋",
    "sourceUrl": "https://hinata-ya.info/",
    "address": "東京都千代田区神田小川町3-10",
    "lunch": null,
    "dinner": null,
    "lunchEvidence": null,
    "dinnerEvidence": null
  },
  {
    "googlePlaceId": "ChIJe4ebpD-MGGARksrpQ0_0cLs",
    "name": "焼肉京城",
    "sourceUrl": "https://keijo-suidobashi.com/?utm_source=google&utm_medium=meo",
    "address": "東京都千代田区神田三崎町2-10-3",
    "lunch": null,
    "dinner": null,
    "lunchEvidence": null,
    "dinnerEvidence": null
  }
];
for (const patch of explicitFieldPatches) {
  const fields=['name']; if(patch.address)fields.push('address'); if(patch.lunch||patch.dinner)fields.push('budget');
  const ref={provider:'official',url:patch.sourceUrl,checkedAt:EXPLICIT_FIELDS_CHECKED_AT,fields};
  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);
  if(!row){row={id:`src-explicit-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}
  row.name=patch.name; if(patch.address)row.address=patch.address; if(patch.lunch)row.lunch=patch.lunch; if(patch.dinner)row.dinner=patch.dinner;
  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; const owned=new Set(fields); row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>!owned.has(field))}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);
}
