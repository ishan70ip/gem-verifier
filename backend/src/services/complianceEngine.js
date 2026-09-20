// Deterministic compliance + scoring engine (V1 prototype).
// Design split (per SIH guidance):
//   AI/heuristic side  -> document understanding: field extraction, semantic
//                         keyword matching, evidence quotes, explanations.
//   Deterministic side -> exact compliance decisions: threshold comparisons,
//                         portal status mapping, mandatory-fail rules, scoring.
// This file is the deterministic side. It never calls an LLM, so results are
// reproducible and auditable - the officer can see the exact rule applied.
import { verifyVendorOnPortals } from "./mockPortals.js";

// ---------- heuristic field extraction (document understanding) ----------
const MONEY = /([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr|million|L|Cr)?/i;

function moneyToInr(match) {
  if (!match || match[1] == null) return null;
  const num = parseFloat(String(match[1]).replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  const unit = (match[2] || "").toLowerCase();
  if (["crore", "cr"].includes(unit)) return num * 1e7;
  if (["lakh", "lack", "lac", "l"].includes(unit)) return num * 1e5;
  if (unit === "million") return num * 1e6;
  return num;
}

function firstGroup(regex, text) {
  const m = text.match(regex);
  return m ? m[0] : null;
}

export function extractFields(text = "", bidMetadata = {}) {
  const t = text || "";
  const gstin = firstGroup(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/, t)?.toUpperCase() || null;
  // standalone PAN (avoid re-matching the PAN embedded in a GSTIN)
  const panCandidates = [...t.toUpperCase().matchAll(/\b[A-Z]{5}\d{4}[A-Z]\b/g)].map((m) => m[0]);
  const pan = panCandidates.find((p) => !gstin || !gstin.includes(p)) || null;
  const udyamNo = firstGroup(/UDYAM-[A-Z]{2}-\d{2}-\d{7}/i, t)?.toUpperCase() || null;
  const dpiitNo = firstGroup(/DIPP\s?\d+/i, t)?.toUpperCase().replace(/\s+/, "") || null;
  const epfoCode = firstGroup(/\b[A-Z]{2}-[A-Z]{3}-\d{6}\b/, t)?.toUpperCase() || null;

  const turnover = moneyToInr(t.match(/(?:annual turnover|turnover|revenue)[^\d₹]{0,20}₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr|million|L|Cr)?/i));
  const emd = moneyToInr(t.match(/(?:EMD|earnest money(?: deposit)?)[^\d₹]{0,25}₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr)?/i));
  const quotedPrice = Number(bidMetadata.quotedPrice) || moneyToInr(t.match(/(?:quoted price|bid price|offer price)[^\d₹]{0,20}₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr)?/i));

  const expMatch = t.match(/(\d+)\s*(?:\+)?\s*years?(?:\s*of)?[^\n.]{0,60}(?:experience|executing|operation|projects?)/i);
  const experienceYears = expMatch ? Number(expMatch[1]) : null;

  const warrantyMatch = t.match(/(\d+)\s*-?\s*years?\s*(?:comprehensive\s*)?(?:on-?site\s*)?warranty|warranty[^\n.]{0,40}(\d+)\s*-?\s*years?/i);
  const warrantyYears = warrantyMatch ? Number(warrantyMatch[1] || warrantyMatch[2]) : null;

  const localMatch = t.match(/(?:local content|indigenous content|make in india)[^\d%]{0,40}(\d+)\s*(%|percent)/i);
  const localContentPct = localMatch ? Number(localMatch[1]) : null;

  return {
    gstin, pan, udyamNo, dpiitNo, epfoCode,
    turnover, emd, quotedPrice, experienceYears, warrantyYears, localContentPct,
    hasIso: /ISO\s*9001/i.test(t),
    hasOemAuth: /OEM\s*authori[sz]ation|authori[sz]ed\s+(?:by\s+)?(?:the\s+)?OEM|manufacturer'?s?\s*authori[sz]ation|MAF\b/i.test(t),
    hasPastContracts: /past (?:contract|project|order|work)|work order|completion certificate|experience certificate/i.test(t),
  };
}

