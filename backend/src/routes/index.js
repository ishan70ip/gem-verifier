import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import os from "node:os";
import { config } from "../config/index.js";
import { auth, officer, vendor, audit } from "../middleware/auth.js";
import { analyzeEvaluation } from "../services/analyze.js";
import { extractTextFromFile } from "../services/extract.js";
import { geminiMode } from "../services/gemini.js";
import { verifyVendorOnPortals } from "../services/mockPortals.js";
import { saveUpload, saveBuffer, readFile } from "../services/storage.js";
import { lookupGemBid, makePdf, GEM_BID_IDS } from "../services/dummyDocs.js";
import {
  AuditLog,
  Award,
  Bid,
  ComplianceResult,
  Document,
  Evaluation as EvaluationModel,
  Requirement,
  Tender,
  User,
  Vendor,
} from "../db/models.js";

const router = Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: config.maxUploadSize } });
const clean = (item) => (item ? { ...item, id: item._id, _id: undefined } : item);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// 12.1 Authentication
router.post("/auth/login", asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase(), isActive: true }).lean();
  if (!user || (!await bcrypt.compare(req.body.password || "", user.passwordHash))) {
    return res.status(401).json({ detail: "Invalid credentials" });
  }
  const vendorDoc = user.role === "vendor" ? await Vendor.findOne({ userId: user._id }).lean() : null;
  res.json({
    access_token: jwt.sign({ sub: user._id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn }),
    token_type: "bearer",
    user: { id: user._id, email: user.email, role: user.role, vendor_id: vendorDoc?._id || null },
  });
}));
router.post("/auth/logout", auth, (_req, res) => res.status(204).end());
router.get("/auth/me", auth, asyncRoute(async (req, res) => {
  const vendorDoc = req.user.role === "vendor" ? await Vendor.findOne({ userId: req.user.id }).lean() : null;
  res.json({ id: req.user.id, email: req.user.email, role: req.user.role, vendor_id: vendorDoc?._id || null });
}));

