/*
# Create works table for evidence records

## Purpose
Stores copyright evidence records for musical works. Each record captures the
work metadata, a SHA-256 file hash, a digital fingerprint, and a registration
number. Audio files are stored in Supabase Storage (private bucket) and linked
via the `storage_path` column.

## New Tables

### works
- `id` (uuid, primary key — generated client-side for idempotency)
- `user_id` (uuid, not null, defaults to auth.uid() — references auth.users)
- `title` (text, not null, max 200 chars)
- `artist` (text, not null, max 200 chars)
- `co_artists` (text, default empty)
- `genre` (text, not null)
- `description` (text, default empty)
- `lyrics` (text, default empty)
- `date_created` (date, not null)
- `date_registered` (timestamptz, defaults to now)
- `registration_number` (text, not null, unique)
- `digital_fingerprint` (text, not null)
- `file_hash` (text, not null — SHA-256 hex)
- `file_name` (text, not null)
- `file_size` (bigint, not null)
- `file_type` (text, not null)
- `status` (text, not null, default 'registered')
- `storage_path` (text — path in the private audio bucket, nullable for local-only records)
- `created_at` (timestamptz, default now)

## Security
- RLS enabled on works.
- Owner-scoped CRUD: each authenticated user can only SELECT, INSERT, UPDATE, DELETE their own rows.
- user_id defaults to auth.uid() so client inserts that omit user_id still pass the WITH CHECK.
*/

CREATE TABLE IF NOT EXISTS public.works (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL,
  co_artists text NOT NULL DEFAULT '',
  genre text NOT NULL,
  description text NOT NULL DEFAULT '',
  lyrics text NOT NULL DEFAULT '',
  date_created date NOT NULL,
  date_registered timestamptz NOT NULL DEFAULT now(),
  registration_number text NOT NULL UNIQUE,
  digital_fingerprint text NOT NULL,
  file_hash text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  status text NOT NULL DEFAULT 'registered',
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS works_user_id_idx ON public.works(user_id);
CREATE INDEX IF NOT EXISTS works_date_registered_idx ON public.works(date_registered DESC);

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_works" ON public.works;
CREATE POLICY "select_own_works" ON public.works
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_works" ON public.works;
CREATE POLICY "insert_own_works" ON public.works
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_works" ON public.works;
CREATE POLICY "update_own_works" ON public.works
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_works" ON public.works;
CREATE POLICY "delete_own_works" ON public.works
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);