// Parse numeric thresholds from tender-side text (requirement descriptions,
// tender description, uploaded tender notice text).
export function parseTenderThresholds(requirements = [], tenderText = "") {
  const combined = [...requirements.map((r) => `${r.title} ${r.description}`), tenderText].join("\n");
  const pick = (regex) => {
    const m = combined.match(regex);
    return m ? moneyToInr(m) : null;
  };
  const expM = combined.match(/minimum[^\n.]{0,60}?(\d+)\s*years?/i) || combined.match(/(\d+)\s*years?\s*(?:of\s*)?(?:minimum\s*)?experience/i);
  const warM = combined.match(/(\d+)\s*-?\s*years?\s*(?:comprehensive\s*)?(?:on-?site\s*)?warranty|warranty[^\n.]{0,40}(\d+)\s*-?\s*years?/i);
  const localM = combined.match(/(?:local content|class-?i|make in india)[^\d%]{0,60}(\d+)\s*(%|percent)/i);
  return {
    minTurnover: pick(/minimum[^\n.]{0,40}annual turnover[^\d₹]{0,25}₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr|million|L|Cr)?/i),
    minEmd: pick(/(?:minimum\s*)?EMD[^\d₹]{0,25}₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lack|lac|crore|cr)?/i),
    minExperience: expM ? Number(expM[1]) : null,
    minWarranty: warM ? Number(warM[1] || warM[2]) : null,
    minLocalContent: localM ? Number(localM[1]) : (/make in india/i.test(combined) ? 50 : null),
    text: combined,
  };
}

// ---------- check catalogue ----------
function portalStatusToCompliance(portalStatus, { mandatory = true } = {}) {
  if (portalStatus === "verified") return "compliant";
  if (portalStatus === "mismatch") return "non_compliant";
  return mandatory ? "needs_review" : "compliant"; // not_found
}

// Maps compliance check keys to tender requirement text, so every check
// lands on the right matrix row.
export const KEY_TO_REQ = [
  [/udyam|msme/i, "udyam"],
  [/gst/i, "gst"],
  [/pan|income tax|\bitr\b/i, "pan_itr"],
  [/epfo|esic|provident/i, "epfo_esic"],
  [/startup|nsic|dpiit/i, "startup_nsic"],
  [/debar|blacklist/i, "debarment"],
  [/digilocker|authentic/i, "digilocker"],
  [/turnover/i, "turnover"],
  [/experience/i, "experience"],
  [/emd|earnest/i, "emd"],
  [/iso/i, "iso"],
  [/oem|authori[sz]ation/i, "oem"],
  [/local content|make in india/i, "make_in_india"],
  [/warranty/i, "warranty"],
];

const labelOf = (c) => c.requirementTitle || c.key;

