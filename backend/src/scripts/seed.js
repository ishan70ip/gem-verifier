// V1 demo seed: officer + 3 vendors (pass / conditional / fail), one tender
// with statutory + technical requirements, submitted bids with generated
// sample PDFs, so the end-to-end verification flow works immediately after
// `npm run seed` with no manual uploads needed.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase, User, Vendor, Tender, Requirement, Bid, Document } from "../db/models.js";
import { saveBuffer } from "../services/storage.js";

// Minimal single-page text PDF writer (no dependencies).
function makePdf(lines) {
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

const VENDORS = [
  {
    email: "vendor@acme.com",
    legalName: "Acme Procurement Systems Pvt Ltd",
    vendorCode: "VEN-ACME-001",
    contact: { email: "vendor@acme.com", phone: "+91-9876543210" },
    organization: { category: "Small", gstin: "07AAAAA0000A1Z5" },
    bidRef: "BID-ACME-2026-01",
    price: 4850000,
    docLines: [
      "TECHNICAL BID - Supply of HPC Servers (GEM/2026/B/1001)",
      "Bidder: Acme Procurement Systems Pvt Ltd",
      "GSTIN: 07AAAAA0000A1Z5",
      "PAN: AAACA1234F",
      "Udyam Registration: UDYAM-DL-06-0012345",
      "EPFO Establishment Code: DL-CPM-123456",
      "Average annual turnover of Rs 4.5 Crore for last 3 financial years.",
      "12 years of experience executing data centre and server projects.",
      "EMD of Rs 500000 enclosed vide DD No. 881122.",
      "ISO 9001:2015 certified. Certificate No. ISO-2019-44551 valid till 2027.",
      "OEM Authorization from server manufacturer attached (MAF dated 02-Sep-2026).",
      "Local content 62 percent under Make in India (Class-I supplier).",
      "5 years comprehensive on-site warranty offered.",
      "Past orders: 3 government supply orders executed successfully.",
    ],
  },
  {
    email: "vendor2@brightline.in",
    legalName: "Brightline Technologies LLP",
    vendorCode: "VEN-BRIGHT-002",
    contact: { email: "vendor2@brightline.in", phone: "+91-9988776655" },
    organization: { category: "Micro", gstin: "27BBBBB1111B2Z6" },
    bidRef: "BID-BRIGHT-2026-02",
    price: 4690000,
    docLines: [
      "TECHNICAL BID - Supply of HPC Servers (GEM/2026/B/1001)",
      "Bidder: Brightline Technologies LLP",
      "GSTIN: 27BBBBB1111B2Z6",
      "PAN: AALCB5678G",
      "Udyam Registration: UDYAM-MH-19-0098765",
      "DPIIT Startup Recognition: DIPP67890",
      "Average annual turnover of Rs 1.2 Crore for last 3 financial years.",
      "6 years of experience in supply of IT hardware.",
      "EMD of Rs 500000 enclosed.",
      "ISO 9001:2015 certified.",
      "Local content 55 percent under Make in India.",
      "3 years comprehensive on-site warranty offered.",
    ],
  },
  {
    email: "vendor3@shadytraders.in",
    legalName: "Shady Traders Co",
    vendorCode: "VEN-SHADY-003",
    contact: { email: "vendor3@shadytraders.in", phone: "+91-9000000007" },
    organization: { category: "Micro", gstin: "29CCCCC2222C3Z7" },
    bidRef: "BID-SHADY-2026-03",
    price: 3900000,
    docLines: [
      "BID FOR SERVERS GEM/2026/B/1001",
      "Bidder: Shady Traders Co",
      "GSTIN: 29CCCCC2222C3Z7",
      "PAN: AAKCS9999H",
      "Udyam Registration: UDYAM-KA-03-0001112",
      "Annual turnover Rs 40 Lakh approx.",
      "2 years of experience in general trading.",
    ],
  },
];

const REQUIREMENTS = [
  { title: "Udyam / MSME registration", description: "Bidder must hold valid Udyam registration.", category: "Statutory", mandatory: true },
  { title: "GST registration and return filing", description: "Active GSTIN with returns filed up to date.", category: "Statutory", mandatory: true },
  { title: "PAN and Income Tax compliance", description: "Valid PAN with latest ITR filed.", category: "Statutory", mandatory: true },
  { title: "Minimum average annual turnover", description: "Minimum average annual turnover: Rs 10000000 (Rs 1 Crore) over last 3 years.", category: "Financial", mandatory: true },
  { title: "Minimum years of experience", description: "Minimum 5 years of experience in relevant supplies with past order proof.", category: "Eligibility", mandatory: true },
  { title: "Earnest Money Deposit", description: "Minimum EMD required: Rs 500000.", category: "Financial", mandatory: true },
  { title: "ISO 9001 Certification", description: "Vendor must possess valid ISO 9001 certificate.", category: "Quality", mandatory: true },
  { title: "OEM Authorisation", description: "Valid OEM authorisation / MAF for quoted servers.", category: "Technical", mandatory: true },
  { title: "Make in India local content", description: "Minimum 50 percent local content (Class-I supplier preferred).", category: "Policy", mandatory: false },
  { title: "On-site warranty", description: "Minimum 3 years comprehensive on-site warranty.", category: "Technical", mandatory: false },
];

export async function seedDatabase() {
  await connectDatabase();
  console.log("Seeding V1 demo database...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  async function ensureUser(email, role) {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, passwordHash, role, isActive: true });
      console.log("Created user:", email);
    }
    const plain = user.toObject ? user.toObject() : user;
    return plain;
  }

  const officerUser = await ensureUser("officer@procurement.gov.in", "officer");

  let tender = await Tender.findOne({ referenceNumber: "GEM/2026/B/1001" });
  if (!tender) {
    tender = await Tender.create({
      referenceNumber: "GEM/2026/B/1001",
      title: "Supply of High-Performance Computing Servers",
      department: "Department of Electronics & IT",
      description: "Procurement of rack-mountable enterprise server infrastructure with minimum 50 percent local content.",
      submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "OPEN",
      createdBy: officerUser._id,
    });
    console.log("Created Tender:", "GEM/2026/B/1001");
  }
  const tenderPlain = tender.toObject ? tender.toObject() : tender;

  const existingReqs = await Requirement.find({ tenderId: tenderPlain._id }).lean();
  if (!existingReqs.length) {
    await Requirement.insertMany(
      REQUIREMENTS.map((item, index) => ({
        tenderId: tenderPlain._id,
        title: item.title,
        description: item.description,
        category: item.category,
        mandatory: item.mandatory,
        requirementOrder: index + 1,
      }))
    );
    console.log("Inserted", REQUIREMENTS.length, "tender requirements");
  }

  for (const v of VENDORS) {
    const user = await ensureUser(v.email, "vendor");
    let profile = await Vendor.findOne({ userId: user._id });
    if (!profile) {
      profile = await Vendor.create({
        userId: user._id,
        legalName: v.legalName,
        vendorCode: v.vendorCode,
        contact: v.contact,
        organization: v.organization,
        status: "Active",
      });
      console.log("Created vendor profile:", v.legalName);
    }
    const profilePlain = profile.toObject ? profile.toObject() : profile;

    let bid = await Bid.findOne({ tenderId: tenderPlain._id, vendorId: profilePlain._id });
    if (!bid) {
      bid = await Bid.create({
        tenderId: tenderPlain._id,
        vendorId: profilePlain._id,
        submissionStatus: "SUBMITTED",
        submittedAt: new Date(),
        bidReference: v.bidRef,
        bidMetadata: { quotedPrice: v.price, deliveryTimelineDays: 30, remarks: "Seeded demo bid" },
      });
      console.log("Created bid:", v.bidRef);
    }
    const bidPlain = bid.toObject ? bid.toObject() : bid;

    const filename = `${v.vendorCode}-technical-bid.pdf`;
    const existingDoc = await Document.findOne({ bidId: bidPlain._id });
    if (!existingDoc) {
      const stored = await saveBuffer(filename, makePdf(v.docLines), "application/pdf");
      console.log("Generated sample PDF:", filename);
      await Document.create({
        bidId: bidPlain._id,
        tenderId: tenderPlain._id,
        vendorId: profilePlain._id,
        documentType: "Technical Proposal",
        originalFilename: filename,
        storagePath: stored.storagePath,
        mimeType: "application/pdf",
        fileSize: stored.fileSize,
        uploadedBy: user._id,
        visibility: "vendor_and_officer",
        status: "ACTIVE",
        uploadedAt: new Date(),
      });
    }
  }

  console.log("Database seed completed successfully!");
  console.log("Logins (password for all: Password123!):");
  console.log("  officer: officer@procurement.gov.in");
  console.log("  vendors: vendor@acme.com, vendor2@brightline.in, vendor3@shadytraders.in");
}

if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
