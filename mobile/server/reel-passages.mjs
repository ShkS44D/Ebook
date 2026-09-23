export function overlapsPassage(reel, anchor) {
  if (reel.book_id !== anchor.bookId || Number(reel.content_version) !== Number(anchor.contentVersion)) return false;
  if (reel.reel_scope === 'book') return true;
  if (reel.chapter_id !== anchor.chapterId) return false;
  if (reel.reel_scope === 'chapter') return true;
  return Number(reel.start_offset) < Number(anchor.endOffset) && Number(reel.end_offset) > Number(anchor.startOffset);
}

export function passageTier(reel, anchor) {
  if (!overlapsPassage(reel, anchor)) return Infinity;
  if (reel.reel_scope === 'passage') return 0;
  if (reel.reel_scope === 'chapter') return 1;
  return 2;
}

export function orderPassageReels(reels, anchor) {
  return reels.filter(reel => reel.status === 'published' && reel.visibility === 'public' && overlapsPassage(reel, anchor))
    .sort((a, b) => passageTier(a, anchor) - passageTier(b, anchor) || Date.parse(b.published_at || b.created_at) - Date.parse(a.published_at || a.created_at));
}
