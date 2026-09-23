import test from 'node:test';
import assert from 'node:assert/strict';
import { overlapsPassage, orderPassageReels, passageTier } from '../server/reel-passages.mjs';

const anchor = { bookId: 'book', contentVersion: 3, chapterId: 'chapter-2', startOffset: 100, endOffset: 180 };
const reel = (id, values = {}) => ({ id, book_id: 'book', content_version: 3, chapter_id: 'chapter-2', start_offset: 120, end_offset: 160, reel_scope: 'passage', status: 'published', visibility: 'public', created_at: '2026-09-20T00:00:00Z', ...values });

test('passage ranges overlap independently of rendered page number', () => {
  assert.equal(overlapsPassage(reel('inside'), anchor), true);
  assert.equal(overlapsPassage(reel('touches-end', { start_offset: 180, end_offset: 220 }), anchor), false);
  assert.equal(overlapsPassage(reel('old-version', { content_version: 2 }), anchor), false);
  assert.equal(overlapsPassage(reel('other-chapter', { chapter_id: 'chapter-3' }), anchor), false);
});

test('fallback scopes cover chapter and book without leaking other chapters', () => {
  assert.equal(passageTier(reel('exact'), anchor), 0);
  assert.equal(passageTier(reel('chapter', { reel_scope: 'chapter', start_offset: 0, end_offset: 0 }), anchor), 1);
  assert.equal(passageTier(reel('book', { reel_scope: 'book', chapter_id: null }), anchor), 2);
  assert.equal(passageTier(reel('wrong', { reel_scope: 'chapter', chapter_id: 'chapter-4' }), anchor), Infinity);
});

test('only published public reels are returned and exact passage wins', () => {
  const ordered = orderPassageReels([
    reel('book', { reel_scope: 'book', chapter_id: null }),
    reel('private', { visibility: 'private' }),
    reel('draft', { status: 'ready' }),
    reel('chapter', { reel_scope: 'chapter' }),
    reel('exact'),
  ], anchor);
  assert.deepEqual(ordered.map(item => item.id), ['exact', 'chapter', 'book']);
});
