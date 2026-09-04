(()=>{const norm=s=>(s||'').replace(/[\s　・’'"\-—_]+/g,'').toLowerCase();const rows=[
{aliases:['うどん 丸香','Udon Maruka'],status:'verified',address:'東京都千代田区神田小川町3-16-1 NEW SURUGADAI bld. 1F',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('うどん 丸香 東京都千代田区神田小川町3-16-1')},
{aliases:['さぼうる','味の珈琲屋さぼうる'],status:'verified',address:'東京都千代田区神田神保町1-9-1',googlePlaceId:'ChIJ99yieACNGGARwaV-MYwH0x4'},
{aliases:['中国料理 錦和','錦和'],status:'verified',address:'東京都千代田区神田神保町1-103',googlePlaceId:'ChIJ2yzmKgCNGGARujgyaVuRhy8'},
{aliases:['メナムのほとり 神保町本店','メナムのほとり'],status:'verified',address:'東京都千代田区神田神保町1-13-10 西インド会社本社ビル 1F・2F',googlePlaceId:'ChIJA8pJAACNGGARgFD55sBMr-o'},
{aliases:['スターバックス コーヒー 都営神保町駅店','Starbucks Coffee - Toei Jimbocho Station'],status:'verified',address:'東京都千代田区神田神保町2-7 都営神保町駅構内',googlePlaceId:'ChIJ3woP4BCMGGAR_rK6Rw0LqWA'},
{aliases:['トロワバグヴェール'],status:'verified',address:'東京都千代田区猿楽町2-7-7 倉林ビル1階B室',googlePlaceId:'ChIJkz2YIgCNGGARHuSdnnPwbVk'},
{aliases:['KHAO','カオ'],status:'verified',address:'東京都千代田区神田神保町2-12-2 1F',googlePlaceId:'ChIJNQnCOb-NGGARiB0LJimpocc'},
{aliases:['海老丸らーめん'],status:'verified',address:'東京都千代田区西神田2-1-13 十勝ビル1F',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('海老丸らーめん 東京都千代田区西神田2-1-13 十勝ビル1F')},
{aliases:['スープカレー屋 鴻 神田駿河台店','鴻 神田駿河台店'],status:'verified',address:'東京都千代田区神田小川町3-10-18',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('スープカレー屋 鴻 神田駿河台店 東京都千代田区神田小川町3-10-18')},
{aliases:['キッチン南海 神保町店'],status:'verified',address:'東京都千代田区神田神保町1-39-8',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('キッチン南海 神保町店 東京都千代田区神田神保町1-39-8')},
{aliases:['タケウチ 神保町本店','TAKEUCHI'],status:'verified',address:'東京都千代田区神田神保町1-20-3 1F',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('タケウチ 神保町本店 東京都千代田区神田神保町1-20-3 1F')},
{aliases:['ラーメン二郎 神田神保町店'],status:'verified',address:'東京都千代田区神田神保町1-21-4',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('ラーメン二郎 神田神保町店 東京都千代田区神田神保町1-21-4')},
{aliases:['四川料理 秋 神保町本店'],status:'verified',address:'東京都千代田区神田神保町1-37-3 B-WALL神保町ビル B1F',mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('四川料理 秋 神保町本店 東京都千代田区神田神保町1-37-3')},
{aliases:['山本のハンバーグ 神保町','Yamamoto Hamburger Jimbocho'],status:'rejected',reason:'Google Maps marks this business permanently closed',googlePlaceId:'ChIJb0YBI8ONGGAREQZrj1BMZC0'}
];const byAlias=new Map();rows.forEach(x=>x.aliases.forEach(a=>byAlias.set(norm(a),x)));window.RESTAURANTS.forEach(r=>{const hit=byAlias.get(norm(r.name));if(!hit)return;r.googleStatus=hit.status;if(hit.address)r.address=hit.address;if(hit.googlePlaceId)r.googlePlaceId=hit.googlePlaceId;if(hit.mapsUrl)r.googleMapsUrl=hit.mapsUrl;if(hit.reason)r.googleRejectReason=hit.reason});window.GOOGLE_ENTITY_STATS={verified:rows.filter(x=>x.status==='verified').length,rejected:rows.filter(x=>x.status==='rejected').length};})();