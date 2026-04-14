-- ============================================================
-- SUPABASE SETUP — Kim's Family Visit Website
-- ============================================================
-- Paste this entire file into Supabase > SQL Editor > Run
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name      TEXT NOT NULL,
  is_host   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. COMMENTS & SUGGESTIONS
CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_id   TEXT NOT NULL,
  day_id     TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users,
  user_name  TEXT NOT NULL,
  content    TEXT NOT NULL,
  type       TEXT DEFAULT 'comment' CHECK (type IN ('comment', 'suggestion'))
);
CREATE INDEX IF NOT EXISTS comments_event_id_idx ON public.comments(event_id);
CREATE INDEX IF NOT EXISTS comments_day_id_idx   ON public.comments(day_id);

-- 3. EDIT HISTORY
CREATE TABLE IF NOT EXISTS public.edit_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  event_id   TEXT NOT NULL,
  day_id     TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users,
  user_name  TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);
CREATE INDEX IF NOT EXISTS edit_history_event_id_idx ON public.edit_history(event_id);

-- 4. EVENT OVERRIDES (persistent itinerary edits)
CREATE TABLE IF NOT EXISTS public.event_overrides (
  event_id        TEXT PRIMARY KEY,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_by_name TEXT
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_overrides ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, users can update their own
CREATE POLICY "Profiles viewable by all"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Comments: anyone can read, authenticated users can insert
CREATE POLICY "Comments viewable by all"
  ON public.comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Edit history: anyone can read, authenticated users can insert
CREATE POLICY "Edit history viewable by all"
  ON public.edit_history FOR SELECT USING (true);

CREATE POLICY "Authenticated users can add history"
  ON public.edit_history FOR INSERT TO authenticated
  WITH CHECK (true);

-- Event overrides: anyone can read, authenticated users can upsert
CREATE POLICY "Event overrides viewable by all"
  ON public.event_overrides FOR SELECT USING (true);

CREATE POLICY "Authenticated users can upsert overrides"
  ON public.event_overrides FOR ALL TO authenticated
  WITH CHECK (true);
