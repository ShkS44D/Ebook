import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query, pool } from "../server/db.mjs";
const base = process.env.TEST_API_URL || "http://localhost:3001/api";
const created = [];
async function request(
  path,
  { token, method = "GET", body, status = 200, origin } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-iBook-Client": "native",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
test("Neon-backed account, library, reading, collection and social workflows", async (t) => {
  const nonce = randomUUID().slice(0, 8),
    password = "Test-only-" + randomUUID();
  let a, b, collectionId;
  try {
    await t.test(
      "signup, authentication, private session and duplicate rejection",
      async () => {
        await request("/me", { status: 401 });
        a = await request("/auth/signup", {
          method: "POST",
          status: 201,
          body: {
            email: `qa-${nonce}-a@example.invalid`,
            name: `QA ${nonce} Alice`,
            password,
          },
        });
        created.push(a.user.id);
        b = await request("/auth/signup", {
          method: "POST",
          status: 201,
          body: {
            email: `qa-${nonce}-b@example.invalid`,
            name: `QA ${nonce} Bob`,
            password,
          },
        });
        created.push(b.user.id);
        assert.ok(a.token);
        assert.equal(a.user.password_hash, undefined);
        await request("/auth/login", {
          method: "POST",
          body: { email: a.user.email, password: "wrong-password" },
          status: 401,
        });
        await request("/auth/signup", {
          method: "POST",
          body: { email: a.user.email, name: "Duplicate", password },
          status: 409,
        });
        const login = await request("/auth/login", {
          method: "POST",
          body: { email: a.user.email, password },
        });
        assert.equal(login.user.id, a.user.id);
        await request("/me", {
          token: a.token,
          method: "PATCH",
          body: { name: "Injection" },
          origin: "https://untrusted.invalid",
          status: 403,
        });
      },
    );
    await t.test(
      "catalog search, no-result search, valid and invalid reading state",
      async () => {
        const catalog = await request("/books");
        assert.ok(catalog.some((b) => b.id === "reading-guide" && b.available));
        assert.equal(
          (await request("/books?q=doesnotexist-" + nonce)).length,
          0,
        );
        assert.equal((await request("/books?q=Mexican"))[0].id, "mexican");
        await request("/library/reading-guide", {
          token: a.token,
          method: "PUT",
          body: { page: 2, bookmarked: true },
        });
        await request("/library/mexican", {
          token: a.token,
          method: "PUT",
          body: { page: 1 },
          status: 400,
        });
        await request("/library/reading-guide", {
          token: a.token,
          method: "PUT",
          body: { page: 999 },
          status: 400,
        });
        await request("/reading/reading-guide", {
          token: a.token,
          method: "POST",
          body: { seconds: 30 },
        });
        const me = await request("/me", { token: a.token });
        assert.equal(me.library[0].page, 2);
        assert.equal(me.library[0].bookmarked, true);
        assert.equal(me.days[0].seconds, 30);
        assert.equal(
          (await request("/me", { token: b.token })).library.length,
          0,
        );
      },
    );
    await t.test(
      "collections persist, reject cross-account writes, and roll back invalid changes",
      async () => {
        const c = await request("/collections", {
          token: a.token,
          method: "POST",
          body: { name: "QA shelf" },
          status: 201,
        });
        collectionId = c.id;
        await request("/collections/" + c.id + "/books", {
          token: a.token,
          method: "PUT",
          body: { bookIds: ["mexican", "reading-guide"] },
        });
        await request("/collections/" + c.id, {
          token: b.token,
          method: "PATCH",
          body: { name: "Not yours" },
          status: 404,
        });
        await request("/collections/" + c.id + "/books", {
          token: b.token,
          method: "PUT",
          body: { bookIds: [] },
          status: 404,
        });
        await request("/collections/" + c.id + "/books", {
          token: a.token,
          method: "PUT",
          body: { bookIds: ["unknown"] },
          status: 400,
        });
        let me = await request("/me", { token: a.token });
        assert.equal(me.collections[0].book_ids.length, 2);
        await request("/collections/" + c.id, {
          token: a.token,
          method: "PATCH",
          body: { name: "Renamed shelf" },
        });
        me = await request("/me", { token: a.token });
        assert.equal(me.collections[0].name, "Renamed shelf");
      },
    );
    await t.test(
      "profiles, preferences, reviews and unavailable payments",
      async () => {
        await request("/me", {
          token: a.token,
          method: "PATCH",
          body: {
            name: `QA ${nonce} Alice`,
            goal: 30,
            dark: true,
            reader_settings: { fontSize: 22, theme: "dark" },
          },
        });
        await request("/me", {
          token: a.token,
          method: "PATCH",
          body: { goal: 0 },
          status: 400,
        });
        await request("/books/reading-guide/review", {
          token: a.token,
          method: "PUT",
          body: { rating: 4, body: "Integration test review." },
        });
        const book = await request("/books/reading-guide");
        assert.ok(
          book.reviews.some((r) => r.user_id === a.user.id && r.rating === 4),
        );
        await request("/books/reading-guide/review", {
          token: a.token,
          method: "PUT",
          body: { rating: 6, body: "Invalid rating" },
          status: 400,
        });
        await request("/purchases", {
          token: a.token,
          method: "POST",
          body: {},
          status: 503,
        });
        await request("/auth/forgot", {
          method: "POST",
          body: { email: a.user.email },
          status: 503,
        });
      },
    );
    await t.test(
      "friend acceptance, messages, notifications, blocking and privacy",
      async () => {
        const people = await request(
          "/people?q=" + encodeURIComponent(`QA ${nonce} Bob`),
          { token: a.token },
        );
        assert.equal(people[0].id, b.user.id);
        assert.equal(people[0].email, undefined);
        await request("/messages/" + b.user.id, {
          token: a.token,
          method: "POST",
          body: { body: "Before acceptance" },
          status: 403,
        });
        await request("/friends/" + b.user.id, {
          token: a.token,
          method: "POST",
          body: {},
        });
        await request("/friends/" + a.user.id, {
          token: b.token,
          method: "POST",
          body: {},
        });
        await request("/messages/" + b.user.id, {
          token: a.token,
          method: "POST",
          status: 201,
          body: { body: "Hello from the integration test" },
        });
        const messages = await request("/messages/" + a.user.id, {
          token: b.token,
        });
        assert.equal(messages[0].body, "Hello from the integration test");
        const me = await request("/me", { token: b.token });
        assert.ok(me.notifications.length);
        await request("/notifications/read", {
          token: b.token,
          method: "POST",
          body: {},
        });
        assert.ok(
          (await request("/me", { token: b.token })).notifications.every(
            (n) => n.read,
          ),
        );
        await request("/blocks/" + a.user.id, {
          token: b.token,
          method: "POST",
          body: {},
        });
        await request("/messages/" + b.user.id, {
          token: a.token,
          status: 403,
        });
        await request("/friends/" + b.user.id, {
          token: a.token,
          method: "POST",
          body: {},
          status: 404,
        });
        assert.equal(
          (
            await request(
              "/people?q=" + encodeURIComponent(`QA ${nonce} Bob`),
              { token: a.token },
            )
          ).length,
          0,
        );
        await request("/blocks/" + a.user.id, {
          token: b.token,
          method: "DELETE",
        });
      },
    );
    await t.test("deletion and logout revoke saved access", async () => {
      await request("/library/mexican", { token: a.token, method: "DELETE" });
      assert.ok(
        !(
          await request("/me", { token: a.token })
        ).collections[0].book_ids.includes("mexican"),
      );
      await request("/collections/" + collectionId, {
        token: a.token,
        method: "DELETE",
      });
      assert.equal(
        (await request("/me", { token: a.token })).collections.length,
        0,
      );
      await request("/logout", { token: a.token, method: "POST", body: {} });
      await request("/me", { token: a.token, status: 401 });
    });
  } finally {
    for (const id of created)
      await query("DELETE FROM ibook.users WHERE id=$1", [id]);
    await pool.end();
  }
});
