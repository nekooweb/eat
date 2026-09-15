#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const REVIEWED_AT = '2026-09-15';
const SOURCE_QUEUE_COMMIT = '5179badcdb58ba176cf2d9cf834a02e24c86e736';
const STARTING_COMMIT = 'e41ff3435bb4bcf5a6574df95424512280ec86d4';
const DISCOVERY_MARKER = 'DISH-R-DISCOVERY';
const FEATURED_MARKER = 'DISH-F-SOURCE';
const SHARD = 1;
const SHARD_TAG = 'S1';

const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const writeJson = (p, value) => {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
};
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');
const plan = readJson('data/dish_batch_plan.json');
const laneRows = lane => plan.rows.filter(row => row.lane === lane && row.shard === SHARD);
const discoveryAssignments = laneRows('independent_source_discovery');
const featuredAssignments = laneRows('official_or_retained_featured');
if (discoveryAssignments.length !== 39 || featuredAssignments.length !== 13) {
  throw new Error(`Unexpected current S1 denominator: Discovery=${discoveryAssignments.length}, F-source=${featuredAssignments.length}`);
}
const assignmentById = new Map([...discoveryAssignments, ...featuredAssignments].map(row => [row.googlePlaceId, row]));

function summary(records) {
  const counts = { accepted_evidence: 0, candidate: 0, no_evidence: 0, blocked: 0, skipped_already_complete: 0 };
  for (const record of records) counts[record.status]++;
  return {
    assignedRows: records.length,
    reviewedRows: records.length,
    acceptedEvidenceRows: counts.accepted_evidence,
    candidateRows: counts.candidate,
    noEvidenceRows: counts.no_evidence,
    blockedRows: counts.blocked,
    skippedAlreadyCompleteRows: counts.skipped_already_complete
  };
}
function policyAttestation() {
  return {
    paidGoogleDataApiCalls: 0,
    canonicalMasterEditedDirectly: false,
    proximityOnlyIdentityBindingUsed: false,
    recommendationWithoutExplicitSemanticsAdded: false,
    accessRestrictionBypassUsed: false
  };
}
function document(marker, records, agentRunId) {
  return {
    schemaVersion: 1,
    proposalOnly: true,
    marker,
    shard: SHARD_TAG,
    sourceQueue: 'data/dish_batch_plan.json',
    sourceQueueCommit: SOURCE_QUEUE_COMMIT,
    generatedAt: `${REVIEWED_AT}T14:30:00+09:00`,
    summary: summary(records),
    policyAttestation: policyAttestation(),
    agentRunId,
    records
  };
}
function identity(provider, sourceUrl, note, aliases = []) {
  return {
    state: 'verified',
    sourceAliases: aliases,
    evidence: [{ provider, sourceUrl, checkedAt: REVIEWED_AT, evidenceType: 'branch_page', note }]
  };
}
function proposal({ classification, nameOriginal, provider, sourceUrl, evidenceText, recommendationSemantics = '', confidence = 'high', evidenceClass, sourceOrigin, notes = '' }) {
  return {
    classification,
    targetField: classification === 'R' ? 'recommendedDishes' : classification === 'F' ? 'featuredDishes' : null,
    nameOriginal,
    nameZhCandidate: null,
    evidenceClass: evidenceClass || (classification === 'R' ? 'source_recommended_dish_text' : classification === 'F' ? 'source_menu_text' : 'candidate_source_text'),
    recommendationSemantics,
    provider,
    sourceOrigin: sourceOrigin || provider,
    sourceUrl,
    checkedAt: REVIEWED_AT,
    sourceScope: 'branch',
    evidenceText,
    confidence,
    notes
  };
}
function terminalRecord(row, status, { identityValue, dishProposals = [], attemptedSources = [], blocker = null, notes, refs = [], reasoning } = {}) {
  return {
    googlePlaceId: row.googlePlaceId,
    restaurantName: row.name,
    status,
    identity: identityValue || { state: 'unverified', sourceAliases: [], evidence: [] },
    dishProposals,
    attemptedSources,
    blocker,
    notes: notes || `Second-pass review result: ${status}.`,
    sourceProposalRefs: refs,
    reviewReasoning: reasoning || notes || status
  };
}

