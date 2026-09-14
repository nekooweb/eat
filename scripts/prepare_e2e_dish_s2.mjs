#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = path.join(ROOT, 'data/dish_batch_plan.json');
const CHECKED_AT = '2026-09-14';
const GENERATED_AT = '2026-09-14T21:03:00+09:00';
const SOURCE_QUEUE_COMMIT = process.env.SOURCE_QUEUE_COMMIT || process.argv[2];
if (!/^[0-9a-f]{40}$/.test(SOURCE_QUEUE_COMMIT || '')) throw new Error('SOURCE_QUEUE_COMMIT must be a 40-char git SHA');

const POLICY = Object.freeze({
  paidGoogleDataApiCalls: 0,
  canonicalMasterEditedDirectly: false,
  proximityOnlyIdentityBindingUsed: false,
  recommendationWithoutExplicitSemanticsAdded: false,
  accessRestrictionBypassUsed: false
});
const LANES = Object.freeze({
  'DISH-R-DISCOVERY': 'independent_source_discovery',
  'DISH-F-SOURCE': 'official_or_retained_featured'
});

const acceptedDiscovery = new Map(Object.entries({
  ChIJkSjJMtWNGGARBJEfaEl17hI: {
    identityUrl: 'https://akibazettai.com/shop/', provider: 'official_web',
    identityNote: 'Official shop page names A.D.1912 and gives the exact branch address 東京都千代田区外神田3-1-15 箸勝ビル2F and phone 03-6876-4178.',
    dish: ['R','recommendedDishes','デミグラスオムライス（A.D.1912）','official_web','https://akibazettai.com/system/','official_menu_item','人気メニュー紹介：デミグラスオムライス（A.D.1912）','人気','Official current menu places the exact A.D.1912-labelled dish under 人気メニュー紹介.']
  },
  ChIJNUM68hiMGGARFSUebjxtZJc: {
    identityUrl: 'https://tabelog.com/tokyo/A1310/A131002/13169833/', provider: 'Tabelog',
    identityNote: 'Exact Tabelog branch page for 香港屋台; restaurant information is used, not customer-review prose.',
    dish: ['R','recommendedDishes','自家製羽つき焼き餃子','Tabelog','https://tabelog.com/tokyo/A1310/A131002/13169833/','source_recommendation_text','自家製羽つき餃子は必食。自家製羽つき焼き餃子','必食','Exact branch restaurant information explicitly marks the house winged pan-fried dumplings as 必食.']
  },
  ChIJRzuTUwGMGGARH3cj1AlyjEc: {
    identityUrl: 'https://page.line.me/033pzmoj', provider: 'official_web',
    identityNote: 'Official LINE account identifies 炭火焼 蕎麦 いきしぐさ and the Uchikanda branch address.',
    dish: ['R','recommendedDishes','カレーかけそば','official_web','https://page.line.me/033pzmoj','source_recommendation_text','当店のカレーそばの中で、断然の一番人気は『カレーかけそば』','一番人気','Official account directly identifies the concrete dish as the clear number-one curry soba.']
  },
  ChIJwRnSIQSMGGARhf6J07NnEsM: {
    identityUrl: 'https://tabelog.com/tokyo/A1310/A131002/13046811/', provider: 'Tabelog',
    identityNote: 'Exact Tabelog restaurant page for 鮨 後富久; only restaurant-managed descriptive/menu fields are used.',
    dish: ['R','recommendedDishes','漬けマグロ','Tabelog','https://tabelog.com/tokyo/A1310/A131002/13046811/','source_recommendation_text','日本近海で獲れた本マグロは必食。自慢の漬けマグロ','自慢','Exact branch page explicitly calls 漬けマグロ its 自慢.']
  },
  ChIJb4EjHQSMGGAROEMMNBy38mM: {
    identityUrl: 'https://nikubar-bosco.com/', provider: 'official_web',
    identityNote: 'Official BOSCO page gives the exact 神田/内神田 restaurant context and current offering.',
    dish: ['R','recommendedDishes','ワイルドヒレBBQ','official_web','https://nikubar-bosco.com/','source_recommendation_text','当店一押しのワイルドヒレBBQ','一押し','Official page directly applies 一押し to the concrete dish; course-level wording is not being propagated.']
  },
  ChIJp8dsAhGMGGARlvTDe2cyOEc: {
    identityUrl: 'https://sites.google.com/view/fuzambo-folio/menu', provider: 'official_web',
    identityNote: 'Publisher-maintained Folio menu names サロンド 冨山房 Folio and gives exact address 神田神保町1-3 冨山房ビルB1 and phone 03-3291-5153.',
    dish: ['F','featuredDishes','Folio特製ビーフカレー','official_web','https://sites.google.com/view/fuzambo-folio/menu','official_menu_item','Folio特製ビーフカレー 12:00～18:00 単品で￥900','', 'Current branch menu gives a concrete ordinary menu item; 特製 alone is not promoted to strict R.']
  },
  ChIJqSiOxDCNGGARWOU0to8PZ8k: {
    identityUrl: 'https://www.coconomi.jp/menu.html', provider: 'official_web',
    identityNote: 'Official ここのみ menu is branch-specific and identifies the Uchikanda restaurant.',
    dish: ['R','recommendedDishes','和牛の自家製ローストビーフ','official_web','https://www.coconomi.jp/menu.html','source_recommendation_text','数ある品書きの中でも特におすすめしたいのが、和牛の自家製ローストビーフ','おすすめ','Official menu directly says this concrete dish is one it especially recommends.']
  }
}));

