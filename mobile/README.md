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

Every available chapter has a reels section, opened from the reader menu. Reels remain identified by `(book_id, zero-based chapter index)`, independent of the reader's display pagination. Keep chapter indexes stable once people publish reels. The four guide chapters have starter clips; catalog-only books still cannot be opened without licensed text.

### Reader controls

Tap the reading text or page number to open the floating menu. Contents lists chapters with their current display page numbers and a separate bookmarks tab. Search finds literal, case-insensitive matches in the available full text, shows snippets (up to 200 matches), and opens and highlights the selected passage. Previous/next buttons and horizontal swipes turn pages; the scrolling control switches to continuous reading. Finish book saves completion.

Original, Quiet, Paper, Bold, Calm, and Focus themes include font-size controls and a customization preview. Choose serif, sans serif, or monospace; toggle bold; adjust line spacing, character spacing, word spacing, margins and justification. Customization applies with the checkmark or cancels with the close button. Reset Theme restores the selected preset. Done saves preferences to the account. Fonts use available system families rather than Apple's proprietary Canela font. Native word spacing is approximated using hair spaces.

The reader estimates display page breaks from the viewport and typography, with overflow scrolling to keep all text reachable. Display page totals can change with layout. Saved positions and individual bookmarks use a chapter index plus an original-text character offset, so reflow does not invalidate them. The existing library `page` field and reel links retain their chapter semantics. Schema startup migration adds `reader_offset` and `bookmarks` without removing existing library data. Scrolling debounces position saves; page navigation waits for a successful save and reports connection errors.

Light, Dark and Match Device work on all platforms. Match Surroundings uses the ambient light sensor when available (typically Android); unsupported devices show the option as unavailable. Native brightness changes are restored when leaving the reader; web adjusts page brightness only. Rotation lock uses the device API and reports unsupported browsers. iPad builds require full-screen mode for rotation locking. Rebuild native apps after installing the new Expo modules.

Share opens the real native or browser share sheet, with clipboard fallback on browsers without Web Share. Targets such as AirDrop, Mail or Notes are supplied by the operating system and installed apps. Reading links include chapter and offset; native links use `EXPO_PUBLIC_WEB_URL` when configured or `ibook://` otherwise.

Validation: `npm run test:reader` covers reflow, literal search, legacy preferences and validation; `npm run test:api` covers database persistence, invalid positions and account isolation. Run `npm run typecheck` and `npm run build:web` for compile checks. Native brightness, orientation, sensors and share targets still need real-device testing.

Readers can upload MP4/WebM videos of 1–90 seconds and up to 50 MB, or share HTTPS Instagram, YouTube and Vimeo post links. The server probes uploaded files rather than trusting their extensions, accepts supported video codecs, and checks upload ownership before publishing. There is a 50-upload quota per account and a combined 30 upload/publish operations per account per hour. Unpublished uploads are removed when the form is closed normally. Unexpected shutdowns can leave unpublished uploads; an operator should periodically review and remove abandoned files/rows. The tiny test MP4 is an original generated three-second color card, not third-party footage.

Uploaded videos play inside iBook. External links open on their original platforms; iBook does not download Instagram content, scrape accounts, or claim to measure external watch completion. Public share links use `/reels/:reelId` and preserve the linked reading page. Web also supports copying the link. Set `EXPO_PUBLIC_WEB_URL` for native HTTPS share links; otherwise native shares use `ibook://`, which requires the installed app. A localhost link is only useful on the development computer. A deployed web host must fall back to `index.html` for these routes.

Locally, video files live in `MEDIA_DIR`. On Vercel, `BLOB_READ_WRITE_TOKEN` enables direct client uploads to Vercel Blob; Neon stores metadata, ownership and engagement. Upload tokens are short-lived and restricted to one generated path, supported content types and 50 MB. The completion endpoint checks ownership, downloads the object to temporary storage and validates its actual format, codec and duration with ffprobe before creating a reel-media record. Playback redirects to Blob for range support. Unfinished upload intents expire; the next upload from that account cleans up expired objects. Blob URLs are public, so a previously shared URL remains accessible until its object is deleted. Adaptive bitrate/transcoding and automatic content moderation are not implemented.

### Vercel deployment

The Vercel project uses `mobile` as its root, exports the Expo web app into `dist`, and serves Express through `api/index.mjs`. `vercel.json` routes API requests separately from app deep links. The build runs the idempotent database migration. In production, web API calls use the same origin; set `EXPO_PUBLIC_API_URL` only for a separately hosted API or native build.

Set server-only `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, and `REEL_REVIEW_SECRET` in Vercel. Add custom domains to `ALLOWED_ORIGINS`; Vercel's deployment and production hosts are included automatically. Keep `.env*` and `.vercel` files out of Git and deployment uploads. From the linked repository root run `vercel deploy --prod`. GitHub auto-deploy requires connecting the GitHub account in Vercel, then linking `ShkS44D/Ebook` with root directory `mobile`.

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
