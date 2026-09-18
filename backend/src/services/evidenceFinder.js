// Evidence-finder client for the Express backend.
// Calls the Python sidecar ONLY when AI_SERVICE_URL is set (e.g.
// AI_SERVICE_URL=http://localhost:8765). Missing service, timeout, or any
// error -> returns null and the caller keeps its built-in heuristic.
// Zero behavior change when the env var is unset (default).
const AI_URL = (process.env.AI_SERVICE_URL || "").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS || 8000);

export function evidenceServiceMode() {
  return AI_URL ? `evidence-service:${AI_URL}` : "heuristic";
}

// Returns { quote, score, method } or null.
export async function findEvidence({ title = "", description = "", requirement = "", docText = "", topK = 3 } = {}) {
  if (!AI_URL) return null;
  const reqText = requirement || `${title} ${description}`.trim();
  if (!reqText || !docText) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${AI_URL}/find-evidence`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirement: reqText, docText: docText.slice(0, 60000), topK }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.score !== "number") return null;
    return { quote: json.quote || null, score: json.score, method: json.method || "unknown" };
  } catch {
    return null; // sidecar down -> heuristic path, silently
  }
}