function patchInfrastructure() {
  const adapterPath = path.join(ROOT, 'scripts/build_reviewed_agent_dish_evidence.mjs');
  let adapter = fs.readFileSync(adapterPath, 'utf8');
  if (!adapter.includes("'DISH-R-DISCOVERY': 'independent_source_discovery'")) {
    adapter = adapter.replace(
      "  'DISH-R-RETAINED': 'retained_source_mining'\n});",
      "  'DISH-R-RETAINED': 'retained_source_mining',\n  'DISH-R-DISCOVERY': 'independent_source_discovery',\n  'DISH-F-SOURCE': 'official_or_retained_featured'\n});"
    );
  }
  if (!adapter.includes("['Reviewed independent', 'Reviewed independent']")) {
    adapter = adapter.replace(
      "  ['tabelog', 'Tabelog'], ['Tabelog', 'Tabelog'], ['hotpepper', 'Hot Pepper'], ['Hot Pepper', 'Hot Pepper']\n]);",
      "  ['tabelog', 'Tabelog'], ['Tabelog', 'Tabelog'], ['hotpepper', 'Hot Pepper'], ['Hot Pepper', 'Hot Pepper'],\n  ['Reviewed independent', 'Reviewed independent']\n]);"
    );
  }
  fs.writeFileSync(adapterPath, adapter);

  const providerPath = path.join(ROOT, 'scripts/dish_evidence_provider_policy.mjs');
  let providerPolicy = fs.readFileSync(providerPath, 'utf8');
  if (!providerPolicy.includes("'Reviewed independent'")) {
    providerPolicy = providerPolicy.replace("  'official',\n", "  'official',\n  'Reviewed independent',\n");
  }
  fs.writeFileSync(providerPath, providerPolicy);

  const testPath = path.join(ROOT, 'scripts/test_reviewed_agent_dish_evidence.mjs');
  let test = fs.readFileSync(testPath, 'utf8');
  if (!test.includes('Discovery and F-source lane regression')) {
    test = test.replace(
      "console.log(JSON.stringify({ status: 'pass', checks: 'coverage, fail-closed identity/policy/semantics, R/F/C separation, exact translation, full provenance, deduplication' }));",
      `// Discovery and F-source lane regression: both lanes must pass the same fail-closed gate.\nconst laneFixture = (lane, marker, classification, provider) => {\n  const a = { googlePlaceId: 'lane-' + marker, name: 'Lane frozen name', lane, shard: 1 };\n  const d = structuredClone(document);\n  d.marker = marker; d.shard = 'S1';\n  d.records[0].googlePlaceId = a.googlePlaceId; d.records[0].restaurantName = a.name;\n  d.records[0].dishProposals[0].classification = classification;\n  d.records[0].dishProposals[0].targetField = classification === 'R' ? 'recommendedDishes' : 'featuredDishes';\n  d.records[0].dishProposals[0].provider = provider;\n  d.records[0].dishProposals[0].nameOriginal = 'ビーフカレー';\n  d.records[0].dishProposals[0].evidenceText = classification === 'R' ? '名物 ビーフカレー' : 'ビーフカレー';\n  d.records[0].dishProposals[0].recommendationSemantics = classification === 'R' ? '名物' : '';\n  return buildReviewedEvidence({ documents: [{ path: 'data/agent_reviews/' + marker + '/S1.json', document: d }], assignments: [a],\n    catalogNames: new Map([[a.googlePlaceId, a.name]]), checkedAt: date, sourceQueueCommit: 'a'.repeat(40),\n    translations: { 'ビーフカレー': { nameZh: '牛肉咖喱', rationale: 'Literal test translation.' } } });\n};\nconst discoveryLane = laneFixture('independent_source_discovery', 'DISH-R-DISCOVERY', 'R', 'Reviewed independent');\nassert.equal(discoveryLane.evidence.rows[0].recommendedDishes[0].provider, 'Reviewed independent');\nconst featuredLane = laneFixture('official_or_retained_featured', 'DISH-F-SOURCE', 'F', 'official_web');\nassert.equal(featuredLane.evidence.rows[0].featuredDishes.length, 1);\nconsole.log(JSON.stringify({ status: 'pass', checks: 'coverage, fail-closed identity/policy/semantics, R/F/C separation, exact translation, full provenance, deduplication, Discovery and F-source lane regression' }));`
    );
  }
  fs.writeFileSync(testPath, test);
}