// 12.3 Officer Portal - Tenders
router.get("/tenders", ...officer, asyncRoute(async (_req, res) => {
  const tenders = await Tender.find().sort({ updatedAt: -1 }).lean();
  const tenderIds = tenders.map(t => t._id);
  
  const [bids, requirements, results] = await Promise.all([
    Bid.find({ tenderId: { $in: tenderIds } }).lean(),
    Requirement.find({ tenderId: { $in: tenderIds } }).lean(),
    ComplianceResult.find({ tenderId: { $in: tenderIds } }).lean()
  ]);

  const payload = tenders.map(tender => {
    const tBids = bids.filter(b => String(b.tenderId) === String(tender._id));
    const tReqs = requirements.filter(r => String(r.tenderId) === String(tender._id));
    const tResults = results.filter(r => String(r.tenderId) === String(tender._id));
    const compliant = tResults.filter(r => r.status === "compliant" || r.status === "COMPLIANT").length;
    
    const compliancePercentage = tResults.length > 0 
      ? Math.round((compliant / tResults.length) * 100) 
      : null;
      
    return {
      ...clean(tender),
      totalBids: tBids.length,
      requirementCount: tReqs.length,
      compliancePercentage
    };
  });
  
  res.json(payload);
}));
router.post("/tenders", ...officer, asyncRoute(async (req, res) => {
  const { reference_number, title, department, description = "", submission_deadline, requirements = [] } = req.body;
  const tender = await Tender.create({ referenceNumber: reference_number, title, department, description, submissionDeadline: submission_deadline, status: "OPEN", createdBy: req.user.id });
  await Requirement.insertMany(requirements.map((item, index) => ({ tenderId: tender._id, title: item.title, description: item.description, category: item.category, mandatory: item.mandatory ?? true, requirementOrder: item.requirement_order ?? index })));
  await audit(req.user, "tender.created", "tender", tender._id);
  res.status(201).json({ ...clean(tender.toObject()), name: title, tenderRef: reference_number, deadline: submission_deadline });
}));
router.get("/tenders/:id", ...officer, asyncRoute(async (req, res) => {
  const tender = await Tender.findById(req.params.id).lean(); if (!tender) return res.status(404).json({ detail: "Tender not found" });
  const [requirements, bids, documents] = await Promise.all([Requirement.find({ tenderId: tender._id }).sort({ requirementOrder: 1 }).lean(), Bid.find({ tenderId: tender._id }).lean(), Document.find({ tenderId: tender._id }).lean()]);
  const vendors = await Vendor.find({ _id: { $in: bids.map(bid => bid.vendorId) } }).lean();
  const vendorById = Object.fromEntries(vendors.map(v => [v._id, v]));
  res.json({ ...clean(tender), name: tender.title, tenderRef: tender.referenceNumber, deadline: tender.submissionDeadline, requirements: requirements.map(clean), documents: documents.map(clean), bids: bids.map(bid => ({ ...clean(bid), companyName: vendorById[bid.vendorId]?.legalName || "Unknown vendor", vendorName: vendorById[bid.vendorId]?.legalName || "Unknown vendor" })) });
}));
router.post("/tenders/:id/documents", ...officer, upload.single("file"), asyncRoute(async (req, res) => {
  const tender = await Tender.findById(req.params.id).lean();
  if (!tender || !req.file) return res.status(404).json({ detail: "Tender or file not found" });
  const stored = await saveUpload(req.file);
  const document = await Document.create({
    tenderId: tender._id,
    documentType: req.body.document_type || "tender_notice",
    originalFilename: req.file.originalname,
    storagePath: stored.storagePath,
    mimeType: req.file.mimetype,
    fileSize: stored.fileSize,
    uploadedBy: req.user.id,
    visibility: "public",
    status: "ACTIVE",
    uploadedAt: new Date(),
  });
  await audit(req.user, "document.uploaded", "document", document._id, { tender_id: tender._id });
  res.status(201).json(clean(document.toObject()));
}));
router.get("/tenders/:id/documents", ...officer, asyncRoute(async (req, res) => res.json((await Document.find({ tenderId: req.params.id }).lean()).map(clean))));
router.patch("/tenders/:id", ...officer, asyncRoute(async (req, res) => {
  const tender = await Tender.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!tender) return res.status(404).json({ detail: "Tender not found" });
  await audit(req.user, "tender.updated", "tender", tender._id);
  res.json(clean(tender));
}));
router.get("/tenders/:id/bids", ...officer, asyncRoute(async (req, res) => res.json((await Bid.find({ tenderId: req.params.id }).lean()).map(clean))));
router.get("/tenders/:id/vendors", ...officer, asyncRoute(async (req, res) => {
  const bids = await Bid.find({ tenderId: req.params.id }).lean();
  res.json((await Vendor.find({ _id: { $in: bids.map(bid => bid.vendorId) } }).lean()).map(clean));
}));

// 12.3 Officer Portal - Evaluations & Compliance
async function evaluationPayload(evaluation) {
  const tender = await Tender.findById(evaluation.tenderId).lean();
  const [requirements, bids, results, documents] = await Promise.all([
    Requirement.find({ tenderId: evaluation.tenderId }).sort({ requirementOrder: 1 }).lean(),
    Bid.find({ tenderId: evaluation.tenderId }).lean(),
    ComplianceResult.find({ evaluationId: evaluation._id }).lean(),
    Document.find({ tenderId: evaluation.tenderId }).lean(),
  ]);
  const vendors = await Vendor.find({ _id: { $in: bids.map(bid => bid.vendorId) } }).lean();
  let summary = null;
  try { summary = evaluation.overallSummary ? JSON.parse(evaluation.overallSummary) : null; } catch { summary = null; }
  return {
    evaluation: { ...clean(evaluation), title: tender?.title, tenderReference: tender?.referenceNumber, department: tender?.department, deadline: tender?.submissionDeadline, aiMode: summary?.mode || geminiMode(), lastProcessed: summary?.generatedAt || evaluation.updatedAt },
    requirements: requirements.map(clean),
    // Every document tied to this tender (both the officer-uploaded notice
    // and vendor bid submissions). Bid documents carry a bidId, so the
    // frontend can filter to "documents submitted by this vendor" by
    // matching document.bidId against each vendor's bid.id.
    documents: documents.map(clean),
    summary,
    vendors: vendors.map(v => {
      const items = results.filter(r => r.vendorId === v._id);
      const compliant = items.filter(r => r.status === "compliant").length;
      const score = requirements.length ? Math.round((compliant / requirements.length) * 100) : null;
      const ai = summary?.vendors?.[v._id];
      return { ...clean(v), name: v.legalName, compliancePercentage: ai?.score ?? score, riskLevel: ai?.riskLevel || null, recommendation: ai?.recommendation || null, eligibility: ai ? (ai.eligible ? "ELIGIBLE" : "NOT_ELIGIBLE") : (score != null && score >= 80 ? "ELIGIBLE" : "NOT_ELIGIBLE"), bid: clean(bids.find(b => b.vendorId === v._id)) };
    }),
    results: results.map(r => ({
      ...clean(r),
      status: { compliant: "COMPLIANT", non_compliant: "NON_COMPLIANT", needs_review: "FLAG_FOR_REVIEW" }[r.status] || r.status,
      extractedValue: r.evidenceText,
      confidenceScore: r.confidence,
      exactQuote: r.evidenceText,
      pageNumber: r.pageNumber,
    })),
  };
}

