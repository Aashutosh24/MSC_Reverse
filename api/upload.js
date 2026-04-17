const { createClient } = require("@supabase/supabase-js");
const { formidable } = require("formidable");
const fs = require("fs");
const { generateQuestionsFromPdf } = require("./gemini");

module.exports.config = { api: { bodyParser: false } };

function extractProjectRefFromUrl(url = "") {
  const m = String(url).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : "";
}

function extractProjectRefFromToken(token = "") {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return String(json?.ref || "");
  } catch (_) {
    return "";
  }
}

module.exports = async (req, res) => {
  try {
    // ── CORS ──────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    // ── Validate env vars before touching Supabase ────────
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase env vars");
      return res.status(500).json({ success: false, message: "Server misconfiguration: missing env vars." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Auth check ────────────────────────────────────────
    const token = (req.headers.authorization || "").split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Not authenticated. Please login first." });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      const backendRef = extractProjectRefFromUrl(process.env.SUPABASE_URL);
      const tokenRef = extractProjectRefFromToken(token);
      const isProjectMismatch = !!backendRef && !!tokenRef && backendRef !== tokenRef;
      const reason = authErr?.message || "Invalid auth token";

      return res.status(401).json({
        success: false,
        message: isProjectMismatch
          ? "Session belongs to a different Supabase project. Please log out and log in again."
          : "Session expired or invalid. Please login again.",
        reason,
      });
    }

    // ── Parse multipart form ──────────────────────────────
    const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
    const [, files] = await form.parse(req);

    const fileArr = files.document;
    const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
    if (!file) {
      return res.status(400).json({ success: false, message: "No file received." });
    }

    // ── Validate PDF ──────────────────────────────────────
    const originalName = file.originalFilename || "document.pdf";
    const ext = originalName.split(".").pop().toLowerCase();
    if (ext !== "pdf") {
      return res.status(400).json({ success: false, message: "Only PDF files are allowed." });
    }

    // ── Upload to Supabase Storage ────────────────────────
    const storagePath = `${user.id}/${Date.now()}-${originalName}`;
    const fileBuffer = fs.readFileSync(file.filepath);
    try { fs.unlinkSync(file.filepath); } catch (_) { }

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadErr) {
      console.error("Supabase storage upload failed:", uploadErr);
      return res.status(500).json({ success: false, message: uploadErr.message });
    }

    // ── Log upload + update score ─────────────────────────
    const { error: insertErr } = await supabase.from("uploads").insert({
      user_id: user.id,
      file_path: storagePath,
      original_name: originalName,
      size: file.size,
    });

    const { error: rpcErr } = await supabase.rpc("increment_upload_count", { uid: user.id });

    if (insertErr || rpcErr) {
      console.warn("Upload metadata update failed:", {
        insertErr: insertErr?.message,
        rpcErr: rpcErr?.message,
      });
    }

    let analysis;
    try {
      analysis = await generateQuestionsFromPdf({ pdfBuffer: fileBuffer, fileName: originalName });
    } catch (aiErr) {
      console.error("Gemini analysis failed:", aiErr);
      analysis = {
        summary: "This document appears to describe a real-world application problem and the participant's proposed technical response.",
        questions: [
          { id: 1, question: "What exact problem is the application trying to solve, and who feels that pain most strongly?", focus: "Problem framing" },
          { id: 2, question: "Which part of the system would you redesign first, and why?", focus: "Architecture" },
          { id: 3, question: "What implementation approach would you use, and what trade-offs does it create?", focus: "Technical approach" },
          { id: 4, question: "How would you validate the solution and measure whether it works?", focus: "Testing and metrics" },
          { id: 5, question: "What edge cases, privacy risks, or scaling limits could break the solution?", focus: "Risk analysis" },
        ],
        provider: "fallback",
        aiError: aiErr.message,
      };
    }

    return res.json({
      success: true,
      file: { originalName, size: file.size },
      questions: analysis.questions,
      analysis: {
        summary: analysis.summary,
        provider: analysis.provider || "openrouter",
      },
      note: analysis.provider === "fallback"
        ? "AI analysis fallback questions were used for this document."
        : "OpenRouter analyzed the PDF and generated five critical questions.",
      warnings: insertErr || rpcErr
        ? [
            ...(insertErr ? [insertErr.message] : []),
            ...(rpcErr ? [rpcErr.message] : []),
          ]
        : [],
    });
  } catch (error) {
    console.error("Upload handler failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};