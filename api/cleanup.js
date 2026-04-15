/* ════════════════════════════════════════════════
   api/cleanup.js  —  Vercel Cron (runs daily 02:00 UTC)
   Deletes uploads older than 24 hours from both
   Supabase Storage and the uploads DB table.
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // ── Security: only Vercel cron or authorised callers ──
  const auth = (req.headers.authorization || "").split(" ")[1];
  if (auth !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Find old uploads ─────────────────────────────────
  const { data: old, error: fetchErr } = await supabase
    .from("uploads")
    .select("id, file_path")
    .lt("uploaded_at", oneDayAgo);

  if (fetchErr) {
    console.error("Cleanup fetch error:", fetchErr.message);
    return res.status(500).json({ error: fetchErr.message });
  }

  if (!old || old.length === 0) {
    return res.json({ deleted: 0, message: "Nothing to clean up." });
  }

  // ── Delete from Supabase Storage ──────────────────────
  const paths = old.map((u) => u.file_path);
  const { error: storageErr } = await supabase.storage.from("documents").remove(paths);
  if (storageErr) console.warn("Storage delete partial error:", storageErr.message);

  // ── Delete from DB ────────────────────────────────────
  const ids = old.map((u) => u.id);
  const { error: dbErr } = await supabase.from("uploads").delete().in("id", ids);
  if (dbErr) console.warn("DB delete partial error:", dbErr.message);

  console.log(`✅ Cleanup: deleted ${old.length} files`);
  return res.json({ deleted: old.length, message: `Cleaned up ${old.length} file(s).` });
};
