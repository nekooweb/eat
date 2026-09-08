(() => {
  'use strict';

  const POLICY = 'relaxed-zh-v2';
  const HAN_RE = /[\u3400-\u9fff]/u;
  const KANA_RE = /[\u3040-\u30ff]/u;

  const isChineseDish = (value) => {
    const text = String(value || '').trim();
    return Boolean(text) && text.length <= 24 && HAN_RE.test(text) && !KANA_RE.test(text);
  };

  const chineseDishName = (item) => {
    if (typeof item === 'string') return isChineseDish(item) ? item.trim() : '';
    if (!item || typeof item !== 'object') return '';
    const value = String(item.nameZh || '').trim();
    return isChineseDish(value) ? value : '';
  };

  const dedupeChinese = (items, limit = 2) => {
    const output = [];
    const seen = new Set();
    for (const item of items || []) {
      const value = chineseDishName(item);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push(value);
      if (output.length >= limit) break;
    }
    return output;
  };

  // Approximate recommendations are display hints, not verified source claims.
  // v2 deliberately removes the old generic "招牌主菜 / 时令小菜" fallback.
  // A row is filled only when a brand, dish keyword or sufficiently specific
  // cuisine signal supports concrete Chinese menu suggestions.
  const RULES = [
    // Exact/common chains: strongest approximate tier.
    { id: 'brand-starbucks', tier: 'brand', re: /starbucks|スターバックス|星巴克/iu, dishes: ['星巴克拿铁', '美式咖啡'] },
    { id: 'brand-tullys', tier: 'brand', re: /tully'?s|タリーズ/iu, dishes: ['蜂蜜牛奶拿铁', '本日咖啡'] },
    { id: 'brand-doutor', tier: 'brand', re: /doutor|ドトール/iu, dishes: ['米兰三明治', '混合咖啡'] },
    { id: 'brand-veloce', tier: 'brand', re: /ベローチェ|veloce/iu, dishes: ['热三明治', '混合咖啡'] },
    { id: 'brand-crie', tier: 'brand', re: /カフェ・?ド・?クリエ|cafe\s*de\s*crie/iu, dishes: ['意大利面', '咖啡'] },
    { id: 'brand-renoir', tier: 'brand', re: /ルノアール|renoir/iu, dishes: ['厚切吐司', '混合咖啡'] },
    { id: 'brand-ueshima', tier: 'brand', re: /上島珈琲|上岛咖啡/iu, dishes: ['黑糖牛奶咖啡', '厚切吐司'] },
    { id: 'brand-komeda', tier: 'brand', re: /コメダ|komeda/iu, dishes: ['红豆黄油吐司', '混合咖啡'] },
    { id: 'brand-pronto', tier: 'brand', re: /pronto|プロント/iu, dishes: ['意大利面', '咖啡'] },
    { id: 'brand-mcdonalds', tier: 'brand', re: /マクドナルド|mcdonald/iu, dishes: ['巨无霸', '麦乐鸡'] },
    { id: 'brand-subway', tier: 'brand', re: /サブウェイ|subway/iu, dishes: ['火鸡三明治', '金枪鱼三明治'] },
    { id: 'brand-shakeshack', tier: 'brand', re: /shake\s*shack/iu, dishes: ['芝士汉堡', '薯条'] },
    { id: 'brand-burgerking', tier: 'brand', re: /バーガーキング|burger\s*king/iu, dishes: ['皇堡', '薯条'] },
    { id: 'brand-mosburger', tier: 'brand', re: /モスバーガー|mos\s*burger/iu, dishes: ['摩斯汉堡', '洋葱圈'] },
    { id: 'brand-freshness', tier: 'brand', re: /フレッシュネス|freshness\s*burger/iu, dishes: ['经典芝士汉堡', '薯条'] },
    { id: 'brand-torikizoku', tier: 'brand', re: /鳥貴族|鸟贵族/iu, dishes: ['鸡腿贵族烧', '烤鸡串'] },
    { id: 'brand-hanamaru', tier: 'brand', re: /はなまる/iu, dishes: ['温玉牛肉乌冬', '炸蔬菜天妇罗'] },
    { id: 'brand-marugame', tier: 'brand', re: /丸亀製麺|丸龟制面/iu, dishes: ['釜扬乌冬', '炸蔬菜天妇罗'] },
    { id: 'brand-royalhost', tier: 'brand', re: /royal\s*host|ロイヤルホスト/iu, dishes: ['黑黑汉堡肉排', '洋葱焗汤'] },
    { id: 'brand-gusto', tier: 'brand', re: /ガスト|gusto/iu, dishes: ['芝士汉堡肉排', '山盛薯条'] },
    { id: 'brand-jonathans', tier: 'brand', re: /ジョナサン|jonathan'?s/iu, dishes: ['汉堡肉排', '意大利面'] },
    { id: 'brand-cocos', tier: 'brand', re: /(^|\s)ココス($|\s)|coco'?s/iu, dishes: ['包烧汉堡肉排', '牛肉汉堡肉排'] },
    { id: 'brand-saizeriya', tier: 'brand', re: /サイゼリヤ|saizeriya/iu, dishes: ['米兰风焗饭', '小虾沙拉'] },
    { id: 'brand-goemon', tier: 'brand', re: /洋麺屋\s*五右衛門|洋麺屋五右衛門|五右衛門/iu, dishes: ['明太子意大利面', '日式意大利面'] },
    { id: 'brand-cocoichi', tier: 'brand', re: /coco壱|ココイチ|coco\s*ichibanya|壱番屋/iu, dishes: ['猪肉咖喱', '炸猪排咖喱'] },
    { id: 'brand-hinoya', tier: 'brand', re: /日乃屋/iu, dishes: ['日乃屋咖喱', '炸猪排咖喱'] },
    { id: 'brand-bondy', tier: 'brand', re: /ボンディ|bondy/iu, dishes: ['欧风牛肉咖喱', '芝士咖喱'] },
    { id: 'brand-tsujita', tier: 'brand', re: /つじ田|tsujita/iu, dishes: ['浓厚蘸面', '叉烧'] },
    { id: 'brand-taishoken', tier: 'brand', re: /大勝軒|大胜轩/iu, dishes: ['特制蘸面', '叉烧'] },
    { id: 'brand-machidashoten', tier: 'brand', re: /町田商店/iu, dishes: ['横滨家系拉面', '叉烧'] },
    { id: 'brand-hidakaya', tier: 'brand', re: /日高屋/iu, dishes: ['中华拉面', '煎饺'] },
    { id: 'brand-ringerhut', tier: 'brand', re: /リンガーハット|ringer\s*hut/iu, dishes: ['长崎什锦面', '皿乌冬'] },
    { id: 'brand-butayama', tier: 'brand', re: /豚山/iu, dishes: ['豚骨酱油拉面', '厚切叉烧'] },
    { id: 'brand-katsuya', tier: 'brand', re: /かつや/iu, dishes: ['炸猪排盖饭', '炸猪排套餐'] },
    { id: 'brand-yoshinoya', tier: 'brand', re: /吉野家/iu, dishes: ['牛肉盖饭', '温泉蛋'] },
    { id: 'brand-sukiya', tier: 'brand', re: /すき家/iu, dishes: ['牛肉盖饭', '葱温玉牛肉盖饭'] },
    { id: 'brand-matsuya', tier: 'brand', re: /(^|\s)松屋($|\s)|松屋フーズ/iu, dishes: ['牛肉饭', '牛烧肉套餐'] },
    { id: 'brand-nakau', tier: 'brand', re: /なか卯|nakau/iu, dishes: ['亲子盖饭', '乌冬面'] },
    { id: 'brand-tenya', tier: 'brand', re: /てんや|天丼てんや/iu, dishes: ['天妇罗盖饭', '天妇罗'] },
    { id: 'brand-ootoya', tier: 'brand', re: /大戸屋|大户屋/iu, dishes: ['鸡肉蔬菜黑醋套餐', '烤鲭鱼套餐'] },
    { id: 'brand-yayoiken', tier: 'brand', re: /やよい軒/iu, dishes: ['姜烧猪肉套餐', '烤鲭鱼套餐'] },
    { id: 'brand-hoshino', tier: 'brand', re: /星乃珈琲/iu, dishes: ['舒芙蕾松饼', '手冲咖啡'] },
    { id: 'brand-delifrance', tier: 'brand', re: /delifrance|デリフランス/iu, dishes: ['牛角包', '三明治'] },
    { id: 'brand-viedefrance', tier: 'brand', re: /vie\s*de\s*france|ヴィ・?ド・?フランス/iu, dishes: ['牛角包', '法式三明治'] },
    { id: 'brand-littlemermaid', tier: 'brand', re: /リトルマーメイド|little\s*mermaid/iu, dishes: ['丹麦面包', '三明治'] },
    { id: 'brand-dominos', tier: 'brand', re: /domino'?s|ドミノ/iu, dishes: ['玛格丽特披萨', '意式香肠披萨'] },

    // Highly identifiable dish/name patterns.
    { id: 'dish-tsukemen', tier: 'dish-keyword', re: /つけ麺|つけめん|つけそば|蘸面/iu, dishes: ['蘸面', '叉烧'] },
    { id: 'dish-iekei', tier: 'dish-keyword', re: /家系/iu, dishes: ['横滨家系拉面', '叉烧'] },
    { id: 'dish-niboshi-ramen', tier: 'dish-keyword', re: /煮干し|煮干/iu, dishes: ['煮干拉面', '叉烧'] },
    { id: 'dish-shio-shoga-ramen', tier: 'dish-keyword', re: /塩生姜/iu, dishes: ['盐味生姜拉面', '叉烧'] },
    { id: 'dish-tantan', tier: 'dish-keyword', re: /担々麺|担担麺|担担面/iu, dishes: ['担担面', '麻婆豆腐'] },
    { id: 'dish-malatang', tier: 'dish-keyword', re: /麻辣湯|麻辣烫/iu, dishes: ['麻辣烫', '拌面'] },
    { id: 'dish-daoxiaomian', tier: 'dish-keyword', re: /刀削麺|刀削面/iu, dishes: ['刀削面', '煎饺'] },
    { id: 'dish-ramen', tier: 'dish-keyword', re: /ラーメン|らーめん|中華そば|拉麺|拉面/iu, dishes: ['拉面', '叉烧'] },
    { id: 'dish-soup-curry', tier: 'dish-keyword', re: /スープカレー/iu, dishes: ['汤咖喱', '烤蔬菜'] },
    { id: 'dish-curry', tier: 'dish-keyword', re: /カレー|咖喱/iu, dishes: ['咖喱饭', '炸猪排咖喱'] },
    { id: 'dish-sushi', tier: 'dish-keyword', re: /寿司|すし|鮨/iu, dishes: ['寿司', '金枪鱼握寿司'] },
    { id: 'dish-sashimi', tier: 'dish-keyword', re: /刺身/iu, dishes: ['生鱼片拼盘', '金枪鱼刺身'] },
    { id: 'dish-unagi', tier: 'dish-keyword', re: /鰻|うなぎ|鳗鱼/iu, dishes: ['鳗鱼饭', '鳗鱼蒲烧'] },
    { id: 'dish-maguro', tier: 'dish-keyword', re: /まぐろ|鮪|金枪鱼/iu, dishes: ['金枪鱼盖饭', '金枪鱼刺身'] },
    { id: 'dish-saba', tier: 'dish-keyword', re: /鯖|さば|鲭鱼/iu, dishes: ['烤鲭鱼', '鲭鱼套餐'] },
    { id: 'dish-iwashi', tier: 'dish-keyword', re: /鰯|いわし|沙丁鱼/iu, dishes: ['烤沙丁鱼', '沙丁鱼刺身'] },
    { id: 'dish-yakitori', tier: 'dish-keyword', re: /焼き鳥|焼鳥|やきとり|焼鳥/iu, dishes: ['烤鸡串', '鸡腿肉串'] },
    { id: 'dish-yakiton', tier: 'dish-keyword', re: /焼きとん|やきとん/iu, dishes: ['烤猪肉串', '猪内脏串'] },
    { id: 'dish-kushikatsu', tier: 'dish-keyword', re: /串揚げ|串カツ|串炸/iu, dishes: ['炸串拼盘', '炸猪肉串'] },
    { id: 'dish-kushiyaki', tier: 'dish-keyword', re: /串焼き|串焼|烤串/iu, dishes: ['烤串拼盘', '鸡肉串'] },
    { id: 'dish-yakiniku', tier: 'dish-keyword', re: /焼肉|ホルモン|烤肉/iu, dishes: ['烤肉拼盘', '牛舌'] },
    { id: 'dish-gyutan', tier: 'dish-keyword', re: /牛タン|牛舌/iu, dishes: ['烤牛舌', '牛舌套餐'] },
    { id: 'dish-udon', tier: 'dish-keyword', re: /うどん|乌冬/iu, dishes: ['乌冬面', '炸蔬菜天妇罗'] },
    { id: 'dish-soba', tier: 'dish-keyword', re: /そば|蕎麦|荞麦/iu, dishes: ['荞麦面', '天妇罗'] },
    { id: 'dish-tempura', tier: 'dish-keyword', re: /天ぷら|天麩羅|天丼|天妇罗/iu, dishes: ['天妇罗', '天妇罗盖饭'] },
    { id: 'dish-tonkatsu', tier: 'dish-keyword', re: /とんかつ|豚カツ|炸猪排/iu, dishes: ['炸猪排', '炸猪排套餐'] },
    { id: 'dish-katsudon', tier: 'dish-keyword', re: /カツ丼|かつ丼/iu, dishes: ['炸猪排盖饭', '味噌汤'] },
    { id: 'dish-gyudon', tier: 'dish-keyword', re: /牛丼|牛めし|牛肉飯|牛肉饭/iu, dishes: ['牛肉盖饭', '温泉蛋'] },
    { id: 'dish-oyakodon', tier: 'dish-keyword', re: /親子丼|亲子丼/iu, dishes: ['亲子盖饭', '鸡肉鸡蛋'] },
    { id: 'dish-butadon', tier: 'dish-keyword', re: /豚丼/iu, dishes: ['猪肉盖饭', '温泉蛋'] },
    { id: 'dish-kaisendon', tier: 'dish-keyword', re: /海鮮丼|海鲜丼/iu, dishes: ['海鲜盖饭', '金枪鱼刺身'] },
    { id: 'dish-okonomiyaki', tier: 'dish-keyword', re: /お好み焼|もんじゃ|大阪烧|文字烧/iu, dishes: ['大阪烧', '文字烧'] },
    { id: 'dish-takoyaki', tier: 'dish-keyword', re: /たこ焼|章鱼烧/iu, dishes: ['章鱼烧', '大阪烧'] },
    { id: 'dish-yakisoba', tier: 'dish-keyword', re: /焼きそば|焼そば|炒麺/iu, dishes: ['日式炒面', '煎饺'] },
    { id: 'dish-sukiyaki', tier: 'dish-keyword', re: /すき焼|寿喜烧/iu, dishes: ['寿喜烧', '牛肉锅'] },
    { id: 'dish-shabushabu', tier: 'dish-keyword', re: /しゃぶしゃぶ|涮涮锅/iu, dishes: ['涮涮锅', '牛肉锅'] },
    { id: 'dish-motsunabe', tier: 'dish-keyword', re: /もつ鍋|牛杂锅/iu, dishes: ['牛杂锅', '炙烤牛杂'] },
    { id: 'dish-mizutaki', tier: 'dish-keyword', re: /水炊き/iu, dishes: ['鸡肉水炊锅', '鸡肉料理'] },
    { id: 'dish-chanko', tier: 'dish-keyword', re: /ちゃんこ/iu, dishes: ['相扑火锅', '鸡肉蔬菜锅'] },
    { id: 'dish-oden', tier: 'dish-keyword', re: /おでん|关东煮/iu, dishes: ['关东煮', '炖萝卜'] },
    { id: 'dish-teppan', tier: 'dish-keyword', re: /鉄板|铁板/iu, dishes: ['铁板牛排', '铁板炒面'] },
    { id: 'dish-omurice', tier: 'dish-keyword', re: /オムライス|蛋包饭/iu, dishes: ['蛋包饭', '汉堡肉排'] },
    { id: 'dish-hamburg', tier: 'dish-keyword', re: /ハンバーグ|汉堡肉排/iu, dishes: ['汉堡肉排', '蛋包饭'] },
    { id: 'dish-gyoza', tier: 'dish-keyword', re: /餃子|饺子/iu, dishes: ['煎饺', '水饺'] },
    { id: 'dish-xiaolongbao', tier: 'dish-keyword', re: /小籠包|小笼包/iu, dishes: ['小笼包', '煎饺'] },
    { id: 'dish-biryani', tier: 'dish-keyword', re: /ビリヤニ|biryani|印度香饭/iu, dishes: ['印度香饭', '咖喱'] },
    { id: 'dish-kebab', tier: 'dish-keyword', re: /ケバブ|kebab/iu, dishes: ['土耳其烤肉卷', '烤肉'] },
    { id: 'dish-banhmi', tier: 'dish-keyword', re: /バインミー|bánh\s*mì|banh\s*mi/iu, dishes: ['越南法棍', '越南河粉'] },
    { id: 'dish-pho', tier: 'dish-keyword', re: /フォー|pho\b/iu, dishes: ['越南河粉', '越南春卷'] },
    { id: 'dish-paella', tier: 'dish-keyword', re: /パエリア|paella/iu, dishes: ['西班牙海鲜饭', '蒜香虾'] },
    { id: 'dish-tacos', tier: 'dish-keyword', re: /タコス|tacos?/iu, dishes: ['墨西哥塔可', '墨西哥卷饼'] },
    { id: 'dish-onigiri', tier: 'dish-keyword', re: /おむすび|おにぎり|饭团/iu, dishes: ['鲑鱼饭团', '梅子饭团'] },
    { id: 'dish-sandwich', tier: 'dish-keyword', re: /サンドイッチ|sandwich/iu, dishes: ['三明治', '汤品'] },
    { id: 'dish-pudding', tier: 'dish-keyword', re: /プリン|pudding|布丁/iu, dishes: ['焦糖布丁', '咖啡'] },
    { id: 'dish-douhua', tier: 'dish-keyword', re: /豆花/iu, dishes: ['豆花', '台湾甜品'] },
    { id: 'dish-wagashi', tier: 'dish-keyword', re: /和菓子|甘味|羊羹|最中/iu, dishes: ['日式和果子', '红豆甜品'] },

    // Specific cuisines. Broad generic labels such as 餐厅 / 酒吧 / 日式 / 面食
    // are intentionally NOT mapped in v2.
    { id: 'cuisine-sichuan', tier: 'cuisine', re: /四川/iu, dishes: ['麻婆豆腐', '担担面'] },
    { id: 'cuisine-shanghai', tier: 'cuisine', re: /上海/iu, dishes: ['小笼包', '红烧肉'] },
    { id: 'cuisine-cantonese', tier: 'cuisine', re: /広東|广东/iu, dishes: ['叉烧', '烧卖'] },
    { id: 'cuisine-hongkong', tier: 'cuisine', re: /香港/iu, dishes: ['叉烧饭', '港式点心'] },
    { id: 'cuisine-beijing', tier: 'cuisine', re: /北京/iu, dishes: ['北京烤鸭', '炸酱面'] },
    { id: 'cuisine-taiwan', tier: 'cuisine', re: /台湾/iu, dishes: ['卤肉饭', '煎饺'] },
    { id: 'cuisine-chinese', tier: 'cuisine', re: /中華|中国料理|中华|中餐/iu, dishes: ['炒饭', '煎饺'] },
    { id: 'cuisine-indian', tier: 'cuisine', re: /インド|印度/iu, dishes: ['印度咖喱', '烤饼'] },
    { id: 'cuisine-nepal', tier: 'cuisine', re: /ネパール|尼泊尔/iu, dishes: ['尼泊尔咖喱', '烤饼'] },
    { id: 'cuisine-srilanka', tier: 'cuisine', re: /スリランカ|斯里兰卡/iu, dishes: ['斯里兰卡咖喱', '咖喱拼盘'] },
    { id: 'cuisine-thai', tier: 'cuisine', re: /タイ料理|泰国|泰式/iu, dishes: ['泰式炒河粉', '绿咖喱'] },
    { id: 'cuisine-korean', tier: 'cuisine', re: /韓国|韩国|韓式|韩式/iu, dishes: ['韩式烤肉', '海鲜煎饼'] },
    { id: 'cuisine-vietnamese', tier: 'cuisine', re: /ベトナム|越南/iu, dishes: ['越南河粉', '越南春卷'] },
    { id: 'cuisine-spanish', tier: 'cuisine', re: /スペイン|西班牙/iu, dishes: ['西班牙海鲜饭', '蒜香虾'] },
    { id: 'cuisine-mexican', tier: 'cuisine', re: /メキシコ|墨西哥/iu, dishes: ['墨西哥塔可', '墨西哥卷饼'] },
    { id: 'cuisine-moroccan', tier: 'cuisine', re: /モロッコ|摩洛哥/iu, dishes: ['塔吉锅', '库斯库斯'] },
    { id: 'cuisine-turkish', tier: 'cuisine', re: /トルコ|土耳其/iu, dishes: ['土耳其烤肉', '烤肉卷'] },
    { id: 'cuisine-italian', tier: 'cuisine', re: /イタリアン|イタリア料理|trattoria|ristorante|意大利/iu, dishes: ['意大利面', '披萨'] },
    { id: 'cuisine-pizza', tier: 'cuisine', re: /ピザ|ピッツァ|pizzeria|披萨/iu, dishes: ['披萨', '意大利面'] },
    { id: 'cuisine-french', tier: 'cuisine', re: /フレンチ|フランス料理|法餐|法国料理|brasserie/iu, dishes: ['法式肉料理', '甜点'] },
    { id: 'cuisine-bistro', tier: 'cuisine', re: /ビストロ|bistro/iu, dishes: ['法式肉料理', '法式小菜'] },
    { id: 'cuisine-yoshoku', tier: 'cuisine', re: /洋食|西餐/iu, dishes: ['汉堡肉排', '蛋包饭'] },
    { id: 'cuisine-steak', tier: 'cuisine', re: /ステーキ|牛排/iu, dishes: ['牛排', '烤蔬菜'] },
    { id: 'cuisine-seafood', tier: 'cuisine', re: /海鮮|海鲜|魚料理|鱼料理/iu, dishes: ['生鱼片拼盘', '烤鱼'] },
    { id: 'cuisine-cafe', tier: 'cuisine', re: /カフェ|cafe|coffee|珈琲|喫茶|咖啡/iu, dishes: ['手冲咖啡', '三明治'] },
    { id: 'cuisine-bakery', tier: 'cuisine', re: /bakery|ベーカリー|boulangerie|パン屋|面包・烘焙|面包店/iu, dishes: ['牛角包', '三明治'] },
    { id: 'cuisine-sweets', tier: 'cuisine', re: /スイーツ|デザート|ケーキ|甜品|菓子/iu, dishes: ['蛋糕', '布丁'] },
    { id: 'cuisine-icecream', tier: 'cuisine', re: /アイス|ジェラート|gelato|冰淇淋/iu, dishes: ['冰淇淋', '意式冰淇淋'] },
    { id: 'cuisine-crepe', tier: 'cuisine', re: /クレープ|crepe|可丽饼/iu, dishes: ['可丽饼', '冰淇淋'] },
    { id: 'cuisine-burger', tier: 'cuisine', re: /ハンバーガー|burger|汉堡/iu, dishes: ['芝士汉堡', '薯条'] },
    { id: 'cuisine-pancake', tier: 'cuisine', re: /パンケーキ|pancake|松饼/iu, dishes: ['松饼', '咖啡'] }
  ];

  const inferDishes = (row) => {
    const haystack = [
      row?.name,
      row?.cuisine,
      ...(Array.isArray(row?.tags) ? row.tags : [])
    ].map((value) => String(value || '')).join(' ').normalize('NFKC').toLowerCase();

    for (const rule of RULES) {
      if (rule.re.test(haystack)) {
        const dishes = dedupeChinese(rule.dishes, 2);
        if (dishes.length) return { rule: rule.id, tier: rule.tier, dishes };
      }
    }
    return null;
  };

  const patchRows = (rows) => {
    const stats = {
      total: Array.isArray(rows) ? rows.length : 0,
      preservedRecommended: 0,
      preservedFeatured: 0,
      patchedApproximate: 0,
      unfilledNoSpecificSignal: 0,
      tierCounts: {}
    };
    if (!Array.isArray(rows)) return stats;

    for (const row of rows) {
      const existingRecommended = dedupeChinese(row.recommendedDishes, 3);
      row.recommendedDishes = existingRecommended;
      if (existingRecommended.length) {
        stats.preservedRecommended += 1;
        continue;
      }

      const featuredChinese = dedupeChinese(row.featuredDishes, 3);
      if (featuredChinese.length) {
        stats.preservedFeatured += 1;
        continue;
      }

      const inferred = inferDishes(row);
      if (!inferred) {
        stats.unfilledNoSpecificSignal += 1;
        continue;
      }

      row.recommendedDishes = inferred.dishes;
      row.dishRecommendationConfidence = 'approximate';
      row.dishRecommendationBasis = inferred.rule;
      row.dishRecommendationQualityTier = inferred.tier;
      row.dishRecommendationLanguage = 'zh-CN';
      row.dishRecommendationDisplayPolicy = POLICY;
      stats.patchedApproximate += 1;
      stats.tierCounts[inferred.tier] = (stats.tierCounts[inferred.tier] || 0) + 1;
    }
    return stats;
  };

  const inventory = patchRows(window.GOOGLE_INVENTORY_RESTAURANTS);
  const production = patchRows(window.PRODUCTION_RESTAURANTS);
  window.CHINESE_DISH_FALLBACK_STATS = {
    policy: POLICY,
    language: 'zh-CN',
    evidencePromotion: false,
    genericFallbackAllowed: false,
    inventory,
    production
  };
})();
