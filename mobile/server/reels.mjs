import express from "express";
import multer from "multer";
import {
  randomUUID,
  randomBytes,
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, open, unlink, readFile } from "node:fs/promises";
import { del } from '@vercel/blob';
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffprobe from "ffprobe-static";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { query, transaction } from "./db.mjs";
import { rankReels } from "./reel-ranking.mjs";
import { getBook, isBookAdmin } from './books/service.mjs';
const runFile = promisify(execFile);
const mediaRoot = path.resolve(process.env.MEDIA_DIR || (process.env.VERCEL ? '/tmp/ibook-media' : 'media'));
await mkdir(mediaRoot, { recursive: true });
const uuid = z.string().uuid();
const reviewSecret = process.env.REEL_REVIEW_SECRET || randomBytes(32);
const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};
const cloudStorage = Object.values(cloudinary).every(Boolean);
const cloudinarySign = params => createHash('sha1')
  .update(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&') + cloudinary.apiSecret)
  .digest('hex');
const isCloudinaryUrl = value => /^https:\/\/res\.cloudinary\.com\//.test(value);
const cloudinaryPublicId = value => {
  try {
    const match = new URL(value).pathname.match(/\/video\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
};
async function cloudinaryRequest(endpoint, options = {}) {
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}${endpoint}`, {
    ...options,
    headers: { Authorization: `Basic ${Buffer.from(`${cloudinary.apiKey}:${cloudinary.apiSecret}`).toString('base64')}`, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    fail(response.status === 404 ? 404 : 502, detail.error?.message || 'Cloudinary could not verify the video.');
  }
  return response.json();
}
async function removeCloudinary(publicId) {
  const timestamp = Math.floor(Date.now() / 1000), signature = cloudinarySign({ public_id: publicId, timestamp });
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: cloudinary.apiKey, signature });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/video/destroy`, { method: 'POST', body, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Cloudinary video deletion failed.');
}
async function removeMedia(filename) {
  if (isCloudinaryUrl(filename) && cloudStorage) {
    const publicId = cloudinaryPublicId(filename);
    if (publicId) await removeCloudinary(publicId);
  } else if (filename.startsWith('https://')) await del(filename);
  else await unlink(path.join(mediaRoot, filename)).catch(() => {});
}
function sendStoredMedia(req, res, media) {
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.type(media.mime);
  if (!media.data) {
    if (media.filename.startsWith('https://')) return res.redirect(307, media.filename);
    return res.sendFile(media.filename, { root: mediaRoot, dotfiles: "deny" }, error => {
      if (error && !res.headersSent) res.status(404).json({ error: "Video file unavailable." });
    });
  }
  const bytes = Buffer.from(media.data);
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (!match) {
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Length': String(bytes.length) });
    return res.send(bytes);
  }
  const start = Number(match[1]);
  const end = Math.min(bytes.length - 1, match[2] ? Number(match[2]) : bytes.length - 1);
  if (start > end || start >= bytes.length) return res.status(416).set('Content-Range', `bytes */${bytes.length}`).end();
  res.status(206).set({ 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) });
  return res.send(bytes.subarray(start, end + 1));
}
const signReview = (id, expires) =>
  createHmac("sha256", reviewSecret)
    .update(id + ":" + expires)
    .digest("hex");
const isModerator = (id) =>
  (process.env.REEL_MODERATOR_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .includes(id);
const isReelAdmin = (id) => isBookAdmin(id) || isModerator(id);
const featureFlags = {
  viewing: process.env.REELS_VIEWING_ENABLED !== 'false',
  editorialUploads: process.env.EDITORIAL_REEL_UPLOADS_ENABLED !== 'false',
  communityUploads: process.env.COMMUNITY_REEL_UPLOADS_ENABLED === 'true',
  comments: process.env.REEL_COMMENTS_ENABLED === 'true',
};
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const safeExternal = z
  .string()
  .url()
  .max(1500)
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "instagram.com",
        "www.instagram.com",
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "vimeo.com",
        "www.vimeo.com",
      ].includes(u.hostname) &&
      u.pathname !== "/"
    );
  }, "Use an HTTPS Instagram, YouTube, or Vimeo post link.");
