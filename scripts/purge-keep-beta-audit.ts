/**
 * Apaga dados de todas as tabelas CRM excepto:
 *   - auditLogs (auditoria)
 *   - featureSuggestions + featureSuggestionEdits (Beta)
 *
 * Requer DATABASE_URL. Depois correr: pnpm ensure-super-admin
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const KEEP = new Set(["auditLogs", "featureSuggestions", "featureSuggestionEdits"]);

/** Nomes = primeira arg de mysqlTable no schema (pode faltar alguma se migração antiga). */
const TABLES = [
  "campaignFiles",
  "calendarEvents",
  "contracts",
  "pendentes",
  "callLogs",
  "call_feedback",
  "fidelizacoes_terminando",
  "crm_notifications",
  "sales",
  "blacklist",
  "sosRequests",
  "gamification",
  "energyCalculations",
  "competitorScripts",
  "contactOrigins",
  "energyConfig",
  "contact_subcontacts",
  "contacts",
  "campaigns",
  "teams",
  "users",
  "companies",
  "appSettings",
];

async function deleteFromOrSkip(conn: mysql.Connection, t: string) {
  if (KEEP.has(t)) return;
  try {
    await conn.query(`DELETE FROM \`${t}\``);
    console.log("OK:", t);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "ER_NO_SUCH_TABLE") {
      console.warn("Ignorada (tabela inexistente):", t);
      return;
    }
    throw e;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL em falta.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of TABLES) {
      await deleteFromOrSkip(conn, t);
    }
  } finally {
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=1");
    } catch {
      /* ignore */
    }
    await conn.end();
  }

  console.log("Concluído. Mantidos:", [...KEEP].join(", "));
  console.log("Execute: pnpm ensure-super-admin");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
