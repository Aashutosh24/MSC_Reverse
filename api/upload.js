/* ════════════════════════════════════════════════
   api/upload.js  —  Vercel Serverless Function
   Auth-gated PDF upload → Supabase Storage
   Also records metadata + increments user score
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");
const formidable = require("formidable");
const fs = require("fs");

// Disable Vercel's default body parser so formidable can read the stream
module.exports.config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // server-side only — never expose this key in the browser
);

module.exports = async (req, res) => {
  // ── CORS preflight ────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth check ────────────────────────────────────────
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Not authenticated. Please login first." });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ success: false, message: "Session expired. Please login again." });
  }

  // ── Parse multipart form ──────────────────────────────
  const form = formidable({ maxFileSize: 50 * 1024 * 1024 });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }

  const fileArr = files.document;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!file) {
    return res.status(400).json({ success: false, message: "No file received." });
  }

  // ── Validate extension ────────────────────────────────
  const ext = (file.originalFilename || "").split(".").pop().toLowerCase();
  if (ext !== "pdf") {
    return res.status(400).json({ success: false, message: "Only PDF files are allowed." });
  }

  // ── Upload to Supabase Storage ────────────────────────
  const storagePath = `${user.id}/${Date.now()}-${file.originalFilename}`;
  const fileBuffer = fs.readFileSync(file.filepath);

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: false });

  // Clean up temp file
  try { fs.unlinkSync(file.filepath); } catch (_) {}

  if (uploadErr) {
    return res.status(500).json({ success: false, message: uploadErr.message });
  }

  // ── Record upload metadata ────────────────────────────
  await supabase.from("uploads").insert({
    user_id: user.id,
    file_path: storagePath,
    original_name: file.originalFilename,
    size: file.size,
  });

  // ── Update leaderboard score ──────────────────────────
  await supabase.rpc("increment_upload_count", { uid: user.id });

  // ── Return mock questions (LLM integration pending) ───
  const mockQuestions = [
    { id: 1, question: "What is the primary objective discussed in this document?" },
    { id: 2, question: "Summarize the key concepts introduced in the first section." },
    { id: 3, question: "What methodologies or approaches are highlighted?" },
    { id: 4, question: "Identify any conclusions or outcomes mentioned in the document." },
    { id: 5, question: "What are the potential real-world applications of the topics covered?" },
    { id: 6, question: "Are there any limitations or challenges discussed in the document?" },
  ];

  return res.json({
    success: true,
    file: { originalName: file.originalFilename, size: file.size },
    questions: mockQuestions,
    note: "LLM integration pending — placeholder questions shown.",
  });
};