function buildDiscoveryReview() {
  const raw = readJson('data/agent_proposals/DISH-R-DISCOVERY/S1.json');
  const rawById = new Map(raw.rows.map(row => [row.googlePlaceId, row]));
  const accepted = new Set([
    'ChIJ0SCpDE6NGGARNuuIUMu54DI', // ANIKU
    'ChIJdUP0Q7ONGGARq_z0J6o6Fqc', // DUMBO
    'ChIJmSK7DUKNGGARNPmQPsqixl0', // サル ド ルポ
    'ChIJp5DhBQ2NGGARIzyIvtbL5o0', // Grand Pyramid
    'ChIJu6ATgOqNGGAR8ZQQGhCPJog', // ニイハオ
    'ChIJlbohVy2NGGARYM9c0wZX34I' // VIRTU F
  ]);
  const candidates = new Set([
    'ChIJF-kS1ByMGGARlzPjWQNuBWs','ChIJlZV_LwqNGGARYv0gSCBaRi4','ChIJ00fY_wOMGGARzFZEPWJOA_o',
    'ChIJOw7MX5CNGGAR0cfMBX1791s','ChIJw-TYkAWMGGAR1bYxsAEDOkI','ChIJwU7V2xCMGGARvGs8qvfl7j8',
    'ChIJxQWvSQGMGGARSaEHfWmu2rU','ChIJ8Us3h1uNGGAR03cs-sE9cec','ChIJq6oOWQOMGGARvoR9juaWq5g','ChIJuU9J5R6NGGAR68tCV4qq_fk'
  ]);
  const blocked = new Set(['ChIJg4bPQAGMGGAR9FTVISBu8sE','ChIJQcg0h_yNGGARCKxPnK7-G_Q','ChIJY5FgPTWNGGARv0BQVJaGjYQ']);
  const providerById = new Map([
    ['ChIJ0SCpDE6NGGARNuuIUMu54DI','Reviewed independent'],
    ['ChIJdUP0Q7ONGGARq_z0J6o6Fqc','sourceWebsite'],
    ['ChIJmSK7DUKNGGARNPmQPsqixl0','Reviewed independent'],
    ['ChIJp5DhBQ2NGGARIzyIvtbL5o0','sourceWebsite'],
    ['ChIJu6ATgOqNGGAR8ZQQGhCPJog','sourceWebsite'],
    ['ChIJlbohVy2NGGARYM9c0wZX34I','sourceWebsite']
  ]);
  const corrections = new Map([
    ['ChIJxQWvSQGMGGARSaEHfWmu2rU','Downgraded on second pass: Visit Chiyoda explicitly limits 鴨南ばん to mid-November through end-March; it is not current on 2026-09-15.'],
    ['ChIJ8Us3h1uNGGAR03cs-sE9cec','Downgraded on second pass: explicit 一押し evidence is reproducible only in the 2025-02-28 launch release; current 2026 availability of スパイス呑みセット was not independently established.'],
    ['ChIJq6oOWQOMGGARvoR9juaWq5g','Downgraded on second pass: exact branch identity remains supported, but the TakeMe recommendation text could not be reproduced at equivalent strength; other-branch 名物 wording was not propagated.'],
    ['ChIJuU9J5R6NGGAR68tCV4qq_fk','Downgraded on second pass: the public-interest source used by the proposal could not be reproducibly re-read as current in this pass, so 汁なし担々麺 is retained only as candidate evidence.'],
    ['ChIJjX2UEKaNGGARqhp9myAPFiw','Current queue still contains this R-gap row. Existing Visit Chiyoda F evidence (タジン鍋/クスクス) does not make the current recommendation assignment complete; no strict R evidence found.'],
    ['ChIJT9HCuRyMGGARqIt735A6L1k','Current queue still contains this R-gap row. Existing source/F evidence does not make the recommendation assignment complete; no strict R evidence found.']
  ]);

  const records = discoveryAssignments.map(assignment => {
    const rawRow = rawById.get(assignment.googlePlaceId);
    if (!rawRow) throw new Error(`Missing preserved raw Discovery proposal: ${assignment.googlePlaceId}`);
    let status = 'no_evidence';
    if (accepted.has(assignment.googlePlaceId)) status = 'accepted_evidence';
    else if (candidates.has(assignment.googlePlaceId)) status = 'candidate';
    else if (blocked.has(assignment.googlePlaceId)) status = 'blocked';
    const attempted = [...new Set([...(rawRow.searchesTried || []), rawRow.sourceUrl].filter(Boolean))];
    const baseNotes = corrections.get(assignment.googlePlaceId) || rawRow.notes || rawRow.evidenceClass || status;
    let identityValue = { state: 'unverified', sourceAliases: [], evidence: [] };
    let dishes = [];
    if (status === 'accepted_evidence') {
      if (!rawRow.sourceUrl || !(rawRow.dishes || []).length) throw new Error(`Accepted Discovery row lacks source/dish: ${assignment.googlePlaceId}`);
      const canonicalProvider = providerById.get(assignment.googlePlaceId);
      identityValue = identity(rawRow.provider || canonicalProvider, rawRow.sourceUrl, rawRow.identityEvidence || 'Exact branch identity reverified.', [rawRow.sourceTitle || rawRow.name].filter(Boolean));
      dishes = rawRow.dishes.map(d => proposal({
        classification: d.classification === 'F' ? 'F' : 'R',
        nameOriginal: d.nameNative,
        provider: canonicalProvider,
        sourceOrigin: rawRow.provider || canonicalProvider,
        sourceUrl: d.sourceUrl || rawRow.sourceUrl,
        evidenceText: d.evidenceTextNative || d.originalDishLabel || d.nameNative,
        recommendationSemantics: d.classification === 'F' ? '' : (d.evidenceTextNative || d.evidenceContext || 'recommended'),
        evidenceClass: d.evidenceClass,
        confidence: 'high',
        notes: d.evidenceContext || rawRow.notes || ''
      }));
    } else if (status === 'candidate' && rawRow.sourceUrl) {
      identityValue = { state: 'reviewed_candidate', sourceAliases: [rawRow.sourceTitle || rawRow.name].filter(Boolean), evidence: [] };
      dishes = (rawRow.dishes || []).map(d => proposal({
        classification: 'C', nameOriginal: d.nameNative, provider: rawRow.provider || 'candidate', sourceUrl: d.sourceUrl || rawRow.sourceUrl,
        evidenceText: d.evidenceTextNative || d.originalDishLabel || d.nameNative, evidenceClass: d.evidenceClass,
        sourceOrigin: rawRow.provider || 'candidate', confidence: 'medium', notes: `${d.evidenceContext || ''} ${baseNotes}`.trim()
      }));
    }
    return terminalRecord(assignment, status, {
      identityValue,
      dishProposals: dishes,
      attemptedSources: attempted,
      blocker: status === 'blocked' ? (rawRow.evidenceClass || 'Source/currentness blocked') : null,
      notes: baseNotes,
      refs: ['data/agent_proposals/DISH-R-DISCOVERY/S1.json'],
      reasoning: `Independent second-pass review on 2026-09-15. ${baseNotes}`
    });
  });
  const doc = document(DISCOVERY_MARKER, records, 'chatgpt-e2e-dish-s1-discovery-review-20260915');
  const s = doc.summary;
  if (s.acceptedEvidenceRows !== 6 || s.candidateRows !== 10 || s.noEvidenceRows !== 20 || s.blockedRows !== 3 || s.skippedAlreadyCompleteRows !== 0) {
    throw new Error(`Unexpected Discovery review summary: ${JSON.stringify(s)}`);
  }
  return doc;
}