export function runComplianceForVendor({ vendor, bid, documents, docText, tender, requirements, thresholds }) {
  const fields = extractFields(docText, bid?.bidMetadata || {});
  const identifiers = {
    udyamNo: fields.udyamNo,
    gstin: vendor?.organization?.gstin || fields.gstin,
    pan: fields.pan,
    epfoCode: fields.epfoCode,
    dpiitNo: fields.dpiitNo,
    vendorCode: vendor?.vendorCode,
    legalName: vendor?.legalName,
  };
  const portal = verifyVendorOnPortals(identifiers, {
    ...fields,
    documentNames: documents.map((d) => d.originalFilename),
  });

  const checks = [];
  const push = (check) => checks.push({ confidence: 0.85, ...check });

  // 1-7: statutory / portal checks
  const portalChecks = [
    { key: "udyam", reqMatch: /udyam|msme/i, mandatory: true, weight: 12 },
    { key: "gst", reqMatch: /gst/i, mandatory: true, weight: 12 },
    { key: "pan_itr", reqMatch: /pan|income tax|itr/i, mandatory: true, weight: 10 },
    { key: "epfo_esic", reqMatch: /epfo|esic|provident|labour/i, mandatory: false, weight: 6 },
    { key: "startup_nsic", reqMatch: /startup|nsic/i, mandatory: false, weight: 4 },
    { key: "debarment", reqMatch: /blacklist|debar/i, mandatory: true, weight: 14 },
    { key: "digilocker", reqMatch: /digilocker|document authentic/i, mandatory: false, weight: 4 },
  ];
  for (const pc of portalChecks) {
    const p = portal.results[pc.key];
    const mandatory = pc.mandatory || requirements.some((r) => pc.reqMatch.test(`${r.title} ${r.description}`) && r.mandatory);
    push({
      key: pc.key,
      mandatory,
      weight: pc.weight,
      status: portalStatusToCompliance(p.status, { mandatory }),
      evidenceText: p.detail,
      exactQuote: p.detail,
      explanation:
        p.status === "verified"
          ? `Portal cross-verification passed: ${p.detail}`
          : p.status === "mismatch"
            ? `Portal cross-verification FAILED: ${p.detail} Officer must reject or seek clarification.`
            : `Could not verify against portal snapshot: ${p.detail} Requires officer review.`,
    });
  }

  // 8: turnover
  if (thresholds.minTurnover != null) {
    const ok = fields.turnover != null && fields.turnover >= thresholds.minTurnover;
    const mc = marginConf(fields.turnover, thresholds.minTurnover);
    push({
      key: "turnover", mandatory: true, weight: 10,
      status: fields.turnover == null ? "needs_review" : ok ? "compliant" : "non_compliant",
      confidence: mc, confidenceLocked: mc != null,
      evidenceText: fields.turnover != null ? `Extracted turnover ₹${fields.turnover.toLocaleString("en-IN")} vs required ₹${thresholds.minTurnover.toLocaleString("en-IN")}` : "No turnover figure extracted from bid documents.",
      exactQuote: fields.turnover != null ? `Turnover ₹${fields.turnover.toLocaleString("en-IN")}` : null,
      explanation: fields.turnover == null ? "Turnover not found in documents; officer to verify audited financials." : ok ? "Meets minimum average annual turnover." : "Below minimum turnover threshold.",
    });
  }

  // 9: experience
  if (thresholds.minExperience != null) {
    const ok = fields.experienceYears != null && fields.experienceYears >= thresholds.minExperience;
    const mc = fields.experienceYears != null
      ? marginConf(fields.experienceYears, thresholds.minExperience)
      : fields.hasPastContracts ? 0.5 : null; // partial hint, still needs review
    push({
      key: "experience", mandatory: true, weight: 8,
      confidence: mc, confidenceLocked: mc != null,
      status: fields.experienceYears == null && !fields.hasPastContracts ? "needs_review" : ok || (fields.experienceYears == null && fields.hasPastContracts) ? (fields.experienceYears == null ? "needs_review" : "compliant") : "non_compliant",
      evidenceText: fields.experienceYears != null ? `Extracted experience ${fields.experienceYears} yrs vs required ${thresholds.minExperience} yrs` : fields.hasPastContracts ? "Past-contract certificates mentioned but years not quantified." : "No experience evidence extracted.",
      exactQuote: fields.experienceYears != null ? `${fields.experienceYears} years experience` : null,
      explanation: ok ? "Meets minimum experience." : "Experience below threshold or not quantifiable; needs officer review.",
    });
  }

  // 10: EMD
  if (thresholds.minEmd != null) {
    const ok = fields.emd != null && fields.emd >= thresholds.minEmd;
    const mc = marginConf(fields.emd, thresholds.minEmd);
    push({
      key: "emd", mandatory: true, weight: 6,
      confidence: mc, confidenceLocked: mc != null,
      status: fields.emd == null ? "needs_review" : ok ? "compliant" : "non_compliant",
      evidenceText: fields.emd != null ? `Extracted EMD ₹${fields.emd.toLocaleString("en-IN")} vs required ₹${thresholds.minEmd.toLocaleString("en-IN")}` : "No EMD amount extracted from bid documents.",
      exactQuote: fields.emd != null ? `EMD ₹${fields.emd.toLocaleString("en-IN")}` : null,
      explanation: fields.emd == null ? "EMD instrument must be verified manually." : ok ? "EMD meets requirement." : "EMD below required amount.",
    });
  }

  // 11: ISO 9001
  if (requirements.some((r) => /iso/i.test(`${r.title} ${r.description}`))) {
    const isoDoc = documents.find((d) => /iso/i.test(`${d.originalFilename} ${d.documentType}`));
    push({
      key: "iso", mandatory: true, weight: 6,
      status: fields.hasIso || isoDoc ? "compliant" : "needs_review",
      evidenceText: fields.hasIso ? "ISO 9001 explicitly claimed in bid text." + (isoDoc ? ` Certificate file: ${isoDoc.originalFilename}.` : "") : isoDoc ? `Certificate file uploaded: ${isoDoc.originalFilename}.` : "No ISO 9001 claim or certificate found.",
      exactQuote: fields.hasIso ? "ISO 9001" : null,
      explanation: fields.hasIso || isoDoc ? "Quality certification evidenced." : "Officer must verify ISO certificate manually.",
    });
  }

  // 12: OEM authorisation
  if (requirements.some((r) => /oem|authori[sz]ation|warranty/i.test(`${r.title} ${r.description}`))) {
    push({
      key: "oem", mandatory: true, weight: 6,
      status: fields.hasOemAuth ? "compliant" : "needs_review",
      evidenceText: fields.hasOemAuth ? "OEM authorisation statement found in bid text." : "No OEM authorisation statement extracted.",
      exactQuote: fields.hasOemAuth ? "OEM Authorization" : null,
      explanation: fields.hasOemAuth ? "OEM authorisation evidenced." : "Officer must verify OEM/MAF letter manually.",
    });
  }

  // 13: Make in India / local content
  if (thresholds.minLocalContent != null) {
    const ok = fields.localContentPct != null && fields.localContentPct >= thresholds.minLocalContent;
    const mc = marginConf(fields.localContentPct, thresholds.minLocalContent);
    push({
      key: "make_in_india", mandatory: false, weight: 5,
      confidence: mc, confidenceLocked: mc != null,
      status: fields.localContentPct == null ? "needs_review" : ok ? "compliant" : "non_compliant",
      evidenceText: fields.localContentPct != null ? `Declared local content ${fields.localContentPct}% vs required ${thresholds.minLocalContent}%` : "No local-content declaration extracted.",
      exactQuote: fields.localContentPct != null ? `${fields.localContentPct}% local content` : null,
      explanation: fields.localContentPct == null ? "Local-content certificate must be checked manually." : ok ? "Meets Make-in-India local content threshold." : "Below local-content threshold; may lose purchase preference.",
    });
  }

  // 14: warranty
  if (thresholds.minWarranty != null) {
    const ok = fields.warrantyYears != null && fields.warrantyYears >= thresholds.minWarranty;
    const mc = marginConf(fields.warrantyYears, thresholds.minWarranty);
    push({
      key: "warranty", mandatory: false, weight: 4,
      confidence: mc, confidenceLocked: mc != null,
      status: fields.warrantyYears == null ? "needs_review" : ok ? "compliant" : "non_compliant",
      evidenceText: fields.warrantyYears != null ? `Offered warranty ${fields.warrantyYears} yrs vs required ${thresholds.minWarranty} yrs` : "No warranty period extracted.",
      exactQuote: fields.warrantyYears != null ? `${fields.warrantyYears} years warranty` : null,
      explanation: ok ? "Warranty meets requirement." : "Warranty below requirement or not stated.",
    });
  }

  // Generic tender requirements with no dedicated check: keyword search.
  // Requirements already covered by a statutory/threshold check above are
  // attached to that check so the matrix shows one row per requirement.
  const covered = new Set(checks.map((c) => c.key));
  for (const req of requirements) {
    const hay = `${req.title} ${req.description}`;
    const entry = KEY_TO_REQ.find(([regex]) => regex.test(hay));
    if (entry && covered.has(entry[1])) {
      const hit = checks.find((c) => c.key === entry[1]);
      hit.requirementId = req._id || req.id;
      hit.requirementTitle = req.title;
      continue;
    }
    const keywords = req.title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !["with", "from", "must", "shall", "year", "years"].includes(w));
    const found = keywords.length ? keywords.some((k) => docText.toLowerCase().includes(k)) : docText.length > 100;
    push({
      key: `req:${req._id || req.id}`,
      requirementId: req._id || req.id,
      requirementTitle: req.title,
      mandatory: req.mandatory !== false,
      weight: 5,
      status: found ? "compliant" : "needs_review",
      confidence: 0.6,
      evidenceText: found ? `Bid text references requirement "${req.title}".` : `No textual evidence found for "${req.title}".`,
      exactQuote: found ? req.title : null,
      explanation: found ? "Semantic keyword match in bid documents (low confidence - officer to confirm)." : "No evidence extracted; officer review required.",
    });
  }

  return { fields, portal, checks: checks.map(withConfidence), ...scoreVerdict(checks.map(withConfidence), vendor) };
}

