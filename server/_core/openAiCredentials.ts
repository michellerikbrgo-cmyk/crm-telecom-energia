import { appSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { decryptText } from "./cryptoSecrets";

export function looksLikeOpenAiApiKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const k = value.trim();
  return k.startsWith("sk-");
}

/** Chaves API Google Gemini / AI Studio (começam normalmente por `AIza`). */
export function looksLikeGeminiApiKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const k = value.trim();
  return k.startsWith("AIza");
}

export type LlmKeyBundle = {
  preference: "openai" | "gemini" | "deepseek" | "claude";
  /** Chave válida formato OpenAI (Whisper/chat). */
  openaiKey: string | null;
  /** Chave Gemini (chat). */
  geminiKey: string | null;
};

export async function loadLlmKeyBundle(): Promise<LlmKeyBundle> {
  let preference: LlmKeyBundle["preference"] = "openai";
  let rawOpenDb: string | null = null;
  let rawGemDb: string | null = null;

  try {
    const db = await getDb();
    if (db) {
      const sk = await db.select().from(appSettings).limit(1);
      const row = sk[0];
      if (row?.preferredAiProvider) preference = row.preferredAiProvider;
      rawOpenDb = row?.openaiApiKeyEnc ? decryptText(row.openaiApiKeyEnc) : null;
      rawGemDb = row?.geminiApiKeyEnc ? decryptText(row.geminiApiKeyEnc) : null;
    }
  } catch {
    /* ignore DB */
  }

  const envOpen = process.env.OPENAI_API_KEY?.trim();
  const envGem = process.env.GEMINI_API_KEY?.trim();

  const openaiKey =
    (looksLikeOpenAiApiKey(envOpen) ? envOpen.trim() : null) ??
    (looksLikeOpenAiApiKey(rawOpenDb) ? rawOpenDb!.trim() : null);
  const geminiKey =
    (looksLikeGeminiApiKey(envGem) ? envGem.trim() : null) ??
    (looksLikeGeminiApiKey(rawGemDb) ? rawGemDb!.trim() : null);

  return { preference, openaiKey, geminiKey };
}

/** Chave OpenAI: `OPENAI_API_KEY` (só formato `sk-…`) ou Super Admin. Whisper e chat fallback. */
export async function getOpenAiApiKey(): Promise<string | null> {
  const bundle = await loadLlmKeyBundle();
  return bundle.openaiKey;
}

/** GEMINI_API_KEY ou campo Gemini na Super Admin. */
export async function getGeminiApiKey(): Promise<string | null> {
  const bundle = await loadLlmKeyBundle();
  return bundle.geminiKey;
}

/** Ordem chat: respeita fornecedor preferido; sempre tenta segundo backend se falhar ou inexistente. */
export async function resolveChatBackendOrder(
  cached?: LlmKeyBundle | null,
): Promise<readonly ("openai" | "gemini")[]> {
  const { preference, openaiKey, geminiKey } = cached ?? (await loadLlmKeyBundle());

  const primary: "openai" | "gemini" =
    preference === "gemini"
      ? "gemini"
      : /** deepseek/claude: ainda não têm servidor dedicado → OpenAI primeiro. */
        "openai";
  const ordered: ("openai" | "gemini")[] =
    primary === "gemini" ? ["gemini", "openai"] : ["openai", "gemini"];

  const has = (which: "openai" | "gemini") =>
    which === "openai" ? !!openaiKey : !!geminiKey;

  return ordered.filter(has) as ("openai" | "gemini")[];
}