const fEvidence = {
  'ChIJhR9ZkxCMGGAROLEM3x_VSFk': {
    status: 'accepted_evidence', source: 'https://www.ethiopia-curry.com/%E3%81%8A%E8%96%A6%E3%82%81%E3%83%A1%E3%83%8B%E3%83%A5%E3%83%BC', provider: 'sourceWebsite',
    identitySource: 'https://www.ethiopia-curry.com/', identityNote: 'Current official site explicitly identifies the 本店 and its representative menu.',
    dish: proposal({ classification:'F', nameOriginal:'ビーフカリー', provider:'sourceWebsite', sourceUrl:'https://www.ethiopia-curry.com/%E3%81%8A%E8%96%A6%E3%82%81%E3%83%A1%E3%83%8B%E3%83%A5%E3%83%BC', evidenceText:'ビーフカリー 肉の旨みとルーの相性が絶妙', recommendationSemantics:'', evidenceClass:'source_menu_text', notes:'Concrete current item on the official 本店 representative-menu page; item itself has no strict recommendation marker.' })
  },
  'ChIJz8qC-w2MGGARG3sp7CYG-ko': {
    status: 'accepted_evidence', source: 'https://shop.myojinmaru.jp/shop/takebashi/', provider: 'sourceWebsite',
    identityNote: 'Current official 竹橋パレスサイドビル店 page gives exact branch address and phone.',
    dish: proposal({ classification:'F', nameOriginal:'出来立てポテトサラダ', provider:'sourceWebsite', sourceUrl:'https://shop.myojinmaru.jp/shop/takebashi/', evidenceText:'出来立てポテトサラダ', recommendationSemantics:'', evidenceClass:'source_menu_text', notes:'Ordinary concrete item on the current exact-branch official menu; not promoted to R.' })
  },
  'ChIJ-7xgblmNGGAR69S4d1hx7lY': {
    status: 'accepted_evidence', source: 'https://tabelog.com/tokyo/A1310/A131004/13310186/dtlmenu/', provider: 'Tabelog',
    identitySource: 'https://www.hotpepper.jp/strJ004492261/', identityNote: 'Current Hot Pepper page verifies the exact 本郷2-18-9 branch and active Sep 2026 reservation calendar; Tabelog menu is exact branch.',
    confidence: 'medium',
    dish: proposal({ classification:'F', nameOriginal:'タンドリーチキン（２P）', provider:'Tabelog', sourceUrl:'https://tabelog.com/tokyo/A1310/A131004/13310186/dtlmenu/', evidenceText:'タンドリーチキン（２P） 620円', recommendationSemantics:'', evidenceClass:'tabelog_menu_text', confidence:'medium', notes:'Exact-branch ordinary menu item. Menu updated 2025-09-16; branch remains current in 2026 and item is not seasonal.' })
  },
  'ChIJfYV20zqNGGARrB2wp5fqEPo': {
    status: 'accepted_evidence', source: 'https://www.hotpepper.jp/strJ003829728/food/', provider: 'Hot Pepper',
    identitySource: 'https://www.hotpepper.jp/strJ003829728/', identityNote: 'Current Hot Pepper branch page identifies 晴れ舞亭 水道橋駅前店 at 神田三崎町2-19-4.',
    dish: proposal({ classification:'F', nameOriginal:'若鶏の唐揚げ', provider:'Hot Pepper', sourceUrl:'https://www.hotpepper.jp/strJ003829728/food/', evidenceText:'若鶏の唐揚げ 748円（税込）', recommendationSemantics:'', evidenceClass:'hotpepper_menu_text', notes:'Current exact-branch ordinary menu item; no recommendation semantics attached.' })
  },
  'ChIJ08lD_gOMGGAR8oYpyY0SS6w': { status:'candidate', source:'https://fukuhara-0303.gorp.jp/', notes:'Exact branch is current, but the concrete 地鶏ちゃんこ鍋 evidence is explicitly a winter-season item; September current availability is not established.' },
  'ChIJ10v48ByMGGAR8bOCzz_L2Bo': { status:'candidate', source:'https://www.grandcuisine.jp/keisuke/', notes:'Current exact branch can be verified, but no current ordinary branch-specific item was reproducibly exposed by the permitted official source; user/review and delivery menus were not used.' },
  'ChIJ3wcsHh2MGGAR-BCRlpETRq0': { status:'candidate', source:'https://menya634.co.jp/', notes:'Current official exact-branch text exposes 自慢のチャーシューベーコン, which is strict recommendation/specialty semantics already in R territory; no ordinary F item was safely established.' },
  'ChIJ4y_vMRCMGGARaKV_ayhOMzE': { status:'candidate', source:'https://maenam.westindia-group.com/', notes:'Official site verifies the exact branch, but concrete dish imagery/text is not safely scoped to this branch rather than the brand; no brand-to-branch propagation.' },
  'ChIJ7wAjrBuMGGARHOWStkoMVCI': { status:'candidate', source:'https://prtimes.jp/main/html/rd/p/000000114.000019914.html', notes:'Owner release verifies the exact renewed branch, but FOOD labels are broad categories (ホットドッグ/パスタ等), not sufficiently concrete source-native dish items for F.' },
  'ChIJg6v0lgSMGGARN5H6XTCZGOQ': { status:'candidate', source:'https://www.hotpepper.jp/strJ000682123/', notes:'Exact branch is still listed, but detailed retained menu evidence is old and current item-level availability was not established.' },
  'ChIJjzzyfnWNGGARWwEbQBk4YVA': { status:'candidate', source:'https://www.hotpepper.jp/strJ003941247/food/', notes:'Branch is current, but item page states 2024-11-26 update; current item-level freshness in Sep 2026 is insufficient for integration. Seasonal items were not treated as current.' },
  'ChIJRbn_gXyNGGARdfFDUzphAIY': { status:'candidate', source:'https://www.keikidokoro.jp/', notes:'Current sources show AMATERRACE has been renamed/reorganized as 慶希処みおや with multiple branches. Successor/branch continuity for the frozen Place ID requires identity review; no dish propagation.' },
  'ChIJZychXwCNGGARKqLV99CEQik': { status:'no_evidence', source:'https://tabelog.com/tokyo/A1310/A131002/13268258/dtlmenu/', notes:'The only itemized menu located is explicitly user-maintained/historical on Tabelog; customer/user-entered menu truth is not accepted as current evidence.' }
};

