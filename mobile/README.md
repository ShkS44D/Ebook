# iBook

An Expo / React Native reading app with an Express API and Neon PostgreSQL storage. The existing visual components now support real account and reading workflows on web and native clients.

## Run locally

Requires Node.js 22.13 or newer and npm. The supplied Neon connection is configured in the local, ignored `.env` file. Do not commit this file or put database credentials in any `EXPO_PUBLIC_` variable.

```sh
npm install
npm run dev
```

Open **http://localhost:8081**. The API runs at **http://localhost:3001**. `npm run dev` starts both processes; you can also use `npm run server` and `npm run web` in separate terminals. Create your account in the app; there are no hard-coded users or passwords.

For another checkout, copy `.env.example` to `.env` and supply a PostgreSQL URL. API startup applies the idempotent schema and catalog seed. `npm run db:migrate` runs this step separately. All application tables live in the `ibook` schema, leaving unrelated database tables alone.

For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address, such as `http://192.168.1.20:3001`, restart Expo, and run `npm start`. Your phone must be able to reach that address. Use HTTPS for a deployed API. Native session tokens are stored in Expo SecureStore. Native builds were not verified on a simulator or device in this implementation.

## Working features

- Email/password sign-up, sign-in, persistent sessions, and sign-out with session revocation.
- Search and category filters using the database catalog, with genuine empty results.
- Private library saves, reading lists, finished books, and bookmarks.
- Create, rename, delete, and populate private collections; remove books individually.
- A four-chapter original reading guide, chapter navigation, saved position, reading time, completion, reader font size and background preferences.
- Text-file download for available content; native devices use their share sheet.
- Published ratings and reviews, including editing and deleting your own review.
- Profile changes, persisted appearance and notification settings, daily reading goals, and reading history.
- Reader search, friend requests, acceptance, removal, blocking/unblocking, and messaging between accepted friends.
- Stored in-app notifications and mark-as-read. Active chats refresh every five seconds.
- Native share sheets or web sharing/clipboard support.
- Page-linked reels: publish owned/approved video uploads or Instagram/YouTube/Vimeo links; play videos, like, save, comment, share, hide, report, and delete your own content.
- Personalized page feeds with recommendation explanations, saved filters, and watch-history reset. Appointed moderators can inspect reports and hide/restore reels.

Reading-day totals use UTC. The streak shown counts days with recorded reading time in the last 366 days. The reader records active time in batches; an abrupt browser or device shutdown can lose the last unsent batch (up to 30 seconds). Offline app synchronization is not implemented; download the available text for offline reading instead.

## Content and services

The named commercial books are **catalog entries only**. Their text is not supplied or fabricated. They can be saved and reviewed, but cannot be read, purchased, or downloaded. **A Small Guide to Reading** is original content included with this project, so the complete reading workflow is usable immediately.

Payments, paid memberships, gift codes, Apple/Google sign-in, SMS verification, and push notifications are unavailable. The app does not simulate payments or collect card details. In-app notifications are functional.

Password reset has a server implementation but requires `SMTP_URL` and `MAIL_FROM` before it can deliver email. Until configured, the API and UI explicitly report that reset delivery is unavailable. When configured, codes expire after 30 minutes, are stored only as hashes, and successful resets invalidate all account sessions. SMTP delivery was not tested because no email provider was supplied.

To add licensed content, insert or update a row in `ibook.books`: `chapters` is a JSON array of `{ "title": "Chapter title", "text": "Chapter text" }`; set `available=true` only when content is present and permitted for distribution. There is no administrative CMS in this release.

## Configuration and deployment

