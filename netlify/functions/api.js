require("dotenv").config();

const express = require("express");
const serverless = require("serverless-http");

const uploadHandler = require("../../api/upload");
const gradeHandler = require("../../api/grade");
const leaderboardHandler = require("../../api/leaderboard");
const cleanupHandler = require("../../api/cleanup");

const app = express();

// Keep behavior aligned with local server.js CORS handling.
app.use((req, res, next) => {
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

function mapPost(path, handler) {
  app.post(path, (req, res) => handler(req, res));
}

function mapGet(path, handler) {
  app.get(path, (req, res) => handler(req, res));
}

mapPost("/api/upload", uploadHandler);
mapPost("/upload", uploadHandler);

mapPost("/api/grade", gradeHandler);
mapPost("/grade", gradeHandler);

mapGet("/api/leaderboard", leaderboardHandler);
mapGet("/leaderboard", leaderboardHandler);

mapGet("/api/cleanup", cleanupHandler);
mapGet("/cleanup", cleanupHandler);

module.exports.handler = serverless(app, {
  basePath: "/.netlify/functions/api",
});