router.get("/evaluations", ...officer, asyncRoute(async (_req, res) => res.json((await EvaluationModel.find().sort({ updatedAt: -1 }).lean()).map(clean))));
router.get("/evaluations/:id", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  res.json(await evaluationPayload(evaluation));
}));
router.post("/evaluations", ...officer, asyncRoute(async (req, res) => {
  const tender = await Tender.findById(req.body.tender_id);
  if (!tender) return res.status(404).json({ detail: "Tender not found" });
  const evaluation = await EvaluationModel.findOneAndUpdate(
    { tenderId: tender._id },
    { $setOnInsert: { tenderId: tender._id, status: "IN_PROGRESS", startedBy: req.user.id, startedAt: new Date() } },
    { new: true, upsert: true }
  );
  await tender.updateOne({ status: "EVALUATION_IN_PROGRESS" });
  await audit(req.user, "evaluation.created", "evaluation", evaluation._id);
  res.json(await evaluationPayload(evaluation.toObject()));
}));
router.get("/evaluations/:id/matrix", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  res.json((await evaluationPayload(evaluation)).results);
}));
router.get("/evaluations/:id/results", ...officer, asyncRoute(async (req, res) => res.json((await ComplianceResult.find({ evaluationId: req.params.id }).lean()).map(clean))));
router.post("/evaluations/:id/complete", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id);
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  if (await ComplianceResult.exists({ evaluationId: evaluation._id, status: "needs_review" })) {
    return res.status(409).json({ detail: "Resolve all needs-review results before completing the evaluation" });
  }
  evaluation.status = "COMPLETED";
  evaluation.completedBy = req.user.id;
  evaluation.completedAt = new Date();
  await evaluation.save();
  await Tender.findByIdAndUpdate(evaluation.tenderId, { status: "EVALUATION_COMPLETED" });
  await audit(req.user, "evaluation.completed", "evaluation", evaluation._id);
  res.json(await evaluationPayload(evaluation.toObject()));
}));
router.patch("/compliance/:id", ...officer, asyncRoute(async (req, res) => {
  const status = { COMPLIANT: "compliant", NON_COMPLIANT: "non_compliant", FLAG_FOR_REVIEW: "needs_review", NOT_FOUND: "needs_review" }[req.body.status] || req.body.status;
  const result = await ComplianceResult.findById(req.params.id);
  if (!result) return res.status(404).json({ detail: "Compliance result not found" });
  const evaluation = await EvaluationModel.findById(result.evaluationId);
  if (["AWARDED", "LOCKED"].includes(evaluation?.status)) return res.status(409).json({ detail: "Awarded evaluations are read-only" });
  Object.assign(result, { status, determinationSource: "human", humanReviewed: true, reviewedBy: req.user.id, reviewedAt: new Date(), reviewComment: req.body.review_comment });
  await result.save();
  await audit(req.user, "compliance_result.updated", "compliance_result", result._id, { status });
  res.json(clean(result.toObject()));
}));

