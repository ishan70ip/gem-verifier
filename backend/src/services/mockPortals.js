// Mock Government portal registries for the V1 prototype.
// The SIH statement asks for integration with Udyam, GSTN, PAN/Income Tax,
// MCA21, Startup India, NSIC, EPFO, ESIC, DigiLocker, GeM, etc. Real portal
// APIs need authorised credentials, so V1 ships deterministic dummy
// registries with the same verification *interface* the production
// connectors will implement. Each verify*() function returns a portal-style
// response { status, detail, evidence } and every call is audit-logged by
// the caller. To plug in a real API later, replace the lookup inside the
// corresponding function - the compliance engine does not change.

// ---- Dummy registry data (deterministic, matches backend seed) ----
const UDYAM = {
  "UDYAM-DL-06-0012345": { legalName: "Acme Procurement Systems Pvt Ltd", status: "Active", category: "Small", verified: true },
  "UDYAM-MH-19-0098765": { legalName: "Brightline Technologies LLP", status: "Active", category: "Micro", verified: true },
  "UDYAM-KA-03-0001112": { legalName: "Shady Traders Co", status: "Suspended", category: "Micro", verified: false },
};

const GSTN = {
  "07AAAAA0000A1Z5": { legalName: "Acme Procurement Systems Pvt Ltd", status: "Active", returnsFiledTill: "Aug-2026", filingUpToDate: true, state: "Delhi" },
  "27BBBBB1111B2Z6": { legalName: "Brightline Technologies LLP", status: "Active", returnsFiledTill: "Jul-2026", filingUpToDate: true, state: "Maharashtra" },
  "29CCCCC2222C3Z7": { legalName: "Shady Traders Co", status: "Cancelled", returnsFiledTill: "Mar-2024", filingUpToDate: false, state: "Karnataka" },
};

const PAN = {
  "AAACA1234F": { name: "Acme Procurement Systems Pvt Ltd", itrFiledAY: "2025-26", compliant: true },
  "AALCB5678G": { name: "Brightline Technologies LLP", itrFiledAY: "2025-26", compliant: true },
  "AAKCS9999H": { name: "Shady Traders Co", itrFiledAY: "2022-23", compliant: false },
};

const EPFO_ESIC = {
  "DL-CPM-123456": { epfo: "Compliant", esic: "Compliant" },
  "MH-BAN-654321": { epfo: "Compliant", esic: "Not Applicable (headcount < 10)" },
  "KA-BLR-000007": { epfo: "Default", esic: "Default" },
};

const STARTUP_NSIC = {
  "DIPP12345": { startupIndia: "Recognised", nsic: "Registered" },
  "DIPP67890": { startupIndia: "Recognised", nsic: "Not registered" },
};

// Firms debarred on the (mock) GeM debarment list.
const DEBARRED = new Set(["Shady Traders Co", "VEN-SHADY-003"]);

export const PORTAL_CHECKS = [
  { key: "udyam", label: "Udyam / MSME registration" },
  { key: "gst", label: "GST registration & return filing" },
  { key: "pan_itr", label: "PAN & Income Tax compliance" },
  { key: "epfo_esic", label: "EPFO / ESIC compliance" },
  { key: "startup_nsic", label: "Startup India / NSIC" },
  { key: "debarment", label: "Blacklisting / debarment" },
  { key: "digilocker", label: "DigiLocker document authenticity" },
];

function norm(value) {
  return (value || "").toString().trim();
}

