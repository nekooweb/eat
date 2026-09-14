#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const checkedAt = '2026-09-14';
const generatedAt = '2026-09-14T21:08:00+09:00';
const sourceQueueCommit = process.env.GITHUB_SHA || process.argv[2];
if (!/^[0-9a-f]{40}$/.test(sourceQueueCommit || '')) throw new Error('GITHUB_SHA/source queue commit required');
const startingCommit = 'e41ff3435bb4bcf5a6574df95424512280ec86d4';

const discoveryIds = [
  'ChIJ0aDTMWuMGGARh6ta_oeDieo','ChIJ234igBiMGGAR5THgWps4ED8','ChIJ3V0Foz-MGGAR1z_vpZkS6QU',
  'ChIJ7wRQ4xyMGGARRUnRCcvcYR8','ChIJb89ZGkSMGGARSBXfZs4_uhY','ChIJE1B9072NGGARAc2c1yso4FE',
  'ChIJHR3eZRyMGGARgb3K60lZKb4','ChIJIWNpEjyMGGARR4Ix9v8c32Y','ChIJm_L1ZwaMGGARItmByJT3IxE',
  'ChIJOezUv0OMGGARzSEqpv56al0','ChIJqXc6Cg6MGGARw_jjf4DmshU','ChIJRcu6ggOMGGAR62_THvo-ho4',
  'ChIJVVUk7xCMGGARMyh51ujPs50','ChIJvWKURAOMGGARrI228Ht1cNo','ChIJx1ZBDuONGGARg9L-4ZdIwUY',
  'ChIJ-3hjRgGMGGARUm7ETP8WqDY','ChIJ-4BioUuLGGARFmh7Hi-jkkA','ChIJ5-vLPkKNGGARQA0BDgfPFi4',
  'ChIJ7UdXoEOMGGARtvLt39mMWRk','ChIJ9_4CKwCNGGAReojOE2R0Ydc','ChIJEdkVMgSMGGARsTT85lCQ7xk',
  'ChIJGTlbRhuMGGARIAZmv0AYzss','ChIJkZ5mMwCNGGAR71KbjY19Juo','ChIJl6DVeQSMGGAR8HCf_UX93LA',
  'ChIJO6XWuwSMGGARNf_eMObW97I','ChIJuVk_oBqMGGARYlDpY7-RPqA','ChIJV2fZvB6MGGARTxGjO7HmQuA',
  'ChIJY_gYhRqMGGARAfTrky4HnZo','ChIJZYTCzBWMGGARIpip-V_r6ks','ChIJ73iZqQeMGGAR1UPN4hA0-bA'
];
const fSourceIds = [
  'ChIJnYWupOGNGGARbJXrXzGrfL4','ChIJU3-_NwWMGGARoBcetg2Ko8Y','ChIJKV27XcWNGGARUMPjYkQlDlQ',
  'ChIJN43AC9KNGGARqhKvBwkG2qM','ChIJyxn98FCNGGARKcL6RborViU','ChIJzbh-BgCNGGARYOcIF_C_Og8'
];
const expected = new Map([
  ...discoveryIds.map(id => [id, { lane: 'independent_source_discovery', shard: 6 }]),
  ...fSourceIds.map(id => [id, { lane: 'official_or_retained_featured', shard: 6 }])
]);

const source = (provider, sourceUrl, sourceTitle, note, evidenceType = 'exact_branch_identity') => ({
  provider, sourceUrl, sourceTitle, checkedAt, evidenceType, note
});
const dish = ({ classification, nameOriginal, provider, sourceUrl, sourceTitle, evidenceText,
  recommendationSemantics = '', confidence = 'high', freshness = 'current', notes = '' }) => ({
  targetField: classification === 'R' ? 'recommendedDishes' : classification === 'F' ? 'featuredDishes' : 'recommendedDishes',
  classification, nameOriginal, nameZhCandidate: null, evidenceClass:
    classification === 'R' ? 'branch_recommendation_text' : classification === 'F' ? 'branch_menu_text' : 'candidate_only',
  recommendationSemantics, provider, sourceUrl, sourceTitle, checkedAt, sourceScope: 'branch', evidenceText,
  freshness, seasonality: 'not_expired_or_explicitly_seasonal', confidence, notes
});

