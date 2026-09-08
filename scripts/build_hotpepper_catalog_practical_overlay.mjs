import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const INPUT = path.join(DATA, 'hotpepper_catalog_facts.json');
const OUTPUT = process.argv[2] || path.join(DATA, 'hotpepper_catalog_practical_overlay.json');
const RULE_VERSION = 'hotpepper-catalog-practical-v1';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function exactJaBool(value) {
  const text = clean(value);
  if (text === 'あり') return true;
  if (text === 'なし') return false;
  return null;
}

function prefixedAvailability(value, subject) {
  const text = clean(value);
  if (!text) return null;
  const yes = /^あり(?:\s*[:：]|$)/.test(text);
  const no = /^なし(?:\s*[:：]|$)/.test(text);
  if (!yes && !no) return null;

  const negative = subject === 'food'
    ? /食べ放題.{0,28}(?:ご用意しておりません|ご用意はございません|ございません|ありません|行っておりません|実施しておりません|なし)/
    : /飲み放題.{0,28}(?:ご用意しておりません|ご用意はございません|ございません|ありません|行っておりません|実施しておりません|なし)/;
  const positive = subject === 'food'
    ? /食べ放題.{0,28}(?:あり|有り|ございます|ご用意|実施|付き|付|コース)/
    : /飲み放題.{0,28}(?:あり|有り|ございます|ご用意|実施|付き|付|コース)/;

  if (yes && negative.test(text)) return null;
  if (no && positive.test(text) && !negative.test(text)) return null;
  return yes;
}

function privateRoomStatus(value) {
  const text = clean(value);
  if (!text) return 'unknown';
  const yes = /^あり(?:\s*[:：]|$)/.test(text);
  const no = /^なし(?:\s*[:：]|$)/.test(text);
  if (!yes && !no) return 'unknown';

  const negative = /(?:個室なし|個室はございません|個室はありません|個室のご用意はございません|個室のご用意はありません|個室がございません|個室がありません)/;
  const textWithoutSemi = text.replaceAll('半個室', '');
  const explicitFull = /完全個室/.test(text) || /個室/.test(textWithoutSemi);
  const semi = /半個室/.test(text);

  if (yes) {
    if (negative.test(text)) return semi ? 'semi_private' : 'unknown';
    if (explicitFull) return 'available';
    if (semi) return 'semi_private';
    return 'available';
  }

  const positive = /(?:完全個室|個室.{0,18}(?:あり|有り|完備|ご用意|利用可|ございます))/;
  if (positive.test(text) && !negative.test(text)) return 'unknown';
  return 'not_available';
}

function privateRoomAvailable(status) {
  if (status === 'available') return true;
  if (status === 'not_available') return false;
  return null;
}

function cardAvailable(value) {
  const text = clean(value);
  if (text === '利用可') return true;
  if (text === '利用不可') return false;
  return null;
}

function smokingPolicy(value) {
  const text = clean(value);
  if (text === '全面禁煙') return 'non_smoking';
  if (text === '禁煙席なし') return 'smoking_allowed';
  if (text === '一部禁煙') return 'partial_non_smoking';
  return 'unknown';
}

function parkingStatus(value) {
  const text = clean(value);
  if (!text) return 'unknown';
  const yes = /^あり(?:\s*[:：]|$)/.test(text);
  const no = /^なし(?:\s*[:：]|$)/.test(text);
  if (!yes && !no) return 'unknown';

  const nearby = /(?:コインパーキング|近隣.{0,24}(?:駐車場|パーキング)|近く.{0,24}(?:駐車場|パーキング)|お近く.{0,24}(?:駐車場|パーキング)|有料駐車場)/;
  const onSite = /(?:専用.{0,10}(?:駐車|\d+台)|(?:当店|当ビル|ビル|ホテル|施設|館内|地下|共用|共有).{0,20}駐車場|駐車場(?:あり|有り|有|をご用意)|\d+台分|ワテラスタワーの駐車場|東京ドーム(?:シティ)?の駐車場)/;

  if (no) return nearby.test(text) ? 'nearby_paid' : 'none';
  if (onSite.test(text)) return 'on_site_or_building';
  if (nearby.test(text)) return 'nearby_paid';
  return 'available_unspecified';
}

function parkingAvailable(status) {
  if (status === 'on_site_or_building' || status === 'available_unspecified') return true;
  if (status === 'none') return false;
  return null;
}

function trusted(row) {
  const binding = row?.binding || {};
  return binding.autoEligible === true && ['high', 'reviewed'].includes(String(binding.confidence || ''));
}

