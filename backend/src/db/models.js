// Database selector for the V1 prototype.
//   DB_MODE=file (default)      -> embedded JSON store, zero setup.
//   DB_MODE=supabase            -> Supabase Postgres (needs SUPABASE_URL +
//                                SUPABASE_SERVICE_KEY + schema from
//                                backend/supabase/schema.sql).
// Both backends expose the identical collection API, so routes, middleware
// and seed code import from this file and run unchanged on either.
const mode = (process.env.DB_MODE || "file").toLowerCase();

const backend =
  mode === "supabase" ? await import("./supabaseStore.js") : await import("./store.js");

export const {
  User,
  Vendor,
  Tender,
  Requirement,
  Bid,
  ComplianceResult,
  Evaluation,
  Award,
  AuditLog,
  Document,
  connectDatabase,
  resetDatabase,
} = backend;

export const dbMode = mode === "supabase" ? "supabase" : "file";