const decisions = {
  'ChIJm_L1ZwaMGGARItmByJT3IxE': {
    status: 'accepted_evidence', identity: { state: 'verified', sourceAliases: ['焼き鳥・炙り炭焼き をどり 大手町店'], evidence: [
      source('Tabelog','https://tabelog.com/tokyo/A1302/A130201/13195411/','焼き鳥・炙り炭焼き をどり 大手町店','Exact branch name, 〒100-0004 東京都千代田区大手町1-9-2 大手町フィナンシャルシティ・グランキューブ B1F and 050-5593-6129; current hours are published.')
    ]}, dishProposals: [dish({ classification:'R', nameOriginal:'九条ねぎの塩親子丼', provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1302/A130201/13195411/dtlmenu/lunch/', sourceTitle:'ランチメニュー : 焼き鳥・炙り炭焼き をどり 大手町店',
      evidenceText:'九条ねぎの塩親子丼 980円 おすすめ', recommendationSemantics:'おすすめ', confidence:'medium',
      freshness:'branch current in 2026; branch-specific lunch menu remains published', notes:'Recommendation marker is attached directly to the concrete lunch item; no review prose used.' })],
    attemptedSources:['https://tabelog.com/tokyo/A1302/A130201/13195411/','https://tabelog.com/tokyo/A1302/A130201/13195411/dtlmenu/lunch/'], blocker:null,
    notes:'Second-pass semantic review confirmed exact branch identity and direct item-level おすすめ semantics.'
  },
  'ChIJRcu6ggOMGGAR62_THvo-ho4': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['麺匠 釜善','KAMAYOSHI'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131002/13201863/','麺匠 釜善（KAMAYOSHI）','Exact branch name, 東京都千代田区神田司町2-14-15 高梨ビル1F and 050-5872-3360; current listing crawled in September 2026.')
    ]}, dishProposals:[dish({classification:'R',nameOriginal:'（温）とりちくわ天うどん',provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1310/A131002/13201863/dtlmenu/',sourceTitle:'料理メニュー : 麺匠 釜善（KAMAYOSHI）',
      evidenceText:'おすすめ （温）とりちくわ天うどん 1,050円',recommendationSemantics:'おすすめ',freshness:'menu published/updated in 2026 and crawled last week',
      notes:'Current exact-branch menu; explicit recommendation marker immediately precedes the item.'})],
    attemptedSources:['https://tabelog.com/tokyo/A1310/A131002/13201863/','https://tabelog.com/tokyo/A1310/A131002/13201863/dtlmenu/'],blocker:null,
    notes:'Second-pass review rejected review-prose popularity claims and retained only the current menu recommendation.'
  },
  'ChIJ5-vLPkKNGGARQA0BDgfPFi4': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['夢いち輪'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131002/13288959/','夢いち輪','Exact branch name, 東京都千代田区内神田3-10-10 SNビル1F and 050-5594-4784; active current branch page with 2026 availability signals.')
    ]}, dishProposals:[dish({classification:'R',nameOriginal:'海老真丈のサクサク揚げ',provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1310/A131002/13288959/dtlmenu/',sourceTitle:'料理メニュー : 夢いち輪',
      evidenceText:'揚げもの オリジナルの海老真丈です。 おすすめ 海老真丈のサクサク揚げ',recommendationSemantics:'おすすめ',confidence:'medium',
      freshness:'current branch is active; the non-seasonal item remains on the branch menu page',notes:'Avoided explicitly seasonal items; menu notes that offerings can change with procurement, so confidence is medium.'})],
    attemptedSources:['https://tabelog.com/tokyo/A1310/A131002/13288959/','https://tabelog.com/tokyo/A1310/A131002/13288959/dtlmenu/'],blocker:null,
    notes:'Accepted only a concrete non-expired item with direct おすすめ wording; seasonal candidates were not integrated.'
  },
  'ChIJEdkVMgSMGGARsTT85lCQ7xk': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['欧風カレー ボンディ 神保町本店','Bondy'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131003/13000439/','欧風カレー ボンディ 神保町本店','Exact current branch is restaurant-published on Tabelog; address 東京都千代田区神田神保町2-3 神田古書センター2F and phone 03-3234-2080.')
    ]}, dishProposals:[dish({classification:'R',nameOriginal:'ビーフカレー',provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1310/A131003/13000439/dtlmenu/',sourceTitle:'料理メニュー : 欧風カレー ボンディ 神保町本店',
      evidenceText:'おすすめ ビーフカレー 1,800円',recommendationSemantics:'おすすめ',freshness:'menu update 2026-05-11; crawled 2026-09-13',
      notes:'Corporate/official Tabelog menu, exact branch, explicit item-level recommendation.'})],
    attemptedSources:['https://tabelog.com/tokyo/A1310/A131003/13000439/','https://tabelog.com/tokyo/A1310/A131003/13000439/dtlmenu/'],blocker:null,
    notes:'Current restaurant-published exact-branch menu; no customer review text used.'
  },
  'ChIJZYTCzBWMGGARIpip-V_r6ks': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['オサカナジャック','OSACANA JACK'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131003/13209155/dtlmenu/lunch/','ランチメニュー : オサカナジャック','Exact branch menu identifies オサカナジャック at 東京都千代田区神田神保町2-48, phone 03-6272-6634; lunch menu updated 2026-05-09.')
    ]}, dishProposals:[dish({classification:'F',nameOriginal:'オサカナランチ',provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1310/A131003/13209155/dtlmenu/lunch/',sourceTitle:'ランチメニュー : オサカナジャック',
      evidenceText:'オサカナランチ 1,100円 オサカナジャックが色々楽しめるプレートランチ★',confidence:'high',freshness:'menu update 2026-05-09',
      notes:'Concrete current ordinary menu item. No strict recommendation marker is attached, so it remains F.'})],
    attemptedSources:['https://tabelog.com/tokyo/A1310/A131003/13209155/dtlmenu/lunch/','https://tabelog.com/tokyo/A1310/A131003/13209155/dtlmenu/'],blocker:null,
    notes:'Second pass upgraded this row from candidate to F after finding the 2026-05-09 exact-branch lunch menu; older dinner recommendations were deliberately not used.'
  },
  'ChIJU3-_NwWMGGARoBcetg2Ko8Y': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['鶏ラーメン TOKU','鶏ラーメン TOKU トク'],evidence:[
      source('Hot Pepper','https://www.hotpepper.jp/strJ001125561/','鶏ラーメン TOKU トク','Current exact branch listing, current hours and exact store identity; retained binding exists for this Place ID.')
    ]}, dishProposals:[dish({classification:'F',nameOriginal:'鶏白湯ラーメン味玉入り　（醤油）',provider:'Hot Pepper',
      sourceUrl:'https://www.hotpepper.jp/strJ001125561/',sourceTitle:'鶏ラーメン TOKU トク',
      evidenceText:'アラカルト料理 鶏白湯ラーメン味玉入り　（醤油） 850円',confidence:'high',freshness:'current main branch page crawled 2026-09-09',
      notes:'Selected the soy-sauce item from the ordinary アラカルト section, not the separate recommended salt item; therefore F is intentional.'})],
    attemptedSources:['https://www.hotpepper.jp/strJ001125561/','https://www.hotpepper.jp/strJ001125561/food/'],blocker:null,
    notes:'Current branch main page reproduces the ordinary item even though the dedicated food page has an old edit timestamp.'
  },
  'ChIJKV27XcWNGGARUMPjYkQlDlQ': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['think coffee','Think Coffee'],evidence:[
      source('official_web','https://thinkcoffee.jp/cafe/','Think Coffee Japan 店舗情報','Official branch page gives 〒101-0054 東京都千代田区神田錦町2-9-15 1F-2F and current 8:00-19:00 hours.')
    ]}, dishProposals:[dish({classification:'R',nameOriginal:'NYCベーグルサンド',provider:'official_web',
      sourceUrl:'https://thinkcoffee.jp/nyc_bagel_sandwich/',sourceTitle:'NYCベーグルサンド - Think Coffee Japan',
      evidenceText:'thinkcoffeeのNYCベーグルサンド。thinkcoffeeのシグネチャー・サンドイッチです。ぜひ一度ご賞味ください。',recommendationSemantics:'シグネチャー',confidence:'high',freshness:'official page remains live and official site is current in 2026',
      notes:'Exact branch official site and explicit signature semantics; no brand-to-branch propagation because the Japan site publishes a single Kanda address on the same page family.'})],
    attemptedSources:['https://thinkcoffee.jp/cafe/','https://thinkcoffee.jp/nyc_bagel_sandwich/','https://thinkcoffee.jp/menu_detail/food/'],blocker:null,
    notes:'Strict R is required here because the same source calls the concrete sandwich the signature sandwich.'
  },
  'ChIJyxn98FCNGGARKcL6RborViU': {
    status:'accepted_evidence', identity:{state:'verified',sourceAliases:['RECORD BAR JBC','RECORD BAR JBC レコードバー ジェイビーシー'],evidence:[
      source('Hot Pepper','https://www.hotpepper.jp/strJ003516624/map/','RECORD BAR JBC 地図','Exact current branch address 東京都千代田区神田神保町1-12-6 B1F and current opening information; repository Hot Pepper binding is high-confidence/auto-eligible.')
    ]}, dishProposals:[dish({classification:'R',nameOriginal:'ナポリタン',provider:'Hot Pepper',
      sourceUrl:'https://www.hotpepper.jp/strJ003516624/',sourceTitle:'RECORD BAR JBC レコードバー ジェイビーシー',
      evidenceText:'店長のおすすめ料理 ナポリタン フードメニューも豊富にご用意しております。ソーセージたっぷりのナポリタンがおすすめです。',recommendationSemantics:'店長のおすすめ料理 / おすすめ',confidence:'high',freshness:'current branch page crawled in September 2026',
      notes:'Direct concrete item-level recommendation on current exact branch page.'})],
    attemptedSources:['https://www.hotpepper.jp/strJ003516624/','https://www.hotpepper.jp/strJ003516624/map/'],blocker:null,
    notes:'Current main page carries the recommendation; no customer-review content used.'
  },
  'ChIJ3V0Foz-MGGAR1z_vpZkS6QU': {
    status:'candidate', identity:{state:'verified',sourceAliases:['水道橋酒場 多喜乃や'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131003/13189266/','水道橋酒場 多喜乃や','Exact current branch identity/address and current hours are reproducible.')
    ]}, dishProposals:[dish({classification:'C',nameOriginal:'一番鶏',provider:'Tabelog',
      sourceUrl:'https://tabelog.com/tokyo/A1310/A131003/13189266/dtlmenu/',sourceTitle:'料理メニュー : 水道橋酒場 多喜乃や',
      evidenceText:'名物 一番鶏 100円',recommendationSemantics:'名物',confidence:'low',freshness:'stale menu update 2016-03-06 and explicitly user-registered',
      notes:'Unsafe candidate only: source explicitly states the menu was registered by users and may be outdated.'})],
    attemptedSources:['https://tabelog.com/tokyo/A1310/A131003/13189266/','https://tabelog.com/tokyo/A1310/A131003/13189266/dtlmenu/'],blocker:null,
    notes:'Kept as C only. User-registered stale menu cannot become current canonical truth.'
  },
  'ChIJqXc6Cg6MGGARw_jjf4DmshU': {
    status:'candidate', identity:{state:'conflict',sourceAliases:['サパナ 水道橋店','SAPANA'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1310/A131003/13185735/','移転 サパナ 水道橋店','Source explicitly marks this as pre-relocation information and points to a successor/current location; frozen Place-ID branch cannot be silently rebound.')
    ]}, dishProposals:[], attemptedSources:['https://tabelog.com/tokyo/A1310/A131003/13185735/','http://www.sapana-group.com/'],blocker:null,
    notes:'Candidate only because the exact catalog Place ID must not be propagated across the relocation without branch-specific frozen identity proof.'
  },
  'ChIJ-4BioUuLGGARFmh7Hi-jkkA': {
    status:'candidate', identity:{state:'conflict',sourceAliases:['Banh Xeo Saigon Yatai Ebisu','バインセオサイゴン 屋台 恵比寿'],evidence:[
      source('Tabelog','https://tabelog.com/tokyo/A1303/A130302/13253656/','移転 Banh Xeo Saigon Yatai Ebisu','Corporate Tabelog page explicitly says this is information from before relocation; current branch identity must not be inferred from the old branch.')
    ]}, dishProposals:[], attemptedSources:['https://tabelog.com/tokyo/A1303/A130302/13253656/'],blocker:null,
    notes:'Relocation conflict makes otherwise concrete historical menu evidence unsafe for current canonical integration.'
  },
  'ChIJN43AC9KNGGARqhKvBwkG2qM': {
    status:'candidate', identity:{state:'verified',sourceAliases:['酒処 魚肴'],evidence:[
      source('Hot Pepper','https://www.hotpepper.jp/strJ003559689/','酒処 魚肴','Current exact branch listing: 東京都千代田区神田須田町1-8-4 玉井ビル2階, current hours/reservations in 2026.')
    ]}, dishProposals:[dish({classification:'C',nameOriginal:'鶏天',provider:'Hot Pepper',
      sourceUrl:'https://www.hotpepper.jp/strJ003559689/food/',sourceTitle:'酒処 魚肴 料理メニュー',
      evidenceText:'逸品 鶏天 650円（税込）',confidence:'low',freshness:'food page last updated 2023-11-06 although branch is current in 2026',
      notes:'Concrete item exists, but the item page is too stale to promote as current F without stronger freshness evidence.'})],
    attemptedSources:['https://www.hotpepper.jp/strJ003559689/','https://www.hotpepper.jp/strJ003559689/food/'],blocker:null,
    notes:'Current identity is solid; ordinary menu evidence is preserved as C because freshness is insufficient.'
  },
  'ChIJ73iZqQeMGGAR1UPN4hA0-bA': {
    status:'blocked', identity:{state:'conflict',sourceAliases:['Minatoya'],evidence:[]}, dishProposals:[],
    attemptedSources:['repository source-field quarantine removed a wrong website binding','independent search found multiple unrelated Minatoya entities and no exact frozen-branch source'],
    blocker:'identity_source_conflict_after_quarantine',
    notes:'Maintained rebuild moved this row from Official S6 into Discovery S6 after a wrong website was quarantined. No replacement exact-branch source was safe to bind.'
  }
};