const discoveryDowngrades = new Map(Object.entries({
  ChIJhXD3_AaMGGARcRQ90hRePdE: null
}));
// Hyphen-bearing Place IDs are assigned explicitly below to avoid accidental normalization.
const discoveryReviewCandidate = new Map([
  ['ChIJhXD3-AaMGGARcRQ90hRePdE', ['https://ban-nai.com/shop/', 'Official store directory proves the exact 大手町店 identity, but the inspected branch entry does not itself bind a concrete current menu item; brand-menu propagation was rejected.']],
  ['ChIJue2Wnx6MGGARtsk7v0lFNZc', ['https://sevens.owst.jp/', 'Exact branch identity is independently supported, but the discoverable concrete food-menu material is stale/insufficiently current; freshness gate rejected integration.']],
  ['ChIJsSFoXwCNGGARqlfQzh_6P5g', ['https://brozers.co.jp/restaurant/ochanomizu.html', 'Official 御茶の水店 page proves exact identity and links a GRAND MENU, but concrete item pages use another branch path; cross-branch menu propagation was not assumed.']]
]);
const discoveryInitialCandidateIds = new Set([
  'ChIJ2edswDuMGGAREjmUSuQI_6E','ChIJAQBEjBiMGGARYUv2a_TphXI','ChIJBXu_LgSMGGARXn0ZfwtG-kk',
  'ChIJlZ2-PQOMGGAR8PIOOozwzG8','ChIJr_AmLxmMGGARsJ6hMCyVNI4','ChIJVTolURyMGGARmV5611ctEqE'
]);

