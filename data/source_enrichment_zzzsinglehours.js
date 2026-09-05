// Generated from current single-business official pages with explicit weekly hours.
// Existing source-backed identities only; platform/locator/resolution/conditional schedules are excluded.
const SINGLE_SITE_HOURS_CHECKED_AT = "2026-09-06";
const singleSiteHoursPatches = [];
for (const patch of singleSiteHoursPatches) {
  const ref={provider:'official',url:patch.sourceUrl,checkedAt:SINGLE_SITE_HOURS_CHECKED_AT,fields:['name','hours']};
  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);
  if(!row){row={id:`src-single-hours-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}
  row.name=patch.name; row.openingHoursRaw=patch.openingHoursRaw; row.closedDays=patch.closedDays||[]; row.closedNote=null;
  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>field!=='hours')}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);
}
