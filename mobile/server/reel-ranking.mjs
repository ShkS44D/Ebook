// Explainable cold-start ranker. Weights require tuning against real relevance
// judgments and retention data; they are not a pretrained recommendation model.
const stop = new Set(
  "a an the and or but is are was were be been to of on in for from with it this that you your by as at can will have has not some one into its".split(
    " ",
  ),
);
export function tokens(text = "") {
  return [
    ...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []),
  ].filter((t) => !stop.has(t));
}
function cosine(a, b, idf) {
  const right = new Set(b);
  let numerator = 0,
    aa = 0,
    bb = 0;
  for (const t of a) {
    const w = idf(t);
    aa += w * w;
    if (right.has(t)) numerator += w * w;
  }
  for (const t of b) {
    const w = idf(t);
    bb += w * w;
  }
  return numerator / (Math.sqrt(aa * bb) || 1);
}
export function rankReels(
  candidates,
  {
    bookId,
    page,
    text = "",
    preferences = [],
    now = Date.now(),
    limit = 12,
    mode = "for-you",
  },
) {
  const docs = candidates.map((r) =>
    tokens(`${r.title} ${r.caption} ${(r.tags || []).join(" ")}`),
  );
  const frequency = new Map();
  for (const doc of docs)
    for (const t of doc) frequency.set(t, (frequency.get(t) || 0) + 1);
  const idf = (t) =>
    1 + Math.log(1 + (docs.length + 1) / (1 + (frequency.get(t) || 0)));
  const interests = new Map();
  for (const p of preferences)
    for (const tag of p.tags || [])
      interests.set(
        tag,
        (interests.get(tag) || 0) + Math.max(-2, Math.min(4, Number(p.weight))),
      );
  const query = tokens(text);
  const scored = candidates
    .map((r, i) => {
      if (r.hidden || r.blocked || r.status !== "published") return null;
      const exact = r.book_id === bookId && r.page === page;
      // Avoid accidental spoilers: other pages of this book are never candidates.
      if (r.book_id === bookId && !exact) return null;
      const relevance = cosine(query, docs[i], idf);
      if (!exact && relevance < 0.12) return null;
      if (mode === "page" && !exact) return null;
      const affinity = Math.max(
        -1,
        Math.min(
          1,
          (r.tags || []).reduce((s, t) => s + (interests.get(t) || 0), 0) / 12,
        ),
      );
      const viewers = Number(r.viewers || 0),
        positive = Number(r.positive || 0);
      const quality = (Math.min(positive, viewers) + 2) / (viewers + 5); // Bounded Bayesian quality; raw like volume cannot overwhelm relevance.
      const freshness = Math.exp(
        -Math.max(0, now - Date.parse(r.created_at)) / 86400000 / 21,
      );
      const watched = Number(r.max_completion || 0),
        seen = Number(r.impressions || 0);
      const score =
        (exact ? 5 : 0) +
        3 * relevance +
        1.2 * affinity +
        0.8 * quality +
        0.5 * freshness +
        (seen === 0 ? 0.4 : 0) -
        Math.min(1.5, seen * 0.15) -
        watched * 0.7;
      return {
        ...r,
        score,
        reason: exact
          ? "Shared for this page"
          : affinity > 0.2
            ? "Related to this page and your interests"
            : "Related to the ideas on this page",
        _tokens: docs[i],
      };
    })
    .filter(Boolean);
  const result = [];
  while (scored.length && result.length < limit) {
    scored.sort((a, b) => {
      const penalty = (r) =>
        result.reduce(
          (p, x) =>
            Math.max(
              p,
              (x.creator_id && x.creator_id === r.creator_id ? 0.8 : 0) +
                0.5 * cosine(x._tokens, r._tokens, idf),
            ),
          0,
        );
      return (
        b.score - penalty(b) - (a.score - penalty(a)) ||
        a.id.localeCompare(b.id)
      );
    });
    result.push(scored.shift());
  }
  return result.map(({ _tokens, score, ...r }) => r);
}
