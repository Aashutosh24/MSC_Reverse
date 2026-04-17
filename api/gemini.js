const pdfParse = require("pdf-parse");

const FALLBACK_QUESTIONS = [
  {
    id: 1,
    question: "What exact user or business problem does this application need to solve, and why does the current experience fail?",
    focus: "Problem framing, user pain point, and scope",
  },
  {
    id: 2,
    question: "Which core product flows, screens, or system components should change first to address the issue effectively?",
    focus: "Product prioritization and architecture",
  },
  {
    id: 3,
    question: "What technical approach would you use to implement the solution, and what trade-offs are you accepting?",
    focus: "Implementation strategy and trade-offs",
  },
  {
    id: 4,
    question: "How would you validate that the proposed fix actually improves the application for real users?",
    focus: "Metrics, testing, and validation",
  },
  {
    id: 5,
    question: "What edge cases, security concerns, or scaling limits could break your solution in production?",
    focus: "Risk analysis, privacy, and reliability",
  },
];

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

function getModelName() {
  return process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
}

function getOpenRouterUrl() {
  return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
}

function getResultText(result = {}) {
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return "";

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        return typeof part?.text === "string" ? part.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

async function callOpenRouter(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  const response = await fetch(getOpenRouterUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: getModelName(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a strict technical evaluator. Return only valid JSON with no markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result?.error?.message || `OpenRouter request failed (${response.status})`;
    throw new Error(message);
  }

  return result;
}

async function extractPdfText(pdfBuffer) {
  try {
    const parsed = await pdfParse(pdfBuffer);
    const text = String(parsed?.text || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.slice(0, 24000);
  } catch (_) {
    return "";
  }
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    const parsed = tryParse(trimmed.slice(objectStart, objectEnd + 1));
    if (parsed) return parsed;
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return tryParse(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  return null;
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      question: String(item?.question || item?.text || "").trim(),
      focus: String(item?.focus || item?.ideal_focus || item?.rubric || "").trim(),
    }))
    .filter((item) => item.question)
    .slice(0, 5)
    .map((item, index) => ({ ...item, id: index + 1 }));
}

function clampScore(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function buildDocumentPrompt({ fileName, documentText }) {
  return `You are ReverseIT, an exam-style product reviewer for student submissions.

The uploaded PDF usually describes a real-world problem on a famous application or platform such as social media, messaging, delivery, finance, e-commerce, streaming, education, or productivity software.

Your job is to read the document and generate exactly five critical questions that test whether the participant truly understands:
- the application and the problem being solved
- the technical approach they would use
- scalability, trade-offs, and implementation details
- edge cases, security, privacy, and operational concerns
- how they would validate success

The questions must be specific, thoughtful, and based on the uploaded PDF. Do not ask generic summary questions. Make them sound like interview or design-review questions.

Return valid JSON only with this shape:
{
  "summary": "1-2 sentence summary of the document and the problem it describes",
  "questions": [
    { "id": 1, "question": "...", "focus": "..." },
    { "id": 2, "question": "...", "focus": "..." },
    { "id": 3, "question": "...", "focus": "..." },
    { "id": 4, "question": "...", "focus": "..." },
    { "id": 5, "question": "...", "focus": "..." }
  ]
}

PDF filename: ${fileName}

Document text:
${documentText}`;
}

function buildGradePrompt({ fileName, summary, questions, answers }) {
  return `You are grading a participant's response to a PDF-based product and technical analysis.

The document usually concerns a real problem on a famous application or platform. Evaluate whether the participant understood the application problem, the technical approach, the trade-offs, and the production risks.

Score each question out of 20. Total score should be out of 100.
Use a strict but fair rubric:
- 0-4: no meaningful answer
- 5-9: weak, generic, or off-topic
- 10-14: partially correct with some useful reasoning
- 15-17: strong and relevant
- 18-20: excellent, specific, and technically grounded

Return valid JSON only with this shape:
{
  "score": 0,
  "breakdown": [
    { "id": 1, "score": 0, "max": 20, "comment": "..." }
  ],
  "feedback": "short final review paragraph",
  "strengths": ["..."],
  "improvements": ["..."]
}

PDF filename: ${fileName}
Document summary: ${summary}
Questions: ${JSON.stringify(questions, null, 2)}
Participant answers: ${JSON.stringify(answers, null, 2)}`;
}

function fallbackGrade(answers, questions) {
  const breakdown = questions.map((question, index) => {
    const answer = String(answers?.[index]?.answer || "").trim();
    const words = answer ? answer.split(/\s+/).filter(Boolean).length : 0;
    const keywordHits = [question.question, question.focus]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 4)
      .filter((token) => answer.toLowerCase().includes(token)).length;
    const score = clampScore(Math.min(20, Math.round(words / 7) + keywordHits * 2 + (words > 0 ? 4 : 0)), 0, 20);
    return {
      id: question.id || index + 1,
      score,
      max: 20,
      comment: score >= 15 ? "Strong response for the available context." : score >= 10 ? "Some useful reasoning, but more technical depth would help." : "Needs a clearer, more specific answer.",
    };
  });

  const total = breakdown.reduce((sum, item) => sum + item.score, 0);
  return {
    score: total,
    breakdown,
    feedback: total >= 75
      ? "Good technical understanding overall. The answers are specific and mostly relevant."
      : total >= 50
        ? "A reasonable submission, but the responses need more concrete architecture and trade-off detail."
        : "The submission is too general. Focus on the application problem, implementation choices, and edge cases.",
    strengths: ["Relevance", "Problem awareness"],
    improvements: ["Add architecture detail", "Explain trade-offs more clearly"],
    provider: "fallback",
  };
}

async function generateQuestionsFromPdf({ pdfBuffer, fileName }) {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      summary: "This document appears to describe a real application problem and a proposed solution path. The participant should explain the problem, the technical design, and the production risks in detail.",
      questions: FALLBACK_QUESTIONS,
      provider: "fallback",
    };
  }

  const pdfText = await extractPdfText(pdfBuffer);
  const documentText = pdfText || "PDF text extraction failed. Infer likely application problem context from the filename and ask critical technical questions.";

  const prompt = buildDocumentPrompt({
    fileName,
    documentText,
  });

  const result = await callOpenRouter(prompt);

  const text = getResultText(result);
  const parsed = extractJson(text);
  const questions = normalizeQuestions(parsed?.questions);

  if (!parsed || !questions.length) {
    return {
      summary: "The PDF was analyzed, but the model response was not structured enough to extract questions reliably.",
      questions: FALLBACK_QUESTIONS,
      provider: "fallback",
      raw: text,
    };
  }

  return {
    summary: String(parsed.summary || "").trim() || "This document describes a product or technical problem that requires careful design thinking.",
    questions,
    provider: "openrouter",
    raw: text,
  };
}

