// File storage driver for the V1 prototype.
//   - Default (no Supabase configured): local disk under UPLOAD_DIR.
//   - Production (SUPABASE_URL + SUPABASE_SERVICE_KEY set): Supabase
//     Storage bucket (default 'bid-uploads', override SUPABASE_BUCKET).
// storagePath values are self-describing: local paths stay filesystem
// paths, Supabase objects are stored as "supabase://bucket/key".
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/index.js";

const BUCKET = process.env.SUPABASE_BUCKET || "bid-uploads";

export function storageMode() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? "supabase" : "local";
}

async function supabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function safeName(name) {
  return path.basename(name || "upload.bin").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

// Persist a multer temporary file. Returns { storagePath, fileSize }.
export async function saveUpload(file) {
  if (storageMode() === "supabase") {
    const supabase = await supabaseAdmin();
    const buffer = await fs.readFile(file.path);
    const key = `${Date.now()}_${safeName(file.originalname)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
    });
    await fs.unlink(file.path).catch(() => {});
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return { storagePath: `supabase://${BUCKET}/${key}`, fileSize: buffer.length };
  }
  await fs.mkdir(config.uploadDir, { recursive: true });
  const target = path.join(config.uploadDir, `${file.filename}_${safeName(file.originalname)}`);
  await fs.rename(file.path, target);
  return { storagePath: target, fileSize: file.size };
}

// Persist an in-memory buffer (used by the seed script).
export async function saveBuffer(filename, buffer, mimeType = "application/octet-stream") {
  if (storageMode() === "supabase") {
    const supabase = await supabaseAdmin();
    const key = `${Date.now()}_${safeName(filename)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return { storagePath: `supabase://${BUCKET}/${key}`, fileSize: buffer.length };
  }
  await fs.mkdir(config.uploadDir, { recursive: true });
  const target = path.join(config.uploadDir, safeName(filename));
  await fs.writeFile(target, buffer);
  return { storagePath: target, fileSize: buffer.length };
}

export async function fileExists(storagePath) {
  if (storagePath.startsWith("supabase://")) return true; // checked on read
  try {
    await fs.access(storagePath);
    return true;
  } catch {
    return false;
  }
}

// Read a stored file back into a Buffer (for parsing + downloads).
export async function readFile(storagePath) {
  if (storagePath.startsWith("supabase://")) {
    const supabase = await supabaseAdmin();
    const [, rest] = storagePath.split("supabase://");
    const slash = rest.indexOf("/");
    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    const { data, error } = await supabase.storage.from(bucket).download(key);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(storagePath);
}
