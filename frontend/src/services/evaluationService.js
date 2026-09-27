import { apiRequest } from "@/services/apiClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const getEvaluationById = id => apiRequest(`/evaluations/${id}`);
export const completeEvaluation = id => apiRequest(`/evaluations/${id}/complete`, { method: "POST" });
export const createEvaluation = tenderId => apiRequest("/evaluations", { method: "POST", body: JSON.stringify({ tender_id: tenderId }) });
export const runAiAnalysis = evaluationId => apiRequest(`/ai/evaluations/${evaluationId}/analyze`, { method: "POST" });
export const getAiStatus = evaluationId => apiRequest(`/ai/evaluations/${evaluationId}/status`);
export const getEvaluationAwards = evaluationId => apiRequest(`/evaluations/${evaluationId}/awards`);
export const getEvaluationRejections = evaluationId => apiRequest(`/evaluations/${evaluationId}/rejections`);
export const submitRejection = (evaluationId, vendorId, reason) => apiRequest(`/evaluations/${evaluationId}/rejections`, { method: "POST", body: JSON.stringify({ vendor_id: vendorId, reason }) });
export const removeRejection = rejectionId => apiRequest(`/rejections/${rejectionId}`, { method: "DELETE" });
export const resolveComplianceResult = (resultId, status, reviewComment) => apiRequest(`/compliance/${resultId}`, {
  method: "PATCH",
  body: JSON.stringify({ status, review_comment: reviewComment }),
});

// CSV download needs the auth header, so we fetch as blob.
export async function downloadReportCsv(evaluationId) {
  const token = window.localStorage.getItem("gem_access_token");
  const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/report.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Report download failed");
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `evaluation-${evaluationId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Vendor/bid documents (tender notices, bid submissions) are only served
// with an auth header, so fetch as a blob. Used by DocumentPreviewModal to
// render PDFs/images inline instead of forcing a browser download.
export async function fetchDocumentBlob(documentId) {
  const token = window.localStorage.getItem("gem_access_token");
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Document could not be loaded");
  return response.blob();
}

// ---- Minimal client-side PDF report (no dependencies) ----
// Builds a real multi-page PDF from the evaluation JSON using base-14
// Helvetica (no font embedding needed), so Export PDF works offline.
const pdfEsc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E\u0900-\u097F₹]/g, "");

function pdfWrap(text, max = 95) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdf(pages) {
  const encoder = new TextEncoder();
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const pageCount = pages.length;
  // 1 catalog, 2 pages, then 2 objects per page (page + content), then 2 fonts
  const contentStart = 3;
  const fontBase = contentStart + pageCount * 2;
  const kids = pages.map((_, i) => `${contentStart + i * 2} 0 R`).join(" ");
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  pages.forEach((ops, i) => {
    const content = ops.join("\n");
    objs[contentStart + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentStart + i * 2 + 1} 0 R /Resources << /Font << /F1 ${fontBase} 0 R /F2 ${fontBase + 1} 0 R >> >> >>`;
    objs[contentStart + i * 2 + 1] = `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`;
  });
  objs[fontBase] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[fontBase + 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const total = fontBase + 1;
  for (let i = 1; i <= total; i++) {
    offsets[i] = encoder.encode(parts.join("")).length;
    parts.push(`${i} 0 obj\n${objs[i]}\nendobj\n`);
  }
  const xrefAt = encoder.encode(parts.join("")).length;
  parts.push("xref\n0 " + (total + 1) + "\n0000000000 65535 f \n");
  for (let i = 1; i <= total; i++) parts.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  parts.push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  return new Blob([encoder.encode(parts.join(""))], { type: "application/pdf" });
}

function pdfLine(x, y, size, bold, gray, str) {
  const color = gray ? "0.42 0.42 0.42 rg\n" : "0 0 0 rg\n";
  return `${color}BT ${bold ? "/F2" : "/F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEsc(str).slice(0, 130)}) Tj ET`;
}

export async function downloadReportPdf(evaluationId) {
  const data = await apiRequest(`/evaluations/${evaluationId}/report`);
  const evaluation = data.evaluation || {};
  const requirements = data.requirements || [];
  const vendors = data.vendors || [];
  const results = data.results || [];
  const reqById = Object.fromEntries(requirements.map((r) => [r.id, r]));

  const pages = [];
  let ops = [];
  let y = 0;
  const need = (h) => {
    if (y - h < 50) {
      pages.push(ops);
      ops = [];
      y = 740;
    }
  };
  const line = (size, bold, gray, str) => {
    for (const part of pdfWrap(str)) {
      need(size + 4);
      ops.push(pdfLine(50, y, size, bold, gray, part));
      y -= size + 5;
    }
  };
  const gap = (h = 10) => { y -= h; if (y < 60) { pages.push(ops); ops = []; y = 740; } };

  y = 740;
  line(18, true, false, "GeM Bid Compliance Verification Report");
  line(11, false, true, `${evaluation.title || ""} · ${evaluation.tenderReference || ""}`);
  line(10, false, true, `Department: ${evaluation.department || "—"} · Generated: ${new Date().toLocaleString()} · Mode: ${data.summary?.mode || evaluation.aiMode || "heuristic"}`);
  gap(14);
  line(14, true, false, "Vendor summary");
  for (const vendor of vendors) {
    gap(4);
    line(12, true, false, `${vendor.name} — ${vendor.compliancePercentage ?? "—"}%${vendor.riskLevel ? ` · ${vendor.riskLevel} risk` : ""} · ${vendor.eligibility || ""}`);
    if (vendor.recommendation) line(10, false, true, vendor.recommendation);
  }
  gap(14);
  line(14, true, false, "Requirement results");
  const shortStatus = (s) => (s === "COMPLIANT" ? "PASS" : s === "NON_COMPLIANT" ? "FAIL" : "REVIEW");
  for (const req of requirements) {
    gap(4);
    line(11, true, false, req.title || "");
    for (const vendor of vendors) {
      const hit = results.find((r) => r.requirementId === req.id && r.vendorId === vendor.id);
      line(10, false, false, `- ${vendor.name}: ${hit ? shortStatus(hit.status) : "—"}${hit?.extractedValue ? ` — ${hit.extractedValue}` : ""}`);
    }
  }
  gap(14);
  line(9, false, true, "Evidence-based evaluation. Final qualification rests with the Procurement Officer.");
  pages.push(ops);

  // page numbers
  pages.forEach((pageOps, i) => {
    pageOps.push(pdfLine(540, 30, 9, false, true, `Page ${i + 1} of ${pages.length}`));
  });

  const blob = buildPdf(pages);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `evaluation-${evaluationId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}