import test from "node:test";
import assert from "node:assert/strict";
import { rankReels } from "../server/reel-ranking.mjs";
const now = Date.parse("2026-09-10");
const reel = (id, props = {}) => ({
  id,
  book_id: "book",
  page: 0,
  title: "reading reflection",
  caption: "notes and questions",
  tags: ["reading"],
  status: "published",
  created_at: new Date(now).toISOString(),
  ...props,
});
const rank = (items, options = {}) =>
  rankReels(items, {
    bookId: "book",
    page: 0,
    text: "reading reflection notes questions",
    now,
    ...options,
  });
test("page relevance beats viral engagement, and later pages cannot leak", () => {
  const results = rank([
    reel("viral", { book_id: "other", viewers: 0, positive: 10000000 }),
    reel("exact"),
    reel("spoiler", { page: 1 }),
    reel("unrelated", {
      book_id: "other",
      title: "basketball",
      caption: "stadium sports",
      tags: ["sport"],
    }),
  ]);
  assert.deepEqual(
    results.map((r) => r.id),
    ["exact", "viral"],
  );
});
test("positive interests reorder relevant candidates; hidden and blocked stay excluded", () => {
  const items = [
    reel("a", { tags: ["habit"] }),
    reel("b", { tags: ["visual"] }),
    reel("c", { hidden: true }),
    reel("d", { blocked: true }),
    reel("e", { status: "hidden" }),
  ];
  assert.equal(
    rank(items, { preferences: [{ tags: ["visual"], weight: 4 }] })[0].id,
    "b",
  );
  assert.equal(
    rank(items, { preferences: [{ tags: ["habit"], weight: 4 }] })[0].id,
    "a",
  );
  assert.equal(rank(items).length, 2);
});
test("creator variety, unseen clips, strict page mode, and deterministic output", () => {
  const items = [
    reel("a", { creator_id: "same" }),
    reel("b", { creator_id: "same" }),
    reel("c", { creator_id: "different" }),
    reel("d", { book_id: "other" }),
  ];
  assert.deepEqual(
    rank(items)
      .slice(0, 2)
      .map((r) => r.id),
    ["a", "c"],
  );
  assert.equal(rank(items, { mode: "page" }).length, 3);
  assert.equal(
    rank([reel("a", { impressions: 10, max_completion: 1 }), reel("b")])[0].id,
    "b",
  );
  assert.deepEqual(rank(items), rank(items));
  assert.equal("score" in rank(items)[0], false);
});