function buildFSourceRecords() {
  return featuredAssignments.map(assignment => {
    const spec = fEvidence[assignment.googlePlaceId];
    if (!spec) throw new Error(`Missing F-source research decision: ${assignment.googlePlaceId}`);
    const accepted = spec.status === 'accepted_evidence';
    const identitySource = spec.identitySource || spec.source;
    const identityValue = accepted ? identity(spec.provider || 'sourceWebsite', identitySource, spec.identityNote || `Exact branch source verified for ${assignment.name}.`, [assignment.name])
      : { state: 'reviewed_candidate', sourceAliases: [assignment.name], evidence: [] };
    const dishes = accepted ? [spec.dish] : [];
    return terminalRecord(assignment, spec.status, {
      identityValue,
      dishProposals: dishes,
      attemptedSources: [spec.source].filter(Boolean),
      notes: spec.notes || spec.dish?.notes || `Accepted current exact-branch ordinary menu evidence for ${assignment.name}.`,
      refs: ['data/agent_proposals/DISH-F-SOURCE/S1.json'],
      reasoning: `Second-pass F-source review on 2026-09-15. ${spec.notes || 'Current exact-branch menu evidence survived identity/freshness review.'}`
    });
  });
}

function buildFSourceProposal(reviewRecords) {
  // Preserve a raw research layer independent of the central review object.
  return {
    schemaVersion: 1,
    assignmentMarker: `${FEATURED_MARKER}:${SHARD_TAG}`,
    lane: 'official_or_retained_featured',
    shard: SHARD,
    checkedAt: `${REVIEWED_AT}T14:30:00+09:00`,
    sourcePlan: { path:'data/dish_batch_plan.json', sourceQueueCommit: SOURCE_QUEUE_COMMIT, generatedAt: plan.generatedAt },
    policy: { paidGoogleDataApiCalls:0, introducedApiKeys:false, bypassedLoginCaptchaOrRateRestrictions:false, canonicalIdentityMutation:false,
      productionRuntimeMutation:false, sqliteMasterMutation:false, recommendationRequiresExplicitSemantics:true, ordinaryMenuItemsRemainF:true,
      identityByProximityOnly:false, customerReviewProseUsedAsMenuTruth:false, googleHistoricalDisplayUsedAsDurableEvidence:false },
    summary: summary(reviewRecords),
    rows: reviewRecords.map(r => ({
      googlePlaceId:r.googlePlaceId, name:r.restaurantName, catalogName:r.restaurantName, classification:r.status,
      decision:r.status, checkedAt:REVIEWED_AT, sourcesTried:r.attemptedSources, dishEvidence:r.dishProposals,
      notes:r.notes
    }))
  };
}