const acceptedFSource = new Map(Object.entries({
  ChIJbR57HVCNGGARzVRZXQjjbGM: {
    identityUrl: 'https://plus1coffee.hp.peraichi.com/', provider: 'official_web',
    identityNote: 'Current official Plus1 coffee page gives phone 03-3868-0979 and exact 本郷2-19-10 address.',
    dish: ['F','featuredDishes','スコーンサンドあんバター','official_web','https://plus1coffee.hp.peraichi.com/','official_menu_item','スコーンサンドあんバター 甘さおさえめのスコーンサンド','', 'Concrete current food item; no strict recommendation semantics.']
  },
  ChIJbwAATwCNGGARQwDbKm46DFQ: {
    identityUrl: 'https://tabelog.com/tokyo/A1310/A131003/13319539/', provider: 'Tabelog',
    identityNote: 'Current exact branch page for relocated メナムのほとり 神保町本店; branch identity is explicit.',
    dish: ['F','featuredDishes','トムヤムクン','Tabelog','https://tabelog.com/tokyo/A1310/A131003/13319539/dtlmenu/','tabelog_menu_text','Soup トムヤムクン 1,650円（2,3名様分）','', 'Current menu item on the exact branch page; this occurrence has no direct recommendation wording.']
  },
  ChIJd34FSnuNGGARgax6PuL4j_E: {
    identityUrl: 'https://rec-coffee.com/pages/coffee-shop-suidobashi', provider: 'official_web',
    identityNote: 'Current official branch page states 水道橋店, address 神田三崎町3-10-1 and phone 03-6910-0977, and directly links the branch menu PDF.',
    dish: ['F','featuredDishes','ツナアボカドサンドイッチ','official_web','https://cdn.shopify.com/s/files/1/0297/5193/5024/files/25.10_449104fc-cf2c-43d4-97be-11ea946656d4.pdf?v=1761025103','official_menu_item','TUNA & AVOCADO SANDWICH ツナアボカドサンドイッチ','', 'Current PDF linked directly from the exact 水道橋店 page; ordinary menu item, F only.']
  },
  ChIJi8oOa_-NGGARI5gh6aSXNxs: {
    identityUrl: 'https://www.hotpepper.jp/strJ004445138/', provider: 'Hot Pepper',
    identityNote: 'Exact current Hot Pepper branch page names タチエイト and address 神田小川町1-10-1 AUSPICE 1F.',
    dish: ['F','featuredDishes','SABA＆青ネギ','Hot Pepper','https://www.hotpepper.jp/strJ004445138/','hotpepper_menu_text','SABA＆青ネギ 500円（税込）','', 'Concrete branch menu item, updated 2025-09-25; no strict recommendation semantics.']
  },
  ChIJoUfFe9KNGGARFzs_SomCDXE: {
    identityUrl: 'https://gondtokyo.com/', provider: 'official_web',
    identityNote: 'Official GOND site gives exact address 神田駿河台3-5-15 荒井ビル1F and phone 03-3259-2800.',
    dish: ['F','featuredDishes','パニプーリ（２PC）','official_web','https://gondtokyo.com/','official_menu_item','Street Food & Starter パニプーリ（２PC） ¥360','', 'Concrete ordinary menu item outside the separate Recommended Menu section, therefore F.']
  },
  ChIJpfBVfQCNGGARX3UP4wURDQI: {
    identityUrl: 'https://r.gnavi.co.jp/947t5ggz0000/', provider: 'sourceWebsite',
    identityNote: 'Stable branch provider page names 神田炭火居酒屋 焼鳥 軒 －KEN－ and is the exact restaurant source used for current menu evidence.',
    dish: ['F','featuredDishes','焼き鳥軒サラダ','sourceWebsite','https://r.gnavi.co.jp/947t5ggz0000/menu6/','source_menu_text','焼き鳥軒サラダ 新鮮野菜をたっぷり使用した特製サラダ','', 'Concrete current branch course/menu component. 特製 is not strict recommendation semantics; course recommendation is not propagated.']
  }
}));

const fSourceDowngrades = new Map([
  ['ChIJ0VWstxyMGGARsq0cm5Y6970', ['https://www.hotpepper.jp/strJ000681988/food/', 'The exact Hot Pepper menu lead is stale enough that it should not become current canonical F truth without a fresher branch source.']],
  ['ChIJRdoFq06NGGARF_6Kq3TaI_o', ['https://www.hotpepper.jp/strJ003599266/food/', 'The exact branch source says the highlighted burger is daily-changing and cake examples are seasonal/illustrative; stable current ordinary-menu truth is not strong enough to integrate.']]
]);

