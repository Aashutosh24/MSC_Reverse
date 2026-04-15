/* ════════════════════════════════════════════════
   api/leaderboard.js  —  Vercel Serverless Function
   Returns top 8 users sorted by score (public read)
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY   // anon key is fine — profiles table allows public reads
);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data, error } = await supabase
    .from("profiles")
    .select("name, upload_count, score")
    .order("score", { ascending: false })
    .limit(8);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ leaderboard: data || [] });
};