// Confidence reflects evidence quality, not a flat default:
// portal-verified identities score highest; missing evidence scores lowest;
// Gemini-adjudicated rows keep the model's own confidence.
// Margin-sensitive confidence for numeric threshold checks: beating the
// threshold by far scores higher than scraping past it exactly.
function marginConf(actual, required) {
  if (actual == null || required == null || required <= 0) return null;
  const ratio = actual / required;
  if (ratio >= 2) return 0.93;
  if (ratio >= 1.2) return 0.88;
  if (ratio >= 1) return 0.78;
  if (ratio >= 0.8) return 0.7; // near miss: less certain it is a fail
  return 0.85; // clear miss: confident fail
}

function withConfidence(check) {
  if (check.determinationSource === "ai-gemini-adjudicated" && typeof check.confidence === "number") return check;
  if (check.confidenceLocked) return check; // margin-computed at the check site
  if (check.key.startsWith("req:")) {
    // Generic keyword matches are inherently low-confidence signals.
    check.confidence = check.status === "compliant" ? 0.6 : 0.35;
    return check;
  }
  const hasEvidence = Boolean(check.exactQuote);
  if (check.status === "compliant") {
    check.confidence = ["udyam", "gst", "pan_itr", "debarment"].includes(check.key) ? 0.95 : hasEvidence ? 0.85 : 0.7;
  } else if (check.status === "non_compliant") {
    check.confidence = ["udyam", "gst", "pan_itr", "debarment"].includes(check.key) ? 0.92 : hasEvidence ? 0.85 : 0.7;
  } else {
    check.confidence = hasEvidence ? 0.6 : 0.35;
  }
  return check;
}