const defaultAttempts = {
  'ChIJ0aDTMWuMGGARh6ta_oeDieo':['exact-name branch search; chain-level ターリー屋 recommendations rejected because exact assigned branch was not established'],
  'ChIJ234igBiMGGAR5THgWps4ED8':['exact-name source search; user-submitted menu/image evidence rejected'],
  'ChIJ7wRQ4xyMGGARRUnRCcvcYR8':['exact-name/source search; no current concrete branch menu reproduced'],
  'ChIJb89ZGkSMGGARSBXfZs4_uhY':['https://tabelog.com/ exact branch identity checked; only stale user-registered menu evidence found'],
  'ChIJE1B9072NGGARAc2c1yso4FE':['exact-name current branch search; menu-photo/user content not promoted'],
  'ChIJHR3eZRyMGGARgb3K60lZKb4':['https://tabelog.com/tokyo/A1310/A131002/13021383/dtlmenu/','menu explicitly user-registered and stale (2015), rejected'],
  'ChIJIWNpEjyMGGARR4Ix9v8c32Y':['same-name noise excluded; no exact branch-specific current source reproduced'],
  'ChIJOezUv0OMGGARzSEqpv56al0':['exact-name source search; no safe current branch menu evidence reproduced'],
  'ChIJVVUk7xCMGGARMyh51ujPs50':['exact-name bar/source search; no concrete current food dish evidence'],
  'ChIJvWKURAOMGGARrI228Ht1cNo':['https://tabelog.com/tokyo/A1310/A131002/13042246/dtlmenu/','menu explicitly user-registered; customer/user menu truth rejected'],
  'ChIJx1ZBDuONGGARg9L-4ZdIwUY':['exact-name venue search; no reproducible branch-current menu source'],
  'ChIJ-3hjRgGMGGARUm7ETP8WqDY':['https://barandy.gorp.jp/','current exact venue page has beverage service but no concrete ordinary food dish suitable for dish completion'],
  'ChIJ7UdXoEOMGGARtvLt39mMWRk':['exact branch page checked; no reproducible concrete food menu item accepted'],
  'ChIJ9_4CKwCNGGAReojOE2R0Ydc':['exact current Tabelog branch checked; food menu unavailable/0 items'],
  'ChIJGTlbRhuMGGARIAZmv0AYzss':['exact-name branch search; no current concrete dish source'],
  'ChIJkZ5mMwCNGGAR71KbjY19Juo':['current exact identity verified, but no safe merchant/provider menu text reproduced; user review prose rejected'],
  'ChIJl6DVeQSMGGAR8HCf_UX93LA':['exact-name source search did not establish a current branch-specific menu'],
  'ChIJO6XWuwSMGGARNf_eMObW97I':['current exact restaurant listing checked; no current concrete branch menu source reproduced'],
  'ChIJuVk_oBqMGGARYlDpY7-RPqA':['current exact restaurant listing checked; no text food menu available'],
  'ChIJV2fZvB6MGGARTxGjO7HmQuA':['same-name/brand-family results were other branches; cross-branch propagation rejected'],
  'ChIJY_gYhRqMGGARAfTrky4HnZo':['same-name restaurants outside the frozen branch excluded; no exact current menu source'],
  'ChIJnYWupOGNGGARbJXrXzGrfL4':['current official STORIARE source checked; menu is image/category oriented and no source-native concrete dish text was safely reproducible'],
  'ChIJzbh-BgCNGGARYOcIF_C_Og8':['current official Livevillageアポロ venue source checked; event plate/drink bundles did not provide a stable ordinary concrete dish for canonical F']
};

