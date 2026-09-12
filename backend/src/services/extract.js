// Document text extraction for the V1 prototype.
// Pipeline stage: PDF/DOC/Scanned Doc -> OCR/parsing -> raw text.
// - PDFs are parsed with pdf-parse (pure JS, no system dependencies).
// - .txt/.md/.csv/.json are read as UTF-8.
// - Anything else falls back to a UTF-8 best-effort read so the demo never
//   crashes; the extraction method is recorded for auditability.
// (Real OCR for scanned images, e.g. Tesseract, is a documented V2 step;
//  for V1, vendors upload text PDFs which this handles fully.)
import { readFile } from "./storage.js";

function looksLikePdf(buffer) {
  return buffer.length > 4 && buffer.subarray(0, 4).toString() === "%PDF";
}

async function parsePdf(buffer) {
  // pdf-parse v2 API (installed). Keep a v1 fallback just in case.
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: result?.text || "",
        pages: result?.numpages || result?.total || null,
        method: "pdf-parse",
      };
    } finally {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    return { text: "", pages: null, method: `pdf-parse-failed: ${error.message}` };
  }
}

export async function extractTextFromFile(storagePath, { mimeType = "", originalFilename = "" } = {}) {
  const buffer = await readFile(storagePath);
  const name = (originalFilename || storagePath).toLowerCase();

  if (looksLikePdf(buffer) || mimeType.includes("pdf") || name.endsWith(".pdf")) {
    const parsed = await parsePdf(buffer);
    return { ...parsed, chars: parsed.text.length, scannedHint: parsed.text.trim().length < 20 };
  }

  if (/\.(txt|md|csv|json|log)$/.test(name) || mimeType.startsWith("text/")) {
    const text = buffer.toString("utf8");
    return { text, pages: 1, method: "utf8-read", chars: text.length, scannedHint: false };
  }

  // Best-effort fallback: binary formats (docx/png/jpg) without an OCR engine.
  // We still record metadata so the compliance engine can flag "needs_review"
  // instead of silently passing.
  const text = buffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\uFFFF]/g, " ").slice(0, 20000);
  return {
    text,
    pages: null,
    method: "binary-fallback-no-ocr",
    chars: text.length,
    scannedHint: true,
  };
}
