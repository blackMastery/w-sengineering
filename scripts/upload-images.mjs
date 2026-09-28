// Upload extracted catalog photos to Supabase Storage (bucket: product-images, folder: catalog/).
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-images.mjs [dir]
// Safe to re-run: existing files are overwritten (upsert).
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2] ?? "data/images";
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const files = (await readdir(dir)).filter((f) => f.endsWith(".webp"));
let done = 0, failed = 0;
const queue = [...files];

async function worker() {
  while (queue.length) {
    const f = queue.shift();
    const body = await readFile(path.join(dir, f));
    const { error } = await supabase.storage
      .from("product-images")
      .upload(`catalog/${f}`, body, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    if (error) { failed++; console.error(f, error.message); } else done++;
    if ((done + failed) % 100 === 0) console.log(`${done + failed}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Uploaded ${done}, failed ${failed}`);