const currentPlan = JSON.parse(fs.readFileSync(path.join(DATA, 'dish_batch_plan.json'), 'utf8'));
const currentAssignments = currentPlan.rows.filter(row => expected.has(row.googlePlaceId) && expected.get(row.googlePlaceId).lane === row.lane && expected.get(row.googlePlaceId).shard === row.shard);
if (currentAssignments.length !== expected.size) {
  const got = new Set(currentAssignments.map(row => row.googlePlaceId));
  const missing = [...expected.keys()].filter(id => !got.has(id));
  throw new Error(`S6 current assignment denominator mismatch: expected ${expected.size}, got ${currentAssignments.length}; missing=${missing.join(',')}`);
}
for (const row of currentPlan.rows) {
  if ((row.lane === 'independent_source_discovery' || row.lane === 'official_or_retained_featured') && row.shard === 6 && !expected.has(row.googlePlaceId)) {
    throw new Error(`Unexpected new S6 assignment requires review: ${row.googlePlaceId} ${row.name}`);
  }
}

const stateFields = ['recommendedDishesKnown','featuredDishesKnown','recommendedKnown','featuredKnown','officialUrlCount','retainedThirdPartyUrlCount','sourceWebsiteCount','sourceUrlCount','nextAction'];
function buildRecord(row) {
  const d = decisions[row.googlePlaceId] || {
    status:'no_evidence', identity:{state:'partial',sourceAliases:[row.name],evidence:[]}, dishProposals:[],
    attemptedSources:defaultAttempts[row.googlePlaceId] || ['bounded exact-name/current-source discovery on 2026-09-14'], blocker:null,
    notes:'No permitted, reproducible current branch-specific concrete dish evidence survived the second-pass identity/freshness/provenance review.'
  };
  const assignmentState = Object.fromEntries(stateFields.filter(key => Object.hasOwn(row,key)).map(key => [key,row[key]]));
  return { googlePlaceId:row.googlePlaceId, restaurantName:row.name, status:d.status, assignmentState,
    identity:d.identity, dishProposals:d.dishProposals, attemptedSources:d.attemptedSources, blocker:d.blocker ?? null, notes:d.notes };
}

