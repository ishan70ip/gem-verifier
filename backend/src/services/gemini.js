// Gemini enhancement for the V1 prototype.
//   - No key (default): platform runs fully offline, mode "heuristic".
//   - With GEMINI_API_KEY: two upgrades activate:
//       1. geminiExtract: second-opinion field extraction per bid.
//       2. geminiAdjudicate: for AMBIGUOUS checks only (deterministic status
//          "needs_review"), Gemini reads the evidence and returns a verdict.
//          It may only resolve ambiguity - it can never overturn a
//          deterministic compliant/non_compliant verdict. Every call stores
//          its prompt + raw response on the compliance row for auditability.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function geminiMode() {
  return process.env.GEMINI_API_KEY ? `gemini:${MODEL}` : "heuristic";
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGemini(prompt, maxOutputTokens = 1024) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens },
        }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) return { error: `gemini-http-${res.status}` };
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return { text, prompt };
  } catch (error) {
    clearTimeout(timer);
    return { error: `gemini-failed: ${error.message}` };
  }
}

export async function geminiExtract(summary, docText) {
  const prompt = `You are a GeM procurement document analyst. From the bidder text below, extract JSON only with keys: gstin, pan, udyamNo, turnover_inr (number|null), experience_years (number|null), emd_inr (number|null), hasIso (bool), hasOemAuth (bool), localContentPct (number|null), warrantyYears (number|null), oneLineSummary (string). Context: ${summary}. Bidder text (truncated):\n${(docText || "").slice(0, 12000)}`;
  const result = await callGemini(prompt);
  if (!result || result.error) return result;
  const parsed = extractJson(result.text);
  if (!parsed) return { error: "gemini-no-json", raw: result.text.slice(0, 500) };
  return { ...parsed, model: MODEL };
}

// Adjudicate ONE ambiguous check. Returns null when Gemini is unavailable
// or unusable - the caller then keeps the deterministic needs_review verdict.
export async function geminiAdjudicate({ requirementTitle, requirementDesc, currentEvidence, docText }) {
  const prompt = `You are a GeM (Government e-Marketplace, India) bid compliance officer. Decide ONE requirement strictly from the bidder evidence below.

Requirement: ${requirementTitle}
Detail: ${requirementDesc || ""}
Current machine finding: ${currentEvidence || "no evidence extracted"}

Bidder documents (truncated):
${(docText || "").slice(0, 10000)}

Reply with JSON only, exactly these keys:
{
  "verdict": "compliant" | "non_compliant" | "needs_review",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence justification quoting the evidence",
  "quote": "short exact quote from the documents supporting the verdict, or null"
}
Be strict: verdict "compliant" only with explicit textual evidence. Missing evidence means "non_compliant" only if the requirement is clearly applicable and unmet; otherwise "needs_review".`;
  const result = await callGemini(prompt, 768);
  if (!result || result.error) return result; // null (no key) or { error }
  const parsed = extractJson(result.text);
  if (!parsed || !["compliant", "non_compliant", "needs_review"].includes(parsed.verdict)) {
    return { error: "gemini-no-json", raw: result.text.slice(0, 500), prompt, response: result.text };
  }
  return {
    verdict: parsed.verdict,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    reasoning: parsed.reasoning || "",
    quote: parsed.quote || null,
    model: MODEL,
    prompt,
    response: result.text,
  };
}