async function gradeAnswersWithGemini({ fileName, summary, questions, answers }) {
  const apiKey = getApiKey();

  if (!apiKey) {
    return fallbackGrade(answers, questions);
  }

  const result = await callOpenRouter(
    buildGradePrompt({ fileName, summary, questions, answers })
  );

  const text = getResultText(result);
  const parsed = extractJson(text);

  if (!parsed) {
    throw new Error("Gemini returned an unreadable grading response.");
  }

  const breakdown = Array.isArray(parsed.breakdown)
    ? parsed.breakdown.map((item, index) => ({
        id: Number(item?.id) || index + 1,
        score: clampScore(item?.score, 0, 20),
        max: 20,
        comment: String(item?.comment || "").trim(),
      }))
    : [];

  const score = clampScore(parsed.score, 0, 100);

  return {
    score,
    breakdown: breakdown.length ? breakdown : questions.map((question, index) => ({
      id: question.id || index + 1,
      score: 0,
      max: 20,
      comment: "No breakdown returned by the model.",
    })),
    feedback: String(parsed.feedback || "").trim() || "The submission was scored successfully.",
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).filter(Boolean) : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String).filter(Boolean) : [],
    provider: "openrouter",
    raw: text,
  };
}

module.exports = {
  FALLBACK_QUESTIONS,
  generateQuestionsFromPdf,
  gradeAnswersWithGemini,
};