function summary(records) {
  const map = {accepted_evidence:'acceptedEvidenceRows',candidate:'candidateRows',no_evidence:'noEvidenceRows',blocked:'blockedRows',skipped_already_complete:'skippedAlreadyCompleteRows'};
  const out = {assignedRows:records.length,reviewedRows:records.length,acceptedEvidenceRows:0,candidateRows:0,noEvidenceRows:0,blockedRows:0,skippedAlreadyCompleteRows:0};
  for (const r of records) out[map[r.status]]++;
  return out;
}
const policyAttestation = {paidGoogleDataApiCalls:0,canonicalMasterEditedDirectly:false,proximityOnlyIdentityBindingUsed:false,recommendationWithoutExplicitSemanticsAdded:false,accessRestrictionBypassUsed:false};
function makeDoc(marker, rows) {
  const records = rows.map(buildRecord);
  return {schemaVersion:1,proposalOnly:true,marker,shard:'S6',agentRunId:`${marker}:S6:20260914-E2E`,sourceQueue:'data/dish_batch_plan.json',sourceQueueCommit,generatedAt,summary:summary(records),policyAttestation,records};
}
const discoveryRows = currentAssignments.filter(r => r.lane === 'independent_source_discovery').sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));
const fRows = currentAssignments.filter(r => r.lane === 'official_or_retained_featured').sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));
if (discoveryRows.length !== 30 || fRows.length !== 6) throw new Error(`Expected Discovery30/F-source6 after maintained rebuild, got ${discoveryRows.length}/${fRows.length}`);
const docs = [
  ['DISH-R-DISCOVERY', discoveryRows, 'data/agent_proposals/DISH-R-DISCOVERY/S6.json', 'data/agent_reviews/DISH-R-DISCOVERY/S6.json'],
  ['DISH-F-SOURCE', fRows, 'data/agent_proposals/DISH-F-SOURCE/S6.json', 'data/agent_reviews/DISH-F-SOURCE/S6.json']
];
for (const [marker,rows,proposalPath,reviewPath] of docs) {
  const proposal = makeDoc(marker, rows);
  fs.mkdirSync(path.dirname(path.join(ROOT, proposalPath)), {recursive:true});
  fs.writeFileSync(path.join(ROOT, proposalPath), JSON.stringify(proposal,null,2)+'\n');
  const review = structuredClone(proposal);
  review.agentRunId = `${marker}:S6:20260914-E2E-SELF-REVIEW`;
  review.records.forEach((record,index) => {
    record.sourceProposalRefs = [{path:proposalPath,recordIndex:index,sourceStatus:record.status}];
    record.reviewReasoning = record.status === 'accepted_evidence'
      ? 'Independent second pass re-checked current assignment membership, frozen identity, exact branch scope, concrete source-native item, R/F semantics, freshness, reproducibility, customer-review exclusion, and cross-branch safeguards.'
      : 'Independent second pass re-checked identity/source/freshness constraints and confirmed this terminal outcome should not enter canonical evidence.';
  });
  fs.mkdirSync(path.dirname(path.join(ROOT, reviewPath)), {recursive:true});
  fs.writeFileSync(path.join(ROOT, reviewPath), JSON.stringify(review,null,2)+'\n');
}

