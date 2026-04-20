/* ════════════════════════════════════════════════
   server.js  —  Local Development Only
   Wraps the same api/*.js handlers in Express so
   you can run `node server.js` locally.
   For production, Vercel uses api/ as serverless fns.
════════════════════════════════════════════════ */

require("dotenv").config();

const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── API CORS (for Live Server frontend on a different origin) ──
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// ── Static frontend ────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Re-use the same Vercel-style API handlers ──────────────
// formidable reads raw streams — don't add global body parsers.

const uploadHandler      = require("./api/upload");
const gradeHandler       = require("./api/grade");
const leaderboardHandler = require("./api/leaderboard");
const cleanupHandler     = require("./api/cleanup");

app.post("/api/upload",      (req, res) => uploadHandler(req, res));
app.post("/api/grade",       (req, res) => gradeHandler(req, res));
app.get("/api/leaderboard",  (req, res) => leaderboardHandler(req, res));
app.get("/api/cleanup",      (req, res) => cleanupHandler(req, res));

// ── Fallback → index.html ──────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 ReverseIT running at http://localhost:${PORT}`);
  console.log(`   Make sure .env exists with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY etc.\n`);
});
