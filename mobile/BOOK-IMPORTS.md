# Book ingestion and catalogue

The existing Expo reader now consumes normalized chapters through the existing API. Catalogue search is paginated and virtualized. It offers the local library, Gutenberg metadata through Gutendex, Google Books previews, and Open Library editions. Google/Open Library results link to their providers; they do not imply full-text rights.

## Start locally

Set DATABASE_URL in `.env`, then:

```sh
npm ci
npm run db:migrate
npm run books -- sync 320
npm run books -- queue 32 --publish-clean
npm run books -- work 32
npm run dev
```

`dev` runs the API, Expo, and a durable queue worker. `books:worker` can instead run as its own supervised process. Sync imports metadata only. Queue creates idempotent jobs; work downloads and parses full books. `--publish-clean` authorizes publication only when validation has no warnings. Other imports wait in the administrator's review screen. Explicitly confirm distribution rights for the countries served by your deployment; Gutendex's public-domain classification is US-specific.

Books are downloaded from Gutenberg's designated mirror, not scraped from its website. The dynamic `/ebooks/<id>.epub3.images` metadata links are translated to static mirror files. Downloads are capped at 30 MB, expanded EPUBs at 100 MB, with a 2.5-second gap between worker jobs. EPUB is preferred, followed by HTML/PDF download fallbacks. Heavy parsing occurs in the worker, not in an HTTP request.

## Production worker and storage

Create/configure a **private** Vercel Blob store and set `BOOK_BLOB_READ_WRITE_TOKEN` on both the existing Vercel API and its worker. Source files stay private. Published illustrations are served through `/api/book-assets/:id`. Local storage is useful for development but is not a substitute for shared production storage. Existing local imports must have their source/assets transferred before hosting the new image API elsewhere.

The supplied GitHub Actions worker runs every 30 minutes and supports manual dispatch. It requires repository secrets `DATABASE_URL` and `BOOK_BLOB_READ_WRITE_TOKEN`. It processes existing queued jobs only; it does not bulk-publish unreviewed uploads. Published files remain in Blob between runs. An external supervised Node worker is also supported. Vercel request timeouts are not used as a background processing mechanism.

Set `BOOK_ADMIN_IDS` to trusted account UUIDs. Those users see **Profile → Book imports**. The API enforces the same role. They can upload an authorized EPUB/HTML/PDF, inspect chapter previews and validation results, download the original, and publish reviewed editions. Do not put administrator credentials or database/storage tokens in Expo public variables.

## Storage and compatibility

- `books`: catalogue metadata, source/license, language, formats, immutable content version and TOC.
- `book_chapters`: chapter text, sanitized HTML, formatting spans, images/anchors, word counts and search index.
- `book_imports`: durable queue, leases, attempts, file checksum, original-file key, validation reports and status.
- `book_assets`: storage references to images, never image data inside the database.
- `provider_cache`: provider responses cached for an hour.

Published editions cannot be overwritten. Import corrections as a new edition ID, preserving existing bookmarks and links. Reading progress retains the existing chapter/offset contract and adds a versioned chapter anchor. Text offsets and text lengths use JavaScript UTF-16 units consistently.

A temporary plain-text snapshot is written to the legacy `books.chapters` column at publication to support the already-deployed reader during rollout. New reader calls use normalized rows. Remove the snapshot only after older clients have migrated.

## Reader behavior

The contents endpoint returns chapter IDs, titles, lengths and reading order. The selected chapter loads first; the next is prefetched. Page totals for unloaded chapters are estimated until that chapter is loaded and word boundaries are known. Bookmarks use source offsets, so theme/font changes do not change the saved passage. Scroll mode renders the current chapter to avoid mounting thousands of pages.

Safe formatting spans preserve emphasis and link to internal footnotes. Raster illustrations are stored and rewritten to controlled asset URLs. Imported scripts, inline events, arbitrary CSS, remote fonts and embedded frames never run inside the app. Source fonts are intentionally replaced with the reader's accessible font controls.

Previously fetched chapter data is cached for reconnects. Web cache is bounded to 150 records; native content uses the OS cache directory and may be evicted. This is a chapter cache, not a guarantee that an entire unvisited book is available offline. Authentication and progress sync still require connectivity. A plain-text download remains available through the existing Download screen.