| Variable                | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`          | Server-only Neon connection string                          |
| `API_PORT`              | API port, defaults to 3001                                  |
| `EXPO_PUBLIC_API_URL`   | Public URL of the API, embedded when Expo builds the app    |
| `ALLOWED_ORIGINS`       | Comma-separated exact web origins allowed to access the API |
| `NODE_ENV=production`   | Enables secure web session cookies                          |
| `SMTP_URL`, `MAIL_FROM` | Optional password-reset email delivery                      |
| `MEDIA_DIR`            | Persistent disk directory for video files; defaults to `./media` |
| `REEL_MODERATOR_IDS`   | Comma-separated account UUIDs authorized to review reports |
| `EXPO_PUBLIC_WEB_URL`  | Deployed frontend origin used for native reel share links |

Deploy the web app and API behind the same HTTPS site (route `/api` to Express) or same-site HTTPS subdomains. Web sessions use HttpOnly, SameSite=Lax cookies; unrelated cross-site hosting is intentionally unsupported. Set `ALLOWED_ORIGINS` to the deployed frontend origin and configure the public API URL before building. If the API is behind a proxy, configure Express's trusted proxy hop count for that exact infrastructure before launch so rate limiting uses the correct client address; do not blindly trust all forwarded headers.

```sh
npm run build:web
npm run server
```

Serve `dist/` with a fallback to `index.html` for app routes. Supply server environment variables through the hosting provider's secret settings. This work runs locally and does not deploy a public service.

Before a public launch, the operator still needs real terms/contact details, content rights, a deployment/backup plan, and any desired payment/email integrations. See the in-app help and privacy information for current data visibility. Messages are not end-to-end encrypted.

## Validation

```sh
npm run typecheck
npm run test:api   # run against the local API with the same DATABASE_URL
npm run test:reels # ranking plus real PostgreSQL/video API workflows
npm run build:web
```

The API integration tests create uniquely named test accounts in the configured database and remove only those accounts afterward. They exercise authentication, invalid input, catalog search, progress persistence, collection ownership and rollback, profiles, reviews, friend acceptance, messaging permissions, blocking, notifications, deletion, and session revocation. Do not point the tests at an unrelated API/database pair.

Browser QA exercises sign-up, reload persistence, collections, search, reviews, settings, goals, downloading, and login/logout at phone and desktop sizes. Browser verification artifacts are kept outside the repository.

The dependency audit currently reports moderate advisories in the existing Expo / React Navigation dependency trees. Suggested automatic fixes include incompatible downgrades; these were not applied. Review upstream compatible releases before public deployment.

## Page reels

Every available reading page has a reels section. In the current reader, a page is a **chapter entry**, identified by `(book_id, zero-based chapter index)`; it is independent of screen size or font size. Keep chapter indexes stable once people publish reels. Adding true ebook pagination will require stable content anchors and an anchor migration. The four guide chapters have starter clips; catalog-only books still cannot be opened without licensed text.

Readers can upload MP4/WebM videos of 1–90 seconds and up to 50 MB, or share HTTPS Instagram, YouTube and Vimeo post links. The server probes uploaded files rather than trusting their extensions, accepts supported video codecs, and checks upload ownership before publishing. There is a 50-upload quota per account and a combined 30 upload/publish operations per account per hour. Unpublished uploads are removed when the form is closed normally. Unexpected shutdowns can leave unpublished uploads; an operator should periodically review and remove abandoned files/rows. The tiny test MP4 is an original generated three-second color card, not third-party footage.

Uploaded videos play inside iBook. External links open on their original platforms; iBook does not download Instagram content, scrape accounts, or claim to measure external watch completion. Public share links use `/reels/:reelId` and preserve the linked reading page. Web also supports copying the link. Set `EXPO_PUBLIC_WEB_URL` for native HTTPS share links; otherwise native shares use `ibook://`, which requires the installed app. A localhost link is only useful on the development computer. A deployed web host must fall back to `index.html` for these routes.

Video files live on the API server's persistent disk, while Neon stores their metadata, relationships and engagement. Back up **both** Neon and `MEDIA_DIR`. The API needs permission to execute the bundled ffprobe binary. This disk-backed implementation targets a single persistent API instance: ephemeral/serverless hosts or multiple replicas require shared object storage/CDN and a media processing pipeline before deployment. Original uploads are served with byte-range support; adaptive bitrate/transcoding and automatic content moderation are not implemented.

