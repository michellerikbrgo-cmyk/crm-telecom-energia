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

/** Anthropic (Claude): normalmente `sk-ant-api…`. */
export function looksLikeAnthropicApiKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const k = value.trim();
  return k.startsWith("sk-ant-");
}

/**
 * DeepSeek (API compatível OpenAI): formato variável; exclui Gemini e Anthropic.
 * Validação leve — o campo na BD é específico para DeepSeek.
 */
export function looksLikeDeepSeekApiKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const k = value.trim();
  if (k.length < 10) return false;
  if (looksLikeGeminiApiKey(k)) return false;
  if (looksLikeAnthropicApiKey(k)) return false;
  return true;
}

export type ChatBackend = "openai" | "gemini" | "deepseek" | "claude";

export type LlmKeyBundle = {
  preference: ChatBackend;
  /** Chave válida formato OpenAI (Whisper/chat). */
  openaiKey: string | null;
  /** Chave Gemini (chat). */
  geminiKey: string | null;
  /** DeepSeek (endpoint compatível OpenAI). */
  deepseekKey: string | null;
  /** Anthropic Claude (Messages API). */
  claudeKey: string | null;
};

export async function loadLlmKeyBundle(): Promise<LlmKeyBundle> {
  let preference: LlmKeyBundle["preference"] = "openai";
  let rawOpenDb: string | null = null;
  let rawGemDb: string | null = null;
  let rawDeepDb: string | null = null;
  let rawClaudeDb: string | null = null;

  try {
    const db = await getDb();
    if (db) {
      const sk = await db.select().from(appSettings).limit(1);
      const row = sk[0];
      if (row?.preferredAiProvider) preference = row.preferredAiProvider;
      rawOpenDb = row?.openaiApiKeyEnc ? decryptText(row.openaiApiKeyEnc) : null;
      rawGemDb = row?.geminiApiKeyEnc ? decryptText(row.geminiApiKeyEnc) : null;
      rawDeepDb = row?.deepseekApiKeyEnc ? decryptText(row.deepseekApiKeyEnc) : null;
      rawClaudeDb = row?.claudeApiKeyEnc ? decryptText(row.claudeApiKeyEnc) : null;
    }
  } catch {
    /* ignore DB */
  }

  const envOpen = process.env.OPENAI_API_KEY?.trim();
  const envGem = process.env.GEMINI_API_KEY?.trim();
  const envDeep = process.env.DEEPSEEK_API_KEY?.trim();
  const envClaude =
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY?.trim();

  const openaiKey =
    (looksLikeOpenAiApiKey(envOpen) ? envOpen.trim() : null) ??
    (looksLikeOpenAiApiKey(rawOpenDb) ? rawOpenDb!.trim() : null);
  const geminiKey =
    (looksLikeGeminiApiKey(envGem) ? envGem.trim() : null) ??
    (looksLikeGeminiApiKey(rawGemDb) ? rawGemDb!.trim() : null);
  const deepseekKey =
    (looksLikeDeepSeekApiKey(envDeep) ? envDeep.trim() : null) ??
    (looksLikeDeepSeekApiKey(rawDeepDb) ? rawDeepDb!.trim() : null);
  const claudeKey =
    (looksLikeAnthropicApiKey(envClaude) ? envClaude.trim() : null) ??
    (looksLikeAnthropicApiKey(rawClaudeDb) ? rawClaudeDb!.trim() : null);

  return { preference, openaiKey, geminiKey, deepseekKey, claudeKey };
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

const CHAT_BACKEND_FALLBACK_ORDER: readonly ChatBackend[] = [
  "openai",
  "gemini",
  "deepseek",
  "claude",
];

/** Ordem chat: preferência primeiro; depois os outros que tenham chave. */
export async function resolveChatBackendOrder(
  cached?: LlmKeyBundle | null,
): Promise<readonly ChatBackend[]> {
  const bundle = cached ?? (await loadLlmKeyBundle());
  const { preference, openaiKey, geminiKey, deepseekKey, claudeKey } = bundle;

  const ordered: ChatBackend[] = [
    preference,
    ...CHAT_BACKEND_FALLBACK_ORDER.filter((b) => b !== preference),
  ];

  const hasKey = (which: ChatBackend): boolean => {
    switch (which) {
      case "openai":
        return !!openaiKey;
      case "gemini":
        return !!geminiKey;
      case "deepseek":
        return !!deepseekKey;
      case "claude":
        return !!claudeKey;
      default:
        return false;
    }
  };

  return ordered.filter(hasKey);
}
