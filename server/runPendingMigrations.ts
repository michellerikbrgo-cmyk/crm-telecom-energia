import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

/**
 * Aplica migrações em falta (mesmo fluxo que `drizzle-kit migrate`).
 * Garante que a BD acompanha o schema após deploys que só reiniciam o processo.
 */
export async function runPendingMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATE_ON_START === "1") {
    console.warn("[migrate] SKIP_DB_MIGRATE_ON_START=1 — migrações não foram executadas ao arranque.");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL em falta — a ignorar.");
    return;
  }

  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const journal = path.join(migrationsFolder, "meta", "_journal.json");
  if (!fs.existsSync(journal)) {
    console.warn(
      "[migrate] Pasta de migrações não encontrada (cwd=%s, esperado %s) — a ignorar.",
      process.cwd(),
      migrationsFolder,
    );
    return;
  }

  const conn = await mysql.createConnection(url);
  const db = drizzle(conn);
  try {
    console.log("[migrate] A verificar / aplicar migrações Drizzle em", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] Migrações em dia.");
  } finally {
    await conn.end();
  }
}