// 12.3 Officer Portal - Vendors, Awards & Dashboard
router.get("/vendors", ...officer, asyncRoute(async (_req, res) => {
  const items = await Vendor.find().sort({ legalName: 1 }).lean();
  res.json(items.map(v => ({ ...clean(v), name: v.legalName })));
}));
router.get("/vendors/:id", ...officer, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findById(req.params.id).lean();
  if (!vendorDoc) return res.status(404).json({ detail: "Vendor not found" });
  const contracts = await Award.find({ vendorId: req.params.id }).lean();
  res.json({ ...clean(vendorDoc), name: vendorDoc.legalName, awardedContractsCount: contracts.length, awardedContracts: contracts.map(clean) });
}));
router.get("/vendors/:id/contracts", ...officer, asyncRoute(async (req, res) => res.json((await Award.find({ vendorId: req.params.id }).lean()).map(clean))));
router.get("/vendors/:id/documents", ...officer, asyncRoute(async (req, res) => res.json((await Document.find({ vendorId: req.params.id }).lean()).map(clean))));

router.post("/awards", ...officer, asyncRoute(async (req, res) => {
  const { tender_id, evaluation_id, vendor_id } = req.body;
  const evaluation = await EvaluationModel.findOne({ _id: evaluation_id, tenderId: tender_id });
  const results = await ComplianceResult.find({ evaluationId: evaluation_id, vendorId: vendor_id });
  if (!evaluation || !["COMPLETED", "EVALUATION_COMPLETED"].includes(evaluation.status)) return res.status(409).json({ detail: "Evaluation must be complete before award" });
  if (!results.length || results.some(r => r.status !== "compliant")) return res.status(409).json({ detail: "Selected vendor is not eligible" });
  const award = await Award.create({ tenderId: tender_id, evaluationId: evaluation_id, vendorId: vendor_id, status: "ACTIVE", awardedAt: new Date(), awardedBy: req.user.id, contractReference: `CON-${Date.now()}` });
  await Tender.findByIdAndUpdate(tender_id, { status: "AWARDED", awardedVendorId: vendor_id });
  await EvaluationModel.findByIdAndUpdate(evaluation_id, { status: "AWARDED" });
  await audit(req.user, "contract_awarded", "contract_award", award._id, { vendor_id, tender_id });
  res.status(201).json(clean(award.toObject()));
}));
router.get("/awards/:id", ...officer, asyncRoute(async (req, res) => {
  const award = await Award.findById(req.params.id).lean();
  if (!award) return res.status(404).json({ detail: "Award not found" });
  const [tender, vendor, documents] = await Promise.all([
    Tender.findById(award.tenderId).lean(),
    Vendor.findById(award.vendorId).lean(),
    Document.find({ contractAwardId: award._id }).lean(),
  ]);
  res.json({ ...clean(award), tenderName: tender?.title, tenderReference: tender?.referenceNumber, department: tender?.department, vendorName: vendor?.legalName, documents: documents.map(clean) });
}));
router.get("/awards/:id/documents", ...officer, asyncRoute(async (req, res) => res.json((await Document.find({ contractAwardId: req.params.id }).lean()).map(clean))));

router.get("/officer/dashboard", ...officer, asyncRoute(async (_req, res) => res.json({
  tenders: await Tender.countDocuments(),
  evaluations: await EvaluationModel.countDocuments(),
  in_progress: await EvaluationModel.countDocuments({ status: "IN_PROGRESS" }),
  needs_review: await ComplianceResult.countDocuments({ status: "needs_review" }),
  awards: await Award.countDocuments(),
})));
router.get("/audit-logs", ...officer, asyncRoute(async (_req, res) => res.json((await AuditLog.find().sort({ timestamp: -1 }).limit(100).lean()).map(clean))));

