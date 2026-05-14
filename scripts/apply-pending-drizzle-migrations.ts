/**
 * Aplica ficheiros SQL em drizzle/ que ainda não constam em __drizzle_migrations (por hash).
 * Usa multipleStatements para ficheiros com vários comandos.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL em falta");
    process.exit(1);
  }

  const drizzleDir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

  /** `multipleStatements` com string URL não é aplicado de forma fiável no mysql2; usar `uri`. */
  const pool = mysql.createPool({ uri: url, multipleStatements: true });
  try {
    const [existing] = await pool.query<{ hash: string }[]>("SELECT hash FROM __drizzle_migrations");
    const applied = new Set(existing.map((r) => r.hash));

    for (const file of files) {
      const full = path.join(drizzleDir, file);
      const sql = fs.readFileSync(full, "utf8");
      const hash = crypto.createHash("sha256").update(sql).digest("hex");
      if (applied.has(hash)) {
        continue;
      }
      console.log(`Aplicar ${file} (${hash.slice(0, 12)}…)`);
      await pool.query(sql);
      await pool.query(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        [hash, Date.now()],
      );
      applied.add(hash);
      console.log(`  OK ${file}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
