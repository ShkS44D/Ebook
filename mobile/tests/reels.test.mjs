import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { query, pool } from "../server/db.mjs";
const base = process.env.TEST_API_URL || "http://localhost:3001/api";
async function request(
  path,
  { token, method = "GET", body, status = 200 } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-iBook-Client": "native",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
test("page reels persist, enforce ownership, rank safely and moderate reports", async (t) => {
  const users = [];
  let a, b, id, seed;
  const valid = {
    bookId: "reading-guide",
    page: 0,
    title: "A quiet reading corner",
    caption: "Silence distractions to give this page your attention.",
    tags: ["reading", "focus"],
    externalUrl: "https://www.instagram.com/reel/ApprovedExample/",
    rightsConfirmed: true,
  };
  try {
    for (const name of ["Alice", "Bob"]) {
      const r = await request("/auth/signup", {
        method: "POST",
        status: 201,
        body: {
          name: "Reel QA " + name,
          email: `reel-${randomUUID()}@example.invalid`,
          password: "Testing-" + randomUUID(),
        },
      });
      users.push(r);
    }
    [a, b] = users;
    await t.test(
      "authentication and starter clip for each actual reading page",
      async () => {
        await request("/page-reels/reading-guide/0", { status: 401 });
        for (let page = 0; page < 4; page++) {
          const data = await request("/page-reels/reading-guide/" + page, {
            token: a.token,
          });
          assert.ok(
            data.items.some(
              (r) => r.page === page && !r.creator_id && r.playback_url,
            ),
          );
          assert.ok(
            data.items.every(
              (r) => r.book_id !== "reading-guide" || r.page === page,
            ),
          );
          if (page === 0) seed = data.items.find((r) => !r.creator_id).id;
        }
        await request("/page-reels/reading-guide/999", {
          token: a.token,
          status: 404,
        });
        await request("/page-reels/reading-guide/-1", {
          token: a.token,
          status: 400,
        });
      },
    );
    await t.test(
      "create approved external links with source validation",
      async () => {
        await request("/reels", {
          token: a.token,
          method: "POST",
          body: { ...valid, rightsConfirmed: false },
          status: 400,
        });
        await request("/reels", {
          token: a.token,
          method: "POST",
          body: {
            ...valid,
            externalUrl: "https://instagram.com.evil.invalid/reel/a",
          },
          status: 400,
        });
        await request("/reels", {
          token: a.token,
          method: "POST",
          body: { ...valid, page: 999 },
          status: 404,
        });
        ({ id } = await request("/reels", {
          token: a.token,
          method: "POST",
          body: valid,
          status: 201,
        }));
        assert.equal((await request("/reel-public/" + id)).page, 0);
        await request("/reels/" + id, {
          token: b.token,
          method: "DELETE",
          status: 404,
        });
      },
    );
    await t.test(
      "idempotent reactions, saved filter and pagination exclusion",
      async () => {
        for (let i = 0; i < 2; i++)
          await request(`/reels/${id}/reaction`, {
            token: b.token,
            method: "PUT",
            body: { liked: true, saved: true, shared: true },
          });
        assert.equal(
          (await request("/reels/" + id, { token: b.token })).likes,
          1,
        );
        const saved = await request("/page-reels/reading-guide/0?mode=saved", {
          token: b.token,
        });
        assert.deepEqual(
          saved.items.map((r) => r.id),
          [id],
        );
        const excluded = await request(
          "/page-reels/reading-guide/0?exclude=" + id,
          { token: b.token },
        );
        assert.ok(excluded.items.every((r) => r.id !== id));
      },
    );
    await t.test(
      "comments persist and only their owner can delete them",
      async () => {
        const c = await request(`/reels/${id}/comments`, {
          token: b.token,
          method: "POST",
          body: { body: "This helps me imagine a quiet reading habit." },
          status: 201,
        });
        assert.ok(
          (await request(`/reels/${id}/comments`, { token: a.token })).some(
            (row) => row.id === c.id,
          ),
        );
        await request("/reel-comments/" + c.id, {
          token: a.token,
          method: "DELETE",
          status: 404,
        });
        await request("/reel-comments/" + c.id, {
          token: b.token,
          method: "DELETE",
        });
      },
    );
    await t.test(
      "real video validation, upload ownership, public range playback and deletion",
      async () => {
        const send = async (bytes, type, status) => {
          const body = new FormData();
          body.append("video", new Blob([bytes], { type }), "qa.mp4");
          const response = await fetch(base + "/reel-upload", {
            method: "POST",
            headers: { Authorization: "Bearer " + a.token },
            body,
          });
          const data = await response.json();
          assert.equal(response.status, status, JSON.stringify(data));
          return data;
        };
        await send("not a video", "video/mp4", 400);
        const upload = await send(
          await readFile(new URL("./fixtures/reel.mp4", import.meta.url)),
          "video/mp4",
          201,
        );
        const input = { ...valid, mediaId: upload.id };
        delete input.externalUrl;
        await request("/reels", {
          token: b.token,
          method: "POST",
          body: input,
          status: 403,
        });
        const published = await request("/reels", {
          token: a.token,
          method: "POST",
          body: input,
          status: 201,
        });
        await request("/reel-upload/" + upload.id, {
          token: a.token,
          method: "DELETE",
          status: 404,
        });
        const media = await fetch(base + "/reel-media/" + upload.id, {
          headers: { Range: "bytes=0-99" },
        });
        assert.equal(media.status, 206);
        assert.equal(media.headers.get("content-type"), "video/mp4");
        assert.equal((await media.arrayBuffer()).byteLength, 100);
        await request("/reels/" + published.id, {
          token: a.token,
          method: "DELETE",
        });
        await request("/reel-media/" + upload.id, { status: 404 });
      },
    );
    await t.test(
      "watch sessions reject other users, external measurements and rapid inflation",
      async () => {
        const external = await request(`/reels/${id}/view`, {
          token: b.token,
          method: "POST",
          body: {},
          status: 201,
        });
        await request("/reel-views/" + external.viewId, {
          token: b.token,
          method: "PUT",
          body: { seconds: 30 },
          status: 400,
        });
        const view = await request(`/reels/${seed}/view`, {
          token: b.token,
          method: "POST",
          body: {},
          status: 201,
        });
        await request("/reel-views/" + view.viewId, {
          token: a.token,
          method: "PUT",
          body: { seconds: 1 },
          status: 404,
        });
        for (let n = 0; n < 3; n++)
          await request("/reel-views/" + view.viewId, {
            token: b.token,
            method: "PUT",
            body: { seconds: 90 },
          });
        const [v] = await query("SELECT * FROM ibook.reel_views WHERE id=$1", [
          view.viewId,
        ]);
        assert.ok(
          v.last_watch_seconds < 10,
          "instant completion must be capped",
        );
        const [before] = await query(
          "SELECT watch_seconds FROM ibook.reel_reactions WHERE reel_id=$1 AND user_id=$2",
          [seed, b.user.id],
        );
        await request("/reel-views/" + view.viewId, {
          token: b.token,
          method: "PUT",
          body: { seconds: 0 },
        });
        const [after] = await query(
          "SELECT watch_seconds FROM ibook.reel_reactions WHERE reel_id=$1 AND user_id=$2",
          [seed, b.user.id],
        );
        assert.equal(after.watch_seconds, before.watch_seconds);
      },
    );
    await t.test(
      "reports hide locally; moderation hides public playback; reset preserves saves",
      async () => {
        await request(`/reels/${id}/report`, {
          token: b.token,
          method: "POST",
          body: { reason: "Unrelated to page" },
        });
        assert.ok(
          !(
            await request("/page-reels/reading-guide/0", { token: b.token })
          ).items.some((r) => r.id === id),
        );
        await request("/reel-moderation", { token: b.token, status: 403 });
        await request("/reels/reset-preferences", {
          token: b.token,
          method: "POST",
          body: {},
        });
        assert.ok(
          (
            await request("/page-reels/reading-guide/0?mode=saved", {
              token: b.token,
            })
          ).items.some((r) => r.id === id),
        );
        await query("UPDATE ibook.reels SET status='hidden' WHERE id=$1", [id]);
        await request("/reel-public/" + id, { status: 404 });
        await query("UPDATE ibook.reels SET status='published' WHERE id=$1", [
          id,
        ]);
      },
    );
    await t.test(
      "blocked creators disappear and cannot be fetched with that account",
      async () => {
        await query(
          "INSERT INTO ibook.blocks(user_id,blocked_id) VALUES($1,$2)",
          [b.user.id, a.user.id],
        );
        assert.ok(
          !(
            await request("/page-reels/reading-guide/0", { token: b.token })
          ).items.some((r) => r.id === id),
        );
        await request("/reels/" + id, { token: b.token, status: 404 });
        await request("/reels/" + id, { token: a.token, method: "DELETE" });
        await request("/reel-public/" + id, { status: 404 });
      },
    );
  } finally {
    for (const u of users)
      await query("DELETE FROM ibook.users WHERE id=$1", [u.user.id]);
    await pool.end();
  }
});
