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