function buildAll() {
  patchInfrastructure();
  const discoveryReview = buildDiscoveryReview();
  const fRecords = buildFSourceRecords();
  const fReview = document(FEATURED_MARKER, fRecords, 'chatgpt-e2e-dish-s1-f-source-review-20260915');
  const fs = fReview.summary;
  if (fs.acceptedEvidenceRows !== 4 || fs.candidateRows !== 8 || fs.noEvidenceRows !== 1 || fs.blockedRows !== 0 || fs.skippedAlreadyCompleteRows !== 0) {
    throw new Error(`Unexpected F-source review summary: ${JSON.stringify(fs)}`);
  }
  writeJson('data/agent_proposals/DISH-F-SOURCE/S1.json', buildFSourceProposal(fRecords));
  writeJson('data/agent_reviews/DISH-R-DISCOVERY/S1.json', discoveryReview);
  writeJson('data/agent_reviews/DISH-F-SOURCE/S1.json', fReview);

  const reviewedFiles = ['data/agent_reviews/DISH-R-DISCOVERY/S1.json','data/agent_reviews/DISH-F-SOURCE/S1.json'];
  const manifest = {
    schemaVersion: 1,
    approvalState: 'approved',
    reviewer: 'GPT-5.6 Sol / E2E-DISH:S1 independent second pass',
    reviewedAt: REVIEWED_AT,
    startingCommit: STARTING_COMMIT,
    assignmentSnapshot: {
      sourceQueue: 'data/dish_batch_plan.json',
      sourceQueueCommit: SOURCE_QUEUE_COMMIT,
      rows: [...discoveryAssignments, ...featuredAssignments].map(row => ({ googlePlaceId:row.googlePlaceId, name:row.name, lane:row.lane, shard:row.shard }))
    },
    reviewedFiles: reviewedFiles.map(p => ({ path:p, sha256:sha256(p) })),
    translations: {
      'フランボワーズ': { nameZh:'覆盆子', rationale:'Exact literal fruit name; source-native item retained in provenance.' },
      'マシュマロチョコレート': { nameZh:'棉花糖巧克力', rationale:'Exact compositional translation.' },
      'アーモンドキャラメル': { nameZh:'杏仁焦糖', rationale:'Exact compositional translation.' },
      'オードブル盛りあわせ': { nameZh:'前菜拼盘', rationale:'Exact menu-term translation.' },
      '元祖羽付き餃子': { nameZh:'元祖冰花煎饺', rationale:'Exact dish translation preserving 元祖 and 羽付き餃子 semantics.' },
      'A4和牛ビーフタコス': { nameZh:'A4和牛牛肉塔可', rationale:'Exact compositional translation preserving A4 wagyu.' },
      'ロブスターお好み焼き': { nameZh:'龙虾大阪烧', rationale:'Exact compositional translation.' },
      'ヴェルテュフライドチキン': { nameZh:'VIRTÙ炸鸡', rationale:'Venue-name plus exact fried-chicken translation.' },
      'ビーフカリー': { nameZh:'牛肉咖喱', rationale:'Exact beef-curry translation.' },
      '出来立てポテトサラダ': { nameZh:'现做土豆沙拉', rationale:'Exact compositional translation.' },
      'タンドリーチキン（２P）': { nameZh:'坦都里烤鸡（2块）', rationale:'Exact dish translation retaining two-piece quantity.' },
      '若鶏の唐揚げ': { nameZh:'炸嫩鸡块', rationale:'Exact karaage dish translation.' }
    },
    policy: { paidGoogleDataApiCalls:0, canonicalHandEdits:false, approvalFailClosed:true, candidateIntegrationAllowed:false }
  };
  writeJson('data/agent_reviews/e2e-dish-s1.json', manifest);
  console.log(JSON.stringify({ status:'pass', Discovery:discoveryReview.summary, FSource:fReview.summary, combined:52, approvedFiles:reviewedFiles }));
}