// Recompute score / risk / recommendation from an (optionally AI-updated)
// check list, e.g. after Gemini adjudication resolves ambiguous items.
export function scoreVerdict(checks, vendor) {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.status === "compliant" ? c.weight : c.status === "needs_review" ? c.weight * 0.4 : 0), 0);
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;
  const mandatoryFails = checks.filter((c) => c.mandatory && c.status === "non_compliant");
  const reviewItems = checks.filter((c) => c.status === "needs_review");
  const debarred = checks.some((c) => c.key === "debarment" && c.status === "non_compliant");

  let riskLevel = "LOW";
  if (debarred || mandatoryFails.length > 0) riskLevel = debarred ? "CRITICAL" : "HIGH";
  else if (reviewItems.length > 0 || score < 80) riskLevel = "MEDIUM";

  const eligible = !debarred && mandatoryFails.length === 0 && reviewItems.length === 0 && score >= 80;
  const recommendation = debarred
    ? `NOT ELIGIBLE - ${vendor?.legalName} appears on the debarment list. Recommend rejection per GeM GTC.`
    : mandatoryFails.length > 0
      ? `NOT ELIGIBLE - failed mandatory check(s): ${mandatoryFails.map(labelOf).join(", ")}. Recommend disqualification unless clarified.`
      : reviewItems.length > 0
        ? `CONDITIONAL - ${reviewItems.length} item(s) need officer review (${reviewItems.map(labelOf).join(", ")}). May qualify after verification.`
        : `ELIGIBLE - all ${checks.length} checks passed with score ${score}%. Recommend qualification.`;

  return { score, riskLevel, recommendation, eligible };
}
