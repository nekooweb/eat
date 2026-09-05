// Generated from current single-business official pages with explicit weekly hours.
// Existing source-backed identities only; platform/locator/resolution/conditional schedules are excluded.
const SINGLE_SITE_HOURS_CHECKED_AT = "2026-09-06";
const singleSiteHoursPatches = [
  {
    "googlePlaceId": "ChIJDUGL7RCMGGARErPxhJ7bXgc",
    "name": "ヒナタ屋",
    "sourceUrl": "https://hinata-ya.info/",
    "openingHoursRaw": "月 11:30-15:30; 火 11:30-15:30; 水 11:30-15:30; 木 11:30-15:30; 金 11:30-15:30; 土 11:30-15:30",
    "closedDays": [
      "日",
      "祝"
    ],
    "knownDays": 8
  },
  {
    "googlePlaceId": "ChIJ2QzuEhCMGGAR_GwijOC6vao",
    "name": "眞踏珈琲店",
    "sourceUrl": "https://mafumicofffee.vercel.app/",
    "openingHoursRaw": "月 12:00-23:00; 火 12:00-23:00; 水 12:00-23:00; 木 12:00-23:00; 金 12:00-23:00; 土 12:00-23:00; 日 12:00-21:00; 祝 12:00-21:00",
    "closedDays": [],
    "knownDays": 8
  }
];
for (const patch of singleSiteHoursPatches) {
  const ref={provider:'official',url:patch.sourceUrl,checkedAt:SINGLE_SITE_HOURS_CHECKED_AT,fields:['name','hours']};
  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);
  if(!row){row={id:`src-single-hours-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}
  row.name=patch.name; row.openingHoursRaw=patch.openingHoursRaw; row.closedDays=patch.closedDays||[]; row.closedNote=null;
  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>field!=='hours')}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);
}
