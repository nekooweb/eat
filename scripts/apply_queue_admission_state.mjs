#!/usr/bin/env node
import fs from 'node:fs';

const queuePath = 'data/area1_enrichment_queue.json';
const catalogPath = 'data/area1_catalog.json';
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const catalogById = new Map((catalog.rows || []).map((row) => [row.googlePlaceId, row]));

for (const item of queue.items || []) {
  const catalogRow = catalogById.get(item.googlePlaceId);
  const status = catalogRow?.admission?.status || null;
  if (status === 'reviewed_ready' && !item.currentProduction) {
    item.queue = 'inventory_admission_ready';
    item.priorityScore = Math.max(item.priorityScore || 0, 900);
    item.reviewedAdmission = catalogRow.admission;
    item.reviewedCatalogFacts = catalogRow.reviewedCatalogFacts || null;
    item.nextActions = ['productionSchemaAdmission'];
  } else if (status === 'admitted_production' && item.currentProduction) {
    item.reviewedAdmission = catalogRow.admission;
    item.reviewedCatalogFacts = catalogRow.reviewedCatalogFacts || null;
    item.nextActions = (item.nextActions || []).filter((action) =>
      action !== 'identityAdmissionReview' && action !== 'productionSchemaAdmission');
  } else if (status === 'rejected_pair') {
    item.queue = 'inventory_rejected_pair_hold';
    item.priorityScore = -100;
    item.reviewedAdmission = catalogRow.admission;
    item.nextActions = ['sourceRebindingRequired'];
  }
}

queue.items.sort((a, b) =>
  (b.priorityScore || 0) - (a.priorityScore || 0)
  || a.queue.localeCompare(b.queue)
  || (a.name || a.candidateName || '').localeCompare(b.name || b.candidateName || '')
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const queueCounts = {};
for (const item of queue.items || []) queueCounts[item.queue] = (queueCounts[item.queue] || 0) + 1;
queue.schemaVersion = Math.max(Number(queue.schemaVersion || 0), 6);
queue.summary = {
  ...(queue.summary || {}),
  schemaVersion: 6,
  queueCounts,
  inventoryAdmissionReady: (queue.items || []).filter((item) => item.queue === 'inventory_admission_ready').length,
  admittedProduction: (queue.items || []).filter((item) => item.currentProduction && item.reviewedAdmission?.status === 'admitted_production').length,
  inventoryRejectedPairHold: (queue.items || []).filter((item) => item.queue === 'inventory_rejected_pair_hold').length
};

fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
console.log(JSON.stringify({
  inventoryAdmissionReady: queue.summary.inventoryAdmissionReady,
  admittedProduction: queue.summary.admittedProduction,
  inventoryRejectedPairHold: queue.summary.inventoryRejectedPairHold,
  queueCounts
}));
