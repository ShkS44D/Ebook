CREATE TABLE IF NOT EXISTS ibook.reel_media (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 filename text UNIQUE NOT NULL, mime text NOT NULL, bytes bigint NOT NULL,
 duration_seconds real NOT NULL CHECK(duration_seconds BETWEEN 1 AND 90),
 data bytea,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ibook.reel_media ADD COLUMN IF NOT EXISTS data bytea;
CREATE TABLE IF NOT EXISTS ibook.reel_upload_intents (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 pathname text UNIQUE NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ibook.reels (
 id uuid PRIMARY KEY, creator_id uuid REFERENCES ibook.users ON DELETE CASCADE,
 book_id text NOT NULL REFERENCES ibook.books, page integer NOT NULL CHECK(page>=0),
 title text NOT NULL, caption text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}',
 media_id uuid UNIQUE REFERENCES ibook.reel_media, video_url text, external_url text,
 source_url text NOT NULL DEFAULT '', attribution text NOT NULL, license text NOT NULL,
 duration_seconds real NOT NULL DEFAULT 30 CHECK(duration_seconds BETWEEN 1 AND 90),
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(media_id,video_url,external_url)=1)
);

-- Passage anchors are stable across screen sizes, fonts and reader themes.
-- They are derived from canonical chapter text and versioned with the book.
CREATE TABLE IF NOT EXISTS ibook.book_passages (
 id uuid PRIMARY KEY,
 book_id text NOT NULL REFERENCES ibook.books ON DELETE CASCADE,
 content_version integer NOT NULL,
 chapter_id text NOT NULL,
 start_offset integer NOT NULL CHECK(start_offset>=0),
 end_offset integer NOT NULL CHECK(end_offset>=start_offset),
 passage_hash text NOT NULL,
 preview_text text NOT NULL DEFAULT '',
 sequence_number integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(book_id,content_version,chapter_id,start_offset,end_offset)
);
CREATE INDEX IF NOT EXISTS book_passages_lookup ON ibook.book_passages(book_id,content_version,chapter_id,start_offset,end_offset);

ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS chapter_id text;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS passage_id uuid REFERENCES ibook.book_passages ON DELETE SET NULL;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS start_offset integer NOT NULL DEFAULT 0;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS end_offset integer NOT NULL DEFAULT 0;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS reel_scope text NOT NULL DEFAULT 'passage';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'editorial';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS spoiler_level text NOT NULL DEFAULT 'through_current_passage';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS preview_text text NOT NULL DEFAULT '';
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE ibook.reels ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ibook.reels ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE ibook.reels DROP CONSTRAINT IF EXISTS reels_status_check;
ALTER TABLE ibook.reels ADD CONSTRAINT reels_status_check CHECK(status IN ('draft','uploading','processing','ready','published','failed','hidden','archived'));
ALTER TABLE ibook.reels DROP CONSTRAINT IF EXISTS reels_reel_scope_check;
ALTER TABLE ibook.reels ADD CONSTRAINT reels_reel_scope_check CHECK(reel_scope IN ('passage','chapter','book'));
ALTER TABLE ibook.reels DROP CONSTRAINT IF EXISTS reels_source_type_check;
ALTER TABLE ibook.reels ADD CONSTRAINT reels_source_type_check CHECK(source_type IN ('editorial','community'));
ALTER TABLE ibook.reels DROP CONSTRAINT IF EXISTS reels_visibility_check;
ALTER TABLE ibook.reels ADD CONSTRAINT reels_visibility_check CHECK(visibility IN ('public','unlisted','private'));
ALTER TABLE ibook.reels DROP CONSTRAINT IF EXISTS reels_spoiler_level_check;
ALTER TABLE ibook.reels ADD CONSTRAINT reels_spoiler_level_check CHECK(spoiler_level IN ('none','through_current_passage','chapter_spoiler','book_spoiler'));
CREATE INDEX IF NOT EXISTS reels_passage_lookup ON ibook.reels(book_id,content_version,chapter_id,start_offset,end_offset,created_at DESC) WHERE status='published' AND visibility='public';

CREATE TABLE IF NOT EXISTS ibook.reel_moderation_events (
 id uuid PRIMARY KEY,
 reel_id uuid NOT NULL REFERENCES ibook.reels ON DELETE CASCADE,
 moderator_id uuid REFERENCES ibook.users ON DELETE SET NULL,
 action text NOT NULL,
 reason text NOT NULL DEFAULT '',
 previous_status text,
 new_status text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_moderation_history ON ibook.reel_moderation_events(reel_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reels_page ON ibook.reels(book_id,page,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS reels_tags ON ibook.reels USING gin(tags);
CREATE TABLE IF NOT EXISTS ibook.reel_reactions (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 reel_id uuid NOT NULL REFERENCES ibook.reels ON DELETE CASCADE,
 liked boolean NOT NULL DEFAULT false, saved boolean NOT NULL DEFAULT false,
 hidden boolean NOT NULL DEFAULT false, shared boolean NOT NULL DEFAULT false,
 max_completion real NOT NULL DEFAULT 0 CHECK(max_completion BETWEEN 0 AND 1),
 impressions integer NOT NULL DEFAULT 0, watch_seconds real NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,reel_id)
);
CREATE TABLE IF NOT EXISTS ibook.reel_views (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 reel_id uuid NOT NULL REFERENCES ibook.reels ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), last_watch_seconds real NOT NULL DEFAULT 0,
 last_ping_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id)
);
CREATE INDEX IF NOT EXISTS reel_views_expiry ON ibook.reel_views(created_at);
CREATE TABLE IF NOT EXISTS ibook.reel_comments (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 reel_id uuid NOT NULL REFERENCES ibook.reels ON DELETE CASCADE,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_comments_thread ON ibook.reel_comments(reel_id,created_at);
CREATE TABLE IF NOT EXISTS ibook.reel_reports (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 reel_id uuid NOT NULL REFERENCES ibook.reels ON DELETE CASCADE,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,reel_id)
);
CREATE INDEX IF NOT EXISTS reel_media_owner ON ibook.reel_media(owner_id);
CREATE INDEX IF NOT EXISTS reel_reactions_reel ON ibook.reel_reactions(reel_id);
CREATE INDEX IF NOT EXISTS reel_reactions_preferences ON ibook.reel_reactions(user_id,updated_at DESC);