const TRANSLATIONS = {
  'デミグラスオムライス（A.D.1912）': { nameZh: '多蜜酱蛋包饭（A.D.1912）', rationale: 'Exact literal normalization preserving the branch-qualified source-native dish label.' },
  '自家製羽つき焼き餃子': { nameZh: '自制冰花煎饺', rationale: 'Exact literal normalization of house-made winged pan-fried gyoza.' },
  'カレーかけそば': { nameZh: '咖喱浇汁荞麦面', rationale: 'Exact literal normalization; no recommendation semantics added.' },
  '漬けマグロ': { nameZh: '酱渍金枪鱼', rationale: 'Exact literal normalization of marinated tuna.' },
  'ワイルドヒレBBQ': { nameZh: 'WILD菲力BBQ', rationale: 'Preserves the source branding term and literally normalizes ヒレ.' },
  'Folio特製ビーフカレー': { nameZh: 'Folio特制牛肉咖喱', rationale: 'Preserves Folio and literally normalizes the source-native dish.' },
  '和牛の自家製ローストビーフ': { nameZh: '和牛自制烤牛肉', rationale: 'Exact literal normalization of house-made wagyu roast beef.' },
  'スコーンサンドあんバター': { nameZh: '红豆黄油司康夹心', rationale: 'Exact literal normalization of the source-native scone sandwich.' },
  'トムヤムクン': { nameZh: '冬阴功汤', rationale: 'Standard deterministic Chinese normalization for tom yum goong.' },
  'ツナアボカドサンドイッチ': { nameZh: '金枪鱼牛油果三明治', rationale: 'Exact literal normalization of tuna-avocado sandwich.' },
  'SABA＆青ネギ': { nameZh: '鲭鱼＆青葱', rationale: 'Preserves source typography and literally normalizes SABA/green onion.' },
  'パニプーリ（２PC）': { nameZh: '帕尼普里（2个）', rationale: 'Deterministic transliteration preserving the two-piece quantity.' },
  '焼き鳥軒サラダ': { nameZh: '烧鸟轩沙拉', rationale: 'Preserves the restaurant-name component and literally normalizes salad.' }
};

