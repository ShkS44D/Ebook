ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS rights jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS formats jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1;
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS import_status text NOT NULL DEFAULT 'legacy';
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS popularity integer NOT NULL DEFAULT 0;
ALTER TABLE ibook.books ADD COLUMN IF NOT EXISTS toc jsonb NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS books_provider ON ibook.books(provider,provider_id);
CREATE TABLE IF NOT EXISTS ibook.book_chapters (
 book_id text NOT NULL REFERENCES ibook.books ON DELETE CASCADE,
 version integer NOT NULL, id text NOT NULL, ordinal integer NOT NULL,
 title text NOT NULL, html text NOT NULL, text text NOT NULL,
 blocks jsonb NOT NULL DEFAULT '[]', source_reference text,
 word_count integer NOT NULL, text_length integer NOT NULL,
 search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
 PRIMARY KEY(book_id,version,id), UNIQUE(book_id,version,ordinal)
);
CREATE INDEX IF NOT EXISTS chapter_search ON ibook.book_chapters USING gin(search_vector);
CREATE TABLE IF NOT EXISTS ibook.book_imports (
 id uuid PRIMARY KEY, book_id text NOT NULL REFERENCES ibook.books ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 source_url text, source_type text NOT NULL, source_key text,
 checksum text, report jsonb NOT NULL DEFAULT '{}', error text,
 auto_publish boolean NOT NULL DEFAULT false, created_by uuid REFERENCES ibook.users ON DELETE SET NULL,
 lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_book_import ON ibook.book_imports(book_id)
 WHERE status IN ('queued','downloading','parsing','validating','review');
CREATE TABLE IF NOT EXISTS ibook.book_assets (
 id text PRIMARY KEY, book_id text NOT NULL REFERENCES ibook.books ON DELETE CASCADE,
 mime text NOT NULL, storage_key text NOT NULL, public_url text, byte_size integer NOT NULL
);
CREATE TABLE IF NOT EXISTS ibook.provider_cache (
 key text PRIMARY KEY, payload jsonb NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE ibook.library ADD COLUMN IF NOT EXISTS reader_anchor jsonb;
