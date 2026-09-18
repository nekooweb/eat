#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const TERMINAL = new Set(['accepted_evidence', 'candidate', 'no_evidence', 'blocked']);

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function isoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return false;
  const date = new Date(text + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function unique(values) {
  return [...new Set(values || [])];
}

function filterEvidence(evidence, acceptedIds) {
  const accepted = new Set(acceptedIds);
  return (evidence || []).map((item) => ({
    ...item,
    proposedConceptIds: unique((item.proposedConceptIds || []).filter((id) => accepted.has(id)))
  })).filter((item) => item.proposedConceptIds.length > 0);
}

export function buildClassificationEntityReviewed(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const reviewDir = path.join(root, options.reviewDir || 'data/classification_entity_bound_reviews');
  const reviewFiles = fs.existsSync(reviewDir)
    ? fs.readdirSync(reviewDir).filter((name) => /^S\d+\.json$/u.test(name)).sort()
    : [];

  const outputRecords = [];
  const seen = new Set();
  const counts = { accepted_evidence: 0, candidate: 0, no_evidence: 0, blocked: 0 };

  for (const filename of reviewFiles) {
    const reviewRelative = path.posix.join('data/classification_entity_bound_reviews', filename);
    const review = readJson(root, reviewRelative);
    if (review.schemaVersion !== 1 || review.centralReview !== true
      || review.marker !== 'CLASSIFICATION-ENTITY-BOUND-REVIEW') {
      throw new Error('Invalid classification central review contract: ' + filename);
    }
    if (!isoDate(review.reviewedAt)) throw new Error('Invalid reviewedAt: ' + filename);
    if (review.policy?.newSourceDiscoveryPerformed !== false
      || review.policy?.paidGoogleDataApiCalls !== 0) {
      throw new Error('Central review policy violation: ' + filename);
    }

    const proposal = readJson(root, review.proposalFile);
    if (proposal.schemaVersion !== 1 || proposal.proposalOnly !== true
      || proposal.marker !== 'CLASSIFICATION-ENTITY-BOUND') {
      throw new Error('Invalid proposal contract for review: ' + filename);
    }
    if (proposal.shard !== review.shard) throw new Error('Shard mismatch: ' + filename);

    const proposalById = new Map(proposal.records.map((row) => [row.googlePlaceId, row]));
    if (review.completeShardReview) {
      if (review.records.length !== proposal.records.length) {
        throw new Error('Complete central review must cover every proposal row: ' + filename);
      }
    }

    for (const decision of review.records) {
      const proposalRow = proposalById.get(decision.googlePlaceId);
      if (!proposalRow) throw new Error('Central review row missing from proposal: ' + decision.googlePlaceId);
      if (proposalRow.sourceFingerprint !== decision.sourceFingerprint) {
        throw new Error('Central review fingerprint mismatch: ' + decision.googlePlaceId);
      }
      if (proposalRow.status !== decision.proposalStatus) {
        throw new Error('Central review proposal status mismatch: ' + decision.googlePlaceId);
      }
      if (!TERMINAL.has(decision.decision)) {
        throw new Error('Invalid central review decision: ' + decision.googlePlaceId);
      }
      if (seen.has(decision.googlePlaceId)) throw new Error('Duplicate central-reviewed Place ID: ' + decision.googlePlaceId);
      seen.add(decision.googlePlaceId);

      const proposalConcepts = new Set(proposalRow.proposedConceptIds || []);
      const acceptedConceptIds = unique(decision.acceptedConceptIds || []);
      for (const id of acceptedConceptIds) {
        if (!proposalConcepts.has(id)) throw new Error('Central review accepted unproposed concept: ' + decision.googlePlaceId + ' -> ' + id);
      }

      if (decision.decision === 'accepted_evidence') {
        if (proposalRow.status !== 'accepted_evidence') {
          throw new Error('Central review cannot upgrade non-accepted proposal: ' + decision.googlePlaceId);
        }
        if (proposalRow.identity?.state !== 'verified') {
          throw new Error('Accepted central review requires verified identity: ' + decision.googlePlaceId);
        }
        if (!acceptedConceptIds.length) {
          throw new Error('Accepted central review requires concept IDs: ' + decision.googlePlaceId);
        }
      } else if (acceptedConceptIds.length) {
        throw new Error('Non-accepted central review cannot carry accepted concept IDs: ' + decision.googlePlaceId);
      }

      const output = structuredClone(proposalRow);
      output.status = decision.decision;
      output.reviewedAt = review.reviewedAt;
      output.centralReview = {
        reviewFile: reviewRelative,
        proposalFile: review.proposalFile,
        proposalStatus: proposalRow.status,
        decisionReason: decision.reason
      };

      if (decision.decision === 'accepted_evidence') {
        output.proposedConceptIds = acceptedConceptIds;
        output.categoryEvidence = filterEvidence(proposalRow.categoryEvidence, acceptedConceptIds);
        if (!output.categoryEvidence.length) {
          throw new Error('Accepted central review lost all category evidence: ' + decision.googlePlaceId);
        }
        output.blocker = null;
      } else if (decision.decision === 'candidate') {
        const retained = unique(decision.retainedCandidateConceptIds || proposalRow.proposedConceptIds || []);
        for (const id of retained) {
          if (!proposalConcepts.has(id)) throw new Error('Candidate retained unproposed concept: ' + decision.googlePlaceId + ' -> ' + id);
        }
        output.proposedConceptIds = retained;
      } else {
        output.proposedConceptIds = [];
        output.categoryEvidence = [];
      }

      counts[decision.decision] += 1;
      outputRecords.push(output);
    }

    if (review.summary) {
      const localCounts = { accepted_evidence: 0, candidate: 0, no_evidence: 0, blocked: 0 };
      for (const row of review.records) localCounts[row.decision] += 1;
      if (review.summary.reviewedRows !== review.records.length
        || review.summary.acceptedRows !== localCounts.accepted_evidence
        || review.summary.candidateRows !== localCounts.candidate
        || review.summary.noEvidenceRows !== localCounts.no_evidence
        || review.summary.blockedRows !== localCounts.blocked) {
        throw new Error('Central review summary mismatch: ' + filename);
      }
    }
  }

  outputRecords.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId, 'en'));
  return {
    schemaVersion: 1,
    marker: 'CLASSIFICATION-ENTITY-REVIEWED',
    centralReviewCompleted: true,
    policy: {
      frozenIdentityKey: 'googlePlaceId',
      rawCuisineTagsMutationAllowed: false,
      acceptedStatus: 'accepted_evidence',
      candidateCountsAsAccepted: false,
      exactBranchEvidenceRequired: true,
      paidGoogleDataApiCalls: 0
    },
    summary: {
      reviewFiles: reviewFiles.length,
      reviewedRows: outputRecords.length,
      acceptedRows: counts.accepted_evidence,
      candidateRows: counts.candidate,
      noEvidenceRows: counts.no_evidence,
      blockedRows: counts.blocked
    },
    records: outputRecords
  };
}

export function serializeClassificationEntityReviewed(document) {
  return JSON.stringify(document, null, 2) + '\n';
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : 'data/classification_entity_reviewed.json';
  const document = buildClassificationEntityReviewed();
  const rendered = serializeClassificationEntityReviewed(document);
  const outputPath = path.resolve(DEFAULT_ROOT, output);
  if (check) {
    if (!fs.existsSync(outputPath)) throw new Error('classification reviewed artifact missing: ' + output);
    if (fs.readFileSync(outputPath, 'utf8') !== rendered) {
      throw new Error('classification reviewed artifact is stale: ' + output);
    }
  } else {
    fs.writeFileSync(outputPath, rendered, 'utf8');
  }
  console.log(JSON.stringify(document.summary));
}
