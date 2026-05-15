import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { auditLogs, companies, teams, users } from "../drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { isSuperAdminUser } from "./tenantScope";
import {
  assertCanManageEquipaMember,
  buildEquipaMembersWhere,
  canAccessEquipaHub,
  truthyFlag,
} from "./equipaHubScope";
import bcrypt from "bcryptjs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import {
  getClientIp,
  getClientUserAgent,
  lookupGeoLabel,
} from "./_core/clientMeta";
import {
  assertCompanyInCoordinatorTree,
  assertUserIsSubCompanyTeamLeader,
  getRootCompanyForCoordinator,
} from "./companyHierarchy";

function canListUsersDirectory(u: Record<string, unknown> | null | undefined): boolean {
  return canAccessEquipaHub(u);
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

      if (truthyFlag((user as { bloqueado?: boolean }).bloqueado)) {
        throw new Error("Acesso bloqueado. Contacte o coordenador ou RH.");
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
        /** Super Admin ao criar coordenador: nome da empresa raiz (opcional; usa o nome do utilizador). */
        rootCompanyName: z.string().min(1).max(255).optional(),
        /** Coordenador ao criar CE: nome da sub-empresa (opcional; gera a partir do nome). */
        subCompanyName: z.string().min(1).max(255).optional(),
        /** Super Admin: ao criar vendedor/CEJ/CE, opcionalmente fixar `company_id` (sub-empresa ou raiz) sob o coordenador escolhido. */
        targetCompanyId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");

      const currentUser = ctx.user as Record<string, unknown>;
      const isSa = truthyFlag(currentUser.isSuperAdmin);
      const currentRole = String(currentUser.crmRole || "");

      if (isSa) {
        // Super admin cria qualquer papel.
      } else {
        assertHierarchyCreatesBelowOnly(currentUser, input.crmRole);
      }

      let tenantToAssign: number | null = null;

      if (input.crmRole === "coordenador") {
        if (!isSa) {
          throw new Error("Apenas o Super Admin pode criar Coordenadores (nova empresa no sistema).");
        }
        tenantToAssign = null;
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
      } else if (currentRole === "coordenador") {
        tenantToAssign = Number(currentUser.id);
      } else {
        const ct = currentUser.tenantId;
        if (ct == null || Number.isNaN(Number(ct))) {
          throw new Error("Conta sem empresa (tenant) associada. Contacte o Super Admin.");
        }
        tenantToAssign = Number(ct);
      }

      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        throw new Error("Este e-mail já está registado");
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const openId = `local_${randomBytes(18).toString("hex")}`;

      const isCeSubCompanyFlow =
        input.crmRole === "ce" && tenantToAssign != null && (isSa || currentRole === "coordenador");

      const isMemberCreator =
        !isSa &&
        (currentRole === "ce" || currentRole === "cej") &&
        (input.crmRole === "vendedor" || (currentRole === "ce" && input.crmRole === "cej"));

      if (isCeSubCompanyFlow) {
        const coordId = tenantToAssign!;
        await db.transaction(async (tx) => {
          const root = await getRootCompanyForCoordinator(tx, coordId);
          if (!root?.id) {
            throw new Error(
              "Empresa raiz em falta. Execute migrações (`pnpm exec drizzle-kit migrate`) ou contacte o suporte.",
            );
          }
          const internalKey = `__new__${randomBytes(10).toString("hex")}`;
          const displayName = (
            input.subCompanyName?.trim() ||
            `Equipe ${input.name.trim().slice(0, 80)}`
          ).slice(0, 255);
          await tx.insert(companies).values({
            name: internalKey,
            coordinatorUserId: null,
            parentCompanyId: root.id,
          } as any);
          const [subRow] = await tx
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.name, internalKey))
            .limit(1);
          const subId = subRow?.id;
          if (!subId) throw new Error("Falha ao criar sub-empresa.");

          await tx.insert(users).values({
            openId,
            name: input.name,
            email: input.email,
            password: hashedPassword,
            loginMethod: "local",
            role: "user",
            crmRole: "ce",
            tenantId: coordId,
            companyId: subId,
          } as any);

          const [newUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
          const newUserId = newUser?.id;
          if (!newUserId) throw new Error("Falha ao criar utilizador.");

          await tx.insert(teams).values({
            name: displayName,
            leaderId: newUserId,
            tenantId: coordId,
            companyId: subId,
          } as any);
          const [tm] = await tx
            .select({ id: teams.id })
            .from(teams)
            .where(eq(teams.leaderId, newUserId))
            .orderBy(desc(teams.id))
            .limit(1);
          if (tm?.id) {
            await tx.update(users).set({ teamId: tm.id } as any).where(eq(users.id, newUserId));
          }
          await tx.update(companies).set({ name: displayName } as any).where(eq(companies.id, subId));
        });
        return { success: true };
      }

      let companyIdToAssign: number | null = null;

      if (isMemberCreator) {
        companyIdToAssign = await assertUserIsSubCompanyTeamLeader(db, Number(currentUser.id));
      } else if (tenantToAssign != null && ["vendedor", "cej", "ce"].includes(input.crmRole)) {
        if (isSa && input.targetCompanyId != null) {
          await assertCompanyInCoordinatorTree(db, tenantToAssign, input.targetCompanyId);
          companyIdToAssign = input.targetCompanyId;
        } else {
          const root = await getRootCompanyForCoordinator(db, tenantToAssign);
          companyIdToAssign = root?.id ?? null;
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          password: hashedPassword,
          loginMethod: "local",
          role: input.crmRole === "coordenador" ? "admin" : "user",
          crmRole: input.crmRole,
          tenantId: input.crmRole === "coordenador" ? null : tenantToAssign,
          companyId: input.crmRole === "coordenador" ? null : companyIdToAssign,
        } as any);

        const row = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
        const newUserId = row[0]?.id;
        if (!newUserId) throw new Error("Falha ao criar utilizador");

        if (input.crmRole === "coordenador") {
          await tx.update(users).set({ tenantId: newUserId }).where(eq(users.id, newUserId));
          const rootName = (
            input.rootCompanyName?.trim() ||
            input.name.trim() ||
            `Empresa #${newUserId}`
          ).slice(0, 255);
          await tx.insert(companies).values({
            name: rootName,
            coordinatorUserId: newUserId,
            parentCompanyId: null,
          } as any);
          const [co] = await tx
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.coordinatorUserId, newUserId))
            .limit(1);
          if (co?.id) {
            await tx.update(users).set({ companyId: co.id } as any).where(eq(users.id, newUserId));
          }
        }
      });

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
      companyId: users.companyId,
      companyName: coordinator.name,
      nif: users.nif,
      sfid: users.sfid,
      bloqueado: users.bloqueado,
      avatarUrl: users.avatarUrl,
      teamLeaderJuniorId: users.teamLeaderJuniorId,
      teamId: users.teamId,
    };

    const visibility = buildEquipaMembersWhere(currentUser);
    let q = db
      .select(baseSelect)
      .from(users)
      .leftJoin(coordinator, eq(coordinator.id, users.tenantId));
    if (visibility.length) q = (q as any).where(and(...visibility));
    return await q;
  }),

  listEquipaMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const currentUser = ctx.user as Record<string, unknown>;
    if (!canAccessEquipaHub(currentUser)) return [];

    const visibility = buildEquipaMembersWhere(currentUser);
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        crmRole: users.crmRole,
        isSuperAdmin: (users as any).isSuperAdmin,
        bloqueado: users.bloqueado,
        isOnline: users.isOnline,
        dialerState: users.dialerState,
        teamId: users.teamId,
        nif: users.nif,
        sfid: users.sfid,
        teamLeaderJuniorId: users.teamLeaderJuniorId,
        dailyCallsGoal: teams.dailyCallsGoal,
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(visibility.length ? and(...visibility) : undefined)
      .orderBy(users.name);

    return rows.map((r) => ({
      ...r,
      dailyCallsGoal: r.dailyCallsGoal ?? 80,
    }));
  }),

  updateUser: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(200).optional(),
        nif: z.string().max(20).nullable().optional(),
        sfid: z.string().max(64).nullable().optional(),
        bloqueado: z.boolean().optional(),
        teamLeaderJuniorId: z.number().int().positive().nullable().optional(),
        password: z.string().min(6).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");
      const currentUser = ctx.user as Record<string, unknown>;
      if (!canListUsersDirectory(currentUser)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar utilizadores." });
      }

      const [target] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!target) throw new Error("Utilizador não encontrado");

      await assertCanManageEquipaMember(db, currentUser, target as any);

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.nif !== undefined) patch.nif = input.nif;
      if (input.sfid !== undefined) patch.sfid = input.sfid;
      if (input.bloqueado !== undefined) {
        patch.bloqueado = input.bloqueado;
        if (input.bloqueado) {
          patch.isOnline = false;
          patch.dialerState = "idle";
          (patch as { dialerContactId?: null }).dialerContactId = null;
        }
      }
      if (input.teamLeaderJuniorId !== undefined) {
        if (String(target.crmRole) !== "vendedor") {
          throw new Error("CEJ só se aplica a vendedores.");
        }
        if (input.teamLeaderJuniorId != null) {
          const [cej] = await db
            .select({ id: users.id, crmRole: users.crmRole, tenantId: users.tenantId })
            .from(users)
            .where(eq(users.id, input.teamLeaderJuniorId))
            .limit(1);
          if (!cej || cej.crmRole !== "cej") throw new Error("CEJ inválido.");
          if (
            !isSuperAdminUser(currentUser) &&
            Number(cej.tenantId) !== Number(target.tenantId)
          ) {
            throw new Error("CEJ de outra empresa.");
          }
        }
        patch.teamLeaderJuniorId = input.teamLeaderJuniorId;
      }
      if (input.password) {
        patch.password = await bcrypt.hash(input.password, 10);
        patch.loginMethod = "local";
      }
      if (Object.keys(patch).length === 0) return { success: true };

      await db.update(users).set(patch as any).where(eq(users.id, input.id));

      if (input.bloqueado !== undefined) {
        await db.insert(auditLogs).values({
          userId: Number(currentUser.id),
          action: input.bloqueado ? "user_blocked" : "user_unblocked",
          entity: "users",
          entityId: input.id,
          details: JSON.stringify({
            targetEmail: target.email,
            targetName: target.name,
          }),
        });
      }

      return { success: true };
    }),

  listCejForAssignment: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const currentUser = ctx.user as Record<string, unknown>;
    if (!canListUsersDirectory(currentUser)) return [];

    const parts: ReturnType<typeof eq>[] = [eq(users.crmRole, "cej")];
    if (!isSuperAdminUser(currentUser)) {
      const tid =
        currentUser.tenantId != null
          ? Number(currentUser.tenantId)
          : String(currentUser.crmRole) === "coordenador"
            ? Number(currentUser.id)
            : NaN;
      if (!Number.isNaN(tid)) parts.push(eq(users.tenantId, tid));
    }

    return db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(...parts))
      .orderBy(users.name);
  }),
});