function sourceUrl(row) {
  const facts = row?.facts || {};
  const urls = facts.urls || {};
  const candidates = [urls.pc, urls.mobile, row?.sourceUrl].map(clean).filter(Boolean);
  return candidates.find((url) => /^https:\/\//i.test(url)) || `https://www.hotpepper.jp/str${clean(row?.hotpepperId)}/`;
}

const doc = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const rows = [];
const counters = {
  trustedRows: 0,
  lunchKnown: 0,
  courseKnown: 0,
  freeDrinkKnown: 0,
  freeFoodKnown: 0,
  privateRoomStatusKnown: 0,
  privateRoomBooleanKnown: 0,
  cardKnown: 0,
  smokingKnown: 0,
  parkingStatusKnown: 0,
  parkingBooleanKnown: 0,
  stationKnown: 0,
  accessKnown: 0
};

for (const row of doc.rows || []) {
  if (!trusted(row)) continue;
  const facts = row.facts || {};
  const lunch = exactJaBool(facts.lunchAvailabilityText);
  const course = exactJaBool(facts.course);
  const freeDrink = prefixedAvailability(facts.freeDrink, 'drink');
  const freeFood = prefixedAvailability(facts.freeFood, 'food');
  const privateStatus = privateRoomStatus(facts.privateRoom);
  const privateAvailable = privateRoomAvailable(privateStatus);
  const card = cardAvailable(facts.card);
  const smoking = smokingPolicy(facts.nonSmoking);
  const parking = parkingStatus(facts.parking);
  const parkingBool = parkingAvailable(parking);
  const station = clean(facts.stationName) || null;
  const access = clean(facts.access) || null;

  counters.trustedRows += 1;
  if (lunch !== null) counters.lunchKnown += 1;
  if (course !== null) counters.courseKnown += 1;
  if (freeDrink !== null) counters.freeDrinkKnown += 1;
  if (freeFood !== null) counters.freeFoodKnown += 1;
  if (privateStatus !== 'unknown') counters.privateRoomStatusKnown += 1;
  if (privateAvailable !== null) counters.privateRoomBooleanKnown += 1;
  if (card !== null) counters.cardKnown += 1;
  if (smoking !== 'unknown') counters.smokingKnown += 1;
  if (parking !== 'unknown') counters.parkingStatusKnown += 1;
  if (parkingBool !== null) counters.parkingBooleanKnown += 1;
  if (station) counters.stationKnown += 1;
  if (access) counters.accessKnown += 1;

  rows.push({
    googlePlaceId: row.googlePlaceId,
    hotpepperId: row.hotpepperId,
    checkedAt: row.checkedAt || doc.checkedAt || null,
    sourceUrl: sourceUrl(row),
    binding: {
      confidence: row.binding?.confidence || null,
      autoEligible: true
    },
    raw: {
      stationName: facts.stationName ?? null,
      access: facts.access ?? null,
      lunchAvailabilityText: facts.lunchAvailabilityText ?? null,
      course: facts.course ?? null,
      freeDrink: facts.freeDrink ?? null,
      freeFood: facts.freeFood ?? null,
      privateRoom: facts.privateRoom ?? null,
      card: facts.card ?? null,
      nonSmoking: facts.nonSmoking ?? null,
      parking: facts.parking ?? null
    },
    normalized: {
      stationName: station,
      accessReference: access,
      lunchAvailable: lunch,
      courseAvailable: course,
      allYouCanDrinkAvailable: freeDrink,
      allYouCanEatAvailable: freeFood,
      privateRoomStatus: privateStatus,
      privateRoomAvailable: privateAvailable,
      cardPaymentAvailable: card,
      smokingPolicy: smoking,
      parkingStatus: parking,
      parkingAvailable: parkingBool
    }
  });
}

rows.sort((a, b) => String(a.googlePlaceId).localeCompare(String(b.googlePlaceId)));
const output = {
  schemaVersion: 1,
  ruleVersion: RULE_VERSION,
  checkedAt: doc.checkedAt || null,
  policy: {
    sourceBackedOnly: true,
    reviewedAutoEligibleBindingOnly: true,
    requiredBindingConfidence: ['high', 'reviewed'],
    paidGoogleDataApiCalls: 0,
    hotPepperWebServiceApiCalls: 0,
    networkRequests: 0,
    rawSourceTextRetained: true,
    ambiguousContradictoryValuesResolveToUnknown: true,
    accessTextNormalizedAggressively: false,
    parkingNearbyPaidIsNotOnSiteParking: true,
    privateSemiRoomIsNotFullPrivateRoom: true
  },
  summary: counters,
  rows
};
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(output.summary));