function summary(records) {
  const keys = ['accepted_evidence','candidate','no_evidence','blocked','skipped_already_complete'];
  const count = Object.fromEntries(keys.map(k => [k, records.filter(r => r.status === k).length]));
  return { assignedRows: records.length, reviewedRows: records.length,
    acceptedEvidenceRows: count.accepted_evidence, candidateRows: count.candidate,
    noEvidenceRows: count.no_evidence, blockedRows: count.blocked,
    skippedAlreadyCompleteRows: count.skipped_already_complete };
}
function terminal(row, status, notes, attemptedSources = []) {
  return { googlePlaceId: row.googlePlaceId, restaurantName: row.name, status,
    identity: { state: 'unverified', sourceAliases: [row.name], evidence: [] }, dishProposals: [],
    attemptedSources, blocker: null, notes };
}
function accepted(row, spec) {
  const [classification,targetField,nameOriginal,provider,sourceUrl,evidenceClass,evidenceText,recommendationSemantics,notes] = spec.dish;
  return { googlePlaceId: row.googlePlaceId, restaurantName: row.name, status: 'accepted_evidence',
    identity: { state: 'verified', sourceAliases: [row.name], evidence: [{ provider: spec.provider,
      sourceUrl: spec.identityUrl, checkedAt: CHECKED_AT, evidenceType: 'branch_page', note: spec.identityNote }] },
    dishProposals: [{ targetField, classification, nameOriginal, nameZhCandidate: null, evidenceClass,
      recommendationSemantics: recommendationSemantics || null, provider, sourceUrl, checkedAt: CHECKED_AT,
      sourceScope: 'branch', evidenceText, confidence: 'high', notes }],
    attemptedSources: [...new Set([spec.identityUrl, sourceUrl])], blocker: null,
    notes: 'Research pass found exact branch-bound source evidence.' };
}
function tentative(row, marker) {
  if (marker === 'DISH-R-DISCOVERY') {
    const [url] = discoveryReviewCandidate.get(row.googlePlaceId);
    const native = row.googlePlaceId === 'ChIJhXD3-AaMGGARcRQ90hRePdE' ? '喜多方ラーメン' :
      row.googlePlaceId === 'ChIJue2Wnx6MGGARtsk7v0lFNZc' ? 'フライドポテト' : 'ハンバーガー';
    const sourceUrl = row.googlePlaceId === 'ChIJue2Wnx6MGGARtsk7v0lFNZc' ? 'https://tabelog.com/tokyo/A1311/A131101/13212100/dtlmenu/' :
      row.googlePlaceId === 'ChIJsSFoXwCNGGARqlfQzh_6P5g' ? 'https://brozers.co.jp/restaurant/menu/nihonbashi/hamburger.html' : url;
    return { googlePlaceId: row.googlePlaceId, restaurantName: row.name, status: 'accepted_evidence',
      identity: { state: 'verified', sourceAliases: [row.name], evidence: [{ provider: 'official_web', sourceUrl: url,
        checkedAt: CHECKED_AT, evidenceType: 'branch_page', note: 'Research-pass identity/source match; requires independent freshness/scope review.' }] },
      dishProposals: [{ targetField: 'featuredDishes', classification: 'F', nameOriginal: native, nameZhCandidate: null,
        evidenceClass: 'source_menu_text', recommendationSemantics: null, provider: 'official_web', sourceUrl,
        checkedAt: CHECKED_AT, sourceScope: 'branch', evidenceText: native, confidence: 'medium',
        notes: 'Tentative research-pass F; independent self-review required.' }],
      attemptedSources: [...new Set([url, sourceUrl])], blocker: null,
      notes: 'Tentative accepted research finding pending independent self-review.' };
  }
  const [url] = fSourceDowngrades.get(row.googlePlaceId);
  const native = row.googlePlaceId === 'ChIJ0VWstxyMGGARsq0cm5Y6970' ? '刺身盛り合わせ' : '日替わりバーガー';
  return { googlePlaceId: row.googlePlaceId, restaurantName: row.name, status: 'accepted_evidence',
    identity: { state: 'verified', sourceAliases: [row.name], evidence: [{ provider: 'Hot Pepper', sourceUrl: url,
      checkedAt: CHECKED_AT, evidenceType: 'branch_page', note: 'Research pass found an exact branch-bound menu source; freshness/availability requires independent review.' }] },
    dishProposals: [{ targetField: 'featuredDishes', classification: 'F', nameOriginal: native, nameZhCandidate: null,
      evidenceClass: 'hotpepper_menu_text', recommendationSemantics: null, provider: 'Hot Pepper', sourceUrl: url,
      checkedAt: CHECKED_AT, sourceScope: 'branch', evidenceText: native, confidence: 'medium',
      notes: 'Tentative research-pass menu item; independent freshness review required.' }],
    attemptedSources: [url], blocker: null, notes: 'Tentative accepted research finding pending independent self-review.' };
}
function doc(marker, runId, records) {
  return { schemaVersion: 1, proposalOnly: true, marker, shard: 'S2', agentRunId: runId,
    sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: SOURCE_QUEUE_COMMIT,
    generatedAt: GENERATED_AT, summary: summary(records), records, policyAttestation: POLICY };
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const assignments = plan.rows.filter(r => r.shard === 2 && Object.values(LANES).includes(r.lane));
const byLane = new Map(Object.values(LANES).map(lane => [lane, assignments.filter(r => r.lane === lane)]));
if (!assignments.length) throw new Error('No current S2 assignment after maintained rebuild');
for (const [id] of [...acceptedDiscovery, ...acceptedFSource, ...discoveryReviewCandidate, ...fSourceDowngrades]) {
  if (!assignments.some(r => r.googlePlaceId === id)) console.warn(`S2 research record no longer in current assignment: ${id}`);
}

function buildPair(marker) {
  const lane = LANES[marker];
  const rows = byLane.get(lane);
  const acceptedMap = marker === 'DISH-R-DISCOVERY' ? acceptedDiscovery : acceptedFSource;
  const downgradeMap = marker === 'DISH-R-DISCOVERY' ? discoveryReviewCandidate : fSourceDowngrades;
  const proposal = rows.map(row => {
    if (acceptedMap.has(row.googlePlaceId)) return accepted(row, acceptedMap.get(row.googlePlaceId));
    if (downgradeMap.has(row.googlePlaceId)) return tentative(row, marker);
    if (marker === 'DISH-R-DISCOVERY' && discoveryInitialCandidateIds.has(row.googlePlaceId)) {
      return terminal(row, 'candidate', 'A plausible source or identity lead exists, but exact current branch-bound menu evidence was not strong enough for acceptance.');
    }
    return terminal(row, marker === 'DISH-R-DISCOVERY' ? 'no_evidence' : 'candidate',
      marker === 'DISH-R-DISCOVERY' ? 'Free web discovery did not produce reproducible current branch-bound concrete dish evidence strong enough for R/F; no customer-review prose was used.' : 'No stable current ordinary-menu item survived source review.');
  });
  const review = proposal.map((record, index) => {
    const row = rows[index];
    let out = structuredClone(record);
    const sourceStatus = record.status;
    if (downgradeMap.has(row.googlePlaceId)) {
      const [url, reason] = downgradeMap.get(row.googlePlaceId);
      out = terminal(row, 'candidate', reason, [url]);
      out.reviewReasoning = marker === 'DISH-R-DISCOVERY' ?
        'Independent second pass rejected research-pass acceptance because branch/freshness scope was not strong enough.' :
        'Independent freshness/availability review downgraded the research-pass acceptance.';
    } else if (record.status === 'accepted_evidence') {
      out.reviewReasoning = 'Second-pass review reconfirmed current assignment membership, exact branch identity, source-native concrete dish, R/F semantics, freshness and provenance.';
    } else {
      out.reviewReasoning = 'Independent second pass found no stronger exact current branch-bound evidence; terminal state retained.';
    }
    out.sourceProposalRefs = [{ path: `data/agent_proposals/${marker}/S2.json`, recordIndex: index, sourceStatus }];
    return out;
  });
  return { rows, proposal, review };
}

const discovery = buildPair('DISH-R-DISCOVERY');
const fsource = buildPair('DISH-F-SOURCE');
const outputs = [
  ['DISH-R-DISCOVERY', discovery], ['DISH-F-SOURCE', fsource]
];
for (const [marker, pair] of outputs) {
  writeJson(path.join(ROOT, `data/agent_proposals/${marker}/S2.json`), doc(marker, `e2e-dish-s2-${marker.toLowerCase()}-research-20260914`, pair.proposal));
  writeJson(path.join(ROOT, `data/agent_reviews/${marker}/S2.json`), doc(marker, `e2e-dish-s2-${marker.toLowerCase()}-review-20260914`, pair.review));
}
const reviewedFiles = outputs.map(([marker]) => {
  const rel = `data/agent_reviews/${marker}/S2.json`;
  return { path: rel, sha256: sha256(path.join(ROOT, rel)) };
});
const manifest = {
  schemaVersion: 1,
  approvalState: 'approved',
  assignmentName: 'E2E-DISH:S2',
  reviewer: 'E2E-DISH:S2 self-review',
  reviewedAt: CHECKED_AT,
  policyAttestation: POLICY,
  reviewedFiles,
  assignmentSnapshot: { sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: SOURCE_QUEUE_COMMIT,
    rows: assignments.map(({googlePlaceId,name,lane,shard}) => ({googlePlaceId,name,lane,shard})) },
  translations: TRANSLATIONS,
  notes: 'Approval is limited to accepted_evidence records surviving the independent second pass. Candidate/no_evidence rows remain non-canonical.'
};
writeJson(path.join(ROOT, 'data/agent_reviews/e2e-dish-s2.json'), manifest);
console.log(JSON.stringify({
  discovery: { proposal: summary(discovery.proposal), review: summary(discovery.review) },
  fsource: { proposal: summary(fsource.proposal), review: summary(fsource.review) },
  combined: summary([...discovery.review, ...fsource.review]), reviewedFiles
}, null, 2));
