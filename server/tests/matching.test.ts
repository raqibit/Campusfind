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
  imageEmbeddingModel: "external-image-embedding",
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
  imageEmbeddingModel: "external-image-embedding",
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

test("semantic text vectors compare descriptions even when wording differs", () => {
  const left = { ...lost, title: "Book bag", publicDescription: "dark school backpack", textEmbedding: [1, 0, 0], textEmbeddingModel: "text-embedding-3-small" };
  const right = { ...found, title: "Rucksack", publicDescription: "navy bag", textEmbedding: [1, 0, 0], textEmbeddingModel: "text-embedding-3-small" };
  assert.equal(scoreReports(left, right).factors.text, 100);
});

test("text vectors from different models fall back to token comparison", () => {
  const left = { ...lost, textEmbedding: [1, 0, 0], textEmbeddingModel: "model-a" };
  const right = { ...found, textEmbedding: [1, 0, 0], textEmbeddingModel: "model-b" };
  assert.equal(scoreReports(left, right).factors.text, tokenSimilarity(`${lost.title} ${lost.publicDescription}`, `${found.title} ${found.publicDescription}`));
});

test("image vectors from different providers use the neutral image score", () => {
  const result = scoreReports(lost, { ...found, imageEmbeddingModel: "different-provider" });
  assert.equal(result.factors.image, 50);
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
