const { createClient } = require("@supabase/supabase-js");
const { gradeAnswersWithGemini } = require("./gemini");

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, message: "Server misconfiguration: missing env vars." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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

    const body = await readJsonBody(req);
    const fileName = String(body.fileName || "document.pdf");
    const summary = String(body.summary || "");
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!questions.length || !answers.length) {
      return res.status(400).json({ success: false, message: "Questions and answers are required." });
    }

    const grade = await gradeAnswersWithGemini({ fileName, summary, questions, answers });

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, score, upload_count, name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.warn("Profile lookup failed:", profileErr.message);
    }

    const nextScore = (Number(profile?.score) || 0) + Number(grade.score || 0);
    const nextUploadCount = Number(profile?.upload_count) || 0;
    const displayName = profile?.name || user.user_metadata?.name || user.email?.split("@")[0] || "User";

    const { error: upsertErr } = await supabase.from("profiles").upsert({
      id: user.id,
      name: displayName,
      score: nextScore,
      upload_count: nextUploadCount,
    });

    if (upsertErr) {
      return res.status(500).json({ success: false, message: upsertErr.message });
    }

    return res.json({
      success: true,
      score: grade.score,
      breakdown: grade.breakdown,
      feedback: grade.feedback,
      strengths: grade.strengths,
      improvements: grade.improvements,
      provider: grade.provider,
      leaderboardScore: nextScore,
    });
  } catch (error) {
    console.error("Grade handler failed:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
  }
};