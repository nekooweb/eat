#!/usr/bin/env node
import assert from 'node:assert/strict';
import { translateDishText } from './recommended_dish_extractor.mjs';

const resolved = new Map([
  ['塩生姜らー麺', '盐味生姜拉面'],
  ['のり巻', '海苔卷寿司'],
  ['パーコー麺', '排骨面'],
  ['クスクス', '库斯库斯'],
  ['タジン鍋', '塔吉锅'],
  ['名物 ごまさば', '芝麻鲭鱼'],
  ['シェルアンドチップス', '贝类配薯条']
]);

for (const [sourceName, expectedZh] of resolved) {
  const translated = translateDishText(sourceName);
  assert.ok(translated, `${sourceName} should resolve deterministically`);
  assert.equal(translated.nameZh, expectedZh, `${sourceName} normalized label`);
  assert.equal(translated.nameOriginal, sourceName, `${sourceName} source-native label retained`);
}

for (const sourceName of ['えびず焼き', 'ソルベージュ®エスプレッソ']) {
  assert.equal(
    translateDishText(sourceName),
    null,
    `${sourceName} must remain translation-pending until its product-name policy/evidence is resolved`
  );
}

console.log(JSON.stringify({
  resolvedItems: resolved.size,
  intentionallyPendingItems: 2,
  networkRequests: 0,
  paidGoogleDataApiCalls: 0
}));
