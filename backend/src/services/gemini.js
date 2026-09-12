// Optional Gemini enhancement for the V1 prototype.
// If GEMINI_API_KEY is set, bid/tender text is sent to Gemini for a second
// extraction opinion and richer explanations; the deterministic engine in
// complianceEngine.js ALWAYS runs and its verdicts take precedence.
// If no key is set (default for the hackathon demo), the platform runs fully
// offline in heuristic mode and reports mode: "heuristic".
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export function geminiMode() {
  return process.env.GEMINI_API_KEY ? `gemini:${MODEL}` : "heuristic";
}

export async function geminiExtract(summary, docText) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `You are a GeM procurement document analyst. From the bidder text below, extract JSON only with keys: gstin, pan, udyamNo, turnover_inr (number|null), experience_years (number|null), emd_inr (number|null), hasIso (bool), hasOemAuth (bool), localContentPct (number|null), warrantyYears (number|null), oneLineSummary (string). Context: ${summary}. Bidder text (truncated):\n${(docText || "").slice(0, 12000)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );
    clearTimeout(timer);
    if (!res.ok) return { error: `gemini-http-${res.status}` };
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { error: "gemini-no-json", raw: text.slice(0, 500) };
    return { ...JSON.parse(text.slice(start, end + 1)), model: MODEL };
  } catch (error) {
    return { error: `gemini-failed: ${error.message}` };
  }
}
