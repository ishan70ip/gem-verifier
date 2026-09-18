// End-to-end verification orchestrator for the V1 prototype.
// Flow: Tender + Bids (+ uploaded PDFs) -> text extraction -> heuristic/AI
// field extraction -> mock portal cross-verification -> deterministic rules
// -> ComplianceResult rows + score/risk/recommendation on the Evaluation.
import { extractTextFromFile } from "./extract.js";
import { parseTenderThresholds, runComplianceForVendor, scoreVerdict, KEY_TO_REQ } from "./complianceEngine.js";
import { geminiExtract, geminiAdjudicate, geminiMode } from "./gemini.js";
import { findEvidence } from "./evidenceFinder.js";
import {
  Bid,
  ComplianceResult,
  Document,
  Evaluation as EvaluationModel,
  Requirement,
  Tender,
  Vendor,
} from "../db/models.js";

// Statutory requirement rows auto-created (once) so every check has a home
// in the compliance matrix, even if the officer only entered 3 requirements.
const STATUTORY_DEFAULTS = [
  { title: "Udyam / MSME registration", category: "Statutory", mandatory: true },
  { title: "GST registration and return filing", category: "Statutory", mandatory: true },
  { title: "PAN and Income Tax compliance", category: "Statutory", mandatory: true },
  { title: "Debarment / blacklisting check", category: "Statutory", mandatory: true },
  { title: "EPFO / ESIC compliance", category: "Statutory", mandatory: false },
  { title: "Make in India local content declaration", category: "Statutory", mandatory: false },
];

async function ensureRequirements(tenderId, existing) {
  const titles = new Set(existing.map((r) => r.title.toLowerCase()));
  let order = existing.reduce((m, r) => Math.max(m, r.requirementOrder || 0), 0);
  for (const def of STATUTORY_DEFAULTS) {
    if (titles.has(def.title.toLowerCase())) continue;
    order += 1;
    const created = await Requirement.create({
      tenderId,
      title: def.title,
      description: `Auto-added statutory check: ${def.title}. Verified against portal snapshot + bid documents.`,
      category: def.category,
      mandatory: def.mandatory,
      requirementOrder: order,
    });
    existing.push(created.toObject ? created.toObject() : created);
  }
  return existing;
}

function requirementForCheck(check, requirements) {
  if (check.requirementId) return check.requirementId;
  for (const [regex, key] of KEY_TO_REQ) {
    if (check.key !== key) continue;
    const hit = requirements.find((r) => regex.test(`${r.title} ${r.description}`));
    if (hit) return hit._id || hit.id;
  }
  const fallback = requirements[0];
  return fallback ? fallback._id || fallback.id : null;
}

