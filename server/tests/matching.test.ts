import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, scoreReports, tokenSimilarity, type MatchableReport } from "../src/services/matching.js";

const lost: MatchableReport = {
  type: "lost",
  title: "Black leather wallet",
  category: "Wallet",
  publicDescription: "Slim black wallet with a silver mark",
  attributes: { colour: "black", brand: "generic" },
  location: { label: "Kenneth Dike Library" },
  happenedAt: "2026-08-24T09:00:00.000Z",
  imageEmbedding: [0.7, 0.2, 0.1],
};

const found: MatchableReport = {
  type: "found",
  title: "Black wallet near library",
  category: "Wallet",
  publicDescription: "Black leather bi-fold wallet with small silver mark",
  attributes: { colour: "black", brand: "generic" },
  location: { label: "Kenneth Dike Library entrance" },
  happenedAt: "2026-08-24T11:00:00.000Z",
  imageEmbedding: [0.69, 0.21, 0.1],
};

test("token similarity rewards shared descriptive terms", () => {
  assert.ok(tokenSimilarity(lost.title, found.title) >= 50);
});

test("cosine similarity is neutral without embeddings", () => {
  assert.equal(cosineSimilarity(undefined, undefined), 50);
});

test("the documented weighted model ranks a strong match highly", () => {
  const result = scoreReports(lost, found);
  assert.ok(result.score >= 75);
  assert.equal(result.factors.attributes, 100);
  assert.ok(result.factors.date >= 90);
});

test("a dissimilar category receives a weaker score", () => {
  const unrelated: MatchableReport = {
    ...found,
    title: "Blue mathematics textbook",
    category: "Books",
    publicDescription: "Large blue calculus textbook",
    attributes: { colour: "blue" },
    location: { label: "Faculty of Technology" },
    happenedAt: "2026-08-10T11:00:00.000Z",
    imageEmbedding: [-0.2, 0.8, 0.1],
  };
  assert.ok(scoreReports(lost, unrelated).score < scoreReports(lost, found).score);
});
