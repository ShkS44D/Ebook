CREATE TABLE IF NOT EXISTS ibook.reel_media (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 filename text UNIQUE NOT NULL, mime text NOT NULL, bytes bigint NOT NULL,
 duration_seconds real NOT NULL CHECK(duration_seconds BETWEEN 1 AND 90),
 created_at timestamptz NOT NULL DEFAULT now()
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