export async function analyzeEvaluation(evaluationId, actor) {
  const evaluation = await EvaluationModel.findById(evaluationId);
  if (!evaluation) {
    const error = new Error("Evaluation not found");
    error.status = 404;
    throw error;
  }
  const ev = evaluation.toObject ? evaluation.toObject() : evaluation;
  const tender = await Tender.findById(ev.tenderId).lean();
  if (!tender) {
    const error = new Error("Tender not found for evaluation");
    error.status = 404;
    throw error;
  }

  let requirements = await Requirement.find({ tenderId: tender._id }).sort({ requirementOrder: 1 }).lean();
  requirements = await ensureRequirements(tender._id, requirements);

  // Tender-side text (description + uploaded tender notice docs) for thresholds.
  const tenderDocs = await Document.find({ tenderId: tender._id }).lean();
  let tenderText = tender.description || "";
  for (const doc of tenderDocs.filter((d) => !d.bidId)) {
    try {
      const extracted = await extractTextFromFile(doc.storagePath, doc);
      tenderText += `\n${extracted.text}`;
    } catch {
      // unreadable tender attachment -> thresholds fall back to requirement text
    }
  }
  const thresholds = parseTenderThresholds(requirements, tenderText);

  const bids = await Bid.find({ tenderId: tender._id }).lean();
  if (!bids.length) {
    const error = new Error("No bids submitted for this tender yet. Ask vendors to submit via the Vendor portal first.");
    error.status = 409;
    throw error;
  }
  const vendors = await Vendor.find({ _id: { $in: bids.map((b) => b.vendorId) } }).lean();

  const mode = geminiMode();
  // Evidence-finder sidecar: probe once per run. Absent/unhealthy -> the
  // built-in heuristic path below runs exactly as before (zero behavior
  // change when AI_SERVICE_URL is unset).
  let useEvidenceService = false;
  if (process.env.AI_SERVICE_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const probe = await fetch(`${process.env.AI_SERVICE_URL.replace(/\/$/, "")}/health`, { signal: controller.signal });
      clearTimeout(timer);
      useEvidenceService = probe.ok;
    } catch {
      useEvidenceService = false;
    }
  }
  await ComplianceResult.deleteMany({ evaluationId: ev._id });

  const vendorSummaries = {};
  let totalResults = 0;

  for (const bid of bids) {
    const vendor = vendors.find((v) => v._id === bid.vendorId);
    const docs = await Document.find({ bidId: bid._id }).lean();
    let docText = "";
    let sourceDocumentId = null;
    for (const doc of docs) {
      try {
        const extracted = await extractTextFromFile(doc.storagePath, doc);
        docText += `\n--- ${doc.originalFilename} ---\n${extracted.text}`;
        if (!sourceDocumentId) sourceDocumentId = doc._id || doc.id;
      } catch {
        docText += `\n--- ${doc.originalFilename} (unreadable) ---\n`;
      }
    }
    // Bid metadata (quoted price, remarks) is also evidence.
    docText += `\n--- bid form ---\n${JSON.stringify(bid.bidMetadata || {})}\nVendor: ${vendor?.legalName || ""} GSTIN:${vendor?.organization?.gstin || ""}`;

    // Optional LLM second opinion (never overrides deterministic verdicts).
    let llm = null;
    if (mode !== "heuristic") {
      llm = await geminiExtract(`${tender.title} (${tender.referenceNumber})`, docText);
    }

    const verdict = runComplianceForVendor({
      vendor, bid, documents: docs, docText, tender, requirements, thresholds,
    });
    if (llm && !llm.error && llm.oneLineSummary) {
      verdict.recommendation += ` AI note: ${llm.oneLineSummary}`;
    }

    // Gemini adjudication: resolve AMBIGUOUS checks only. Deterministic
    // compliant/non_compliant verdicts are never touched.
    if (mode !== "heuristic") {
      for (const check of verdict.checks) {
        if (check.status !== "needs_review") continue;
        const ai = await geminiAdjudicate({
          requirementTitle: check.requirementTitle || check.key,
          requirementDesc: requirements.find((r) => (r._id || r.id) === check.requirementId)?.description || "",
          currentEvidence: check.evidenceText,
          docText,
        });
        check.geminiPrompt = ai?.prompt || null;
        check.geminiResponse = ai?.response || ai?.raw || ai?.error || null;
        if (ai && !ai.error && (ai.verdict === "compliant" || ai.verdict === "non_compliant")) {
          check.status = ai.verdict;
          check.confidence = ai.confidence;
          if (ai.quote) {
            check.exactQuote = ai.quote;
            check.evidenceText = `Gemini-verified: "${ai.quote}"`;
          }
          check.explanation = `AI adjudication (${ai.model}): ${ai.reasoning}`;
          check.determinationSource = "ai-gemini-adjudicated";
        }
      }
      // Recompute score/risk/recommendation after adjudication upgrades.
      Object.assign(verdict, scoreVerdict(verdict.checks, vendor));
    }

    // Evidence-finder quote upgrade (sidecar only): replace the keyword
    // quote with the retrieved top quote when confident. Verdicts untouched.
    if (useEvidenceService) {
      for (const check of verdict.checks) {
        const reqDesc = requirements.find((r) => (r._id || r.id) === check.requirementId)?.description || "";
        const hit = await findEvidence({
          title: check.requirementTitle || check.key,
          description: reqDesc,
          docText,
          topK: 1,
        });
        if (hit && hit.quote && hit.score >= 0.6) {
          check.exactQuote = hit.quote;
          check.evidenceText = `Service-retrieved (${hit.method}, score ${hit.score}): "${hit.quote}"`;
          check.determinationSource = `${check.determinationSource || "ai-heuristic"}+evidence-service`;
        }
      }
    }

    // Per-check source attribution: point each result at the most relevant
    // document (ISO finding -> ISO certificate, PAN -> PAN card, ...) so the
    // evidence drawer opens the matching visual certificate instead of
    // always defaulting to the first uploaded file.
    const hayOf = (d) => `${d.originalFilename || ""} ${d.documentType || ""}`.toLowerCase();
    const technicalDoc = docs.find((d) => /technical|proposal/i.test(hayOf(d))) || docs[0];
    const docForCheck = (check) => {
      const find = (re) => docs.find((d) => re.test(hayOf(d)));
      switch (check.key) {
        case "udyam": return find(/udyam/) || technicalDoc;
        case "gst": return find(/gst/) || technicalDoc;
        case "pan_itr": return find(/pan(?!el)|pan-card/) || find(/pan/) || technicalDoc;
        case "epfo_esic": return find(/epfo|esic|provident/) || technicalDoc;
        case "startup_nsic": return find(/startup|dpiit|nsic/) || technicalDoc;
        case "iso": return find(/iso/) || technicalDoc;
        case "oem": return find(/oem|maf|authori/) || technicalDoc;
        default: return technicalDoc;
      }
    };

    const rows = verdict.checks.map((check) => ({
      evaluationId: ev._id,
      tenderId: tender._id,
      requirementId: requirementForCheck(check, requirements),
      vendorId: bid.vendorId,
      bidId: bid._id,
      status: check.status,
      evidenceText: check.evidenceText,
      sourceDocumentId: (docForCheck(check) || {})._id || sourceDocumentId,
      pageNumber: null,
      explanation: check.explanation,
      confidence: check.confidence,
      determinationSource: check.determinationSource || (mode.startsWith("gemini") ? "ai-gemini" : "ai-heuristic"),
      geminiPrompt: check.geminiPrompt || null,
      geminiResponse: check.geminiResponse || null,
      humanReviewed: false,
    }));
    await ComplianceResult.insertMany(rows);
    totalResults += rows.length;

    vendorSummaries[bid.vendorId] = {
      vendorName: vendor?.legalName || bid.vendorId,
      bidId: bid._id,
      bidReference: bid.bidReference,
      score: verdict.score,
      riskLevel: verdict.riskLevel,
      recommendation: verdict.recommendation,
      eligible: verdict.eligible,
    };
  }

  const summary = {
    mode,
    generatedAt: new Date().toISOString(),
    generatedBy: actor?.id || "system",
    thresholds: {
      minTurnover: thresholds.minTurnover,
      minEmd: thresholds.minEmd,
      minExperience: thresholds.minExperience,
      minWarranty: thresholds.minWarranty,
      minLocalContent: thresholds.minLocalContent,
    },
    vendors: vendorSummaries,
    totalResults,
  };
  const evalDoc = await EvaluationModel.findById(ev._id);
  Object.assign(evalDoc, { overallSummary: JSON.stringify(summary) });
  await evalDoc.save();

  return { evaluation: evalDoc.toObject(), summary };
}
