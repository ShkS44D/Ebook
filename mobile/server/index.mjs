import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  randomUUID,
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { query, transaction, pool } from "./db.mjs";
import { migrate } from "./migrate.mjs";
import { reelsRouter, registerPublicReels } from "./reels.mjs";
import { readerSettingsSchema, libraryUpdateSchema, validPosition } from "./reader-validation.mjs";
const scrypt = promisify(scryptCallback);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const app = express();
if (process.env.VERCEL) app.set('trust proxy', 1);
const production = process.env.NODE_ENV === "production";
const origins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:8081,http://localhost:8082,http://localhost:19006"
)
  .split(",")
  .map((x) => x.trim());
for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
  if (host) origins.push('https://' + host);
}
app.disable("x-powered-by");
app.use(
  helmet(),
  cors({ origin: origins, credentials: true }),
  express.json({ limit: "32kb" }),
  cookieParser(),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    message: { error: "Too many requests. Please try again in a minute." },
  }),
);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    ((req.headers.origin && !origins.includes(req.headers.origin)) ||
      (req.cookies.ibook_session &&
        !req.headers.origin &&
        !req.headers.authorization?.startsWith("Bearer ")))
  )
    return res.status(403).json({ error: "Untrusted request origin." });
  next();
});
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(10).max(128),
});
const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(80);
const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "lax",
  path: "/api",
  maxAge: 30 * 86400000,
};
const publicUser = (u) => {
  const { password_hash, ...safe } = u;
  return {
    ...safe,
    reel_moderator: (process.env.REEL_MODERATOR_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .includes(u.id),
  };
};
async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + Buffer.from(await scrypt(password, salt, 64)).toString("hex")
  );
}
async function passwordMatches(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    Buffer.from(await scrypt(password, salt, 64)),
  );
}
async function session(res, user, req) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO ibook.sessions VALUES($1,$2,now()+interval '30 days')",
    [hash(token), user.id],
  );
  if (req.headers["x-ibook-client"] !== "native")
    res.cookie("ibook_session", token, cookieOptions);
  return {
    user: publicUser(user),
    ...(req.headers["x-ibook-client"] === "native" ? { token } : {}),
  };
}
async function auth(req, res, next) {
  const token =
    req.headers.authorization?.replace(/^Bearer /, "") ||
    req.cookies.ibook_session;
  if (!token)
    return next(
      Object.assign(new Error("Please sign in to continue."), { status: 401 }),
    );
  const [user] = await query(
    "SELECT u.* FROM ibook.sessions s JOIN ibook.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(token)],
  );
  if (!user)
    return next(
      Object.assign(
        new Error("Your session has expired. Please sign in again."),
        { status: 401 },
      ),
    );
  req.user = user;
  req.token = token;
  next();
}
async function book(id) {
  const [b] = await query("SELECT * FROM ibook.books WHERE id=$1", [id]);
  if (!b) fail(404, "Book not found.");
  return b;
}
async function collection(user, id, q = query) {
  idSchema.parse(id);
  const [c] = await q(
    "SELECT * FROM ibook.collections WHERE id=$1 AND user_id=$2",
    [id, user],
  );
  if (!c) fail(404, "Collection not found.");
  return c;
}
async function notify(q, user, body) {
  await q(
    "INSERT INTO ibook.notifications(id,user_id,body) SELECT $1,id,$3 FROM ibook.users WHERE id=$2 AND notifications=true",
    [randomUUID(), user, body],
  );
}
async function canChat(user, other, q = query) {
  idSchema.parse(other);
  const [ok] = await q(
    "SELECT 1 FROM ibook.friends WHERE accepted AND ((sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1)) AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1))",
    [user, other],
  );
  if (!ok) fail(403, "Messaging is available between accepted friends only.");
}
app.get("/api/health", async (req, res) => {
  await query("SELECT 1");
  res.json({ status: "ok" });
});
app.get("/api/config", (req, res) =>
  res.json({
    passwordReset: !!process.env.SMTP_URL,
    payments: false,
    socialLogin: false,
  }),
);
app.get("/api/books", async (req, res) => {
  const q = z
    .string()
    .max(200)
    .parse(req.query.q || "");
  const category = z
    .string()
    .max(80)
    .parse(req.query.category || "");
  res.json(
    await query(
      "SELECT b.id,b.title,b.author,b.category,b.description,b.available,jsonb_array_length(b.chapters) AS pages,COALESCE(round(avg(r.rating),1),0) AS rating,count(r.user_id)::int AS reviews FROM ibook.books b LEFT JOIN ibook.reviews r ON r.book_id=b.id WHERE ($1='' OR strpos(lower(b.title || ' ' || b.author),lower($1))>0) AND ($2='' OR b.category=$2) GROUP BY b.id ORDER BY b.available DESC,b.title",
      [q, category],
    ),
  );
});
app.get("/api/books/:id", async (req, res) => {
  const b = await book(req.params.id);
  const reviews = await query(
    "SELECT r.rating,r.body,r.updated_at,r.user_id,u.name FROM ibook.reviews r JOIN ibook.users u ON u.id=r.user_id WHERE book_id=$1 ORDER BY updated_at DESC LIMIT 100",
    [b.id],
  );
  res.json({ ...b, reviews });
});
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});
app.use("/api/auth", authLimit);
app.post("/api/auth/signup", async (req, res) => {
  const input = credentials.extend({ name: nameSchema }).parse(req.body);
  const password = await passwordHash(input.password);
  const [user] = await query(
    "INSERT INTO ibook.users(id,email,password_hash,name) VALUES($1,$2,$3,$4) RETURNING *",
    [randomUUID(), input.email, password, input.name],
  );
  res.status(201).json(await session(res, user, req));
});
app.post("/api/auth/login", async (req, res) => {
  const input = credentials.parse(req.body);
  const [user] = await query("SELECT * FROM ibook.users WHERE email=$1", [
    input.email,
  ]);
  // Run the same expensive derivation even when the address is unknown.
  const valid = await passwordMatches(
    input.password,
    user?.password_hash ||
      "00000000000000000000000000000000:" + "0".repeat(128),
  );
  if (!user || !valid) fail(401, "Email or password is incorrect.");
  res.json(await session(res, user, req));
});
app.post("/api/auth/forgot", async (req, res) => {
  if (!process.env.SMTP_URL)
    fail(
      503,
      "Password reset email is not configured. Contact the app owner for account support.",
    );
  const email = credentials.shape.email.parse(req.body.email);
  const [user] = await query("SELECT id FROM ibook.users WHERE email=$1", [
    email,
  ]);
  if (user) {
    const token = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO ibook.resets VALUES($1,$2,now()+interval '30 minutes')",
      [hash(token), user.id],
    );
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: "Reset your iBook password",
      text: `Enter this reset code in iBook within 30 minutes:\n\n${token}\n\nIgnore this message if you did not request a reset.`,
    });
  }
  res.json({
    message: "If this email is registered, a reset code has been sent.",
  });
});
app.post("/api/auth/reset", async (req, res) => {
  const input = z
    .object({
      token: z.string().length(64),
      password: credentials.shape.password,
    })
    .parse(req.body);
  const password = await passwordHash(input.password);
  await transaction(async (q) => {
    const [reset] = await q(
      "DELETE FROM ibook.resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id",
      [hash(input.token)],
    );
    if (!reset) fail(400, "Reset code is invalid or expired.");
    await q("UPDATE ibook.users SET password_hash=$1 WHERE id=$2", [
      password,
      reset.user_id,
    ]);
    await q("DELETE FROM ibook.sessions WHERE user_id=$1", [reset.user_id]);
    await q("DELETE FROM ibook.resets WHERE user_id=$1", [reset.user_id]);
  });
  res.json({ ok: true });
});
registerPublicReels(app);
app.use("/api", auth);
app.use("/api", reelsRouter);
app.post("/api/logout", async (req, res) => {
  await query("DELETE FROM ibook.sessions WHERE token_hash=$1", [
    hash(req.token),
  ]);
  res.clearCookie("ibook_session", cookieOptions);
  res.json({ ok: true });
});
app.get("/api/me", async (req, res) => {
  const uid = req.user.id;
  const [library, collections, days, notifications, friends] =
    await Promise.all([
      query(
        "SELECT * FROM ibook.library WHERE user_id=$1 ORDER BY updated_at DESC",
        [uid],
      ),
      query(
        "SELECT c.*,COALESCE(jsonb_agg(cb.book_id) FILTER(WHERE cb.book_id IS NOT NULL),'[]') AS book_ids FROM ibook.collections c LEFT JOIN ibook.collection_books cb ON cb.collection_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC",
        [uid],
      ),
      query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day,seconds FROM ibook.reading_days WHERE user_id=$1 ORDER BY day DESC LIMIT 366",
        [uid],
      ),
      query(
        "SELECT * FROM ibook.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [uid],
      ),
      query(
        "SELECT f.*,u.id,u.name,u.bio FROM ibook.friends f JOIN ibook.users u ON u.id=CASE WHEN f.sender=$1 THEN f.recipient ELSE f.sender END WHERE (f.sender=$1 OR f.recipient=$1) ORDER BY f.created_at DESC",
        [uid],
      ),
    ]);
  res.json({
    user: publicUser(req.user),
    library,
    collections,
    days,
    notifications,
    friends,
  });
});
app.patch("/api/me", async (req, res) => {
  const data = z
    .object({
      name: nameSchema.optional(),
      bio: z.string().trim().max(500).optional(),
      phone: z.string().trim().max(30).optional(),
      goal: z.number().int().min(5).max(180).optional(),
      dark: z.boolean().optional(),
      notifications: z.boolean().optional(),
      reader_settings: readerSettingsSchema.optional(),
    })
    .strict()
    .parse(req.body);
  const entries = Object.entries(data);
  if (!entries.length) fail(400, "No changes supplied.");
  const [user] = await query(
    `UPDATE ibook.users SET ${entries.map(([key], i) => `${key}=$${i + 2}`).join(",")} WHERE id=$1 RETURNING *`,
    [
      req.user.id,
      ...entries.map(([key, value]) =>
        key === "reader_settings" ? JSON.stringify(value) : value,
      ),
    ],
  );
  res.json(publicUser(user));
});
app.put("/api/library/:id", async (req, res) => {
  const b = await book(req.params.id);
  const data = libraryUpdateSchema.parse(req.body);
  if (
    data.page !== undefined &&
    (!b.available || data.page >= b.chapters.length)
  )
    fail(400, "Invalid reading position.");
  if (data.finished && !b.available)
    fail(400, "This book is not available to read.");
  if (data.reader_offset !== undefined && (data.page === undefined || !validPosition(b.chapters, { chapter: data.page, offset: data.reader_offset })))
    fail(400, "Invalid reading offset.");
  if (data.bookmarks?.some(p => !validPosition(b.chapters, p)))
    fail(400, "Invalid bookmark position.");
  const [entry] = await query(
    "INSERT INTO ibook.library(user_id,book_id,page,finished,bookmarked,reader_offset,bookmarks) VALUES($1,$2,COALESCE($3,0),COALESCE($4,false),COALESCE($5,false),COALESCE($6,0),COALESCE($7::jsonb,'[]'::jsonb)) ON CONFLICT(user_id,book_id) DO UPDATE SET page=COALESCE($3,ibook.library.page),finished=COALESCE($4,ibook.library.finished),bookmarked=COALESCE($5,ibook.library.bookmarked),reader_offset=CASE WHEN $3 IS NOT NULL THEN COALESCE($6,0) ELSE ibook.library.reader_offset END,bookmarks=COALESCE($7::jsonb,ibook.library.bookmarks),updated_at=now() RETURNING *",
    [
      req.user.id,
      b.id,
      data.page ?? null,
      data.finished ?? null,
      data.bookmarked ?? null,
      data.reader_offset ?? null,
      data.bookmarks === undefined ? null : JSON.stringify(data.bookmarks),
    ],
  );
  res.json(entry);
});
app.delete("/api/library/:id", async (req, res) => {
  await transaction(async (q) => {
    await q(
      "DELETE FROM ibook.collection_books cb USING ibook.collections c WHERE cb.collection_id=c.id AND c.user_id=$1 AND cb.book_id=$2",
      [req.user.id, req.params.id],
    );
    await q("DELETE FROM ibook.library WHERE user_id=$1 AND book_id=$2", [
      req.user.id,
      req.params.id,
    ]);
  });
  res.json({ ok: true });
});
app.post("/api/reading/:id", async (req, res) => {
  const b = await book(req.params.id);
  if (!b.available) fail(400, "Book content unavailable.");
  const { seconds } = z
    .object({ seconds: z.number().int().min(1).max(60) })
    .parse(req.body);
  await query(
    "INSERT INTO ibook.reading_days(user_id,seconds) VALUES($1,$2) ON CONFLICT(user_id,day) DO UPDATE SET seconds=ibook.reading_days.seconds+EXCLUDED.seconds",
    [req.user.id, seconds],
  );
  res.json({ ok: true });
});
app.post("/api/collections", async (req, res) => {
  const name = nameSchema.parse(req.body.name);
  const [c] = await query(
    "INSERT INTO ibook.collections(id,user_id,name) VALUES($1,$2,$3) RETURNING *",
    [randomUUID(), req.user.id, name],
  );
  res.status(201).json(c);
});
app.patch("/api/collections/:id", async (req, res) => {
  await collection(req.user.id, req.params.id);
  const name = nameSchema.parse(req.body.name);
  await query("UPDATE ibook.collections SET name=$1 WHERE id=$2", [
    name,
    req.params.id,
  ]);
  res.json({ ok: true });
});
app.delete("/api/collections/:id", async (req, res) => {
  await collection(req.user.id, req.params.id);
  await query("DELETE FROM ibook.collections WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
app.put("/api/collections/:id/books", async (req, res) => {
  const ids = z
    .array(z.string().min(1).max(80))
    .max(500)
    .parse(req.body.bookIds);
  await transaction(async (q) => {
    await collection(req.user.id, req.params.id, q);
    await q("SELECT id FROM ibook.collections WHERE id=$1 FOR UPDATE", [
      req.params.id,
    ]);
    const found = await q(
      "SELECT id FROM ibook.books WHERE id=ANY($1::text[])",
      [ids],
    );
    if (found.length !== new Set(ids).size)
      fail(400, "One or more books do not exist.");
    await q("DELETE FROM ibook.collection_books WHERE collection_id=$1", [
      req.params.id,
    ]);
    for (const id of new Set(ids)) {
      await q("INSERT INTO ibook.collection_books VALUES($1,$2)", [
        req.params.id,
        id,
      ]);
      await q(
        "INSERT INTO ibook.library(user_id,book_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [req.user.id, id],
      );
    }
  });
  res.json({ ok: true });
});
app.put("/api/books/:id/review", async (req, res) => {
  await book(req.params.id);
  const data = z
    .object({
      rating: z.number().int().min(1).max(5),
      body: z.string().trim().min(3).max(3000),
    })
    .parse(req.body);
  await query(
    "INSERT INTO ibook.reviews(user_id,book_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,book_id) DO UPDATE SET rating=$3,body=$4,updated_at=now()",
    [req.user.id, req.params.id, data.rating, data.body],
  );
  res.json({ ok: true });
});
app.delete("/api/books/:id/review", async (req, res) => {
  await query("DELETE FROM ibook.reviews WHERE user_id=$1 AND book_id=$2", [
    req.user.id,
    req.params.id,
  ]);
  res.json({ ok: true });
});
app.get("/api/people", async (req, res) => {
  const search = z
    .string()
    .max(100)
    .parse(req.query.q || "");
  if (search.trim().length < 2) return res.json([]);
  res.json(
    await query(
      "SELECT id,name,bio FROM ibook.users u WHERE id<>$1 AND strpos(lower(name),lower($2))>0 AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$1 AND blocked_id=u.id) OR (user_id=u.id AND blocked_id=$1)) ORDER BY name LIMIT 30",
      [req.user.id, search.trim()],
    ),
  );
});
app.post("/api/friends/:id", async (req, res) => {
  const other = idSchema.parse(req.params.id),
    uid = req.user.id;
  if (other === uid) fail(400, "Choose another reader.");
  await transaction(async (q) => {
    const [exists] = await q(
      "SELECT id FROM ibook.users WHERE id=$2 AND NOT EXISTS(SELECT 1 FROM ibook.blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1))",
      [uid, other],
    );
    if (!exists) fail(404, "Reader not found.");
    const [incoming] = await q(
      "UPDATE ibook.friends SET accepted=true WHERE sender=$2 AND recipient=$1 AND NOT accepted RETURNING sender",
      [uid, other],
    );
    if (incoming)
      await notify(q, other, `${req.user.name} accepted your friend request.`);
    else {
      const inserted = await q(
        "INSERT INTO ibook.friends(sender,recipient) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING sender",
        [uid, other],
      );
      if (inserted.length)
        await notify(q, other, `${req.user.name} sent you a friend request.`);
    }
  });
  res.json({ ok: true });
});
app.delete("/api/friends/:id", async (req, res) => {
  const other = idSchema.parse(req.params.id);
  await query(
    "DELETE FROM ibook.friends WHERE (sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1)",
    [req.user.id, other],
  );
  res.json({ ok: true });
});
app.post("/api/blocks/:id", async (req, res) => {
  const other = idSchema.parse(req.params.id);
  if (other === req.user.id) fail(400, "Cannot block yourself.");
  await transaction(async (q) => {
    await q("INSERT INTO ibook.blocks VALUES($1,$2) ON CONFLICT DO NOTHING", [
      req.user.id,
      other,
    ]);
    await q(
      "DELETE FROM ibook.friends WHERE (sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1)",
      [req.user.id, other],
    );
  });
  res.json({ ok: true });
});
app.get("/api/blocks", async (req, res) =>
  res.json(
    await query(
      "SELECT u.id,u.name FROM ibook.blocks b JOIN ibook.users u ON u.id=b.blocked_id WHERE b.user_id=$1",
      [req.user.id],
    ),
  ),
);
app.delete("/api/blocks/:id", async (req, res) => {
  await query("DELETE FROM ibook.blocks WHERE user_id=$1 AND blocked_id=$2", [
    req.user.id,
    idSchema.parse(req.params.id),
  ]);
  res.json({ ok: true });
});
app.get("/api/messages/:id", async (req, res) => {
  await canChat(req.user.id, req.params.id);
  res.json(
    await query(
      "SELECT * FROM (SELECT * FROM ibook.messages WHERE (sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1) ORDER BY created_at DESC LIMIT 100) recent ORDER BY created_at",
      [req.user.id, req.params.id],
    ),
  );
});
app.post("/api/messages/:id", async (req, res) => {
  const body = z.string().trim().min(1).max(2000).parse(req.body.body);
  await transaction(async (q) => {
    await canChat(req.user.id, req.params.id, q);
    await q(
      "INSERT INTO ibook.messages(id,sender,recipient,body) VALUES($1,$2,$3,$4)",
      [randomUUID(), req.user.id, req.params.id, body],
    );
    await notify(q, req.params.id, `New message from ${req.user.name}.`);
  });
  res.status(201).json({ ok: true });
});
app.post("/api/notifications/read", async (req, res) => {
  await query("UPDATE ibook.notifications SET read=true WHERE user_id=$1", [
    req.user.id,
  ]);
  res.json({ ok: true });
});
app.post("/api/purchases", (req, res) =>
  fail(
    503,
    "Purchases are unavailable until a payment provider and licensed content are configured.",
  ),
);
app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
app.use((error, req, res, next) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (error.code === "23505")
    return res.status(409).json({
      error: "An account or collection with these details already exists.",
    });
  if (error.code === "23503")
    return res
      .status(400)
      .json({ error: "The selected item no longer exists." });
  if (error.type === "entity.parse.failed")
    return res.status(400).json({ error: "Invalid request JSON." });
  if (!error.status) console.error("API error:", error.code || error.name);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "The service could not complete this request. Please try again.",
  });
});
export default app;
if (!process.env.VERCEL) {
await migrate();
const server = app.listen(Number(process.env.API_PORT || 3001), "0.0.0.0", () =>
  console.log(`iBook API ready on port ${process.env.API_PORT || 3001}`),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await pool.end();
    process.exit(0);
  }),
);
}
