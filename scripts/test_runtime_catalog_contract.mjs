#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertRuntimeCatalogContract } from './runtime_catalog_contract.mjs';

const row=(id)=>({googlePlaceId:id,name:`R-${id}`});

// Public named count is intentionally variable. Both 3+2 and 4+1 are valid
// representations of the same frozen five-ID catalog.
for(const [published,unpublished] of [[3,2],[4,1]]){
  const runtime={
    GOOGLE_INVENTORY_RESTAURANTS:Array.from({length:published},(_,i)=>row(`id-${published}-${i}`)),
    GOOGLE_INVENTORY_STATS:{catalogTotal:5,inventoryTotal:published,unpublishedPlaceIdOnly:unpublished}
  };
  const checked=assertRuntimeCatalogContract(runtime,{expectedCatalogTotal:5});
  assert.equal(checked.rows.length,published);
  assert.equal(checked.unpublished,unpublished);
}

assert.throws(()=>assertRuntimeCatalogContract({
  GOOGLE_INVENTORY_RESTAURANTS:[row('a'),row('b'),row('c')],
  GOOGLE_INVENTORY_STATS:{catalogTotal:5,inventoryTotal:2,unpublishedPlaceIdOnly:2}
},{expectedCatalogTotal:5}),/Published runtime\/stat count mismatch/);

assert.throws(()=>assertRuntimeCatalogContract({
  GOOGLE_INVENTORY_RESTAURANTS:[row('a'),row('b'),row('c')],
  GOOGLE_INVENTORY_STATS:{catalogTotal:5,inventoryTotal:3,unpublishedPlaceIdOnly:1}
},{expectedCatalogTotal:5}),/Public\/unpublished catalog reconciliation mismatch/);

assert.throws(()=>assertRuntimeCatalogContract({
  GOOGLE_INVENTORY_RESTAURANTS:[row('a'),row('a'),row('c')],
  GOOGLE_INVENTORY_STATS:{catalogTotal:5,inventoryTotal:3,unpublishedPlaceIdOnly:2}
},{expectedCatalogTotal:5}),/duplicate Place IDs/);

console.log(JSON.stringify({status:'pass',variablePublicRuntimeCountsAccepted:true,fixedPublishedCountRequired:false}));