### Starter-video provenance

The starter clips are streamed from public Pexels URLs and seeded idempotently, with source links, creator credits and license records. They are illustrative footage matched by original captions to the guide's ideas, not adaptations of commercial book text. The [Pexels License](https://www.pexels.com/license/) permits reuse. A remote provider can remove or change a clip; playback errors are shown in the app.

| Guide page | Clip | Creator |
| --- | --- | --- |
| 1 · A place to begin | [A person reading a book](https://www.pexels.com/video/a-person-reading-a-book-6771541/) | Max Vakhtbovych |
| 2 · Read with a question | [Woman taking notes from a book](https://www.pexels.com/video/woman-taking-notes-from-a-book-6549538/) | Tima Miroshnichenko |
| 3 · Make room for different books | [Books in the library](https://www.pexels.com/video/books-in-the-library-1580502/) | Adailton Batista |
| 4 · Carry the story forward | [People reading books](https://www.pexels.com/video/people-reading-books-8199375/) | Yan Krukau |

### Recommendation behavior and limits

`server/reel-ranking.mjs` implements the versioned `page-context-v1` cold-start ranker. It prioritizes exact page attachment, then uses TF-IDF text similarity, tag interests from likes/saves/shares/watch completion, bounded Bayesian engagement quality, freshness and unseen clips. Greedy reranking discourages repeating one creator or near-identical descriptions. Hidden reels and mutually blocked creators are excluded. Other pages of the same book are excluded to reduce accidental spoilers; relevance still depends on honest captions and page assignments, so reporting and human moderation remain necessary.

The API considers at most 250 candidates and 200 recent preference records per request, returns 12 results, and supports an exclusion list for browsing up to 100 results per session. The saved tab filters saved reels related to the current page. Watch updates are authenticated, bound to an expiring playback session, capped by elapsed server time and clip duration, and applied as nonnegative deltas. Unique-reader quality signals exclude the creator and do not multiply from repeated likes. The client excludes seeking, background time and pauses; brief unsent telemetry may be lost when a device closes. Viewing reels on a separate screen does not count toward reading time.

This is an explainable starting algorithm, **not an Instagram-scale trained recommender**. Production-quality semantic retrieval, collaborative ranking, robust fraud detection and diversity tuning require an actual clip catalog, relevance judgments, traffic and evaluation. At larger scale, replace bounded candidate scans with indexed retrieval/embeddings and precomputed aggregates, and evaluate page relevance, creator coverage and retention before tuning weights. This implementation does not claim those evaluations have already happened.

### Reports and access

Published reels and their share links are public. Blocking removes creators from authenticated discovery; it does not make public URLs private. Reports immediately hide a reel from the reporting reader and enter the moderator queue. Configure trusted account UUIDs in server-only `REEL_MODERATOR_IDS`, restart the API, then open Settings → Review reported reels. This role is enforced server-side and cannot be set through profile updates. Moderators can preview even hidden uploads through a signed five-minute review URL, and hide or restore publication. There is no automatic takedown based solely on report count.

Users can delete their own reels/comments, unlike, unsave, hide clips or reset watch history. Reset preserves explicit likes and saves. Operators should schedule cleanup of expired `ibook.reel_views` (older than one hour); aggregated preferences stay until reset. User-uploaded content is published immediately after validation and rights confirmation; configure a moderator and an operational review process before opening registration publicly.

Reels tests cover cold-start relevance, interest ordering, creator diversity, spoilers from other pages, authorization, source validation, upload ownership and file validation, byte-range streaming, idempotent engagement, watch-time limits, comments, reports, reset, blocks and deletion. Browser QA additionally verifies actual starter/uploaded playback, phone/desktop layout, publish/reload, sharing and opening the exact page. Native device playback and native share-sheet interactions require device testing.
