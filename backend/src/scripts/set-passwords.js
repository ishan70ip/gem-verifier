import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase, User } from "../db/models.js";

// Updates the password for demo accounts WITHOUT reseeding (no data loss).
// Run: node src/scripts/set-passwords.js [password]
//   DB_MODE=file npm ...      -> local laptop DB
//   DB_MODE=supabase npm ...  -> cloud production DB
const DEMO_EMAILS = [
  "officer@procurement.gov.in",
  "vendor@acme.com",
  "vendor2@brightline.in",
  "vendor3@shadytraders.in",
];

const password = process.argv[2] || "GeM#Demo2026!Verify";
await connectDatabase();
const passwordHash = await bcrypt.hash(password, 10);
for (const email of DEMO_EMAILS) {
  const user = await User.findOne({ email });
  if (!user) {
    console.log("missing (skipped):", email);
    continue;
  }
  const plain = user.toObject ? user.toObject() : user;
  await User.findByIdAndUpdate(plain._id, { passwordHash });
  console.log("updated:", email);
}
console.log("done.");
process.exit(0);
