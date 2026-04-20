/* ════════════════════════════════════════════════
   ReverseIT — Public Supabase Config
   These are CLIENT-SIDE keys — safe to expose.
   Replace with your actual Supabase project values.
   Get them from: Supabase Dashboard → Project Settings → API
════════════════════════════════════════════════ */

const SUPABASE_URL = "https://ehtkervyhbakhunetebq.supabase.co";          // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodGtlcnZ5aGJha2h1bmV0ZWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDQ2MzUsImV4cCI6MjA5MjAyMDYzNX0.qVAoSG0HTIikjZkJ7-l-HA4q41LD9qLoVvi-BjU0-6g";     // starts with eyJ...

// Optional: set API base when frontend is served by a separate dev server (for example VS Code Live Server on 5500)
// Keep empty to use same-origin API routes.
const API_BASE_URL = window.location.port === "5500" ? "http://localhost:3000" : "";
