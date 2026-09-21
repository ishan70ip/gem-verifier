// Shared dummy-PDF helpers + mock GeM seller-bid registry.
// makePdf(): minimal single-page text PDF writer (no dependencies).
// GEM_BIDS: deterministic stand-in for GeM portal bid records. The real GeM
// portal exposes no public API, so vendor-side "Import from GeM" resolves a
// GeM seller-bid ID against this registry (same pattern as mockPortals.js)
// and materializes the listed documents. Production swaps the lookup for an
// authorized GeM connector; routes and UI stay unchanged.
export function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let y = 720;
  const cmds = ["BT /F1 11 Tf"];
  for (const line of lines) {
    cmds.push(`1 0 0 1 50 ${y} Tm (${esc(line.slice(0, 110))}) Tj`);
    y -= 15;
    if (y < 40) break;
  }
  cmds.push("ET");
  const content = cmds.join("\n");
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>";
  objs[4] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf);
}

// Demo GeM seller bids importable from the vendor portal.
// IDs are shown in the UI placeholder so judges can try them.
export const GEM_BIDS = {
  "GEM-BID-2026-101": {
    seller: "Acme Procurement Systems Pvt Ltd",
    tenderRef: "GEM/2026/B/1002",
    docs: [
      {
        type: "Technical Proposal",
        name: "gem-import-technical-proposal.pdf",
        lines: [
          "TECHNICAL PROPOSAL - Imported from GeM Seller Bid GEM-BID-2026-101",
          "Bidder: Acme Procurement Systems Pvt Ltd",
          "GSTIN: 07AAAAA0000A1Z5",
          "PAN: AAACA1234F",
          "Udyam Registration: UDYAM-DL-06-0012345",
          "Average annual turnover of Rs 4.5 Crore for last 3 financial years.",
          "12 years of experience executing office equipment projects.",
          "EMD of Rs 500000 enclosed vide DD No. 901133.",
          "ISO 9001:2015 certified. Certificate valid till 2027.",
          "OEM Authorization from printer manufacturer attached.",
          "Local content 62 percent under Make in India.",
          "3 years comprehensive on-site warranty offered.",
        ],
      },
      {
        type: "ISO 9001 Certificate",
        name: "gem-import-iso-certificate.pdf",
        lines: [
          "ISO 9001:2015 CERTIFICATE - Imported from GeM",
          "Certified: Acme Procurement Systems Pvt Ltd",
          "Certificate No. ISO-2019-44551 valid till 31-12-2027.",
          "Scope: Supply and support of office equipment.",
        ],
      },
    ],
  },
  "GEM-BID-2026-102": {
    seller: "General Bidder",
    tenderRef: "GEM/2026/B/1002",
    docs: [
      {
        type: "GST Certificate",
        name: "gem-import-gst-certificate.pdf",
        lines: [
          "GST REGISTRATION CERTIFICATE - Imported from GeM",
          "Legal Name: Brightline Technologies LLP",
          "GSTIN: 27BBBBB1111B2Z6",
          "State: Maharashtra. Returns filed up to date.",
        ],
      },
      {
        type: "Udyam Certificate",
        name: "gem-import-udyam-certificate.pdf",
        lines: [
          "UDYAM REGISTRATION CERTIFICATE - Imported from GeM",
          "Enterprise: Brightline Technologies LLP",
          "Udyam Registration: UDYAM-MH-19-0098765",
          "Category: Micro. Registered 2021.",
        ],
      },
    ],
  },
  "GEM-BID-2026-103": {
    seller: "General Bidder",
    tenderRef: "GEM/2026/B/1002",
    docs: [
      {
        type: "OEM Letter",
        name: "gem-import-oem-letter.pdf",
        lines: [
          "MANUFACTURER AUTHORISATION FORM - Imported from GeM",
          "Ref: MAF/PRN/2026/2207",
          "We authorize the bidder to quote and support our printers.",
          "OEM Authorization from printer manufacturer attached.",
          "Back-to-back 3 years comprehensive on-site warranty assured.",
        ],
      },
      {
        type: "Warranty Certificate",
        name: "gem-import-warranty-certificate.pdf",
        lines: [
          "WARRANTY CERTIFICATE - Imported from GeM",
          "3 years comprehensive on-site warranty offered.",
          "Local content 55 percent under Make in India.",
        ],
      },
    ],
  },
  "GEM-BID-2026-104": {
    seller: "General Bidder",
    tenderRef: "GEM/2026/B/1002",
    docs: [
      {
        type: "Financial Statement",
        name: "gem-import-financial-statement.pdf",
        lines: [
          "AUDITED FINANCIAL SUMMARY - Imported from GeM",
          "Average annual turnover of Rs 1.2 Crore for last 3 financial years.",
          "Chartered Accountant certified. UDIN referenced.",
        ],
      },
      {
        type: "EMD Instrument",
        name: "gem-import-emd-receipt.pdf",
        lines: [
          "EMD PAYMENT RECEIPT - Imported from GeM",
          "EMD of Rs 200000 paid vide GeM portal gateway.",
          "Transaction ID GEM-EMD-88231 dated 2026.",
        ],
      },
      {
        type: "Past Contract Experience",
        name: "gem-import-experience-letter.pdf",
        lines: [
          "EXPERIENCE CERTIFICATE - Imported from GeM",
          "6 years of experience in supply of IT hardware to government offices.",
          "Three completed orders with satisfactory performance remarks.",
        ],
      },
    ],
  },
  "GEM-BID-2026-105": {
    seller: "General Bidder",
    tenderRef: "GEM/2026/B/1002",
    docs: [
      {
        type: "EPFO Compliance",
        name: "gem-import-epfo-challan.pdf",
        lines: [
          "EPFO ECR CHALLAN - Imported from GeM",
          "Establishment Code: MH-BAN-654321",
          "Contributions deposited up to date. No defaults.",
        ],
      },
      {
        type: "PAN Card",
        name: "gem-import-pan-card.pdf",
        lines: [
          "PERMANENT ACCOUNT NUMBER CARD - Imported from GeM",
          "PAN: AALCB5678G",
          "Name: Brightline Technologies LLP",
        ],
      },
    ],
  },
};

export const GEM_BID_IDS = Object.keys(GEM_BIDS);

export function lookupGemBid(gemBidId) {
  const key = (gemBidId || "").trim().toUpperCase();
  return GEM_BIDS[key] || null;
}
