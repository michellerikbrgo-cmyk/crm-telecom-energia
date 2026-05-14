import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  crmNotifications,
  systemApiUsage,
  systemApiUsageAlerts,
  users,
} from "../../drizzle/schema";

const ALERT_CODE_NEAR_QUOTA = "quota_90_pct";

export type GeminiQuotaPeriod = "day" | "month";

function geminiQuotaPeriod(): GeminiQuotaPeriod {
  const p = process.env.GEMINI_QUOTA_PERIOD?.trim().toLowerCase();
  return p === "month" ? "month" : "day";
}

/** Chave de período (fuso `GEMINI_QUOTA_TIMEZONE` ou Lisboa). Usada também para contagens Tavily no painel. */
export function currentQuotaPeriodKey(): string {
  const tz = process.env.GEMINI_QUOTA_TIMEZONE?.trim() || "Europe/Lisbon";
  const now = new Date();
  if (geminiQuotaPeriod() === "month") {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
    }).format(now);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Limite de referência para alerta (pedidos por período). 0 = sem alerta nem percentagem. */
export function parseGeminiFreeQuotaLimit(): number {
  const raw = process.env.GEMINI_FREE_QUOTA?.trim();
  if (raw === "" || raw === undefined) return 1500;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1500;
  return Math.floor(n);
}

function isDuplicateKeyError(e: unknown): boolean {
  const err = e as { errno?: number; code?: string };
  return err.errno === 1062 || err.code === "ER_DUP_ENTRY";
}

async function maybeNotifyGeminiQuotaNearExhaustion(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  periodKey: string,
): Promise<void> {
  const limit = parseGeminiFreeQuotaLimit();
  if (limit <= 0) return;

  const row = await db
    .select({ c: systemApiUsage.requestCount })
    .from(systemApiUsage)
    .where(
      and(eq(systemApiUsage.provider, "gemini"), eq(systemApiUsage.periodKey, periodKey)),
    )
    .limit(1);

  const count = row[0]?.c ?? 0;
  const threshold = Math.ceil(limit * 0.9);
  if (count < threshold) return;

  try {
    await db.insert(systemApiUsageAlerts).values({
      provider: "gemini",
      periodKey,
      alertCode: ALERT_CODE_NEAR_QUOTA,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) return;
    console.warn("[globalApiUsage] alert insert:", e);
    return;
  }

  const periodLabel = geminiQuotaPeriod() === "month" ? "mensal" : "diário";
  const remaining = Math.max(0, limit - count);
  const msg = `Uso global Gemini: ${count} / ${limit} pedidos (${periodLabel}, período ${periodKey}). Restam cerca de ${remaining} (≤10% do limite configurado). Revisa GEMINI_FREE_QUOTA e os limites em Google AI Studio.`;

  const superRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isSuperAdmin, true));

  for (const { id } of superRows) {
    try {
      await db.insert(crmNotifications).values({
        userId: id,
        type: "warning",
        message: msg,
      });
    } catch (e) {
      console.warn("[globalApiUsage] notificação super admin:", id, e);
    }
  }
}

/** Conta um pedido HTTP bem-sucedido ao fornecedor (toda a instalação CRM, sem filtro por empresa). */
export async function incrementGlobalApiUsage(provider: "gemini" | "tavily"): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const periodKey = currentQuotaPeriodKey();
  try {
    await db
      .insert(systemApiUsage)
      .values({
        provider,
        periodKey,
        requestCount: 1,
      })
      .onDuplicateKeyUpdate({
        set: {
          requestCount: sql`${systemApiUsage.requestCount} + 1`,
        },
      });
  } catch (e) {
    console.warn("[globalApiUsage] increment falhou:", provider, e);
    return;
  }

  if (provider === "gemini") {
    await maybeNotifyGeminiQuotaNearExhaustion(db, periodKey);
  }
}

export async function getGlobalApiUsageSnapshot() {
  const periodKey = currentQuotaPeriodKey();
  const limit = parseGeminiFreeQuotaLimit();
  const period = geminiQuotaPeriod();
  const timezone = process.env.GEMINI_QUOTA_TIMEZONE?.trim() || "Europe/Lisbon";

  const db = await getDb();
  if (!db) {
    return {
      period,
      periodKey,
      timezone,
      geminiFreeQuota: limit,
      gemini: {
        requestCount: 0,
        freeQuotaLimit: limit,
        percentUsed: null as number | null,
        alertTriggeredThisPeriod: false,
      },
      tavily: { requestCount: 0 },
    };
  }

  const rows = await db
    .select()
    .from(systemApiUsage)
    .where(
      and(
        eq(systemApiUsage.periodKey, periodKey),
        inArray(systemApiUsage.provider, ["gemini", "tavily"]),
      ),
    );

  const geminiCount =
    rows.find((r) => r.provider === "gemini")?.requestCount ?? 0;
  const tavilyCount =
    rows.find((r) => r.provider === "tavily")?.requestCount ?? 0;

  const alertRows = await db
    .select({ id: systemApiUsageAlerts.id })
    .from(systemApiUsageAlerts)
    .where(
      and(
        eq(systemApiUsageAlerts.provider, "gemini"),
        eq(systemApiUsageAlerts.periodKey, periodKey),
        eq(systemApiUsageAlerts.alertCode, ALERT_CODE_NEAR_QUOTA),
      ),
    )
    .limit(1);

  const percentUsed =
    limit > 0 ? Math.min(100, Math.round((geminiCount / limit) * 1000) / 10) : null;

  return {
    period,
    periodKey,
    timezone,
    geminiFreeQuota: limit,
    gemini: {
      requestCount: geminiCount,
      freeQuotaLimit: limit,
      percentUsed,
      alertTriggeredThisPeriod: alertRows.length > 0,
    },
    tavily: { requestCount: tavilyCount },
  };
}
