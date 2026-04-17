/* ════════════════════════════════════════════════
   api/leaderboard.js  —  Vercel Serverless Function
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
    return res.status(500).json({ error: "Server misconfiguration: missing env vars." });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("name, upload_count, score")
    .order("score", { ascending: false })
    .limit(8);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const leaderboard = (data || []).map((row) => ({
    name: String(row?.name || "User"),
    upload_count: Number(row?.upload_count) || 0,
    score: Number(row?.score) || 0,
  }));

  return res.json({ leaderboard });
};