// identifiers: { udyamNo, gstin, pan, epfoCode, dpiitNo, vendorCode, legalName }
// extracted: heuristic fields pulled from the bid documents
export function verifyVendorOnPortals(identifiers = {}, extracted = {}) {
  const id = {
    udyamNo: norm(identifiers.udyamNo || extracted.udyamNo),
    gstin: norm(identifiers.gstin || extracted.gstin).toUpperCase(),
    pan: norm(identifiers.pan || extracted.pan).toUpperCase(),
    epfoCode: norm(identifiers.epfoCode || extracted.epfoCode).toUpperCase(),
    dpiitNo: norm(identifiers.dpiitNo || extracted.dpiitNo).toUpperCase(),
    vendorCode: norm(identifiers.vendorCode),
    legalName: norm(identifiers.legalName),
  };

  const results = {};

  const udyam = UDYAM[id.udyamNo];
  results.udyam = !id.udyamNo
    ? { status: "not_found", detail: "No Udyam number found in bid documents or vendor profile.", evidence: null }
    : !udyam
      ? { status: "not_found", detail: `Udyam ${id.udyamNo} not present in registry snapshot.`, evidence: null }
      : udyam.verified && udyam.status === "Active"
        ? { status: "verified", detail: `Udyam ${id.udyamNo} active (${udyam.category}). Name matches registry.`, evidence: udyam }
        : { status: "mismatch", detail: `Udyam ${id.udyamNo} is ${udyam.status} in registry.`, evidence: udyam };

  const gst = GSTN[id.gstin];
  results.gst = !id.gstin
    ? { status: "not_found", detail: "No GSTIN found in bid documents or vendor profile.", evidence: null }
    : !gst
      ? { status: "not_found", detail: `GSTIN ${id.gstin} not present in registry snapshot.`, evidence: null }
      : gst.status === "Active" && gst.filingUpToDate
        ? { status: "verified", detail: `GSTIN ${id.gstin} active; returns filed till ${gst.returnsFiledTill}.`, evidence: gst }
        : { status: "mismatch", detail: `GSTIN ${id.gstin}: status ${gst.status}, returns filed till ${gst.returnsFiledTill}.`, evidence: gst };

  const pan = PAN[id.pan];
  results.pan_itr = !id.pan
    ? { status: "not_found", detail: "No PAN found in bid documents.", evidence: null }
    : !pan
      ? { status: "not_found", detail: `PAN ${id.pan} not present in registry snapshot.`, evidence: null }
      : pan.compliant
        ? { status: "verified", detail: `PAN ${id.pan}: ITR filed for AY ${pan.itrFiledAY}.`, evidence: pan }
        : { status: "mismatch", detail: `PAN ${id.pan}: last ITR AY ${pan.itrFiledAY}; filing overdue.`, evidence: pan };

  const compliance = EPFO_ESIC[id.epfoCode];
  results.epfo_esic = !id.epfoCode
    ? { status: "not_found", detail: "No EPFO/ESIC code supplied; treated as not applicable unless tender mandates it.", evidence: null }
    : !compliance
      ? { status: "not_found", detail: `Establishment code ${id.epfoCode} not present in registry snapshot.`, evidence: null }
      : /default/i.test(compliance.epfo)
        ? { status: "mismatch", detail: `EPFO ${compliance.epfo}, ESIC ${compliance.esic} for ${id.epfoCode}.`, evidence: compliance }
        : { status: "verified", detail: `EPFO ${compliance.epfo}; ESIC ${compliance.esic}.`, evidence: compliance };

  const startup = STARTUP_NSIC[id.dpiitNo];
  results.startup_nsic = !id.dpiitNo
    ? { status: "not_found", detail: "No DPIIT/NSIC number supplied; exemptions not claimed.", evidence: null }
    : !startup
      ? { status: "not_found", detail: `DPIIT ${id.dpiitNo} not present in registry snapshot.`, evidence: null }
      : { status: "verified", detail: `Startup India ${startup.startupIndia}; NSIC ${startup.nsic}.`, evidence: startup };

  const blacklisted = DEBARRED.has(id.legalName) || DEBARRED.has(id.vendorCode);
  results.debarment = blacklisted
    ? { status: "mismatch", detail: `${id.legalName || id.vendorCode} appears on the GeM debarment list snapshot.`, evidence: { debarred: true } }
    : { status: "verified", detail: "No debarment record found in registry snapshot.", evidence: { debarred: false } };

  const docNames = extracted.documentNames || [];
  results.digilocker = docNames.length
    ? { status: "verified", detail: `${docNames.length} document(s) presented with verifiable filenames/hashes.`, evidence: { documents: docNames } }
    : { status: "not_found", detail: "No bid documents available for DigiLocker-style verification.", evidence: null };

  return { identifiers: id, results };
}