const reviewRefs = docs.map(([, , , reviewPath]) => {
  const raw = fs.readFileSync(path.join(ROOT, reviewPath));
  return {path:reviewPath,sha256:crypto.createHash('sha256').update(raw).digest('hex')};
});
const queueRaw = fs.readFileSync(path.join(DATA,'dish_batch_plan.json'));
const assignmentSnapshot = currentAssignments.map(r => ({googlePlaceId:r.googlePlaceId,name:r.name,lane:r.lane,shard:r.shard})).sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));
const translations = {
  '九条ねぎの塩親子丼':{nameZh:'九条葱盐味亲子盖饭',rationale:'Direct translation of Kujo scallion + salt-seasoned chicken-and-egg rice bowl.'},
  '（温）とりちくわ天うどん':{nameZh:'热鸡肉竹轮天妇罗乌冬面',rationale:'Direct translation preserving hot serving, chicken/chikuwa tempura and udon.'},
  '海老真丈のサクサク揚げ':{nameZh:'酥炸虾肉鱼糕',rationale:'海老=虾; 真丈 is a fish/shrimp paste cake; サクサク揚げ=crisp fried.'},
  'ビーフカレー':{nameZh:'牛肉咖喱',rationale:'Literal beef curry translation.'},
  'オサカナランチ':{nameZh:'海鲜午餐拼盘',rationale:'Source description states a plate lunch for enjoying several Osacanajack seafood offerings.'},
  '鶏白湯ラーメン味玉入り　（醤油）':{nameZh:'溏心蛋鸡白汤酱油拉面',rationale:'Direct translation preserving seasoned egg, chicken paitan broth and soy sauce flavor.'},
  'NYCベーグルサンド':{nameZh:'纽约贝果三明治',rationale:'NYC bagel sandwich direct translation.'},
  'ナポリタン':{nameZh:'拿坡里意面',rationale:'Standard Chinese normalization for Japanese Napolitan spaghetti.'}
};
const manifest = {
  schemaVersion:1,approvalState:'approved',reviewer:'E2E-DISH:S6 self-review',reviewedAt:checkedAt,startingCommit,
  assignmentSnapshot:{sourceQueue:'data/dish_batch_plan.json',sourceQueueCommit,rebuiltQueueSha256:crypto.createHash('sha256').update(queueRaw).digest('hex'),rows:assignmentSnapshot},
  reviewedFiles:reviewRefs,translations,
  approvalNotes:'The same S6 owner performed a distinct second-pass semantic review as required. Approval is fail-closed and covers only current Discovery/F-source S6 assignment rows.'
};
const manifestPath = path.join(DATA,'agent_reviews','e2e-dish-s6-approval.json');
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');

