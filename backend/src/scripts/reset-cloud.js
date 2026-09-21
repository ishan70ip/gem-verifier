import "dotenv/config";
import { connectDatabase, resetDatabase } from "../db/models.js";

// Cloud reset without direct Postgres (uses the API layer, works even when
// the db.* hostname is unavailable). Run: DB_MODE=supabase node src/scripts/reset-cloud.js
// WARNING: deletes all application rows. Schema, bucket, policies untouched.
await connectDatabase();
await resetDatabase();
console.log("CLOUD RESET OK");
process.exit(0);