## PDF and OCR

PDF.js extracts text in page order. PDF imports always require manual quality review for columns, paragraph breaks and repeated headers. Scanned pages are detected and publication is blocked until usable text is available. Installing OCRmyPDF/Tesseract on the durable worker and setting `BOOK_OCR_EXECUTABLE` enables the optional OCR pass. OCR is not silently substituted with invented text. The original PDF is retained for download/comparison. A full native fixed-layout PDF viewer and commercial DRM/licensing are separate integrations, not supplied by a catalogue API.

## API

```
GET  /api/catalog/search?provider=local|gutenberg|google|openlibrary&q=&page=1&language=en
POST /api/catalog/import { id: "gutenberg-1342" }   (signed-in users, rate limited)
GET  /api/books/:id?metadata=1
GET  /api/books/:id/contents
GET  /api/books/:id/chapters/:chapterId
GET  /api/books/:id/search?q=passage
GET  /api/admin/imports
POST /api/admin/imports { bookId: "..." }
POST /api/admin/upload                           (multipart file + metadata + rights)
GET  /api/admin/imports/:id
GET  /api/admin/imports/:id/source
POST /api/admin/imports/:id/publish
```

## Verification

`npm run test:books` runs parser/security fixtures and, when `TEST_API_URL` is set, imported-book API integration checks. `npm run test:reader`, `npm run test:api`, `npm run typecheck`, and `npm run build:web` verify the existing app. The book API suite creates a temporary reader account and removes it afterward.

### Continuation checkpoint — 2026-09-15

- Database observed: 29 published Gutenberg imports, 280 discoverable entries, four failed imports, and 19 legacy entries. No jobs were queued or running. The four failed titles report download timeouts; they have not been retried in this verification pass.
- All 105 asset records belonging to published imports have readable backing files in the current storage environment.
- Fixed stale asynchronous reader responses, pagination of explicit blank lines, and exiting a directly opened reader when navigation has no back history. Pagination preserves source text and saved offsets.
- Added regression coverage for within-chapter EPUB contents anchors and blank-line pagination. Imported-book integration checks now require three published Gutenberg books and validate their first/last chapters and contents references.
- Passed: nine import/API tests (with `TEST_API_URL=http://localhost:3001/api`), six reader tests, eight account/API tests, twelve reels tests, TypeScript checking, and web export.
- Browser verified against the local API: account creation, Moby-Dick contents/search navigation, saved bookmark and Calm theme, reading-position restoration after reload, mobile layout at 390×844, desktop layout, direct-link exit, and catalogue page-two loading. Native device execution, OCR execution, and administrator upload/review were not exercised in this pass.
- Local dependency execute permissions were repaired for Expo, dotslash, and ffprobe. The initial video test failure came from ffprobe lacking execute permission; the complete reels suite passed after repair.

This checkpoint is a local verification, not a production deployment. Shared private storage, transfer of existing local assets, worker secrets, and administrator IDs still need to be confirmed for the production environment. Full-book offline downloads, a fixed-layout PDF viewer, and licensed commercial distribution remain later rollout work.

### Windows continuation and production setup

The nine updated source, test and documentation files from `book reading app 2.zip` were merged into the existing checkout. Machine-specific dependencies and credentials were excluded. Missing content-addressed storage files were restored only after checking their hashes.

The existing Vercel project now has a dedicated private book Blob store, separate from video storage. `BOOK_BLOB_READ_WRITE_TOKEN` is configured for the app and GitHub worker, and `BOOK_ADMIN_IDS` identifies the requested existing administrator account. The scheduled worker processes the persistent queue twice an hour; manual runs can set the batch size. The initial expansion targets at least 300 validated, readable Gutenberg editions, ordered by provider popularity.

`node server/books/migrate-storage.mjs` transfers local source files and illustrations to private storage. `node server/books/recover-storage.mjs` restores missing files from original provider editions, matching image hashes before updating references. Neither tool modifies published chapter text or saved reader offsets. Both can be rerun after interruption.
