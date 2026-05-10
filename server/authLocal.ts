import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { isSuperAdminUser, resolveUserTeamScopeId, whereUsersForUser } from "./tenantScope";
import bcrypt from "bcryptjs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import {
  getClientIp,
  getClientUserAgent,
  lookupGeoLabel,
} from "./_core/clientMeta";

/** MySQL às vezes devolve 0/1 em vez de boolean. */
function truthyFlag(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function canListUsersDirectory(u: Record<string, unknown> | null | undefined): boolean {
  if (!u) return false;
  if (truthyFlag(u.isSuperAdmin)) return true;
  return ["ce", "coordenador", "cej"].includes(String(u.crmRole || ""));
}

/** Cada nível só cria cargos estritamente mais baixos (inferior hierárquico). Super admin não passa aqui (cria todos). */
function assertHierarchyCreatesBelowOnly(creator: Record<string, unknown>, targetRole: string): void {
  const R: Record<string, number> = {
    vendedor: 1,
    cej: 2,
    ce: 3,
    coordenador: 4,
  };
  const creatorCr = String(creator.crmRole || "");
  const creatorRank = R[creatorCr] ?? 0;
  const targetRank = R[targetRole] ?? 0;

  if (creatorRank <= 1 || creatorRank <= targetRank) {
    throw new Error(
      "Só pode criar cargos hierarquicamente abaixo do seu — não pode criar um igual ou superior.",
    );
  }
}

export const authLocalRouter = router({
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");

      const result = await db.select().from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (result.length === 0) {
        throw new Error("E-mail ou senha incorretos");
      }

      const user = result[0];
      if (!user.password) {
        throw new Error("E-mail ou senha incorretos");
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new Error("E-mail ou senha incorretos");
      }

      const token = await sdk.createSessionToken(user.openId, {
        name: (user.name?.trim() || user.email || "Utilizador").slice(0, 200),
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

      const ip = getClientIp(ctx.req as any);
      const ua = getClientUserAgent(ctx.req as any);
      await db
        .update(users)
        .set({
          isOnline: true,
          lastOnlineAt: new Date(),
          presenceSessionStartedAt: new Date(),
          lastSeenIp: ip || null,
          lastSeenUserAgent: ua || null,
          pauseStartedAt: null,
        } as any)
        .where(eq(users.id, user.id));

      void lookupGeoLabel(ip).then((geo) => {
        if (!geo) return;
        void db.update(users).set({ lastSeenGeo: geo } as any).where(eq(users.id, user.id));
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          crmRole: user.crmRole,
          tenantId: (user as any).tenantId ?? null,
          isSuperAdmin: (user as any).isSuperAdmin,
        },
      };
    }),

  /** Lista coordenadores (empresas/tenants) — só Super Admin escolher ao criar outros cargos. */
  listCoordinators: protectedProcedure.query(async ({ ctx }) => {
    if (!truthyFlag((ctx.user as any)?.isSuperAdmin)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Só Super Admin pode listar empresas (coordenadores)." });
    }
    const db = await getDb();
    if (!db) return [];

    return await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.crmRole, "coordenador"))
      .orderBy(users.name);
  }),

  register: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        crmRole: z.enum(["vendedor", "cej", "ce", "coordenador"]),
        /** Obrigatório quando Super Admin cria não-coordenador (= empresa / tenant destino). */
        tenantCoordinatorUserId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");

      const currentUser = ctx.user as Record<string, unknown>;
      const isSa = truthyFlag(currentUser.isSuperAdmin);

      if (isSa) {
        // Super admin cria qualquer papel.
      } else {
        assertHierarchyCreatesBelowOnly(currentUser, input.crmRole);
      }

      // --- Tenant (empresa): ID do utilizador Coordenador dono ---
      let tenantToAssign: number | null = null;

      if (input.crmRole === "coordenador") {
        if (!isSa) {
          throw new Error("Apenas o Super Admin pode criar Coordenadores (nova empresa no sistema).");
        }
        tenantToAssign = null as any;
      } else if (isSa) {
        const tid = input.tenantCoordinatorUserId;
        if (!tid) {
          throw new Error(
            "Indique a empresa (coordenador) a que este utilizador pertence — obrigatório para Super Admin.",
          );
        }
        const coord = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, tid), eq(users.crmRole, "coordenador")))
          .limit(1);
        if (!coord.length) throw new Error("Empresa inválida: esse utilizador não é Coordenador.");
        tenantToAssign = tid;
      } else if (String(currentUser.crmRole || "") === "coordenador") {
        const selfId = Number(currentUser.id);
        tenantToAssign = selfId;
      } else {
        const ct = currentUser.tenantId;
        if (ct == null || Number.isNaN(Number(ct))) {
          throw new Error("Conta sem empresa (tenant) associada. Contacte o Super Admin.");
        }
        tenantToAssign = Number(ct);
      }

      const existing = await db.select().from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Este e-mail já está registado");
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      const openId = `local_${randomBytes(18).toString("hex")}`;

      await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        password: hashedPassword,
        loginMethod: "local",
        role: input.crmRole === "coordenador" ? "admin" : "user",
        crmRole: input.crmRole,
        tenantId: input.crmRole === "coordenador" ? null : tenantToAssign,
      } as any);

      const row = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);

      const newUserId = row[0]?.id;
      if (!newUserId) throw new Error("Falha ao criar utilizador");

      if (input.crmRole === "coordenador") {
        await db.update(users).set({ tenantId: newUserId }).where(eq(users.id, newUserId));
      }

      return { success: true };
    }),

  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const currentUser = ctx.user as Record<string, unknown>;

    if (!canListUsersDirectory(currentUser)) {
      return [];
    }

    const coordinator = alias(users, "tenant_coord");
    const baseSelect = {
      id: users.id,
      name: users.name,
      email: users.email,
      crmRole: users.crmRole,
      tenantId: users.tenantId,
      isSuperAdmin: (users as any).isSuperAdmin,
      isOnline: users.isOnline,
      createdAt: users.createdAt,
      companyName: coordinator.name,
    };

    if (isSuperAdminUser(currentUser)) {
      const tenantWhere = whereUsersForUser(currentUser);
      let q = db
        .select(baseSelect)
        .from(users)
        .leftJoin(coordinator, eq(coordinator.id, users.tenantId));
      if (tenantWhere) q = (q as any).where(tenantWhere);
      return await q;
    }

    const role = String(currentUser.crmRole || "");
    const uid = Number(currentUser.id);

    if (role === "coordenador") {
      const tid =
        currentUser.tenantId != null && !Number.isNaN(Number(currentUser.tenantId))
          ? Number(currentUser.tenantId)
          : uid;
      return await db
        .select(baseSelect)
        .from(users)
        .leftJoin(coordinator, eq(coordinator.id, users.tenantId))
        .where(eq(users.tenantId, tid));
    }

    const tenantIdNum =
      currentUser.tenantId != null ? Number(currentUser.tenantId) : NaN;
    if (Number.isNaN(tenantIdNum)) {
      return [];
    }

    if (role === "ce") {
      const scopeId = await resolveUserTeamScopeId(db, {
        id: uid,
        teamId: (currentUser as { teamId?: number | null }).teamId ?? null,
        crmRole: "ce",
      });
      if (scopeId == null) return [];
      const hierarchyCond = or(
        eq(users.id, uid),
        and(eq(users.teamId, scopeId), inArray(users.crmRole, ["vendedor", "cej"])),
      );
      return await db
        .select(baseSelect)
        .from(users)
        .leftJoin(coordinator, eq(coordinator.id, users.tenantId))
        .where(and(eq(users.tenantId, tenantIdNum), hierarchyCond));
    }

    if (role === "cej") {
      const scopeId = await resolveUserTeamScopeId(db, {
        id: uid,
        teamId: (currentUser as { teamId?: number | null }).teamId ?? null,
        crmRole: "cej",
      });
      if (scopeId == null) return [];
      const hierarchyCond = or(
        eq(users.id, uid),
        and(eq(users.teamId, scopeId), eq(users.crmRole, "vendedor")),
      );
      return await db
        .select(baseSelect)
        .from(users)
        .leftJoin(coordinator, eq(coordinator.id, users.tenantId))
        .where(and(eq(users.tenantId, tenantIdNum), hierarchyCond));
    }

    return [];
  }),
});