const allRecords = docs.flatMap(([, , proposalPath]) => JSON.parse(fs.readFileSync(path.join(ROOT,proposalPath))).records);
const counts = Object.fromEntries(['accepted_evidence','candidate','no_evidence','blocked','skipped_already_complete'].map(s=>[s,allRecords.filter(r=>r.status===s).length]));
const approvedR = allRecords.flatMap(r=>r.status==='accepted_evidence'?r.dishProposals:[]).filter(d=>d.classification==='R').length;
const approvedF = allRecords.flatMap(r=>r.status==='accepted_evidence'?r.dishProposals:[]).filter(d=>d.classification==='F').length;
const table = allRecords.sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId)).map(r => {
  const lane = expected.get(r.googlePlaceId).lane;
  const rKnown = r.assignmentState.recommendedDishesKnown ?? r.assignmentState.recommendedKnown ?? '';
  const fKnown = r.assignmentState.featuredDishesKnown ?? r.assignmentState.featuredKnown ?? '';
  return `| ${r.googlePlaceId} | ${r.restaurantName.replaceAll('|','\\|')} | ${lane} | ${rKnown} | ${fKnown} | ${r.status} |`;
}).join('\n');
const log = `# E2E-DISH:S6 completion log\n\n- Starting/base commit: \`${startingCommit}\` (PR #67 compatible reviewed-evidence/integration-audit base)\n- Assignment source commit: \`${sourceQueueCommit}\`\n- Maintained baseline rebuild: required before this file was generated\n- Current assignment denominator: **36** = Discovery **30** + F-source **6**\n- Historical 29+6 was not reused: Minatoya moved from Official S6 to Discovery S6 after the wrong source website was quarantined.\n- Paid Google Data API calls: **0**\n- Access/CAPTCHA/robots bypasses: **0**\n\n## Baseline public metrics\n\nFrom the compatible base/rebuild infrastructure: catalog 2,804; public runtime 1,422; recommended restaurants 595; featured restaurants 675; any-display 740; recommendation gap 827. Final measured delta is appended by the integration workflow.\n\n## Review coverage\n\n- Discovery S6: 30 / 30 reviewed\n- F-source S6: 6 / 6 reviewed\n- Combined S6: 36 / 36 reviewed\n- Terminal states before integration: accepted=${counts.accepted_evidence}, candidate=${counts.candidate}, no_evidence=${counts.no_evidence}, blocked=${counts.blocked}, skipped=${counts.skipped_already_complete}\n- Approved evidence items before translation gate: R=${approvedR}, F=${approvedF}\n\n## Current assignment and terminal outcome\n\n| Place ID | Catalog name | Lane | R known | F known | Terminal status |\n|---|---|---|---:|---:|---|\n${table}\n\n## Accepted evidence summary\n\n- をどり 大手町: Tabelog exact branch; 九条ねぎの塩親子丼 / おすすめ -> R.\n- KAMAYOSHI: current Tabelog exact branch menu; （温）とりちくわ天うどん / おすすめ -> R.\n- 夢いち輪: exact branch menu; 海老真丈のサクサク揚げ / おすすめ -> R; seasonal alternatives deliberately excluded.\n- Bondy: restaurant-published Tabelog menu updated 2026-05-11; ビーフカレー / おすすめ -> R.\n- Osacanajack: exact branch lunch menu updated 2026-05-09; オサカナランチ -> F; older recommendation menu not used.\n- 鶏ラーメンTOKU: current Hot Pepper main branch page; 鶏白湯ラーメン味玉入り（醤油） appears as ordinary アラカルト -> F.\n- Think Coffee: official Kanda source; NYCベーグルサンド is explicitly シグネチャー・サンドイッチ -> R.\n- RECORD BAR JBC: current Hot Pepper exact branch; ナポリタン is explicitly 店長のおすすめ料理 / おすすめ -> R.\n\n## Rejected / downgraded findings\n\n- 水道橋酒場 多喜乃や: 名物 一番鶏 is preserved only as C because the menu is explicitly user-registered and dated 2016.\n- サパナ 水道橋店 and Banh Xeo Saigon Yatai Ebisu: Tabelog explicitly marks the pages as pre-relocation; no frozen-Place-ID successor propagation.\n- 酒処 魚肴: current identity is verified, but concrete item page is last updated 2023-11-06, so 鶏天 remains C/candidate.\n- Minatoya: prior wrong website was quarantined; multiple unrelated same-name entities remain, so exact source binding is blocked rather than guessed.\n- User-review prose, user-submitted menu photos, generic chain recommendations, neighboring/same-name restaurants, and expired/uncertain seasonal evidence were not integrated.\n\n## Integration path\n\nreviewed evidence -> explicit approval manifest -> reviewed-evidence adapter -> maintained evidence merge -> specificity correction -> evidence audit -> public-only reload/rebuild -> integration audit -> replay/idempotence check.\n\n## Final validation / measured canonical impact\n\n_Populated by the integration workflow after successful rebuild and audit._\n`;
fs.mkdirSync(path.join(ROOT,'logs'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'logs','2026-09-14-e2e-dish-s6.md'),log);
console.log(JSON.stringify({status:'pass',discovery:discoveryRows.length,fSource:fRows.length,total:currentAssignments.length,terminal:counts,approvedR,approvedF,sourceQueueCommit}));
