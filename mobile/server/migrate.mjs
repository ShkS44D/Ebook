import { readFile } from "node:fs/promises";
import { query, transaction, pool } from "./db.mjs";
export async function migrate() {
  await transaction(async (q) => {
    await q("SELECT pg_advisory_xact_lock(19782921)");
    await q(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await q(await readFile(new URL("./books-schema.sql", import.meta.url), "utf8"));
    await q(
      await readFile(new URL("./reels-schema.sql", import.meta.url), "utf8"),
    );
  });
  const source = await readFile(
    new URL("../src/data.ts", import.meta.url),
    "utf8",
  );
  const items = [...source.matchAll(/\["([a-z]+)", "([^"]+)", "([^"]+)"\]/g)];
  const genres = {
    mexican: "Horror",
    murder: "Horror",
    burning: "History",
    immortal: "Fantasy",
    olive: "History",
    gold: "History",
    red: "History",
    bestiary: "Fantasy",
    love: "Romance",
    rain: "History",
    ready: "Fantasy",
    invisible: "Horror",
    flies: "Horror",
    kevin: "Horror",
    carrion: "Horror",
  };
  for (const [, id, title, author] of items) {
    await query(
      "INSERT INTO ibook.books(id,title,author,category,description) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      [
        id,
        title,
        author,
        genres[id] || "Arts",
        `${title} by ${author}. Save this title to your reading list and share your review. The full text is not currently available in iBook.`,
      ],
    );
  }
  const chapters = [
    {
      title: "A place to begin",
      text: "A reading habit begins with a small promise. Choose a quiet moment that already exists in your day: after breakfast, on a break, or before bed. Set a book nearby before that moment arrives.\n\nYou do not need to finish a chapter every time. A few attentive pages are enough. When your mind wanders, pause and return to the last sentence you remember. Reading is an invitation to notice, not a race to finish.\n\nTry this today: choose a comfortable place, silence one distraction, and read for five minutes. Stop while you still feel curious. Tomorrow, that curiosity will make it easier to begin again.",
    },
    {
      title: "Read with a question",
      text: "Before opening a book, ask what you hope to discover. In a story, you might wonder what a character wants and what stands in the way. In a practical book, you might look for one idea you can try.\n\nKeep your question loose. A book can lead somewhere unexpected, and changing your mind is part of the experience. If a passage feels important, reread it slowly. Put the idea into your own words instead of trying to remember every sentence.\n\nAt the end of a session, name one thing that surprised you. That small act of reflection gives the next reading session a place to start.",
    },
    {
      title: "Make room for different books",
      text: "Some books invite fast reading; others ask you to linger. You can enjoy both. Try alternating a demanding book with a lighter one, or a familiar genre with something new.\n\nA collection can help organize that curiosity. Keep a list of books you want to read, books you are reading, and books you want to discuss. These lists belong to you: there is no correct size or required pace.\n\nIt is also fine to set a book aside. A book that does not fit today may find its moment later. Let your reading life have room to change.",
    },
    {
      title: "Carry the story forward",
      text: "Finishing a book creates a useful pause. Before choosing the next one, think about what stayed with you: an image, a question, a useful explanation, or a feeling you cannot quite name.\n\nWrite a short review in your own words. Describe what worked for you and who else might enjoy the book. You can be honest without treating your experience as universal. Avoid giving away a major ending unless the reader has asked for it.\n\nMost of all, let reading connect to the rest of life. Talk about an idea with a friend, notice a detail on a walk, or try something you learned. A finished book can be the beginning of a conversation.",
    },
  ];
  await query(
    "INSERT INTO ibook.books(id,title,author,category,description,chapters,available) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(id) DO NOTHING",
    [
      "reading-guide",
      "A Small Guide to Reading",
      "iBook",
      "Self-Help",
      "An original four-chapter guide included with iBook. Free to read, save, and download.",
      JSON.stringify(chapters),
    ],
  );
  // The reel catalogue intentionally starts empty. Administrators publish
  // reviewed passage reels from the app; no demo footage is inserted.
  const seeds = JSON.parse(await readFile(new URL("./reel-seeds.json", import.meta.url), "utf8"));
  await query("DELETE FROM ibook.reels WHERE id=ANY($1::uuid[]) AND creator_id IS NULL", [seeds.map((r) => r.id)]);
}
if (process.argv[1]?.endsWith("migrate.mjs")) {
  try {
    await migrate();
    console.log("Database migration and catalog seed complete.");
  } finally {
    await pool.end();
  }
}
