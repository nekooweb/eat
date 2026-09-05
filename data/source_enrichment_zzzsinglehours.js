// Generated from current single-business official pages with explicit weekly hours.
// Platform/aggregator hosts, locator chains, resolution identities and ambiguous schedules are excluded.
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
    "openingHoursRaw": "月 12:00-23:00, 12:00-21:00; 火 12:00-23:00, 12:00-21:00; 水 12:00-23:00, 12:00-21:00; 木 12:00-23:00, 12:00-21:00; 金 12:00-23:00, 12:00-21:00; 土 12:00-23:00, 12:00-21:00; 日 12:00-23:00, 12:00-21:00; 祝 12:00-23:00, 12:00-21:00",
    "closedDays": [],
    "knownDays": 8
  },
  {
    "googlePlaceId": "ChIJHdflUQCNGGAR1yV32-VceT0",
    "name": "お茶の水、大勝軒",
    "sourceUrl": "https://taisho-ken.tokyo/",
    "openingHoursRaw": "火 11:00-21:00; 水 11:00-21:00; 木 11:00-21:00; 金 11:00-21:00; 土 11:00-21:00; 日 11:00-21:00",
    "closedDays": [
      "月"
    ],
    "knownDays": 7
  },
  {
    "googlePlaceId": "ChIJ8zcFAQSMGGARjT19WihSuNk",
    "name": "やきとり道場",
    "sourceUrl": "https://mirai.holy.jp/kanda.html",
    "openingHoursRaw": "月 11:30-15:00, 17:00-23:30; 火 11:30-15:00, 17:00-23:30; 水 11:30-15:00, 17:00-23:30; 木 11:30-15:00, 17:00-23:30; 金 11:30-15:00, 17:00-23:30; 土 17:00-23:30, 15:00-23:30",
    "closedDays": [
      "日"
    ],
    "knownDays": 7
  },
  {
    "googlePlaceId": "ChIJBwhgUwKMGGARjoO2N1BAAdk",
    "name": "やよい軒",
    "sourceUrl": "https://store.yayoiken.com/b/yayoiken/info/1048/",
    "openingHoursRaw": "月 08:00-23:00; 火 08:00-23:00; 水 08:00-23:00; 木 08:00-23:00; 金 08:00-23:00; 土 08:00-23:00; 日 08:00-23:00",
    "closedDays": [],
    "knownDays": 7
  },
  {
    "googlePlaceId": "ChIJxY7gPgGMGGARb9tWwbUOOxg",
    "name": "Lamp Light",
    "sourceUrl": "https://www.lamplight-kanda.com/",
    "openingHoursRaw": "月 18:00-02:00; 火 18:00-02:00; 水 18:00-02:00; 木 18:00-02:00; 金 18:00-03:00; 土 18:00-23:00",
    "closedDays": [
      "日",
      "祝"
    ],
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