// 13.1 AI Integration Boundary - REAL implementation (V1 prototype).
// Deterministic local engine + mock portal registries run by default
// (mode "heuristic"); set GEMINI_API_KEY for Gemini second opinions.
router.post("/ai/evaluations/:id/requirements", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  const tenderDocs = await Document.find({ tenderId: evaluation.tenderId }).lean();
  const noticeDocs = tenderDocs.filter(d => !d.bidId);
  if (!noticeDocs.length) return res.status(409).json({ detail: "Upload a tender notice document first (Tender details > Upload notice PDF)" });
  let text = "";
  for (const doc of noticeDocs) {
    try { text += `\n${(await extractTextFromFile(doc.storagePath, doc)).text}`; } catch { /* skip */ }
  }
  const candidates = [...new Set(text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 24 && l.length < 240 && /(must|shall|should|required|mandatory|minimum|at least|certificate|warranty|turnover|experience|emd|iso|oem|gst|udyam|local content)/i.test(l)))].slice(0, 20);
  if (req.query.apply === "1") {
    const existing = await Requirement.find({ tenderId: evaluation.tenderId }).lean();
    let order = existing.reduce((m, r) => Math.max(m, r.requirementOrder || 0), 0);
    const created = [];
    for (const line of candidates) {
      if (existing.some(r => r.title.toLowerCase() === line.slice(0, 80).toLowerCase())) continue;
      order += 1;
      const doc = await Requirement.create({ tenderId: evaluation.tenderId, title: line.slice(0, 80), description: `Extracted from tender notice: ${line}`, category: "Tender-specific", mandatory: true, requirementOrder: order });
      created.push(clean(doc.toObject()));
    }
    await audit(req.user, "ai.requirements_extracted", "evaluation", evaluation._id, { created: created.length });
    return res.status(201).json({ created, mode: geminiMode() });
  }
  res.json({ suggestions: candidates, mode: geminiMode() });
}));
router.post("/ai/evaluations/:id/analyze", ...officer, asyncRoute(async (req, res) => {
  const { summary } = await analyzeEvaluation(req.params.id, req.user);
  await audit(req.user, "ai.analysis_completed", "evaluation", req.params.id, { mode: summary.mode, vendors: Object.keys(summary.vendors).length });
  res.json(await evaluationPayload({ ...(await EvaluationModel.findById(req.params.id).lean()) }));
}));
router.post("/ai/evaluations/:id/results", ...officer, asyncRoute(async (req, res) => {
  // Reserved bulk-import path: accepts pre-computed results (e.g. from an
  // external AI service) and persists them for this evaluation.
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  const items = Array.isArray(req.body.results) ? req.body.results : [];
  if (!items.length) return res.status(400).json({ detail: "Provide a non-empty results array" });
  await ComplianceResult.deleteMany({ evaluationId: evaluation._id });
  await ComplianceResult.insertMany(items.map(r => ({
    evaluationId: evaluation._id,
    tenderId: evaluation.tenderId,
    requirementId: r.requirement_id || r.requirementId,
    vendorId: r.vendor_id || r.vendorId,
    bidId: r.bid_id || r.bidId,
    status: { COMPLIANT: "compliant", NON_COMPLIANT: "non_compliant", FLAG_FOR_REVIEW: "needs_review" }[r.status] || r.status || "needs_review",
    evidenceText: r.evidence_text || r.evidenceText || "",
    sourceDocumentId: r.source_document_id || r.sourceDocumentId || null,
    pageNumber: r.page_number ?? r.pageNumber ?? null,
    explanation: r.explanation || "",
    confidence: r.confidence ?? 0.7,
    determinationSource: "external-ai",
    humanReviewed: false,
  })));
  await audit(req.user, "ai.results_imported", "evaluation", evaluation._id, { count: items.length });
  res.status(201).json(await evaluationPayload({ ...(await EvaluationModel.findById(req.params.id).lean()) }));
}));
router.get("/ai/evaluations/:id/status", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  let summary = null;
  try { summary = evaluation.overallSummary ? JSON.parse(evaluation.overallSummary) : null; } catch { summary = null; }
  res.json({
    evaluation_id: req.params.id,
    status: summary ? "analyzed" : "not_analyzed",
    ai_enabled: true,
    mode: summary?.mode || geminiMode(),
    generated_at: summary?.generatedAt || null,
    results: summary?.totalResults || 0,
  });
}));

