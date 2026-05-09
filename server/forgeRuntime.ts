/**
 * URL + token Forge/Manus: variáveis de ambiente têm prioridade; senão lê-se `appSettings` (Super Admin).
 */
import { ENV } from "./_core/env";
import { decryptText } from "./_core/cryptoSecrets";
import { getDb } from "./db";
import { appSettings } from "../drizzle/schema";

let cached: { url: string; key: string; at: number } | null = null;
const TTL_MS = 60_000;

export function invalidateForgeRuntimeCache() {
  cached = null;
}

export async function getForgeRuntimeConfig(): Promise<{ forgeUrl: string; forgeKey: string } | null> {
  const envUrl = (ENV.forgeApiUrl || "").trim();
  const envKey = (ENV.forgeApiKey || "").trim();
  if (envUrl && envKey) {
    return { forgeUrl: envUrl.replace(/\/+$/, ""), forgeKey: envKey };
  }

  if (cached && Date.now() - cached.at < TTL_MS) {
    return { forgeUrl: cached.url, forgeKey: cached.key };
  }

  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(appSettings).limit(1);
  const row = rows[0] as { forgeApiUrl?: string | null; forgeApiKeyEnc?: string | null } | undefined;
  if (!row) return null;

  const key = decryptText(row.forgeApiKeyEnc);
  if (!key) return null;

  const urlRaw = (row.forgeApiUrl || "").trim();
  const forgeUrl = (urlRaw || "https://forge.manus.im").replace(/\/+$/, "");

  cached = { url: forgeUrl, key, at: Date.now() };
  return { forgeUrl, forgeKey: key };
}
