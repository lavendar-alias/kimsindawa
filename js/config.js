// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
// To enable multi-device comments, auth, and edit history:
// 1. Go to https://supabase.com and create a free account
// 2. Create a new project
// 3. Go to Project Settings > API
// 4. Copy your Project URL and anon/public key below
// 5. Run supabase-setup.sql in your Supabase SQL editor
//
// Without Supabase, the site works in "local mode" —
// comments and edits are stored locally in this browser only.
// ============================================================

const SUPABASE_URL    = 'https://dsatrdpxyqijpgokwcaj.supabase.co';   // e.g. 'https://xyzabc.supabase.co'
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYXRyZHB4eXFpanBnb2t3Y2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjM4NDAsImV4cCI6MjA5MTY5OTg0MH0.RhrW41HzqgCWzRC1OUjEaWk--HBL0Pdvr5Eiq_3Mo5Y';

// Host email — this account gets edit privileges
const HOST_EMAIL = 'reinaalois@gmail.com';        // e.g. 'kim@example.com'

// ─── DO NOT EDIT BELOW THIS LINE ───────────────────────────

const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON);

let supabase = null;
if (USE_SUPABASE) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
}
