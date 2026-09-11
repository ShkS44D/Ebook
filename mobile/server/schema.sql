CREATE SCHEMA IF NOT EXISTS ibook;
CREATE TABLE IF NOT EXISTS ibook.users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 name text NOT NULL, bio text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 goal integer NOT NULL DEFAULT 20 CHECK(goal BETWEEN 5 AND 180),
 dark boolean NOT NULL DEFAULT false, notifications boolean NOT NULL DEFAULT true,
 reader_settings jsonb NOT NULL DEFAULT '{"fontSize":18,"theme":"paper"}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ibook.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ibook.books (
 id text PRIMARY KEY, title text NOT NULL, author text NOT NULL, category text NOT NULL,
 description text NOT NULL, chapters jsonb NOT NULL DEFAULT '[]', available boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS ibook.library (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, book_id text NOT NULL REFERENCES ibook.books,
 page integer NOT NULL DEFAULT 0 CHECK(page >= 0), finished boolean NOT NULL DEFAULT false,
 bookmarked boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,book_id)
);
CREATE TABLE IF NOT EXISTS ibook.collections (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,name)
);
CREATE TABLE IF NOT EXISTS ibook.collection_books (
 collection_id uuid NOT NULL REFERENCES ibook.collections ON DELETE CASCADE, book_id text NOT NULL REFERENCES ibook.books,
 PRIMARY KEY(collection_id,book_id)
);
CREATE TABLE IF NOT EXISTS ibook.reviews (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, book_id text NOT NULL REFERENCES ibook.books,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,book_id)
);
CREATE TABLE IF NOT EXISTS ibook.reading_days (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, day date NOT NULL DEFAULT CURRENT_DATE,
 seconds integer NOT NULL DEFAULT 0 CHECK(seconds >= 0), PRIMARY KEY(user_id,day)
);
CREATE TABLE IF NOT EXISTS ibook.friends (
 sender uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, recipient uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(sender,recipient), CHECK(sender <> recipient)
);
CREATE UNIQUE INDEX IF NOT EXISTS friends_pair ON ibook.friends(LEAST(sender,recipient),GREATEST(sender,recipient));
CREATE TABLE IF NOT EXISTS ibook.blocks (
 user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, blocked_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 PRIMARY KEY(user_id,blocked_id), CHECK(user_id <> blocked_id)
);
CREATE TABLE IF NOT EXISTS ibook.messages (
 id uuid PRIMARY KEY, sender uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, recipient uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation ON ibook.messages(sender,recipient,created_at);
CREATE TABLE IF NOT EXISTS ibook.notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, body text NOT NULL,
 read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ibook.resets (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES ibook.users ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