// Compliance report downloads (officer): JSON + CSV for the audit trail.
router.get("/evaluations/:id/report", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  res.json(await evaluationPayload(evaluation));
}));
router.get("/evaluations/:id/report.csv", ...officer, asyncRoute(async (req, res) => {
  const evaluation = await EvaluationModel.findById(req.params.id).lean();
  if (!evaluation) return res.status(404).json({ detail: "Evaluation not found" });
  const payload = await evaluationPayload(evaluation);
  const vendorById = Object.fromEntries(payload.vendors.map(v => [v.id, v]));
  const reqById = Object.fromEntries(payload.requirements.map(r => [r.id, r]));
  const esc = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  const lines = ["vendor,requirement,status,score,risk,evidence,explanation,confidence"];
  for (const r of payload.results) {
    const v = vendorById[r.vendorId];
    lines.push([v?.name, reqById[r.requirementId]?.title, r.status, v?.compliancePercentage, v?.riskLevel, r.extractedValue, r.explanation, r.confidenceScore].map(esc).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="evaluation-${req.params.id}.csv"`);
  res.send(lines.join("\n"));
}));

// Mock portal verification snapshot for one vendor (dashboard widget).
router.get("/vendors/:id/portal-checks", ...officer, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findById(req.params.id).lean();
  if (!vendorDoc) return res.status(404).json({ detail: "Vendor not found" });
  const { results } = verifyVendorOnPortals({
    gstin: vendorDoc.organization?.gstin,
    vendorCode: vendorDoc.vendorCode,
    legalName: vendorDoc.legalName,
  });
  res.json({ vendor_id: vendorDoc._id, mode: "mock-registry", checks: results });
}));

// 12.2 Vendor Portal
router.get("/vendor/profile", ...vendor, asyncRoute(async (req, res) => {
  const item = await Vendor.findOne({ userId: req.user.id }).lean();
  if (!item) return res.status(404).json({ detail: "Vendor profile not found" });
  res.json(clean(item));
}));
router.patch("/vendor/profile", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOneAndUpdate({ userId: req.user.id }, req.body, { new: true }).lean();
  if (!vendorDoc) return res.status(404).json({ detail: "Vendor profile not found" });
  await audit(req.user, "vendor.profile_updated", "vendor", vendorDoc._id);
  res.json(clean(vendorDoc));
}));
router.get("/vendor/tenders", ...vendor, asyncRoute(async (_req, res) => res.json((await Tender.find({ status: "OPEN" }).lean()).map(clean))));
router.get("/vendor/tenders/:id", ...vendor, asyncRoute(async (req, res) => {
  const tender = await Tender.findOne({ _id: req.params.id, status: "OPEN" }).lean();
  if (!tender) return res.status(404).json({ detail: "Tender not found or not open" });
  const requirements = await Requirement.find({ tenderId: tender._id }).sort({ requirementOrder: 1 }).lean();
  res.json({ ...clean(tender), requirements: requirements.map(clean) });
}));
router.post("/vendor/tenders/:id/bids", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  if (await Bid.exists({ tenderId: req.params.id, vendorId: vendorDoc._id })) return res.status(409).json({ detail: "A bid has already been submitted for this tender" });
  const bid = await Bid.create({
    tenderId: req.params.id,
    vendorId: vendorDoc._id,
    submissionStatus: "SUBMITTED",
    submittedAt: new Date(),
    bidReference: req.body.bid_reference || `BID-${Date.now()}`,
    bidMetadata: req.body.bid_metadata || {},
  });
  await audit(req.user, "bid.submitted", "bid", bid._id);
  res.status(201).json(clean(bid.toObject()));
}));
router.get("/vendor/bids", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  res.json((await Bid.find({ vendorId: vendorDoc._id }).lean()).map(clean));
}));
router.get("/vendor/bids/:id", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  const bid = await Bid.findOne({ _id: req.params.id, vendorId: vendorDoc._id }).lean();
  if (!bid) return res.status(404).json({ detail: "Bid not found" });
  res.json(clean(bid));
}));
router.post("/vendor/bids/:id/documents", ...vendor, upload.single("file"), asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  const bid = await Bid.findOne({ _id: req.params.id, vendorId: vendorDoc._id });
  if (!bid || !req.file) return res.status(404).json({ detail: "Bid or document not found" });
  const stored = await saveUpload(req.file);
  const document = await Document.create({
    bidId: bid._id,
    tenderId: bid.tenderId,
    vendorId: vendorDoc._id,
    documentType: req.body.document_type || "bid_document",
    originalFilename: req.file.originalname,
    storagePath: stored.storagePath,
    mimeType: req.file.mimetype,
    fileSize: stored.fileSize,
    uploadedBy: req.user.id,
    visibility: "vendor_and_officer",
    status: "ACTIVE",
    uploadedAt: new Date(),
  });
  await audit(req.user, "document.uploaded", "document", document._id, { bid_id: bid._id });
  res.status(201).json(clean(document.toObject()));
}));
router.get("/vendor/bids/:id/documents", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  if (!await Bid.exists({ _id: req.params.id, vendorId: vendorDoc._id })) return res.status(404).json({ detail: "Bid not found" });
  res.json((await Document.find({ bidId: req.params.id, vendorId: vendorDoc._id }).lean()).map(clean));
}));
// Import documents from a GeM seller bid (mock GeM portal lookup - the real
// GeM portal exposes no public API, so this registry stands in for an
// authorized connector; production swaps lookupGemBid only).
router.get("/vendor/gem-bids/demo-ids", ...vendor, asyncRoute(async (_req, res) => res.json({ demo_ids: GEM_BID_IDS })));
router.post("/vendor/bids/:id/import-gem", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  const bid = await Bid.findOne({ _id: req.params.id, vendorId: vendorDoc._id });
  if (!bid) return res.status(404).json({ detail: "Bid not found" });
  const gemBid = lookupGemBid(req.body.gem_bid_id);
  if (!gemBid) return res.status(404).json({ detail: `Unknown GeM seller bid "${req.body.gem_bid_id || ""}". Try a demo ID: ${GEM_BID_IDS.join(", ")}` });
  const created = [];
  for (const item of gemBid.docs) {
    const filename = item.name;
    if (await Document.findOne({ bidId: bid._id, originalFilename: filename }).lean()) continue;
    const stored = await saveBuffer(filename, makePdf(item.lines), "application/pdf");
    const document = await Document.create({
      bidId: bid._id,
      tenderId: bid.tenderId,
      vendorId: vendorDoc._id,
      documentType: item.type,
      originalFilename: filename,
      storagePath: stored.storagePath,
      mimeType: "application/pdf",
      fileSize: stored.fileSize,
      uploadedBy: req.user.id,
      visibility: "vendor_and_officer",
      status: "ACTIVE",
      uploadedAt: new Date(),
    });
    created.push(clean(document.toObject()));
  }
  await audit(req.user, "document.imported_from_gem", "bid", bid._id, { gem_bid_id: req.body.gem_bid_id, imported: created.length });
  res.status(201).json({ imported: created, gem_bid: req.body.gem_bid_id, skipped_duplicates: gemBid.docs.length - created.length });
}));
router.get("/documents/:id/download", auth, asyncRoute(async (req, res) => {
  const document = await Document.findById(req.params.id).lean();
  if (!document) return res.status(404).json({ detail: "Document not found" });
  if (req.user.role === "vendor") {
    const vendorDoc = await Vendor.findOne({ userId: req.user.id });
    if (document.vendorId !== vendorDoc?._id) return res.status(403).json({ detail: "Unauthorized access to document" });
  }
  const buffer = await readFile(document.storagePath);
  res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${(document.originalFilename || "document").replace(/"/g, "")}"`);
  res.send(buffer);
}));
router.get("/vendor/contracts", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  res.json((await Award.find({ vendorId: vendorDoc._id }).lean()).map(clean));
}));
router.get("/vendor/contracts/:id", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  const award = await Award.findOne({ _id: req.params.id, vendorId: vendorDoc._id }).lean();
  if (!award) return res.status(404).json({ detail: "Contract award not found" });
  const [tender, documents] = await Promise.all([
    Tender.findById(award.tenderId).lean(),
    Document.find({ contractAwardId: award._id }).lean(),
  ]);
  res.json({ ...clean(award), tenderName: tender?.title, tenderReference: tender?.referenceNumber, documents: documents.map(clean) });
}));
router.get("/vendor/contracts/:id/documents", ...vendor, asyncRoute(async (req, res) => {
  const vendorDoc = await Vendor.findOne({ userId: req.user.id });
  const award = await Award.findOne({ _id: req.params.id, vendorId: vendorDoc._id });
  if (!award) return res.status(404).json({ detail: "Contract award not found" });
  res.json((await Document.find({ contractAwardId: award._id }).lean()).map(clean));
}));

export default router;