-- ============================================================
-- PATCH — Run this in Supabase SQL Editor
-- Allows nickname-only (no login) inserts for comments & history
-- ============================================================

-- Drop old auth-required policies
DROP POLICY IF EXISTS "Authenticated users can comment"       ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can add history"   ON public.edit_history;
DROP POLICY IF EXISTS "Authenticated users can upsert overrides" ON public.event_overrides;

-- Allow anyone (anon key) to insert comments and history
CREATE POLICY "Anyone can insert comments"
  ON public.comments FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert edit history"
  ON public.edit_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can upsert event overrides"
  ON public.event_overrides FOR ALL WITH CHECK (true);

-- Make user_id nullable (no FK needed anymore)
ALTER TABLE public.comments     ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.edit_history ALTER COLUMN user_id DROP NOT NULL;