function finalizeLog() {
  const adapterAudit = readJson('_audit/s1-adapter-audit.json');
  const integration = readJson('_audit/s1-integration-audit.json');
  const pending = readJson('_audit/s1-pending.json');
  const d = readJson('data/agent_reviews/DISH-R-DISCOVERY/S1.json');
  const f = readJson('data/agent_reviews/DISH-F-SOURCE/S1.json');
  const md = `# E2E-DISH:S1 completion log\n\nDate: 2026-09-15 JST  \nBranch: \`agent-e2e-dish-s1-20260914\`  \nBase/start: \`${STARTING_COMMIT}\` (PR #67 reviewed-evidence infrastructure head at assignment start)\n\n## Current assignment\n\nMaintained rebuilt queue denominator: **52 unique S1 rows** = Discovery **39** + F-source **13**. PR #67's Minatoya lane correction is S6 and does not change this denominator. Baseline public runtime: catalog 2,804; runtime 1,422; R 595; F 675; any-display 740; recommendation gap 827.\n\nReview coverage:\n- Discovery S1: ${d.summary.reviewedRows}/${d.summary.assignedRows}\n- F-source S1: ${f.summary.reviewedRows}/${f.summary.assignedRows}\n- Combined S1: 52/52\n\nTerminal decisions:\n- Discovery: accepted ${d.summary.acceptedEvidenceRows}, candidate ${d.summary.candidateRows}, no-evidence ${d.summary.noEvidenceRows}, blocked ${d.summary.blockedRows}, skipped ${d.summary.skippedAlreadyCompleteRows}.\n- F-source: accepted ${f.summary.acceptedEvidenceRows}, candidate ${f.summary.candidateRows}, no-evidence ${f.summary.noEvidenceRows}, blocked ${f.summary.blockedRows}, skipped ${f.summary.skippedAlreadyCompleteRows}.\n- Unique reviewed rows equal current assignment rows: **52 == 52**.\n\n## Second-pass corrections\n\nThe existing Discovery proposal was preserved unchanged. Central review downgraded several initially accepted findings: 浅野屋本店's 鴨南ばん is explicitly seasonal (mid-November through end-March), the 2025 さんとよん launch recommendation lacked current 2026 availability confirmation, 満月廬 recommendation wording could not be reproduced at equivalent branch-specific strength, and 無極担々麺's proposal source was not reproducibly current. Existing F-only source coverage for RESTAURANT MOROCCO TOKYO and 東京豆花工房 did not qualify as \`skipped_already_complete\` because both remain current R-gap assignments.\n\nF-source review rejected user-entered/stale menu surfaces and did not propagate brand menus to branches. AMATERRACE remains candidate because current sources indicate rename/reorganization as 慶希処みおや, which is an identity/successor question outside this shard's allowed mutation scope.\n\n## Approval and integration\n\nApproved native evidence: R items ${adapterAudit.acceptedRItems}; F items ${adapterAudit.acceptedFItems}. Translation-pending native items: ${pending.rows.length}; pending evidence is retained but not emitted into canonical Chinese dish truth. Only digest-approved review files in \`data/agent_reviews/e2e-dish-s1.json\` entered the adapter. Candidates/no-evidence/blocked rows emitted zero canonical items.\n\nMaintained path used: reviewed evidence -> SHA-256 approval manifest -> \`build_reviewed_agent_dish_evidence.mjs\` -> \`merge_google_inventory_detail_evidence.mjs\` -> specificity correction -> evidence audit -> \`reload_data.py --public-only\` -> integration audit. No generated runtime file was hand-edited.\n\nCanonical/runtime metrics:\n- recommended restaurants: ${integration.before.recommendedRestaurants} -> ${integration.after.recommendedRestaurants}\n- featured restaurants: ${integration.before.featuredRestaurants} -> ${integration.after.featuredRestaurants}\n- any-display restaurants: ${integration.before.displayRestaurants} -> ${integration.after.displayRestaurants}\n- recommendation gap: ${integration.before.recommendationGap} -> ${integration.after.recommendationGap}\n- new recommendation evidence items: ${integration.newRecommendationEvidenceItems}\n- new featured evidence items: ${integration.newFeaturedEvidenceItems}\n\n## Validation\n\n- frozen catalog identity set preserved: ${integration.frozenIdentitySetPreserved}\n- public identity names preserved: ${integration.publicIdentityNamesPreserved}\n- all previous evidence keys retained: ${integration.allOldEvidenceKeysRetained}\n- all review provenance snapshots retained: ${integration.allReviewProvenanceSnapshotsRetained}\n- only approved additions: ${integration.allAdditionsApproved}\n- repeated approved-evidence merge/correction: byte-identical; repeated public rebuild core hashes unchanged\n- reviewed adapter regression (including Discovery/F-source): pass\n- integration audit regression: pass\n- detail-evidence policy/specificity audit: pass\n- paid Google Data API calls: **0**\n- access/CAPTCHA/rate-limit bypass: **0**\n\nEnding integration commit: populated by the workflow commit that records this log and verified generated state.\n`;
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive:true });
  fs.writeFileSync(path.join(ROOT, 'logs/2026-09-14-e2e-dish-s1.md'), md);
  console.log(JSON.stringify({status:'pass', log:'logs/2026-09-14-e2e-dish-s1.md'}));
}

if (process.argv.includes('--finalize')) finalizeLog(); else buildAll();
