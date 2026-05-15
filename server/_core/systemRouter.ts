import { appSettings } from "../../drizzle/schema";
import { z } from "zod";
import { buildHealthPayload } from "./appVersion";
import { notifyOwner } from "./notification";
import { getDb } from "../db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  /** Sem input — útil para confirmar deploy / versão da API. */
  ping: publicProcedure.query(() => buildHealthPayload()),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Funcionalidade «Planos para empresas» (/planos). Por defeito desactivada;
   * só o Super Admin activa em admin.updateSettings (pricingPlansEnabled).
   */
  getPricingPlansFeature: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { enabled: false as boolean };
    try {
      const rows = await db.select({ enabled: appSettings.pricingPlansEnabled }).from(appSettings).limit(1);
      return { enabled: !!rows[0]?.enabled };
    } catch (e) {
      // Produção sem migração 0018 (coluna pricingPlansEnabled): não rebentar o layout inteiro.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("pricingPlansEnabled") || msg.includes("Unknown column")) {
        console.warn("[getPricingPlansFeature] Coluna em falta na BD — aplicar migrações (drizzle-kit migrate).", msg);
        return { enabled: false as boolean };
      }
      throw e;
    }
  }),

  /** Aviso configurado na Super Admin para todos os utilizadores autenticados (UI omite Super Admin). */
  getUserBroadcastAlert: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { message: null as string | null, revision: 0 };
    }
    const rows = await db
      .select({
        message: appSettings.userBroadcastAlert,
        revision: appSettings.userBroadcastAlertRevision,
      })
      .from(appSettings)
      .limit(1);
    const r = rows[0];
    const msg = typeof r?.message === "string" ? r.message.trim() : "";
    if (!msg) {
      return { message: null as string | null, revision: r?.revision ?? 0 };
    }
    return { message: msg, revision: r?.revision ?? 0 };
  }),
});
