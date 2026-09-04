(()=>{const norm=s=>(s||'').replace(/[\s　・’'"\-—_]+/g,'').toLowerCase();const rows=[
{aliases:['さぼうる','味の珈琲屋さぼうる'],status:'verified',googlePlaceId:'ChIJ99yieACNGGARwaV-MYwH0x4'},
{aliases:['中国料理 錦和','錦和'],status:'verified',googlePlaceId:'ChIJ2yzmKgCNGGARujgyaVuRhy8'},
{aliases:['スターバックス コーヒー 都営神保町駅店','Starbucks Coffee - Toei Jimbocho Station'],status:'verified',googlePlaceId:'ChIJ3woP4BCMGGAR_rK6Rw0LqWA'},
{aliases:['トロワバグヴェール'],status:'verified',googlePlaceId:'ChIJkz2YIgCNGGARHuSdnnPwbVk'},
{aliases:['KHAO','カオ'],status:'verified',googlePlaceId:'ChIJNQnCOb-NGGARiB0LJimpocc'},
{aliases:['山本のハンバーグ 神保町','Yamamoto Hamburger Jimbocho'],status:'rejected',reason:'closed_permanently',googlePlaceId:'ChIJb0YBI8ONGGAREQZrj1BMZC0'}
];const byAlias=new Map();rows.forEach(x=>x.aliases.forEach(a=>byAlias.set(norm(a),x)));window.RESTAURANTS.forEach(r=>{const x=byAlias.get(norm(r.name));if(!x)return;if(!r.googleStatus)r.googleStatus=x.status;if(!r.googlePlaceId&&x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;if(!r.googleRejectReason&&x.reason)r.googleRejectReason=x.reason});window.GOOGLE_ENTITY_STATS={verified:rows.filter(x=>x.status==='verified').length,rejected:rows.filter(x=>x.status==='rejected').length};})();