async function pageContext(bookId, page) {
  const b = await getBook(bookId);
  if (!b || !b.available || !b.chapters[page])
    fail(404, "Reading page not found.");
  return { book: b, chapter: b.chapters[page] };
}
const projection = `r.*,coalesce(u.name,r.attribution) AS creator_name,b.title AS book_title,
 CASE WHEN r.media_id IS NOT NULL THEN '/api/reel-media/'||r.media_id ELSE r.video_url END AS playback_url`;
const joins =
  "FROM ibook.reels r LEFT JOIN ibook.users u ON u.id=r.creator_id JOIN ibook.books b ON b.id=r.book_id";
async function visibleReel(id, userId = null, q = query) {
  uuid.parse(id);
  const [r] = await q(
    `SELECT ${projection} ${joins} WHERE r.id=$1 AND r.status='published'
 AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$2 AND blocked_id=r.creator_id) OR (user_id=r.creator_id AND blocked_id=$2))`,
    [id, userId],
  );
  if (!r) fail(404, "Reel is unavailable.");
  return r;
}
export function registerPublicReels(app) {
  app.get("/api/reel-review-media/:id", async (req, res) => {
    const id = uuid.parse(req.params.id),
      expires = z.coerce.number().int().parse(req.query.expires),
      signature = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(req.query.signature);
    if (
      expires < Date.now() ||
      expires > Date.now() + 300000 ||
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(signReview(id, expires), "hex"),
      )
    )
      fail(403, "Review link expired. Reopen the report.");
    const [m] = await query("SELECT * FROM ibook.reel_media WHERE id=$1", [id]);
    if (!m) fail(404, "Video unavailable.");
    sendStoredMedia(req, res, m);
  });
  app.get("/api/reel-public/:id", async (req, res) =>
    res.json(await visibleReel(req.params.id)),
  );
  app.get("/api/reel-media/:id", async (req, res) => {
    const [m] = await query(
      "SELECT m.* FROM ibook.reel_media m JOIN ibook.reels r ON r.media_id=m.id WHERE m.id=$1 AND r.status='published'",
      [uuid.parse(req.params.id)],
    );
    if (!m) fail(404, "Video unavailable.");
    sendStoredMedia(req, res, m);
  });
}
export const reelsRouter = express.Router();
reelsRouter.get("/page-reels/:bookId/:page", async (req, res) => {
  const page = z.coerce.number().int().min(0).parse(req.params.page),
    bookId = req.params.bookId;
  const { book, chapter } = await pageContext(bookId, page);
  const startOffset = z.coerce.number().int().min(0).parse(req.query.startOffset ?? 0);
  const endOffset = z.coerce.number().int().min(startOffset).parse(req.query.endOffset ?? Math.max(startOffset, chapter.length ?? chapter.text.length));
  if (!featureFlags.viewing && !isReelAdmin(req.user.id)) return res.json({ items: [], hasMore: false, pageTitle: chapter.title, available: false });
  const mode = z
    .enum(["for-you", "page", "saved"])
    .parse(req.query.mode || "for-you");
  const excluded = z
    .string()
    .max(8000)
    .parse(req.query.exclude || "")
    .split(",")
    .filter(Boolean)
    .slice(0, 100);
  for (const id of excluded) uuid.parse(id);
  const [candidates, preferences] = await Promise.all([
    query(
      `SELECT ${projection},coalesce(rr.liked,false) liked,coalesce(rr.saved,false) saved,coalesce(rr.hidden,false) hidden,
   coalesce(rr.max_completion,0) max_completion,coalesce(rr.impressions,0) impressions,
   (SELECT count(*)::int FROM ibook.reel_reactions s WHERE s.reel_id=r.id AND s.impressions>0 AND s.user_id IS DISTINCT FROM r.creator_id) viewers,
   (SELECT count(*)::int FROM ibook.reel_reactions s WHERE s.reel_id=r.id AND (s.liked OR s.saved OR s.max_completion>=0.8) AND s.user_id IS DISTINCT FROM r.creator_id) positive,
   (SELECT count(*)::int FROM ibook.reel_reactions s WHERE s.reel_id=r.id AND s.liked) likes,
   (SELECT count(*)::int FROM ibook.reel_comments c WHERE c.reel_id=r.id) comments
   ${joins} LEFT JOIN ibook.reel_reactions rr ON rr.reel_id=r.id AND rr.user_id=$3
   WHERE r.status='published' AND r.visibility='public' AND NOT coalesce(rr.hidden,false)
   AND r.book_id=$1 AND r.content_version=$6
   AND (r.reel_scope='book' OR (r.chapter_id=$7 AND (r.reel_scope='chapter' OR (r.start_offset<$9 AND r.end_offset>$8))))
   AND NOT(r.id=ANY($4::uuid[])) AND ($5<>'saved' OR rr.saved)
   AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$3 AND blocked_id=r.creator_id) OR (user_id=r.creator_id AND blocked_id=$3))
   ORDER BY (r.book_id=$1 AND r.page=$2) DESC,r.created_at DESC LIMIT 250`,
      [bookId, page, req.user.id, excluded, mode, book.content_version || 1, chapter.id || String(page), startOffset, endOffset],
    ),
    query(
      "SELECT r.tags,(s.liked::int*2+s.saved::int*3+s.shared::int*2+s.max_completion-s.hidden::int*4) AS weight FROM ibook.reel_reactions s JOIN ibook.reels r ON r.id=s.reel_id WHERE s.user_id=$1 ORDER BY s.updated_at DESC LIMIT 200",
      [req.user.id],
    ),
  ]);
  const ranked = rankReels(candidates, {
    bookId,
    page,
    text: chapter.title + " " + chapter.text,
    preferences,
    mode,
    limit: 13,
  });
  res.json({
    items: ranked.slice(0, 12),
    hasMore: ranked.length > 12,
    pageTitle: chapter.title,
    rankingVersion: "page-context-v1",
    available: ranked.length > 0,
  });
});
reelsRouter.get('/reel-availability/:bookId/:page', async (req, res) => {
  const page = z.coerce.number().int().min(0).parse(req.params.page);
  const { book, chapter } = await pageContext(req.params.bookId, page);
  const start = z.coerce.number().int().min(0).parse(req.query.startOffset ?? 0);
  const end = z.coerce.number().int().min(start).parse(req.query.endOffset ?? Math.max(start, chapter.length ?? chapter.text.length));
  const [{ count }] = await query(`SELECT count(*)::int count FROM ibook.reels WHERE book_id=$1 AND content_version=$2 AND status='published' AND visibility='public' AND (reel_scope='book' OR (chapter_id=$3 AND (reel_scope='chapter' OR (start_offset<$5 AND end_offset>$4))))`, [req.params.bookId, book.content_version || 1, chapter.id || String(page), start, end]);
  res.json({ available: featureFlags.viewing && count > 0, count, admin: isReelAdmin(req.user.id), flags: isReelAdmin(req.user.id) ? featureFlags : undefined });
});
reelsRouter.get("/reels/:id", async (req, res) => {
  const r = await visibleReel(req.params.id, req.user.id);
  const [reaction] = await query(
    "SELECT liked,saved FROM ibook.reel_reactions WHERE user_id=$1 AND reel_id=$2",
    [req.user.id, r.id],
  );
  const [{ likes }] = await query(
    "SELECT count(*)::int AS likes FROM ibook.reel_reactions WHERE reel_id=$1 AND liked",
    [r.id],
  );
  res.json({ ...r, liked: false, saved: false, ...reaction, likes });
});
const publishLimit = rateLimit({
  windowMs: 3600000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  message: {
    error: "Upload and publishing limit reached. Try again in an hour.",
  },
});
const upload = multer({
  storage: multer.diskStorage({
    destination: mediaRoot,
    filename: (req, file, cb) => cb(null, randomUUID() + ".video"),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (req, file, cb) =>
    cb(
      null,
      ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype),
    ),
});
reelsRouter.get('/reel-upload-config', (_req, res) => res.json({ direct: cloudStorage, provider: cloudStorage ? 'cloudinary' : 'local' }));
reelsRouter.post('/reel-upload-token', publishLimit, async (req, res) => {
  if (!isReelAdmin(req.user.id) || !featureFlags.editorialUploads) fail(403, 'Reel administrator access required.');
  if (!cloudStorage) fail(503, 'Cloud uploads are not configured.');
  const expired = await query('DELETE FROM ibook.reel_upload_intents WHERE owner_id=$1 AND expires_at<now() RETURNING pathname', [req.user.id]);
  await Promise.all(expired.map(intent => removeCloudinary(intent.pathname).catch(() => {})));
  const [{ count }] = await query('SELECT ((SELECT count(*) FROM ibook.reel_media WHERE owner_id=$1) + (SELECT count(*) FROM ibook.reel_upload_intents WHERE owner_id=$1 AND expires_at>now()))::int count', [req.user.id]);
  if (count >= 50) fail(400, 'Your upload quota has been reached. Remove a video or try later.');
  const id = randomUUID(), pathname = `ibook/reels/${req.user.id}/${id}`;
  await query("INSERT INTO ibook.reel_upload_intents(id,owner_id,pathname,expires_at) VALUES($1,$2,$3,now()+interval '20 minutes')", [id, req.user.id, pathname]);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: pathname, timestamp, overwrite: 'false' };
  res.json({ id, uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/video/upload`, fields: { ...params, api_key: cloudinary.apiKey, signature: cloudinarySign(params) } });
});
reelsRouter.post('/reel-upload-complete', publishLimit, async (req, res) => {
  const input = z.object({
    id: uuid,
    upload: z.object({
      publicId: z.string().min(1).max(500),
      version: z.number().int().positive(),
      signature: z.string().regex(/^[a-f0-9]{40}$/),
      duration: z.number().positive(),
    }).strict(),
  }).strict().parse(req.body);
  const id = input.id;
  const [intent] = await query('SELECT * FROM ibook.reel_upload_intents WHERE id=$1 AND owner_id=$2 AND expires_at>now()', [id, req.user.id]);
  if (!intent) fail(404, 'Upload expired. Please choose your video again.');
  if (input.upload.publicId !== intent.pathname) fail(403, 'The uploaded video does not match this upload session.');
  const expectedSignature = createHash('sha1').update(`public_id=${input.upload.publicId}&version=${input.upload.version}${cloudinary.apiSecret}`).digest('hex');
  if (!timingSafeEqual(Buffer.from(input.upload.signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) fail(403, 'Cloudinary could not verify this upload.');
  const asset = await cloudinaryRequest(`/resources/video/upload/${encodeURIComponent(intent.pathname)}`);
  const duration = input.upload.duration;
  const [existing] = await query('SELECT id,duration_seconds FROM ibook.reel_media WHERE filename=$1 AND owner_id=$2', [asset.secure_url, req.user.id]);
  if (existing) {
    await query('DELETE FROM ibook.reel_upload_intents WHERE id=$1', [id]);
    return res.status(201).json({ id: existing.id, durationSeconds: existing.duration_seconds });
  }
  const invalid = asset.bytes > 50 * 1024 * 1024
    ? 'Video must be smaller than 50 MB.'
    : !Number.isFinite(duration) || duration < 1 || duration > 90
      ? 'Use a 1–90 second video.'
      : asset.resource_type !== 'video' || !['mp4','webm','mov'].includes(String(asset.format).toLowerCase())
        ? 'Choose an MP4, WebM, or QuickTime video.'
        : null;
  if (invalid) {
    await removeCloudinary(intent.pathname).catch(() => {});
    await query('DELETE FROM ibook.reel_upload_intents WHERE id=$1', [id]);
    fail(400, invalid);
  }
  const mediaId = randomUUID(), mime = asset.format === 'webm' ? 'video/webm' : asset.format === 'mov' ? 'video/quicktime' : 'video/mp4';
  await query("INSERT INTO ibook.reel_media(id,owner_id,filename,mime,bytes,duration_seconds,data) VALUES($1,$2,$3,$4,$5,$6,NULL)", [mediaId, req.user.id, asset.secure_url, mime, asset.bytes, duration]);
  await query('DELETE FROM ibook.reel_upload_intents WHERE id=$1', [id]);
  res.status(201).json({ id: mediaId, durationSeconds: duration });
});
reelsRouter.post("/reel-upload", publishLimit, async (req, res, next) => {
  if (!isReelAdmin(req.user.id) || !featureFlags.editorialUploads) fail(403, 'Reel administrator access required.');
  const [{ count }] = await query(
    "SELECT count(*)::int count FROM ibook.reel_media WHERE owner_id=$1",
    [req.user.id],
  );
  if (count >= 50)
    fail(
      400,
      "Your 50-video upload limit has been reached. Delete a reel before uploading another.",
    );
  upload.single("video")(req, res, error => { void completeUpload(req, res, next, error); });
});
async function completeUpload(req, res, next, error) {
    if (error)
      return next(
        Object.assign(
          new Error(
            error.code === "LIMIT_FILE_SIZE"
              ? "Video must be smaller than 50 MB."
              : "Upload failed. Choose one MP4 or WebM file.",
          ),
          { status: 400 },
        ),
      );
    if (!req.file)
      return next(
        Object.assign(new Error("Choose an MP4 or WebM video."), {
          status: 400,
        }),
      );
    try {
      // Pin the demuxer before probing. A renamed playlist must never cause
      // ffprobe to fetch another URL or interpret a local file reference.
      const handle = await open(req.file.path, "r");
      const header = Buffer.alloc(12);
      try {
        await handle.read(header, 0, header.length, 0);
      } finally {
        await handle.close();
      }
      const format =
        header.subarray(4, 8).toString() === "ftyp"
          ? "mov"
          : header.readUInt32BE(0) === 0x1a45dfa3
            ? "matroska"
            : null;
      if (!format) fail(400, "Choose an MP4 or WebM video file.");
      const { stdout } = await runFile(
        ffprobe.path,
        [
          "-protocol_whitelist",
          "file",
          "-f",
          format,
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          req.file.path,
        ],
        { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
      );
      const info = JSON.parse(stdout),
        video = info.streams.find((s) => s.codec_type === "video"),
        duration = Number(info.format.duration);
      if (
        !video ||
        !/(mov|mp4|webm)/.test(info.format.format_name) ||
        !["h264", "vp8", "vp9", "av1"].includes(video.codec_name) ||
        !Number.isFinite(duration) ||
        duration < 1 ||
        duration > 90
      )
        fail(400, "Use a 1–90 second H.264 MP4 or WebM video.");
      const mime = info.format.format_name.includes("webm")
        ? "video/webm"
        : "video/mp4";
      const id = randomUUID();
      let filename = req.file.cloudUrl || req.file.filename;
      const storedBytes = await readFile(req.file.path);
      await query(
        "INSERT INTO ibook.reel_media(id,owner_id,filename,mime,bytes,duration_seconds,data) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, req.user.id, filename, mime, req.file.size, duration, storedBytes],
      );
      await unlink(req.file.path).catch(() => {});
      res.status(201).json({ id, durationSeconds: duration });
    } catch (error) {
      await unlink(req.file.path).catch(() => {});
      next(
        Object.assign(
          new Error(
            error.status
              ? error.message
              : "The video could not be read. Try an H.264 MP4.",
          ),
          { status: 400 },
        ),
      );
    }

}
reelsRouter.delete("/reel-upload/:id", async (req, res) => {
  const [m] = await query(
    "DELETE FROM ibook.reel_media WHERE id=$1 AND owner_id=$2 AND NOT EXISTS(SELECT 1 FROM ibook.reels WHERE media_id=$1) RETURNING filename",
    [uuid.parse(req.params.id), req.user.id],
  );
  if (!m) fail(404, "Unpublished upload not found.");
  await removeMedia(m.filename);
  res.json({ ok: true });
});
reelsRouter.post("/reels", publishLimit, async (req, res) => {
  if (!isReelAdmin(req.user.id) && !featureFlags.communityUploads) fail(403, "Community reel publishing is not open yet.");
  const input = z
    .object({
      bookId: z.string().min(1).max(80),
      page: z.number().int().min(0),
      chapterId: z.string().min(1).max(200).optional(),
      startOffset: z.number().int().min(0).optional(),
      endOffset: z.number().int().min(0).optional(),
      scope: z.enum(['passage','chapter','book']).optional(),
      spoilerLevel: z.enum(['none','through_current_passage','chapter_spoiler','book_spoiler']).optional(),
      title: z.string().trim().min(3).max(100),
      caption: z.string().trim().min(10).max(1200),
      tags: z.array(z.string().trim().min(2).max(30)).max(8),
      mediaId: uuid.optional(),
      externalUrl: safeExternal.optional(),
      rightsConfirmed: z.literal(true),
    })
    .strict()
    .refine(
      (x) => !!x.mediaId !== !!x.externalUrl,
      "Choose one uploaded video or external link.",
    )
    .parse(req.body);
  const { book, chapter } = await pageContext(input.bookId, input.page);
  const chapterId = input.chapterId || chapter.id || String(input.page);
  const startOffset = input.startOffset ?? 0;
  const endOffset = input.endOffset ?? Math.max(startOffset, chapter.length ?? chapter.text.length);
  if (endOffset < startOffset || endOffset > (chapter.length ?? chapter.text.length)) fail(400, 'Selected passage is outside this chapter.');
  const id = await transaction(async (q) => {
    let duration = 30;
    if (input.mediaId) {
      const [m] = await q(
        "SELECT * FROM ibook.reel_media WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [input.mediaId, req.user.id],
      );
      if (!m) fail(403, "This upload does not belong to you.");
      duration = m.duration_seconds;
    }
    const passageText = chapter.text.slice(startOffset, endOffset);
    const passageHash = createHash('sha256').update(passageText.replace(/\s+/g, ' ').trim()).digest('hex');
    const [passage] = await q(`INSERT INTO ibook.book_passages(id,book_id,content_version,chapter_id,start_offset,end_offset,passage_hash,preview_text)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(book_id,content_version,chapter_id,start_offset,end_offset)
      DO UPDATE SET passage_hash=excluded.passage_hash,preview_text=excluded.preview_text
      RETURNING id`, [randomUUID(), input.bookId, book.content_version || 1, chapterId, startOffset, endOffset, passageHash, passageText.slice(0, 240)]);
    const id = randomUUID();
    await q(
      "INSERT INTO ibook.reels(id,creator_id,book_id,page,title,caption,tags,media_id,external_url,source_url,attribution,license,duration_seconds,status,content_version,chapter_id,start_offset,end_offset,reel_scope,source_type,visibility,moderation_status,spoiler_level,preview_text,passage_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ready',$14,$15,$16,$17,$18,$19,'private','approved',$20,$21,$22)",
      [
        id,
        req.user.id,
        input.bookId,
        input.page,
        input.title,
        input.caption,
        [...new Set(input.tags.map((t) => t.toLowerCase()))],
        input.mediaId || null,
        input.externalUrl || null,
        input.externalUrl || "",
        req.user.name,
        input.mediaId
          ? "Creator confirms distribution rights"
          : "External post; rights remain with creator",
        duration,
        book.content_version || 1,
        chapterId,
        startOffset,
        endOffset,
        input.scope || 'passage',
        isReelAdmin(req.user.id) ? 'editorial' : 'community',
        input.spoilerLevel || 'through_current_passage',
        passageText.slice(0, 240),
        passage.id,
      ],
    );
    return id;
  });
  res.status(201).json({ id });
});
reelsRouter.get('/admin/reels', async (req, res) => {
  if (!isReelAdmin(req.user.id)) fail(403, 'Reel administrator access required.');
  res.json(await query(`SELECT ${projection} ${joins} ORDER BY r.updated_at DESC LIMIT 250`));
});
reelsRouter.post('/admin/reels/:id/publish', async (req, res) => {
  if (!isReelAdmin(req.user.id)) fail(403, 'Reel administrator access required.');
  const id = uuid.parse(req.params.id);
  await transaction(async q => {
    const [reel] = await q("SELECT status FROM ibook.reels WHERE id=$1 FOR UPDATE", [id]);
    if (!reel) fail(404, 'Reel unavailable.');
    if (!['ready','hidden'].includes(reel.status)) fail(400, 'Only a ready reel can be published.');
    await q("UPDATE ibook.reels SET status='published',visibility='public',published_at=coalesce(published_at,now()),updated_at=now() WHERE id=$1", [id]);
    await q("INSERT INTO ibook.reel_moderation_events(id,reel_id,moderator_id,action,previous_status,new_status) VALUES($1,$2,$3,'publish',$4,'published')", [randomUUID(), id, req.user.id, reel.status]);
  });
  res.json({ ok: true });
});
reelsRouter.post('/admin/reels/:id/unpublish', async (req, res) => {
  if (!isReelAdmin(req.user.id)) fail(403, 'Reel administrator access required.');
  const id = uuid.parse(req.params.id);
  const rows = await query("UPDATE ibook.reels SET status='ready',visibility='private',updated_at=now() WHERE id=$1 AND status IN ('published','hidden') RETURNING id", [id]);
  if (!rows.length) fail(404, 'Published reel unavailable.');
  res.json({ ok: true });
});
reelsRouter.delete("/reels/:id", async (req, res) => {
  const removed = await transaction(async (q) => {
    const [r] = await q(
      "DELETE FROM ibook.reels WHERE id=$1 AND creator_id=$2 RETURNING media_id",
      [uuid.parse(req.params.id), req.user.id],
    );
    if (!r) fail(404, "Your reel was not found.");
    if (r.media_id) {
      const [m] = await q(
        "DELETE FROM ibook.reel_media WHERE id=$1 RETURNING filename",
        [r.media_id],
      );
      return m?.filename;
    }
  });
  if (removed) await removeMedia(removed);
  res.json({ ok: true });
});
reelsRouter.put("/reels/:id/reaction", async (req, res) => {
  const r = await visibleReel(req.params.id, req.user.id);
  const input = z
    .object({
      liked: z.boolean().optional(),
      saved: z.boolean().optional(),
      hidden: z.boolean().optional(),
      shared: z.literal(true).optional(),
    })
    .strict()
    .parse(req.body);
  await query(
    "INSERT INTO ibook.reel_reactions(user_id,reel_id,liked,saved,hidden,shared) VALUES($1,$2,coalesce($3,false),coalesce($4,false),coalesce($5,false),coalesce($6,false)) ON CONFLICT(user_id,reel_id) DO UPDATE SET liked=coalesce($3,ibook.reel_reactions.liked),saved=coalesce($4,ibook.reel_reactions.saved),hidden=coalesce($5,ibook.reel_reactions.hidden),shared=coalesce($6,ibook.reel_reactions.shared),updated_at=now()",
    [
      req.user.id,
      r.id,
      input.liked ?? null,
      input.saved ?? null,
      input.hidden ?? null,
      input.shared ?? null,
    ],
  );
  res.json({ ok: true });
});
reelsRouter.post("/reels/:id/view", async (req, res) => {
  const r = await visibleReel(req.params.id, req.user.id),
    id = randomUUID();
  await transaction(async (q) => {
    await q(
      "INSERT INTO ibook.reel_views(id,user_id,reel_id) VALUES($1,$2,$3)",
      [id, req.user.id, r.id],
    );
    await q(
      "INSERT INTO ibook.reel_reactions(user_id,reel_id,impressions) VALUES($1,$2,1) ON CONFLICT(user_id,reel_id) DO UPDATE SET impressions=ibook.reel_reactions.impressions+1,updated_at=now()",
      [req.user.id, r.id],
    );
  });
  res.status(201).json({ viewId: id });
});
reelsRouter.put("/reel-views/:id", async (req, res) => {
  const { seconds } = z
    .object({ seconds: z.number().min(0).max(90) })
    .parse(req.body);
  await transaction(async (q) => {
    const [v] = await q(
      "SELECT v.*,r.duration_seconds,r.external_url FROM ibook.reel_views v JOIN ibook.reels r ON r.id=v.reel_id WHERE v.id=$1 AND v.user_id=$2 AND v.created_at>now()-interval '1 hour' AND r.status='published' FOR UPDATE OF v",
      [uuid.parse(req.params.id), req.user.id],
    );
    if (!v) fail(404, "Playback session expired.");
    if (v.external_url) fail(400, "External playback cannot be measured.");
    const elapsed = Math.max(
      0,
      (Date.now() - Date.parse(v.last_ping_at)) / 1000,
    );
    const total = Math.min(
      seconds,
      v.duration_seconds,
      v.last_watch_seconds + elapsed + 1,
      Math.max(0, (Date.now() - Date.parse(v.created_at)) / 1000) + 1,
    );
    const delta = Math.max(0, total - v.last_watch_seconds);
    await q(
      "UPDATE ibook.reel_views SET last_watch_seconds=greatest(last_watch_seconds,$2),last_ping_at=now() WHERE id=$1",
      [v.id, total],
    );
    await q(
      "UPDATE ibook.reel_reactions SET watch_seconds=watch_seconds+$3,max_completion=greatest(max_completion,$4),updated_at=now() WHERE user_id=$1 AND reel_id=$2",
      [req.user.id, v.reel_id, delta, total / v.duration_seconds],
    );
  });
  res.json({ ok: true });
});
reelsRouter.get("/reels/:id/comments", async (req, res) => {
  await visibleReel(req.params.id, req.user.id);
  res.json(
    await query(
      "SELECT c.*,u.name FROM ibook.reel_comments c JOIN ibook.users u ON u.id=c.user_id WHERE c.reel_id=$1 AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$2 AND blocked_id=c.user_id) OR (user_id=c.user_id AND blocked_id=$2)) ORDER BY created_at DESC LIMIT 100",
      [req.params.id, req.user.id],
    ),
  );
});
reelsRouter.post("/reels/:id/comments", async (req, res) => {
  if (!featureFlags.comments) fail(403, 'Reel comments are not enabled yet.');
  await visibleReel(req.params.id, req.user.id);
  const body = z.string().trim().min(1).max(1000).parse(req.body.body);
  const [comment] = await query(
    "INSERT INTO ibook.reel_comments(id,user_id,reel_id,body) VALUES($1,$2,$3,$4) RETURNING *",
    [randomUUID(), req.user.id, req.params.id, body],
  );
  res.status(201).json(comment);
});
reelsRouter.delete("/reel-comments/:id", async (req, res) => {
  const rows = await query(
    "DELETE FROM ibook.reel_comments WHERE id=$1 AND user_id=$2 RETURNING id",
    [uuid.parse(req.params.id), req.user.id],
  );
  if (!rows.length) fail(404, "Your comment was not found.");
  res.json({ ok: true });
});
reelsRouter.post("/reels/:id/report", async (req, res) => {
  await visibleReel(req.params.id, req.user.id);
  const reason = z
    .enum([
      "Unrelated to page",
      "Spoilers",
      "Copyright",
      "Harassment or unsafe content",
      "Spam",
    ])
    .parse(req.body.reason);
  await transaction(async (q) => {
    await q(
      "INSERT INTO ibook.reel_reports(user_id,reel_id,reason) VALUES($1,$2,$3) ON CONFLICT(user_id,reel_id) DO UPDATE SET reason=$3",
      [req.user.id, req.params.id, reason],
    );
    await q(
      "INSERT INTO ibook.reel_reactions(user_id,reel_id,hidden) VALUES($1,$2,true) ON CONFLICT(user_id,reel_id) DO UPDATE SET hidden=true",
      [req.user.id, req.params.id],
    );
  });
  res.json({ ok: true });
});
reelsRouter.post("/reels/reset-preferences", async (req, res) => {
  await query("DELETE FROM ibook.reel_views WHERE user_id=$1", [req.user.id]);
  await query(
    "UPDATE ibook.reel_reactions SET hidden=false,impressions=0,max_completion=0,watch_seconds=0,shared=false WHERE user_id=$1",
    [req.user.id],
  );
  res.json({ ok: true });
});
reelsRouter.get("/reel-moderation", async (req, res) => {
  if (!isModerator(req.user.id)) fail(403, "Moderator access required.");
  res.json(
    await query(
      "SELECT r.id,r.title,r.status,p.reason,p.created_at FROM ibook.reel_reports p JOIN ibook.reels r ON r.id=p.reel_id ORDER BY p.created_at DESC LIMIT 200",
    ),
  );
});
reelsRouter.get("/reel-moderation/:id", async (req, res) => {
  if (!isModerator(req.user.id)) fail(403, "Moderator access required.");
  const [r] = await query(`SELECT ${projection} ${joins} WHERE r.id=$1`, [
    uuid.parse(req.params.id),
  ]);
  if (!r) fail(404, "Reel unavailable.");
  if (r.media_id) {
    const expires = Date.now() + 300000;
    r.playback_url = `/api/reel-review-media/${r.media_id}?expires=${expires}&signature=${signReview(r.media_id, expires)}`;
  }
  res.json(r);
});
reelsRouter.patch("/reel-moderation/:id", async (req, res) => {
  if (!isModerator(req.user.id)) fail(403, "Moderator access required.");
  const status = z.enum(["published", "hidden"]).parse(req.body.status);
  const rows = await query(
    "UPDATE ibook.reels SET status=$2 WHERE id=$1 RETURNING id",
    [uuid.parse(req.params.id), status],
  );
  if (!rows.length) fail(404, "Reel unavailable.");
  res.json({ ok: true });
});
