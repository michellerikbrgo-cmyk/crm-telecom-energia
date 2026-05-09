import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router, superAdminProcedure } from "./_core/trpc";
import { z } from "zod";
import { authLocalRouter } from "./authLocal";
import { getDb } from "./db";
import {
  appSettings,
  contacts,
  pendentes,
  calendarEvents,
  contracts,
  campaigns,
  campaignFiles,
  competitorScripts,
  callLogs,
  auditLogs,
  sales,
  blacklist,
  sosRequests,
  gamification,
  contactOrigins,
  energyConfig,
  users,
  teams,
  featureSuggestions,
} from "../drizzle/schema";
import { eq, desc, asc, and, sql, like, or, inArray, lte, gte, lt, isNull, type SQL } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { detectImageMimeFromBuffer } from "./_core/imageMagic";
import {
  contactBelongsToUserTenant,
  getScopedTenantCoordinatorUserId,
  getUserIdsInTenant,
  isSuperAdminUser,
  whereContactsForUser,
  whereSosRequestsForUser,
  whereUsersForUser,
  whereInTenantUserIds,
} from "./tenantScope";
import { storagePut } from "./storage";
import {
  decryptText,
  encryptText,
  looksLikeMaskedSecret,
  maskSecret,
} from "./_core/cryptoSecrets";
import {
  getClientIp,
  getClientUserAgent,
  isPrivateOrLocalIp,
  lookupGeoLabel,
  summarizeUserAgent,
} from "./_core/clientMeta";
import { readReleaseLogMerged } from "./releaseLogStore";

function canManageCampaigns(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(
    u?.isSuperAdmin ||
    u?.crmRole === "ce" ||
    u?.crmRole === "cej" ||
    u?.crmRole === "coordenador"
  );
}

function canUseDialer(user: unknown): boolean {
  const u = user as { crmRole?: string } | null;
  return ["vendedor", "cej", "ce"].includes(u?.crmRole || "");
}

function canEditContactsAsManager(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(
    u?.isSuperAdmin ||
    u?.crmRole === "cej" ||
    u?.crmRole === "ce" ||
    u?.crmRole === "coordenador"
  );
}

function canManageSalesLifecycle(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || ["cej", "ce", "coordenador"].includes(u?.crmRole || ""));
}

function canManageTeamsTable(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || u?.crmRole === "coordenador");
}

/** Meta de ligações: qualquer papel acima de vendedor (CEJ, CE, coordenador, Super Admin). */
function canSetDailyCallsGoal(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(
    u?.isSuperAdmin ||
    ["cej", "ce", "coordenador"].includes(u?.crmRole || "")
  );
}

const DEFAULT_DAILY_CALLS_GOAL = 80;

async function resolveDailyCallsGoalForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: Record<string, unknown> | null | undefined,
): Promise<number> {
  if (!user?.id) return DEFAULT_DAILY_CALLS_GOAL;
  const u = user as {
    id: number;
    teamId?: number | null;
    crmRole?: string;
  };
  let teamId: number | null = null;
  if (u.crmRole === "vendedor") {
    teamId = u.teamId ?? null;
  } else {
    const scope = await resolveUserTeamScopeId(db, {
      id: u.id,
      teamId: u.teamId ?? null,
      crmRole: u.crmRole,
    });
    teamId = scope ?? (u.crmRole === "coordenador" ? (u.teamId ?? null) : null);
  }
  if (teamId == null) return DEFAULT_DAILY_CALLS_GOAL;
  const [row] = await db
    .select({ g: teams.dailyCallsGoal })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const g = row?.g;
  return typeof g === "number" && g > 0 ? g : DEFAULT_DAILY_CALLS_GOAL;
}

/** Resolve equipa só deste contexto (sem tenant isolado por domínio; um CRM, várias equipas por teamId). */
async function resolveUserTeamScopeId(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; teamId?: number | null; crmRole?: string },
): Promise<number | null> {
  if (user.teamId) return user.teamId;
  if (user.crmRole === "ce") {
    const tl = await db.select({ id: teams.id }).from(teams).where(eq(teams.leaderId, user.id)).limit(1);
    return tl[0]?.id ?? null;
  }
  return null;
}

/** Vendedor: só ele. Coordenador: tenant. CE/CEJ: utilizadores com o mesmo teamId que a equipa resolvida. */
async function getSellerIdsForPipelineScope(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: Record<string, unknown> | null | undefined,
): Promise<number[] | "ALL"> {
  if (isSuperAdminUser(user)) return "ALL";
  const u = user as { id?: number; crmRole?: string; tenantId?: number | null } | null;
  if (!u?.id) return [];
  if (u.crmRole === "vendedor") return [u.id];
  if (u.crmRole === "coordenador") return getUserIdsInTenant(db, user);
  if (u.crmRole === "ce" || u.crmRole === "cej") {
    const scopeId = await resolveUserTeamScopeId(db, {
      id: u.id,
      teamId: (user as { teamId?: number | null }).teamId ?? null,
      crmRole: u.crmRole,
    });
    if (scopeId == null) return [];
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.teamId, scopeId));
    const ids = new Set(rows.map((r) => r.id));
    ids.add(u.id);
    return Array.from(ids);
  }
  return [];
}

async function blacklistTeamScopeForInsert(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: any,
): Promise<{ tenantId: number | null; teamId: number | null }> {
  if (isSuperAdminUser(user)) return { tenantId: null, teamId: null };
  const tid = user?.tenantId as number | null | undefined;
  if (tid == null || tid === undefined) {
    throw new Error("Conta sem empresa (coordenador); não é possível usar a lista negra.");
  }
  if (user.crmRole === "coordenador") {
    return { tenantId: tid, teamId: null };
  }
  const teamId = await resolveUserTeamScopeId(db, {
    id: user.id,
    teamId: user.teamId ?? null,
    crmRole: user.crmRole,
  });
  if (teamId == null) {
    throw new Error("Associe o utilizador a uma equipa (teamId) para usar a lista negra.");
  }
  return { tenantId: tid, teamId };
}

const INSTALL_CAL_TITLE_PREFIX = "Instalação #";

function canReviewBetaSuggestions(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || u?.crmRole === "coordenador");
}

function assertSuggestionReviewableByUser(
  row: { tenantId?: number | null },
  user: { id?: number; tenantId?: number | null; crmRole?: string; isSuperAdmin?: boolean },
) {
  if (isSuperAdminUser(user)) return;
  if (user?.crmRole === "coordenador") {
    if (row.tenantId == null || Number(row.tenantId) !== Number(user.tenantId)) {
      throw new Error("Esta sugestão não pertence à sua empresa.");
    }
    return;
  }
  throw new Error("Sem permissão.");
}

async function syncSaleInstallationCalendar(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  opts: { saleId: number; contactId: number; vendedorId: number; installationDate: Date | null },
) {
  const title = `${INSTALL_CAL_TITLE_PREFIX}${opts.saleId}`;
  await db.delete(calendarEvents).where(
    and(
      eq(calendarEvents.contactId, opts.contactId),
      eq(calendarEvents.title, title),
      eq(calendarEvents.type, "instalacao"),
    ),
  );
  if (!opts.installationDate || Number.isNaN(opts.installationDate.getTime())) return;

  const [contact] = await db.select({ tenantId: contacts.tenantId }).from(contacts).where(eq(contacts.id, opts.contactId)).limit(1);

  await db.insert(calendarEvents).values({
    tenantId: contact?.tenantId ?? null,
    title,
    description: `Instalação agendada (venda #${opts.saleId})`,
    type: "instalacao",
    startAt: opts.installationDate,
    endAt: null,
    allDay: false,
    contactId: opts.contactId,
    assignedTo: opts.vendedorId,
    createdBy: opts.vendedorId,
  } as any);
}

async function assertContactAccessible(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  contactId: number,
  user: any,
) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!c) throw new Error("Contacto não encontrado");
  if (!contactBelongsToUserTenant(c as any, user) && !isSuperAdminUser(user)) {
    throw new Error("Contacto não pertence à sua empresa.");
  }
}

function assertEntityTenant(row: { tenantId?: number | null }, user: any, label = "Registo") {
  if (isSuperAdminUser(user)) return;
  const ut = user?.tenantId;
  const rt = row?.tenantId;
  if (ut == null || rt == null || Number(rt) !== Number(ut)) {
    throw new Error(`${label} não pertence à esta empresa.`);
  }
}

async function loadCampaignOrThrow(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, id: number) {
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!row[0]) throw new Error("Campanha não encontrada");
  return row[0];
}

function extractAssistantText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return "";
  return raw
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

async function completeSalesChat(
  systemPrompt: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversation.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await invokeLLM({ messages });
    const raw = response.choices?.[0]?.message?.content;
    const text = extractAssistantText(raw);
    if (text.trim()) return text.trim();
  } catch {
    /* invokeLLM usa OpenAI */
  }

  return "";
}

function roleplayTopicHint(topic: "telecom" | "energia" | "ambos"): string {
  switch (topic) {
    case "telecom":
      return "\nCenário actual: fibra, móvel, TV e pacotes de telecomunicações (contexto Vodafone).";
    case "energia":
      return "\nCenário actual: electricidade, gás ou combustível (contexto Repsol).";
    default:
      return "\nCenário: pode alternar entre telecom e energia.";
  }
}

const ROLEPLAY_SYSTEM_PREFIX =
  "Você está num roleplay de treino de vendas em Portugal. É o CLIENTE (particular ou pequena empresa). " +
  "Fala português de Portugal, tom natural de telefonema. Nunca revele que é uma IA. " +
  "Não escreva meta-comentários (ex.: «Como cliente digo…»). Responda só com a fala do cliente: uma ou duas frases curtas. " +
  "Pode objectar ao preço, fidelização, comparar com MEO/NOS, ou hesitar. Se o vendedor for convincente, pode ceder um pouco.";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      const u = ctx.user as Record<string, unknown> | null;
      if (!u) return null;
      const { password: _omit, ...safe } = u;
      return safe;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      const u = ctx.user as { id?: number } | null;
      if (u?.id) {
        const db = await getDb();
        if (db) {
          try {
            await db
              .update(users)
              .set({
                isOnline: false,
                presenceSessionStartedAt: null,
              } as any)
              .where(eq(users.id, u.id));
          } catch {
            /* ignore */
          }
        }
      }
      return { success: true } as const;
    }),

    uploadAvatar: protectedProcedure
      .input(
        z.object({
          base64: z.string().min(1),
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user as { id?: number };
        if (!user?.id) throw new Error("Sessão inválida");

        const buffer = Buffer.from(input.base64, "base64");
        if (buffer.byteLength > 2 * 1024 * 1024) {
          throw new Error("Imagem demasiado grande (máx. 2MB)");
        }

        const detected = detectImageMimeFromBuffer(buffer);
        if (!detected || detected !== input.mimeType) {
          throw new Error("Imagem inválida ou tipo não corresponde ao ficheiro (use JPG, PNG ou WebP).");
        }

        const db = await getDb();
        if (!db) throw new Error("Base de dados indisponível");

        const ext =
          input.mimeType === "image/jpeg" ? "jpg" : input.mimeType === "image/png" ? "png" : "webp";
        const { url } = await storagePut(`avatars/${user.id}/profile.${ext}`, buffer, input.mimeType);

        await db.update(users).set({ avatarUrl: url } as any).where(eq(users.id, user.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "profile_avatar_upload",
          entity: "user",
          entityId: user.id,
          details: "Atualizou foto de perfil",
        });

        return { success: true, avatarUrl: url };
      }),

    removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user as { id?: number };
      if (!user?.id) throw new Error("Sessão inválida");
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");
      await db.update(users).set({ avatarUrl: null } as any).where(eq(users.id, user.id));
      return { success: true };
    }),
  }),

  authLocal: authLocalRouter,

  // ============ CONTACTS ============
  contacts: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(contacts);
        const conditions: any[] = [];

        // Evitar que % ou _ na pesquisa quebrem o LIKE do MySQL; sem wildcards crus no valor
        if (input?.search?.trim()) {
          const cleaned = input.search.trim().replace(/[%_\\\\]/g, "");
          if (cleaned.length > 0) {
            conditions.push(
              or(
                and(sql`${contacts.name} IS NOT NULL`, like(contacts.name, `%${cleaned}%`)),
                like(contacts.phone, `%${cleaned}%`),
              ),
            );
          }
        }
        if (input?.status && input.status !== "todos") {
          conditions.push(eq(contacts.status, input.status as any));
        }

        // Filtro por role + tenant (empresa)
        const user = ctx.user as any;
        const tcond = whereContactsForUser(user);
        if (tcond) conditions.push(tcond);

        if (user?.crmRole === "vendedor") {
          conditions.push(eq(contacts.assignedTo, user.id));
        }

        const utid = user?.tenantId as number | undefined;
        if (user?.crmRole === "ce" && utid != null) {
          conditions.push(
            sql`NOT (
              ${contacts.status} IN ('novo', 'em_contacto')
              AND ${contacts.addedBy} IS NOT NULL
              AND ${contacts.addedBy} = ${contacts.assignedTo}
              AND ${contacts.addedBy} IN (
                SELECT id FROM users WHERE crmRole IN ('vendedor', 'cej') AND tenantId = ${utid}
              )
            )`,
          );
        }
        if (user?.crmRole === "cej" && utid != null) {
          conditions.push(
            sql`NOT (
              ${contacts.status} IN ('novo', 'em_contacto')
              AND ${contacts.addedBy} IS NOT NULL
              AND ${contacts.addedBy} = ${contacts.assignedTo}
              AND ${contacts.addedBy} <> ${user.id}
              AND ${contacts.addedBy} IN (
                SELECT id FROM users WHERE crmRole IN ('vendedor', 'cej') AND tenantId = ${utid}
              )
            )`,
          );
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        return await (query as any).orderBy(desc(contacts.createdAt)).limit(100);
      }),

    add: protectedProcedure
      .input(
        z
          .object({
            phone: z.string(),
            name: z.string().optional(),
            email: z.string().optional(),
            origin: z.string().optional(),
            notes: z.string().optional(),
          })
          .transform((d) => ({
            phone: String(d.phone ?? "").replace(/\s+/g, "").trim(),
            name: d.name !== undefined && d.name !== "" ? String(d.name).trim() || undefined : undefined,
            email: d.email !== undefined && d.email !== "" ? String(d.email).trim() || undefined : undefined,
            origin: String(d.origin ?? "Indicação").trim().slice(0, 100) || "Indicação",
            notes: d.notes !== undefined && d.notes !== "" ? String(d.notes).trim() || undefined : undefined,
          }))
          .refine((d) => d.phone.length >= 1, { message: "Telefone obrigatório", path: ["phone"] }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!user?.id) throw new Error("Sessão inválida: volte a iniciar sessão");

        const contactTenantId = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && contactTenantId == null) {
          throw new Error("Conta sem empresa (tenant). O Super Admin pode importar contactos globais; demais precisam de coordenador.");
        }

        const manualAssign =
          user?.crmRole === "vendedor" || user?.crmRole === "cej" ? user.id : null;

        await db.insert(contacts).values({
          phone: input.phone,
          name: input.name || null,
          email: input.email || null,
          origin: user?.crmRole === "ce" ? "Telemarketing" : input.origin,
          notes: input.notes || null,
          addedBy: user?.id,
          assignedTo: manualAssign,
          lastAssignedAt: manualAssign ? new Date() : null,
          status: "novo",
          tenantId: contactTenantId,
        } as any);

        // Log audit
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "create",
          entity: "contact",
          details: `Adicionou contacto: ${input.phone}`,
        });

        return { success: true };
      }),

    bulkAdd: protectedProcedure
      .input(z.object({
        phones: z.array(z.string()),
        names: z.array(z.string()).optional(),
        listName: z.string().optional(),
        assignTo: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const contactTenantId = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && contactTenantId == null) {
          throw new Error("Conta sem empresa (tenant); não é possível importar listas.");
        }

        let assigneeTenantOk = true;
        if (!isSuperAdminUser(user) && input.assignTo) {
          const a = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, input.assignTo)).limit(1);
          assigneeTenantOk = !!a[0] && Number(a[0].tenantId) === Number(user.tenantId);
        }
        if (!assigneeTenantOk) throw new Error("O vendedor de destino não pertence à mesma empresa.");

        if (input.assignTo && ["ce", "cej"].includes(user?.crmRole ?? "")) {
          const allowed = await getSellerIdsForPipelineScope(db, user);
          if (allowed !== "ALL" && !allowed.includes(input.assignTo)) {
            throw new Error("Só pode atribuir listas a membros da sua equipa.");
          }
        }

        const values = input.phones.map((phone, i) => ({
          phone,
          name: input.names?.[i] || null,
          origin: "Telemarketing",
          status: "novo" as const,
          addedBy: user?.id,
          listName: input.listName || null,
          assignedTo: input.assignTo || null,
          lastAssignedAt: input.assignTo ? new Date() : null,
          tenantId: contactTenantId,
        }));

        // Insert in batches of 500 to avoid query limits
        for (let i = 0; i < values.length; i += 500) {
          const batch = values.slice(i, i + 500);
          await db.insert(contacts).values(batch);
        }

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "bulk_create",
          entity: "contact",
          details: `Adicionou ${input.phones.length} contactos${input.listName ? ` (Lista: ${input.listName})` : ''}${input.assignTo ? ` atribuídos ao vendedor #${input.assignTo}` : ''}`,
        });

        return { count: input.phones.length };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional().nullable(),
        phone: z.string().min(1).optional(),
        email: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        origin: z.string().optional(),
        address: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        status: z.enum(["novo", "em_contacto", "pendente", "venda", "nao_atende", "sem_interesse", "blacklist"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canEditContactsAsManager(ctx.user)) {
          throw new Error("Sem permissão para editar contactos");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const { id, ...patch } = input;
        const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
        if (!existing) throw new Error("Contacto não encontrado");
        if (!contactBelongsToUserTenant(existing as any, user) && !isSuperAdminUser(user)) {
          throw new Error("Sem permissão sobre este contacto (outra empresa).");
        }
        const payload: Record<string, unknown> = {};
        if (patch.name !== undefined) payload.name = patch.name;
        if (patch.phone !== undefined) payload.phone = patch.phone;
        if (patch.email !== undefined) payload.email = patch.email;
        if (patch.notes !== undefined) payload.notes = patch.notes;
        if (patch.origin !== undefined) payload.origin = patch.origin;
        if (patch.address !== undefined) payload.address = patch.address;
        if (patch.postalCode !== undefined) payload.postalCode = patch.postalCode;
        if (patch.status !== undefined) payload.status = patch.status;
        if (Object.keys(payload).length === 0) return { success: true };
        await db.update(contacts).set(payload as any).where(eq(contacts.id, id));
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "update",
          entity: "contact",
          entityId: id,
          details: "Atualizou contacto",
        });
        return { success: true };
      }),
  }),

  // ============ PENDENTES ============
  pendentes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;

      let conditions: any[] = [];
      const pTenant = whereContactsForUser(user);
      if (pTenant) conditions.push(pTenant);

      if (user?.crmRole === "vendedor") {
        conditions.push(eq(pendentes.vendedorId, user.id));
      } else {
        const sellerIds = await getSellerIdsForPipelineScope(db, user);
        const tenantPV = whereInTenantUserIds(sellerIds, pendentes.vendedorId);
        if (tenantPV) conditions.push(tenantPV);
      }

      let query = db.select({
        id: pendentes.id,
        contactId: pendentes.contactId,
        vendedorId: pendentes.vendedorId,
        returnDate: pendentes.returnDate,
        notes: pendentes.notes,
        offerDesired: pendentes.offerDesired,
        status: pendentes.status,
        notified: pendentes.notified,
        priorityLevel: pendentes.priorityLevel,
        createdAt: pendentes.createdAt,
        updatedAt: pendentes.updatedAt,
        contactName: contacts.name,
        contactPhone: contacts.phone,
      }).from(pendentes)
        .leftJoin(contacts, eq(pendentes.contactId, contacts.id));
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      return await (query as any)
        .orderBy(desc(pendentes.priorityLevel), asc(pendentes.returnDate))
        .limit(50);
    }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        returnDate: z.string(),
        notes: z.string().optional(),
        offerDesired: z.string().optional(),
        priorityLevel: z.number().int().min(1).max(5).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(pendentes).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          returnDate: new Date(input.returnDate),
          notes: input.notes || null,
          offerDesired: input.offerDesired || null,
          status: "agendado",
          priorityLevel: input.priorityLevel ?? 3,
        });

        await db.update(contacts)
          .set({ status: "pendente" })
          .where(eq(contacts.id, input.contactId));

        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        returnDate: z.string().optional(),
        notes: z.string().optional().nullable(),
        offerDesired: z.string().optional().nullable(),
        status: z.enum(["agendado", "realizado", "expirado", "cancelado"]).optional(),
        priorityLevel: z.number().int().min(1).max(5).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const row = await db.select().from(pendentes).where(eq(pendentes.id, input.id)).limit(1);
        const p = row[0];
        if (!p) throw new Error("Pendente não encontrado");

        await assertContactAccessible(db, p.contactId, user);

        const isLeadership = !!user?.isSuperAdmin ||
          ["cej", "ce", "coordenador"].includes(user?.crmRole);
        if (!isLeadership && p.vendedorId !== user.id) {
          throw new Error("Só pode editar os seus pendentes");
        }

        const payload: Record<string, unknown> = {};
        if (input.returnDate !== undefined) payload.returnDate = new Date(input.returnDate);
        if (input.notes !== undefined) payload.notes = input.notes;
        if (input.offerDesired !== undefined) payload.offerDesired = input.offerDesired;
        if (input.status !== undefined) payload.status = input.status;
        if (input.priorityLevel !== undefined) payload.priorityLevel = input.priorityLevel;
        if (Object.keys(payload).length === 0) return { success: true };

        await db.update(pendentes).set(payload as any).where(eq(pendentes.id, input.id));
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "update",
          entity: "pendente",
          entityId: input.id,
          details: `Atualizou pendente #${input.id}`,
        });
        return { success: true };
      }),
  }),

  // ============ CALENDAR ============
  calendar: router({
    list: protectedProcedure
      .input(z.object({ from: z.string(), to: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;

        const from = new Date(input.from);
        const to = new Date(input.to);

        const baseRange = and(
          sql`${calendarEvents.startAt} >= ${from}`,
          sql`${calendarEvents.startAt} < ${to}`,
        ) as SQL;

        if (user?.crmRole === "vendedor") {
          return await db.select().from(calendarEvents).where(
            and(
              baseRange,
              or(eq(calendarEvents.assignedTo, user.id), eq(calendarEvents.createdBy, user.id)),
            ),
          ).orderBy(desc(calendarEvents.startAt));
        }

        if (["ce", "cej"].includes(user?.crmRole)) {
          const teamIdsRaw = await getSellerIdsForPipelineScope(db, user);
          if (teamIdsRaw === "ALL" || !teamIdsRaw.length) return [];

          const coordRows = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, user.tenantId as number), eq(users.crmRole, "coordenador")));
          const coordIds = coordRows.map((c) => c.id);

          const visibility: SQL[] = [
            inArray(calendarEvents.assignedTo, teamIdsRaw),
            inArray(calendarEvents.createdBy, teamIdsRaw),
          ];
          if (coordIds.length) {
            visibility.push(and(isNull(calendarEvents.assignedTo), inArray(calendarEvents.createdBy, coordIds)) as SQL);
          }

          return await db
            .select()
            .from(calendarEvents)
            .where(and(baseRange, or(...visibility)))
            .orderBy(desc(calendarEvents.startAt));
        }

        const calParts: SQL[] = [baseRange];
        if (!isSuperAdminUser(user) && user.tenantId != null) {
          calParts.push(eq(calendarEvents.tenantId, user.tenantId));
        }

        return await db.select().from(calendarEvents)
          .where(and(...calParts))
          .orderBy(desc(calendarEvents.startAt));
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["geral", "pendente", "venda", "instalacao"]).default("geral"),
        startAt: z.string(),
        endAt: z.string().optional(),
        allDay: z.boolean().default(true),
        contactId: z.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        if (!["coordenador", "ce", "cej"].includes(user?.crmRole ?? "") && !isSuperAdminUser(user)) {
          throw new Error("Apenas Coordenador, Chefe de Equipa ou CEJ podem criar eventos de calendário.");
        }

        const startAt = new Date(input.startAt);
        const endAt = input.endAt ? new Date(input.endAt) : null;

        const evtTid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && evtTid == null) throw new Error("Conta sem empresa.");

        await db.insert(calendarEvents).values({
          title: input.title,
          description: input.description || null,
          type: input.type,
          startAt,
          endAt,
          allDay: input.allDay,
          contactId: input.contactId ?? null,
          assignedTo: input.assignedTo ?? null,
          createdBy: user?.id,
          tenantId: evtTid,
        } as any);

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "calendar_create",
          entity: "calendarEvent",
          details: `Criou evento: ${input.title}`,
        });

        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        type: z.enum(["geral", "pendente", "venda", "instalacao"]).optional(),
        startAt: z.string().optional(),
        endAt: z.string().nullable().optional(),
        allDay: z.boolean().optional(),
        contactId: z.number().nullable().optional(),
        assignedTo: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const existing = await db.select().from(calendarEvents).where(eq(calendarEvents.id, input.id)).limit(1);
        if (!existing[0]) throw new Error("Evento não encontrado");
        if (user?.crmRole === "vendedor" && existing[0].createdBy !== user.id) {
          throw new Error("Sem permissão para editar este evento");
        }
        assertEntityTenant(existing[0] as any, user, "Evento");

        await db.update(calendarEvents).set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
          ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
          ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
          ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
          ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
        }).where(eq(calendarEvents.id, input.id));

        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const existing = await db.select().from(calendarEvents).where(eq(calendarEvents.id, input.id)).limit(1);
        if (!existing[0]) return { success: true };
        if (user?.crmRole === "vendedor" && existing[0].createdBy !== user.id) {
          throw new Error("Sem permissão para apagar este evento");
        }
        assertEntityTenant(existing[0] as any, user, "Evento");

        await db.delete(calendarEvents).where(eq(calendarEvents.id, input.id));
        return { success: true };
      }),
  }),

  // ============ CONTRACTS ============
  contracts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;

      let query = db
        .select()
        .from(contracts)
        .innerJoin(contacts, eq(contracts.contactId, contacts.id));

      const parts: SQL[] = [];
      if (user?.crmRole === "vendedor") {
        parts.push(eq(contracts.vendedorId, user.id));
      }
      const cten = whereContactsForUser(user);
      if (cten) parts.push(cten);

      if (parts.length) query = (query as any).where(and(...parts));

      const rows = await (query as any).orderBy(desc(contracts.createdAt)).limit(50);
      return rows.map((r: { contracts: (typeof contracts.$inferSelect) }) => r.contracts);
    }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        type: z.enum(["contrato", "portabilidade", "rescisao"]),
        product: z.enum(["telecom", "energia"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(contracts).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          type: input.type,
          product: input.product,
          status: "gerado",
        });

        return { success: true };
      }),
  }),

  // ============ CAMPAIGNS ============
  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      let q = db.select().from(campaigns);
      const cf = isSuperAdminUser(user)
        ? undefined
        : user.tenantId != null
          ? eq(campaigns.tenantId, user.tenantId)
          : sql`1=0`;
      if (cf) q = (q as any).where(cf);
      return await (q as any).orderBy(desc(campaigns.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        product: z.enum(["telecom", "energia", "ambos"]).default("ambos"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageCampaigns(ctx.user)) {
          throw new Error("Só Chefes de Equipa, CEJ e Coordenadores podem criar campanhas");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const tid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && tid == null) throw new Error("Conta sem empresa.");

        await db.insert(campaigns).values({
          title: input.title,
          description: input.description || null,
          product: input.product,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          createdBy: user?.id,
          tenantId: tid,
        } as any);

        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageCampaigns(ctx.user)) {
          throw new Error("Sem permissão");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const camp = await loadCampaignOrThrow(db, input.campaignId);
        assertEntityTenant(camp as any, user, "Campanha");
        await db.update(campaigns).set({ isActive: false }).where(eq(campaigns.id, input.campaignId));
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageCampaigns(ctx.user)) {
          throw new Error("Sem permissão");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const camp = await loadCampaignOrThrow(db, input.campaignId);
        assertEntityTenant(camp as any, user, "Campanha");
        await db.delete(campaignFiles).where(eq(campaignFiles.campaignId, input.campaignId));
        await db.delete(campaigns).where(eq(campaigns.id, input.campaignId));
        return { success: true };
      }),

    files: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const camp = await loadCampaignOrThrow(db, input.campaignId);
        assertEntityTenant(camp as any, ctx.user, "Campanha");
        return await db.select().from(campaignFiles)
          .where(eq(campaignFiles.campaignId, input.campaignId))
          .orderBy(desc(campaignFiles.createdAt));
      }),

    uploadPdf: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        filename: z.string().min(1),
        base64: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageCampaigns(ctx.user)) {
          throw new Error("Só Chefes de Equipa, CEJ e Coordenadores podem carregar PDFs");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const camp = await loadCampaignOrThrow(db, input.campaignId);
        assertEntityTenant(camp as any, user, "Campanha");

        // Basic validation: only PDFs
        const lower = input.filename.toLowerCase();
        if (!lower.endsWith(".pdf")) throw new Error("Apenas PDFs são permitidos");

        const buffer = Buffer.from(input.base64, "base64");
        // 15MB limit safety (base64 inflates; this is server-side final bytes)
        if (buffer.byteLength > 15 * 1024 * 1024) {
          throw new Error("PDF demasiado grande (máx 15MB)");
        }

        const keyPrefix = `campaigns/${input.campaignId}`;
        const relKey = `${keyPrefix}/${input.filename}`;
        const { key, url } = await storagePut(relKey, buffer, "application/pdf");

        await db.insert(campaignFiles).values({
          campaignId: input.campaignId,
          storageKey: key,
          originalName: input.filename,
          mimeType: "application/pdf",
          sizeBytes: buffer.byteLength,
          uploadedBy: user?.id,
        });

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "campaign_file_upload",
          entity: "campaign",
          entityId: input.campaignId,
          details: `Upload PDF: ${input.filename}`,
        });

        return { success: true, url };
      }),

    removePdf: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageCampaigns(ctx.user)) {
          throw new Error("Sem permissão");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(campaignFiles).where(eq(campaignFiles.id, input.fileId));
        return { success: true };
      }),
  }),

  // ============ AI ============
  ai: router({
    askObjection: protectedProcedure
      .input(z.object({ objection: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const systemPrompt = `Você é um assistente de vendas especializado em Telecomunicações e Energia em Portugal (Vodafone e Repsol).
O seu papel é ajudar vendedores a ultrapassar objeções de clientes durante chamadas telefónicas.

Regras:
- Responda SEMPRE em português de Portugal
- Seja conciso e direto (máximo 3-4 parágrafos)
- Forneça argumentos específicos para o setor de Telecom e Energia
- Sugira frases exatas que o vendedor pode usar
- Mantenha um tom profissional mas empático
- Foque na criação de valor, não apenas no preço
- Mencione benefícios como: poupança, qualidade de serviço, fidelização sem compromisso, apoio técnico dedicado
- Produtos: Vodafone (fibra, móvel, TV) e Repsol (eletricidade, gás, combustível com desconto)`;

        const text = await completeSalesChat(systemPrompt, [
          {
            role: "user",
            content: `O cliente disse: "${input.objection}"\n\nComo devo responder para ultrapassar esta objeção?`,
          },
        ]);
        if (text) return { response: text };
        return {
          response:
            "IA indisponível. Configure OpenAI na página Super Admin ou OPENAI_API_KEY no servidor.",
        };
      }),

    /** Simulador: IA interpreta o cliente; o utilizador é o vendedor. */
    roleplayTurn: protectedProcedure
      .input(
        z.object({
          stage: z.enum(["start", "continue"]),
          topic: z.enum(["telecom", "energia", "ambos"]).optional(),
          transcript: z
            .array(
              z.object({
                role: z.enum(["customer", "seller"]),
                content: z.string().max(4000),
              }),
            )
            .max(40)
            .optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const topic = input.topic ?? "ambos";
        const systemPrompt = ROLEPLAY_SYSTEM_PREFIX + roleplayTopicHint(topic);

        const fallbackMsg =
          "IA indisponível. Configure OpenAI na página Super Admin ou OPENAI_API_KEY no servidor.";

        if (input.stage === "start") {
          const conversation: Array<{ role: "user" | "assistant"; content: string }> = [
            {
              role: "user",
              content:
                "Inicia a simulação. Responde APENAS com a primeira fala do cliente ao telefone (objeção, dúvida ou recusa suave). Sem prefixos tipo «Cliente:» nem aspas.",
            },
          ];
          const text = await completeSalesChat(systemPrompt, conversation);
          return { customerMessage: text.trim() || fallbackMsg };
        }

        const t = input.transcript ?? [];
        if (t.length === 0) {
          throw new Error("Envie o histórico da conversa para continuar.");
        }
        if (t[t.length - 1]?.role !== "seller") {
          throw new Error("A última mensagem deve ser sua (vendedor).");
        }

        const conversation: Array<{ role: "user" | "assistant"; content: string }> = [];
        for (const m of t) {
          if (m.role === "seller") {
            conversation.push({ role: "user", content: m.content });
          } else {
            conversation.push({ role: "assistant", content: m.content });
          }
        }

        const text = await completeSalesChat(systemPrompt, conversation);
        return { customerMessage: text.trim() || fallbackMsg };
      }),
  }),

  // ============ SUPER ADMIN SETTINGS ============
  admin: router({
    /** Log de actualização (bootstrap + entrada automática por deploy). */
    getReleaseLog: superAdminProcedure.query(async () => {
      const entries = await readReleaseLogMerged();
      return { entries };
    }),

    getSettings: superAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const row = await db.select().from(appSettings).limit(1);
      const s = row[0];
      if (!s) {
        return {
          aiEnabled: true,
          preferredAiProvider: "openai",
          openaiApiKey: "",
          geminiApiKey: "",
          deepseekApiKey: "",
          claudeApiKey: "",
          whatsappEnabled: false,
          whatsappPhoneNumberId: "",
          whatsappBusinessAccountId: "",
          whatsappAccessToken: "",
          whatsappVerifyToken: "",
          userBroadcastAlert: "",
          userBroadcastAlertRevision: 0,
        };
      }

      return {
        aiEnabled: s.aiEnabled,
        preferredAiProvider: s.preferredAiProvider,
        openaiApiKey: maskSecret(decryptText(s.openaiApiKeyEnc)),
        geminiApiKey: maskSecret(decryptText(s.geminiApiKeyEnc)),
        deepseekApiKey: maskSecret(decryptText(s.deepseekApiKeyEnc)),
        claudeApiKey: maskSecret(decryptText(s.claudeApiKeyEnc)),
        whatsappEnabled: s.whatsappEnabled,
        whatsappPhoneNumberId: s.whatsappPhoneNumberId || "",
        whatsappBusinessAccountId: s.whatsappBusinessAccountId || "",
        whatsappAccessToken: maskSecret(decryptText(s.whatsappAccessTokenEnc)),
        whatsappVerifyToken: maskSecret(decryptText(s.whatsappVerifyTokenEnc)),
        userBroadcastAlert: typeof s.userBroadcastAlert === "string" ? s.userBroadcastAlert : "",
        userBroadcastAlertRevision: s.userBroadcastAlertRevision ?? 0,
      };
    }),

    updateSettings: superAdminProcedure
      .input(z.object({
        aiEnabled: z.boolean().optional(),
        preferredAiProvider: z.enum(["openai", "gemini", "deepseek", "claude"]).optional(),
        openaiApiKey: z.string().optional(),
        geminiApiKey: z.string().optional(),
        deepseekApiKey: z.string().optional(),
        claudeApiKey: z.string().optional(),
        whatsappEnabled: z.boolean().optional(),
        whatsappAccessToken: z.string().optional(),
        whatsappPhoneNumberId: z.string().optional(),
        whatsappBusinessAccountId: z.string().optional(),
        whatsappVerifyToken: z.string().optional(),
        userBroadcastAlert: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const existing = await db.select().from(appSettings).limit(1);
        const update: any = {
          updatedBy: user?.id,
        };

        if (input.aiEnabled !== undefined) update.aiEnabled = input.aiEnabled;
        if (input.preferredAiProvider !== undefined) update.preferredAiProvider = input.preferredAiProvider;

        const setSecret = (field: string, value: string | undefined) => {
          if (value === undefined) return;
          const trimmed = value.trim();
          if (!trimmed) return; // keep existing if empty
          if (looksLikeMaskedSecret(trimmed)) return; // UI mask — não substituir chave real
          update[field] = encryptText(trimmed);
        };

        setSecret("openaiApiKeyEnc", input.openaiApiKey);
        setSecret("geminiApiKeyEnc", input.geminiApiKey);
        setSecret("deepseekApiKeyEnc", input.deepseekApiKey);
        setSecret("claudeApiKeyEnc", input.claudeApiKey);

        if (input.whatsappEnabled !== undefined) update.whatsappEnabled = input.whatsappEnabled;
        if (input.whatsappPhoneNumberId !== undefined) update.whatsappPhoneNumberId = input.whatsappPhoneNumberId || null;
        if (input.whatsappBusinessAccountId !== undefined) update.whatsappBusinessAccountId = input.whatsappBusinessAccountId || null;
        setSecret("whatsappAccessTokenEnc", input.whatsappAccessToken);
        setSecret("whatsappVerifyTokenEnc", input.whatsappVerifyToken);

        if (input.userBroadcastAlert !== undefined) {
          const trimmed =
            input.userBroadcastAlert === null ? "" : String(input.userBroadcastAlert).trim();
          update.userBroadcastAlert = trimmed || null;
          const prevRev = Number(existing[0]?.userBroadcastAlertRevision ?? 0);
          update.userBroadcastAlertRevision = prevRev + 1;
        }

        if (existing[0]) {
          await db.update(appSettings).set(update).where(eq(appSettings.id, existing[0].id));
        } else {
          await db.insert(appSettings).values({
            aiEnabled: update.aiEnabled ?? true,
            preferredAiProvider: update.preferredAiProvider ?? "openai",
            openaiApiKeyEnc: update.openaiApiKeyEnc ?? null,
            geminiApiKeyEnc: update.geminiApiKeyEnc ?? null,
            deepseekApiKeyEnc: update.deepseekApiKeyEnc ?? null,
            claudeApiKeyEnc: update.claudeApiKeyEnc ?? null,
            whatsappEnabled: update.whatsappEnabled ?? false,
            whatsappAccessTokenEnc: update.whatsappAccessTokenEnc ?? null,
            whatsappPhoneNumberId: update.whatsappPhoneNumberId ?? null,
            whatsappBusinessAccountId: update.whatsappBusinessAccountId ?? null,
            whatsappVerifyTokenEnc: update.whatsappVerifyTokenEnc ?? null,
            userBroadcastAlert: update.userBroadcastAlert ?? null,
            userBroadcastAlertRevision: update.userBroadcastAlertRevision ?? 0,
            updatedBy: user?.id,
          } as any);
        }

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "settings_update",
          entity: "appSettings",
          details: "Atualizou configurações do sistema",
        });

        return { success: true };
      }),

    purgeData: superAdminProcedure
      .input(z.object({
        scope: z.enum(["all_except_audit", "crm_only"]).default("all_except_audit"),
        confirm: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.confirm !== "APAGAR") {
          throw new Error("Confirmação inválida. Escreva APAGAR.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        // Never delete auditLogs.
        const tables =
          input.scope === "crm_only"
            ? [
                "callLogs",
                "pendentes",
                "contacts",
                "contracts",
                "sales",
                "blacklist",
                "sosRequests",
                "gamification",
                "calendarEvents",
                "campaignFiles",
                "campaigns",
              ]
            : [
                "callLogs",
                "pendentes",
                "contacts",
                "contracts",
                "sales",
                "blacklist",
                "sosRequests",
                "gamification",
                "calendarEvents",
                "campaignFiles",
                "campaigns",
                "competitorScripts",
                "contactOrigins",
                "energyCalculations",
                "energyConfig",
                "teams",
                "appSettings",
                "users",
              ];

        await db.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
        for (const t of tables) {
          await db.execute(sql.raw(`DELETE FROM \`${t}\``));
        }
        await db.execute(sql`SET FOREIGN_KEY_CHECKS=1`);

        // Ensure current super admin still exists (if scope was all)
        if (input.scope === "all_except_audit") {
          // Recreate current user minimal record so they don't lock themselves out.
          await db.insert(users).values({
            openId: user.openId,
            name: user.name ?? "Super Admin",
            email: user.email ?? null,
            loginMethod: user.loginMethod ?? null,
            role: "admin",
            crmRole: "coordenador",
            isSuperAdmin: true,
          } as any).onDuplicateKeyUpdate({
            set: {
              role: "admin",
              crmRole: "coordenador",
              isSuperAdmin: true,
            } as any,
          });
        }

        await db.insert(auditLogs).values({
          userId: user?.id ?? 0,
          action: "purge_data",
          entity: "system",
          details: `Purge: ${input.scope}`,
        } as any);

        return { success: true };
      }),
  }),

  // ============ CALL LOGS ============
  calls: router({
    log: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        outcome: z.enum(["atendeu", "nao_atende", "ocupado", "numero_errado", "venda", "pendente", "sem_interesse"]),
        notes: z.string().optional(),
        lossReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(callLogs).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          outcome: input.outcome,
          notes: input.notes || null,
        });

        const statusMap: Record<string, string> = {
          atendeu: "em_contacto",
          nao_atende: "nao_atende",
          venda: "venda",
          pendente: "pendente",
          sem_interesse: "sem_interesse",
        };

        const newStatus = statusMap[input.outcome] || "em_contacto";
        await db.update(contacts).set({
          status: newStatus as any,
          attempts: sql`attempts + 1`,
          lastAttemptAt: new Date(),
          lossReason: input.lossReason || null,
        }).where(eq(contacts.id, input.contactId));

        return { success: true };
      }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        return {
          callsToday: 0,
          pendentesToday: 0,
          overduePendenteCount: 0,
          salesMonth: 0,
          totalContacts: 0,
          dailyCallsGoal: DEFAULT_DAILY_CALLS_GOAL,
          salesPipeline: { aguarda_instalacao: 0, em_aberto: 0, activo: 0, e_switch: 0, cancelado: 0 },
          pendenteAlerts: [] as Array<{
            id: number;
            contactId: number;
            returnDate: Date;
            contactPhone: string | null;
            contactName: string | null;
            priorityLevel: number;
            vendedorName: string | null;
          }>,
          dialerQueueEligibleCount: 0,
          rankingPosition: null as number | null,
        };
      }
      const user = ctx.user as any;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sellerIds = await getSellerIdsForPipelineScope(db, user);
      const tenantCallLogs = whereInTenantUserIds(sellerIds, callLogs.vendedorId);
      const tenantPendentesV = whereInTenantUserIds(sellerIds, pendentes.vendedorId);
      const tenantSalesV = whereInTenantUserIds(sellerIds, sales.vendedorId);
      const contactTenant = whereContactsForUser(user);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const queueParts: SQL[] = [
        eq(contacts.status, "novo"),
        or(
          sql`${contacts.lastAssignedAt} IS NULL`,
          sql`${contacts.lastAssignedAt} < ${thirtyDaysAgo}`,
        ) as SQL,
      ];
      if (contactTenant) queueParts.unshift(contactTenant);
      const dialerQueueResult = await db.select({ count: sql<number>`COUNT(*)` }).from(contacts)
        .where(and(...queueParts));
      const dialerQueueEligibleCount = Number(dialerQueueResult[0]?.count ?? 0);

      // Calls today
      let callsResult;
      if (user?.crmRole === "vendedor") {
        callsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(callLogs)
          .where(and(eq(callLogs.vendedorId, user.id), gte(callLogs.calledAt, today)));
      } else {
        const cparts: SQL[] = [gte(callLogs.calledAt, today)];
        if (tenantCallLogs) cparts.push(tenantCallLogs);
        callsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(callLogs)
          .where(and(...cparts));
      }

      // Pendentes for today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      let pendentesResult;
      if (user?.crmRole === "vendedor") {
        pendentesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .where(and(
            eq(pendentes.vendedorId, user.id),
            eq(pendentes.status, "agendado"),
            gte(pendentes.returnDate, today),
            lt(pendentes.returnDate, tomorrow),
          ));
      } else {
        const pparts: SQL[] = [
          eq(pendentes.status, "agendado"),
          gte(pendentes.returnDate, today),
          lt(pendentes.returnDate, tomorrow),
        ];
        if (tenantPendentesV) pparts.push(tenantPendentesV);
        pendentesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .where(and(...pparts));
      }

      // Pendentes em atraso (agendados com data já passada)
      const now = new Date();
      const overdueConditions: SQL[] = [
        eq(pendentes.status, "agendado"),
        lt(pendentes.returnDate, now),
      ];
      if (user?.crmRole === "vendedor") overdueConditions.push(eq(pendentes.vendedorId, user.id));
      else if (tenantPendentesV) overdueConditions.push(tenantPendentesV);
      const overdueResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
        .where(and(...overdueConditions));

      const alertParts = [...overdueConditions];
      if (contactTenant) alertParts.push(contactTenant);
      let alertQuery = db.select({
        id: pendentes.id,
        contactId: pendentes.contactId,
        returnDate: pendentes.returnDate,
        contactPhone: contacts.phone,
        contactName: contacts.name,
        priorityLevel: pendentes.priorityLevel,
        vendedorName: users.name,
      }).from(pendentes)
        .leftJoin(contacts, eq(pendentes.contactId, contacts.id))
        .leftJoin(users, eq(pendentes.vendedorId, users.id))
        .where(and(...alertParts))
        .orderBy(desc(pendentes.priorityLevel), asc(pendentes.returnDate))
        .limit(12);

      const pendenteAlerts = await alertQuery;

      const mo = today.getMonth() + 1;
      const yr = today.getFullYear();
      let activeInstallConditions: SQL[] = [
        eq(sales.status, "activo"),
        sql`${sales.installationDate} IS NOT NULL`,
        sql`MONTH(${sales.installationDate}) = ${mo}`,
        sql`YEAR(${sales.installationDate}) = ${yr}`,
      ];
      if (user?.crmRole === "vendedor") activeInstallConditions.push(eq(sales.vendedorId, user.id));
      else if (tenantSalesV) activeInstallConditions.push(tenantSalesV);

      const salesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
        .where(and(...activeInstallConditions));

      const pipeSelect = db.select({
        status: sales.status,
        cnt: sql<number>`count(*)`,
      }).from(sales);
      let pipeRows: any[];
      if (user?.crmRole === "vendedor") {
        pipeRows = await pipeSelect.where(eq(sales.vendedorId, user.id)).groupBy(sales.status);
      } else if (tenantSalesV) {
        pipeRows = await pipeSelect.where(tenantSalesV).groupBy(sales.status);
      } else {
        pipeRows = await pipeSelect.groupBy(sales.status);
      }

      const salesPipeline = {
        aguarda_instalacao: 0,
        em_aberto: 0,
        activo: 0,
        e_switch: 0,
        cancelado: 0,
      } as Record<string, number>;
      for (const row of pipeRows as any[]) {
        if (row.status in salesPipeline) salesPipeline[row.status] = Number(row.cnt);
      }

      // Posição no ranking (vendas activas com instalação no mês atual)
      let rankingPosition: number | null = null;
      const rankBase: SQL[] = [
        eq(sales.status, "activo"),
        sql`${sales.installationDate} IS NOT NULL`,
        sql`MONTH(${sales.installationDate}) = ${mo}`,
        sql`YEAR(${sales.installationDate}) = ${yr}`,
      ];
      if (tenantSalesV) rankBase.push(tenantSalesV);
      const rankCounts = await db.select({
        vendedorId: sales.vendedorId,
        cnt: sql<number>`count(*)`,
      }).from(sales).where(and(...rankBase))
        .groupBy(sales.vendedorId)
        .orderBy(desc(sql`count(*)`));

      const sorted = [...rankCounts] as Array<{ vendedorId: number; cnt: number }>;
      const idx = sorted.findIndex(r => r.vendedorId === user?.id);
      if (idx >= 0) rankingPosition = idx + 1;

      const dailyCallsGoal = await resolveDailyCallsGoalForUser(db, user);

      return {
        callsToday: callsResult[0]?.count || 0,
        pendentesToday: pendentesResult[0]?.count || 0,
        overduePendenteCount: overdueResult[0]?.count || 0,
        salesMonth: salesResult[0]?.count || 0,
        totalContacts: 0,
        dailyCallsGoal,
        salesPipeline,
        pendenteAlerts,
        dialerQueueEligibleCount,
        rankingPosition,
      };
    }),
  }),

  // ============ DISTRIBUTION ============
  distribution: router({
    getNext: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;

      // Get next available contact not assigned in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const tcond = whereContactsForUser(user);
      const cand: SQL[] = [
        eq(contacts.status, "novo"),
        or(
          sql`${contacts.lastAssignedAt} IS NULL`,
          sql`${contacts.lastAssignedAt} < ${thirtyDaysAgo}`,
        ) as SQL,
      ];
      if (tcond) cand.unshift(tcond);

      const result = await db
        .select()
        .from(contacts)
        .where(and(...cand))
        .limit(1);

      if (result.length === 0) return null;

      const contact = result[0];
      await db.update(contacts).set({
        assignedTo: user?.id,
        lastAssignedAt: new Date(),
        status: "em_contacto",
      }).where(eq(contacts.id, contact.id));

      return contact;
    }),

    repescagem: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      const tcond = whereContactsForUser(user);
      const parts: SQL[] = [eq(contacts.status, "nao_atende"), sql`${contacts.attempts} >= 3`];
      if (tcond) parts.unshift(tcond);
      return await db
        .select()
        .from(contacts)
        .where(and(...parts))
        .orderBy(desc(contacts.lastAttemptAt))
        .limit(20);
    }),
  }),

  // ============ DIALER ============
  dialer: router({
    next: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;
      if (!canUseDialer(user)) {
        throw new Error("Discador disponível para vendedores e chefes de equipa.");
      }

      // 1) Vendedores: priorizar pendentes próprios em atraso
      const now = new Date();
      const pT = whereContactsForUser(user);
      if (user?.crmRole === "vendedor") {
        const dueWhere: SQL[] = [
          eq(pendentes.vendedorId, user.id),
          eq(pendentes.status, "agendado"),
          lte(pendentes.returnDate, now),
        ];
        if (pT) dueWhere.push(pT);

        const due = await db
          .select({ pendente: pendentes })
          .from(pendentes)
          .innerJoin(contacts, eq(pendentes.contactId, contacts.id))
          .where(and(...dueWhere))
          .orderBy(desc(pendentes.priorityLevel), desc(pendentes.returnDate))
          .limit(1);

        const dueRow = due[0]?.pendente;
        if (dueRow) {
          const contact = await db.select().from(contacts).where(eq(contacts.id, dueRow.contactId)).limit(1);
          if (contact[0]) {
            await db.update(users).set({
              dialerState: "ready",
              dialerContactId: contact[0].id,
              dialerSource: "pendente",
              dialerUpdatedAt: new Date(),
            } as any).where(eq(users.id, user.id));
            return { source: "pendente", pendente: dueRow, contact: contact[0] };
          }
        }
      }

      // 2) Fila aleatória (novo + cooldown 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dq: SQL[] = [
        eq(contacts.status, "novo"),
        or(
          sql`${contacts.lastAssignedAt} IS NULL`,
          sql`${contacts.lastAssignedAt} < ${thirtyDaysAgo}`,
        ) as SQL,
      ];
      const dtc = whereContactsForUser(user);
      if (dtc) dq.unshift(dtc);
      const result = await db
        .select()
        .from(contacts)
        .where(and(...dq))
        .limit(1);
      if (result.length === 0) return null;

      const c = result[0];
      await db.update(contacts).set({
        assignedTo: user?.id,
        lastAssignedAt: new Date(),
        status: "em_contacto",
      }).where(eq(contacts.id, c.id));

      await db.update(users).set({
        dialerState: "ready",
        dialerContactId: c.id,
        dialerSource: "queue",
        dialerUpdatedAt: new Date(),
      } as any).where(eq(users.id, user.id));

      return { source: "queue", contact: c };
    }),

    outcome: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        outcome: z.enum(["atendeu", "nao_atende"]),
        notes: z.string().optional(),
        // for atendeu
        disposition: z.enum(["lead", "pendente"]).optional(),
        pendenteReturnDate: z.string().optional(),
        pendenteNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!canUseDialer(user)) {
          throw new Error("Discador disponível para vendedores e chefes de equipa.");
        }

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(callLogs).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          outcome: input.outcome as any,
          notes: input.notes || null,
        });

        if (input.outcome === "nao_atende") {
          await db.update(contacts).set({
            status: "nao_atende",
            attempts: sql`attempts + 1`,
            lastAttemptAt: new Date(),
          }).where(eq(contacts.id, input.contactId));
        } else {
          // atendeu requires disposition
          if (!input.disposition) throw new Error("Selecione Lead ou Pendente");

          if (input.disposition === "lead") {
            await db.update(contacts).set({
              status: "em_contacto",
              isLead: true,
              notes: input.notes || null,
              lastAttemptAt: new Date(),
              attempts: sql`attempts + 1`,
            } as any).where(eq(contacts.id, input.contactId));
          } else {
            if (!input.pendenteReturnDate) throw new Error("Defina data de retorno");
            await db.insert(pendentes).values({
              contactId: input.contactId,
              vendedorId: user?.id,
              returnDate: new Date(input.pendenteReturnDate),
              notes: input.pendenteNotes || input.notes || null,
              offerDesired: null,
              status: "agendado",
              priorityLevel: 3,
            } as any);
            await db.update(contacts).set({
              status: "pendente",
              lastAttemptAt: new Date(),
              attempts: sql`attempts + 1`,
              notes: input.notes || null,
            } as any).where(eq(contacts.id, input.contactId));
          }
        }

        // Clear current dialer contact -> forces next ping
        await db.update(users).set({
          dialerState: "idle",
          dialerContactId: null,
          dialerUpdatedAt: new Date(),
        } as any).where(eq(users.id, user.id));

        return { success: true };
      }),
  }),

  // ============ SUPERVISION ============
  supervision: router({
    teamStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;

      if (!["cej", "ce", "coordenador"].includes(user?.crmRole) && !isSuperAdminUser(user)) return [];

      const selectSupervisionUsers = {
        id: users.id,
        name: users.name,
        email: users.email,
        crmRole: users.crmRole,
        teamId: users.teamId,
        isOnline: users.isOnline,
        dialerState: (users as any).dialerState,
        dialerContactId: (users as any).dialerContactId,
        dialerSource: (users as any).dialerSource,
        dialerUpdatedAt: (users as any).dialerUpdatedAt,
        presenceSessionStartedAt: users.presenceSessionStartedAt,
        lastSeenIp: users.lastSeenIp,
        lastSeenUserAgent: users.lastSeenUserAgent,
        lastSeenGeo: users.lastSeenGeo,
      };

      const mapDevice = (r: Record<string, unknown>) => ({
        ...r,
        deviceSummary: summarizeUserAgent(String(r.lastSeenUserAgent ?? "")),
      });

      /** Super Admin (mesmo sem crmRole coordenador) vê todos os utilizadores com filtro tenant «ALL». */
      if (isSuperAdminUser(user)) {
        let q = db.select(selectSupervisionUsers).from(users);
        const uw = whereUsersForUser(user as any);
        const parts: SQL[] = [];
        if (uw) parts.push(uw);
        if (parts.length) q = (q as any).where(and(...parts));
        const rows = await (q as any);
        return rows.map(mapDevice);
      }

      // Coordenador: visão global no tenant. CE / CEJ: só membros da mesma equipa.
      let q = db.select(selectSupervisionUsers).from(users);
      const uw = whereUsersForUser(user as any);
      const parts: SQL[] = [];
      if (uw) parts.push(uw);

      if (user?.crmRole === "coordenador") {
        if (parts.length) q = (q as any).where(and(...parts));
        const rows = await (q as any);
        return rows.map(mapDevice);
      }

      const scopeId = await resolveUserTeamScopeId(db, {
        id: user.id,
        teamId: user.teamId ?? null,
        crmRole: user.crmRole,
      });

      if (scopeId == null) return [];

      parts.push(eq(users.teamId, scopeId));
      q = (q as any).where(and(...parts));

      const rows = await (q as any);
      return rows.map(mapDevice);
    }),

    alerts: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      if (!["cej", "ce", "coordenador"].includes(user?.crmRole) && !isSuperAdminUser(user)) return [];

      const now = new Date();
      const overdue: SQL[] = [
        eq(pendentes.status, "agendado"),
        lte(pendentes.returnDate, now),
      ];
      const pvin = whereInTenantUserIds(await getSellerIdsForPipelineScope(db, user), pendentes.vendedorId);
      if (pvin) overdue.push(pvin);
      const pten = whereContactsForUser(user as any);
      if (pten) overdue.push(pten);
      const due = await db
        .select({ p: pendentes })
        .from(pendentes)
        .innerJoin(contacts, eq(pendentes.contactId, contacts.id))
        .where(and(...overdue))
        .orderBy(desc(pendentes.returnDate))
        .limit(50);

      return due.map((row) => row.p);
    }),
  }),

  // ============ BLACKLIST ============
  blacklist: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const user = ctx.user as any;
        /** Vendedor / CEJ: não veem números (LGPD interno); usam apenas adicionar a partir do discador. */
        if (user?.crmRole === "vendedor" || user?.crmRole === "cej") {
          return [];
        }

        const parts: SQL[] = [];

        if (!isSuperAdminUser(user)) {
          const scope = getScopedTenantCoordinatorUserId(user);
          if (scope === null || scope === undefined) return [];
          if (typeof scope === "number") {
            parts.push(eq(blacklist.tenantId, scope));
          }

          if (user?.crmRole === "ce") {
            const teamScope = await resolveUserTeamScopeId(db, {
              id: user.id,
              teamId: user.teamId ?? null,
              crmRole: user.crmRole,
            });
            if (teamScope != null) {
              parts.push(eq(blacklist.teamId, teamScope));
            } else {
              return [];
            }
          }
        }

        const term = input?.search?.trim();
        if (term) {
          const cleaned = term.replace(/[%_\\\\]/g, "");
          if (cleaned.length > 0) {
            parts.push(like(blacklist.phone, `%${cleaned}%`));
          }
        }

        let q = db
          .select({
            id: blacklist.id,
            phone: blacklist.phone,
            reason: blacklist.reason,
            createdAt: blacklist.createdAt,
            addedByName: users.name,
          })
          .from(blacklist)
          .leftJoin(users, eq(blacklist.addedBy, users.id));

        if (parts.length > 0) {
          q = (q as any).where(and(...parts));
        }

        return await (q as any).orderBy(desc(blacklist.createdAt)).limit(500);
      }),

    add: protectedProcedure
      .input(z.object({ phone: z.string(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const { tenantId: tidIns, teamId: teamIns } = await blacklistTeamScopeForInsert(db, user);

        await db.insert(blacklist).values({
          phone: input.phone.trim(),
          tenantId: tidIns,
          teamId: teamIns,
          reason: input.reason || null,
          addedBy: user?.id,
        } as any);

        const bu: SQL[] = [eq(contacts.phone, input.phone.trim())];
        const cten = whereContactsForUser(user);
        if (cten) bu.push(cten);
        await db.update(contacts)
          .set({ status: "blacklist" })
          .where(and(...bu));

        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        if (!["ce", "coordenador"].includes(user?.crmRole) && !isSuperAdminUser(user)) {
          throw new Error("Sem permissão para remover da lista negra.");
        }

        const [row] = await db.select().from(blacklist).where(eq(blacklist.id, input.id)).limit(1);
        if (!row) return { success: true };

        const scope = getScopedTenantCoordinatorUserId(user);
        if (!isSuperAdminUser(user)) {
          if (scope === null || typeof scope !== "number" || Number(row.tenantId) !== scope) {
            throw new Error("Sem permissão sobre esta linha.");
          }
          if (user.crmRole === "ce") {
            const ts = await resolveUserTeamScopeId(db, {
              id: user.id,
              teamId: user.teamId ?? null,
              crmRole: user.crmRole,
            });
            if (ts == null) {
              throw new Error("Equipa não resolvida.");
            }
            if (row.teamId != null && Number(row.teamId) !== ts) {
              throw new Error("Só pode remover entradas da sua equipa.");
            }
          }
        }

        await db.delete(blacklist).where(eq(blacklist.id, input.id));
        return { success: true };
      }),
  }),

  // ============ BETA — sugestões de funcionalidades ============
  beta: router({
    submit: protectedProcedure
      .input(
        z.object({
          title: z.string().min(3).max(255),
          body: z.string().min(10).max(8000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const tenantId = user.tenantId != null ? Number(user.tenantId) : null;
        if (!isSuperAdminUser(user) && tenantId == null) {
          throw new Error("Conta sem empresa associada; não é possível enviar sugestões.");
        }
        await db.insert(featureSuggestions).values({
          tenantId,
          authorId: user.id,
          title: input.title.trim(),
          body: input.body.trim(),
          status: "pending",
        } as any);
        await db.insert(auditLogs).values({
          userId: user.id,
          action: "beta_suggestion_submit",
          entity: "featureSuggestion",
          details: input.title.trim().slice(0, 200),
        });
        return { success: true };
      }),

    listMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      return await db
        .select({
          id: featureSuggestions.id,
          title: featureSuggestions.title,
          body: featureSuggestions.body,
          status: featureSuggestions.status,
          createdAt: featureSuggestions.createdAt,
          reviewedAt: featureSuggestions.reviewedAt,
          reviewNote: featureSuggestions.reviewNote,
        })
        .from(featureSuggestions)
        .where(eq(featureSuggestions.authorId, user.id))
        .orderBy(desc(featureSuggestions.createdAt))
        .limit(100);
    }),

    listPending: protectedProcedure.query(async ({ ctx }) => {
      if (!canReviewBetaSuggestions(ctx.user)) return [];
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      const parts: SQL[] = [eq(featureSuggestions.status, "pending")];
      if (!isSuperAdminUser(user)) {
        if (user.tenantId == null) return [];
        parts.push(eq(featureSuggestions.tenantId, user.tenantId));
      }
      const rows = await db
        .select({
          id: featureSuggestions.id,
          tenantId: featureSuggestions.tenantId,
          title: featureSuggestions.title,
          body: featureSuggestions.body,
          authorId: featureSuggestions.authorId,
          authorName: users.name,
          createdAt: featureSuggestions.createdAt,
        })
        .from(featureSuggestions)
        .leftJoin(users, eq(featureSuggestions.authorId, users.id))
        .where(and(...parts))
        .orderBy(desc(featureSuggestions.createdAt))
        .limit(200);
      return rows;
    }),

    listAccepted: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      const parts: SQL[] = [eq(featureSuggestions.status, "accepted")];
      if (!isSuperAdminUser(user)) {
        if (user.tenantId == null) return [];
        parts.push(eq(featureSuggestions.tenantId, user.tenantId));
      }
      const rows = await db
        .select({
          id: featureSuggestions.id,
          tenantId: featureSuggestions.tenantId,
          title: featureSuggestions.title,
          body: featureSuggestions.body,
          createdAt: featureSuggestions.createdAt,
          reviewedAt: featureSuggestions.reviewedAt,
          authorName: users.name,
        })
        .from(featureSuggestions)
        .leftJoin(users, eq(featureSuggestions.authorId, users.id))
        .where(and(...parts))
        .orderBy(desc(featureSuggestions.reviewedAt), desc(featureSuggestions.createdAt))
        .limit(500);

      const tenantIds = Array.from(
        new Set(rows.map((r) => r.tenantId).filter((x): x is number => x != null)),
      );
      let tenantLabels: Record<number, string> = {};
      if (tenantIds.length) {
        const tr = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, tenantIds));
        tenantLabels = Object.fromEntries(tr.map((t) => [t.id, t.name?.trim() || `Empresa #${t.id}`]));
      }

      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantLabel:
          r.tenantId != null ? tenantLabels[r.tenantId] ?? `Empresa #${r.tenantId}` : "Global / Super Admin",
        title: r.title,
        body: r.body,
        createdAt: r.createdAt,
        acceptedAt: r.reviewedAt,
        authorName: r.authorName,
      }));
    }),

    review: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          decision: z.enum(["accepted", "rejected"]),
          reviewNote: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!canReviewBetaSuggestions(ctx.user)) {
          throw new Error("Só Super Admin ou Coordenador podem rever sugestões.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [row] = await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, input.id)).limit(1);
        if (!row) throw new Error("Sugestão não encontrada.");
        if (row.status !== "pending") throw new Error("Esta sugestão já foi revista.");
        assertSuggestionReviewableByUser(row as any, user);

        await db
          .update(featureSuggestions)
          .set({
            status: input.decision,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNote: input.reviewNote?.trim() || null,
          } as any)
          .where(eq(featureSuggestions.id, input.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: input.decision === "accepted" ? "beta_suggestion_accept" : "beta_suggestion_reject",
          entity: "featureSuggestion",
          entityId: input.id,
          details: `${input.decision}: ${row.title}`.slice(0, 255),
        });

        return { success: true };
      }),
  }),

  // ============ GAMIFICATION ============
  gamification: router({
    ranking: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      const now = new Date();
      const mo = now.getMonth() + 1;
      const yr = now.getFullYear();

      const sellerIds = await getSellerIdsForPipelineScope(db, user);
      const tenantV = whereInTenantUserIds(sellerIds, sales.vendedorId);

      const parts: SQL[] = [
        eq(sales.status, "activo"),
        sql`${sales.installationDate} IS NOT NULL`,
        sql`MONTH(${sales.installationDate}) = ${mo}`,
        sql`YEAR(${sales.installationDate}) = ${yr}`,
      ];
      if (tenantV) parts.push(tenantV);

      const counts = await db.select({
        userId: sales.vendedorId,
        activoSales: sql<number>`count(*)`,
      }).from(sales)
        .where(and(...parts))
        .groupBy(sales.vendedorId)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      if (!counts.length) return [];

      const ids = counts.map(c => c.userId);
      const nameRows = await db.select({ id: users.id, name: users.name }).from(users)
        .where(inArray(users.id, ids));
      const nameMap = Object.fromEntries(nameRows.map(r => [r.id, r.name]));

      return counts.map((c, position) => ({
        position: position + 1,
        userId: c.userId,
        userName: nameMap[c.userId] || `Utilizador #${c.userId}`,
        activoSales: Number(c.activoSales),
        points: Number(c.activoSales),
        totalSales: Number(c.activoSales),
        totalCalls: 0,
      }));
    }),
  }),

  // ============ AUDIT (só leitura — nunca UPDATE/DELETE na app; linhas intocáveis) ============
  audit: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }).optional())
      .query(async ({ ctx, input }) => {
        const user = ctx.user as any;
        if (
          !["ce", "coordenador"].includes(user?.crmRole ?? "") &&
          !isSuperAdminUser(user)
        ) {
          throw new Error("Sem permissão para consultar a auditoria.");
        }
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select({
            id: auditLogs.id,
            userId: auditLogs.userId,
            actorName: users.name,
            actorEmail: users.email,
            action: auditLogs.action,
            entity: auditLogs.entity,
            entityId: auditLogs.entityId,
            details: auditLogs.details,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(input?.limit || 50);

        return rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          actorLabel:
            r.actorName?.trim() ||
            r.actorEmail?.trim() ||
            (r.userId > 0 ? `Utilizador #${r.userId}` : "Sistema"),
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          details: r.details,
          createdAt: r.createdAt,
        }));
      }),
  }),

  // ============ COMPETITOR SCRIPTS ============
  scripts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      let q = db.select().from(competitorScripts);
      const st = isSuperAdminUser(user)
        ? undefined
        : user.tenantId != null
          ? eq(competitorScripts.tenantId, user.tenantId)
          : sql`1=0`;
      if (st) q = (q as any).where(st);
      return await (q as any).orderBy(desc(competitorScripts.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({
        competitor: z.string().min(1),
        weakness: z.string().min(1),
        ourStrength: z.string().min(1),
        product: z.enum(["telecom", "energia", "ambos"]).default("ambos"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const tid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && tid == null) throw new Error("Conta sem empresa.");

        await db.insert(competitorScripts).values({
          competitor: input.competitor,
          weakness: input.weakness,
          ourStrength: input.ourStrength,
          product: input.product,
          createdBy: user?.id,
          tenantId: tid,
        } as any);

        return { success: true };
      }),
  }),

  // ============ SALES ============
  sales: router({
    list: protectedProcedure
      .input(z.object({ month: z.number().optional(), year: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const now = new Date();
        const month = input?.month || (now.getMonth() + 1);
        const year = input?.year || now.getFullYear();

        let conditions: SQL[] = [
          sql`MONTH(${sales.closedAt}) = ${month}`,
          sql`YEAR(${sales.closedAt}) = ${year}`,
        ];

        if (user?.crmRole === "vendedor") {
          conditions.push(eq(sales.vendedorId, user.id));
        } else {
          const tenantV = whereInTenantUserIds(await getSellerIdsForPipelineScope(db, user), sales.vendedorId);
          if (tenantV) conditions.push(tenantV);
        }

        return await db.select().from(sales)
          .where(and(...conditions))
          .orderBy(desc(sales.closedAt));
      }),

    pipeline: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(["aguarda_instalacao", "em_aberto", "activo", "e_switch", "cancelado"]).optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const ids = await getSellerIdsForPipelineScope(db, user);
        const parts: SQL[] = [];
        const vcond = whereInTenantUserIds(ids, sales.vendedorId);
        if (vcond) parts.push(vcond);
        const cten = whereContactsForUser(user);
        if (cten) parts.push(cten);
        if (input?.status) parts.push(eq(sales.status, input.status));
        else parts.push(sql`${sales.status} <> 'cancelado'`);
        const rows = await db
          .select({
            sale: sales,
            contactName: contacts.name,
            contactPhone: contacts.phone,
          })
          .from(sales)
          .innerJoin(contacts, eq(sales.contactId, contacts.id))
          .where(and(...parts))
          .orderBy(desc(sales.updatedAt))
          .limit(300);
        return rows.map((r) => ({
          ...r.sale,
          contactName: r.contactName,
          contactPhone: r.contactPhone,
        }));
      }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        product: z.enum(["telecom", "energia"]),
        offer: z.string().optional(),
        value: z.string().optional(),
        installationDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(sales).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          product: input.product,
          offer: input.offer || null,
          value: input.value || null,
          installationDate: input.installationDate ? new Date(input.installationDate) : null,
          status: "aguarda_instalacao",
        });

        const [created] = await db
          .select({ id: sales.id })
          .from(sales)
          .where(and(eq(sales.contactId, input.contactId), eq(sales.vendedorId, user?.id as number)))
          .orderBy(desc(sales.id))
          .limit(1);

        if (created?.id && input.installationDate && String(input.installationDate).trim()) {
          await syncSaleInstallationCalendar(db, {
            saleId: created.id,
            contactId: input.contactId,
            vendedorId: user?.id as number,
            installationDate: new Date(input.installationDate),
          });
        }

        // Update contact status
        await db.update(contacts)
          .set({
            status: "venda",
            ...(input.product === "telecom" ? { hasTelecom: true } : { hasEnergy: true }),
          })
          .where(eq(contacts.id, input.contactId));

        // Log audit
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "sale_created",
          entity: "sale",
          details: `Venda ${input.product} para contacto #${input.contactId}`,
        });

        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        saleId: z.number(),
        status: z.enum(["aguarda_instalacao", "em_aberto", "activo", "e_switch", "cancelado"]).optional(),
        installationDate: z.string().optional().nullable(),
        cancelReason: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canManageSalesLifecycle(ctx.user)) {
          throw new Error("Sem permissão para atualizar estado da venda");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const row = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
        const s = row[0];
        if (!s) throw new Error("Venda não encontrada");

        await assertContactAccessible(db, s.contactId, user);

        const patch: Record<string, unknown> = {};
        if (input.status !== undefined) patch.status = input.status;
        if (input.cancelReason !== undefined) patch.cancelReason = input.cancelReason;
        if (input.installationDate !== undefined) {
          patch.installationDate = input.installationDate ? new Date(input.installationDate) : null;
        }
        const nextStatus = input.status !== undefined ? input.status : s.status;
        const nextInstallationDate =
          input.installationDate !== undefined
            ? (input.installationDate ? new Date(input.installationDate) : null)
            : s.installationDate;
        if (nextStatus === "activo" && !nextInstallationDate) {
          throw new Error("Defina a data de instalação ao marcar como Activo");
        }
        await db.update(sales).set(patch as any).where(eq(sales.id, input.saleId));

        const [fresh] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
        if (fresh) {
          let instDate: Date | null = null;
          if (fresh.installationDate != null) {
            const d = fresh.installationDate instanceof Date ? fresh.installationDate : new Date(fresh.installationDate as string);
            if (!Number.isNaN(d.getTime())) instDate = d;
          }
          await syncSaleInstallationCalendar(db, {
            saleId: fresh.id,
            contactId: fresh.contactId,
            vendedorId: fresh.vendedorId,
            installationDate: instDate,
          });
        }

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "sale_updated",
          entity: "sale",
          entityId: input.saleId,
          details: `Atualizou venda #${input.saleId}`,
        });
        return { success: true };
      }),
  }),

  // ============ SESSION / PAUSE ============
  session: router({
    goOnline: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const user = ctx.user as any;
      const ip = getClientIp(ctx.req as any);
      const ua = getClientUserAgent(ctx.req as any);

      const [before] = await db
        .select({
          isOnline: users.isOnline,
          lastSeenIp: users.lastSeenIp,
          lastSeenGeo: users.lastSeenGeo,
          presenceSessionStartedAt: users.presenceSessionStartedAt,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const wasOffline = before ? !before.isOnline : true;
      const ipChanged = (before?.lastSeenIp ?? "") !== (ip || "");
      /** Inicia/repor marcador de sessão se estava offline ou ainda não havia início guardado. */
      const startSessionClock =
        wasOffline || !(before as { presenceSessionStartedAt?: Date | null })?.presenceSessionStartedAt;

      await db
        .update(users)
        .set({
          isOnline: true,
          lastOnlineAt: new Date(),
          ...(wasOffline ? { pauseStartedAt: null } : {}),
          lastSeenIp: ip || null,
          lastSeenUserAgent: ua || null,
          ...(startSessionClock ? { presenceSessionStartedAt: new Date() } : {}),
        } as any)
        .where(eq(users.id, user.id));

      /**
       * Geolocalização: antes só corria se IP mudava ou reaparecia offline — mas o contexto tRPC
       * já marca `isOnline` em cada pedido, logo `wasOffline` era quase sempre false e `lastSeenGeo`
       * ficava vazio. Actualizar quando: sem geo, mudou IP, estava offline, ou IP local/privado (rótulo fixo).
       */
      const needsGeoRefresh =
        !!ip &&
        (!before?.lastSeenGeo ||
          wasOffline ||
          ipChanged ||
          isPrivateOrLocalIp(ip));

      if (needsGeoRefresh) {
        void lookupGeoLabel(ip).then((geo) => {
          if (!geo) return;
          void db.update(users).set({ lastSeenGeo: geo } as any).where(eq(users.id, user.id));
        });
      }

      return { success: true };
    }),
    goOffline: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const user = ctx.user as any;
      await db.update(users).set({
        isOnline: false,
      }).where(eq(users.id, user.id));
      return { success: true };
    }),
    startPause: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const user = ctx.user as any;
      await db.update(users).set({
        pauseStartedAt: new Date(),
      }).where(eq(users.id, user.id));
      return { success: true };
    }),
    endPause: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const user = ctx.user as any;
      // Get current pause start
      const result = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (result[0]?.pauseStartedAt) {
        const pauseMinutes = Math.floor((Date.now() - new Date(result[0].pauseStartedAt).getTime()) / 60000);
        await db.update(users).set({
          pauseStartedAt: null,
          totalPauseMinutes: sql`totalPauseMinutes + ${pauseMinutes}`,
        }).where(eq(users.id, user.id));
      }
      return { success: true };
    }),
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;
      const result = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      return result[0] || null;
    }),
  }),

  // ============ ORIGINS ============
  origins: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      let q = db.select().from(contactOrigins);
      if (!isSuperAdminUser(user) && user.tenantId != null) {
        q = (q as any).where(eq(contactOrigins.tenantId, user.tenantId));
      } else if (!isSuperAdminUser(user)) {
        q = (q as any).where(sql`1=0`);
      }
      return await (q as any).orderBy(contactOrigins.name);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (user?.crmRole === "vendedor") throw new Error("Sem permissão");
        const oid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && oid == null) throw new Error("Conta sem empresa.");
        await db.insert(contactOrigins).values({ name: input.name, createdBy: user?.id, tenantId: oid } as any);
        return { success: true };
      }),
  }),

  // ============ ENERGY CONFIG ============
  energy: router({
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;

      if (isSuperAdminUser(user)) {
        const r = await db
          .select()
          .from(energyConfig)
          .where(sql`${energyConfig.tenantCoordinatorUserId} IS NULL`)
          .limit(1);
        const row = r[0];
        return row ?? (await db.select().from(energyConfig).limit(1))[0] ?? null;
      }

      const tid = user?.tenantId;
      if (tid == null) return null;

      const own = await db
        .select()
        .from(energyConfig)
        .where(eq(energyConfig.tenantCoordinatorUserId, tid))
        .limit(1);
      if (own[0]) return own[0];

      const template = await db
        .select()
        .from(energyConfig)
        .where(sql`${energyConfig.tenantCoordinatorUserId} IS NULL`)
        .limit(1);
      return template[0] ?? null;
    }),
    updateConfig: protectedProcedure
      .input(z.object({
        priceKwhSimples: z.string(),
        priceKwhBiHorariaPonta: z.string(),
        priceKwhBiHorariaVazio: z.string(),
        baseDiscountPercent: z.string(),
        vdfClientExtraPercent: z.string(),
        vdfGasClientExtraPercent: z.string(),
        reembolsoPercent: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        /** Modelo global (tarifário por defeito) — só Super Admin altera directamente. */
        if (isSuperAdminUser(user)) {
          const globalRows = await db
            .select()
            .from(energyConfig)
            .where(sql`${energyConfig.tenantCoordinatorUserId} IS NULL`)
            .limit(1);
          if (globalRows[0]) {
            await db
              .update(energyConfig)
              .set({ ...input, updatedBy: user?.id })
              .where(eq(energyConfig.id, globalRows[0].id));
          } else {
            await db.insert(energyConfig).values({
              tenantCoordinatorUserId: null,
              priceKwhSimples: input.priceKwhSimples,
              priceKwhBiHorariaPonta: input.priceKwhBiHorariaPonta,
              priceKwhBiHorariaVazio: input.priceKwhBiHorariaVazio,
              baseDiscountPercent: input.baseDiscountPercent,
              vdfClientExtraPercent: input.vdfClientExtraPercent,
              vdfGasClientExtraPercent: input.vdfGasClientExtraPercent,
              reembolsoPercent: input.reembolsoPercent,
              updatedBy: user?.id,
            } as any);
          }
          return { success: true };
        }

        if (user?.crmRole !== "coordenador") throw new Error("Apenas o Coordenador pode alterar a configuração");

        const tid = user.tenantId;
        if (tid == null) throw new Error("Coordenador sem tenantId.");

        const own = await db
          .select()
          .from(energyConfig)
          .where(eq(energyConfig.tenantCoordinatorUserId, tid))
          .limit(1);

        if (own[0]) {
          await db
            .update(energyConfig)
            .set({ ...input, updatedBy: user?.id })
            .where(eq(energyConfig.id, own[0].id));
          return { success: true };
        }

        const template = await db
          .select()
          .from(energyConfig)
          .where(sql`${energyConfig.tenantCoordinatorUserId} IS NULL`)
          .limit(1);
        const t = template[0];
        if (!t) throw new Error("Sem modelo global de tarifário na base.");

        await db.insert(energyConfig).values({
          tenantCoordinatorUserId: tid,
          priceKwhSimples: input.priceKwhSimples,
          priceKwhBiHorariaPonta: input.priceKwhBiHorariaPonta,
          priceKwhBiHorariaVazio: input.priceKwhBiHorariaVazio,
          baseDiscountPercent: input.baseDiscountPercent,
          vdfClientExtraPercent: input.vdfClientExtraPercent,
          vdfGasClientExtraPercent: input.vdfGasClientExtraPercent,
          reembolsoPercent: input.reembolsoPercent,
          updatedBy: user?.id,
        } as any);
        return { success: true };
      }),
  }),

  // ============ TEAMS (hierarquia / e-mail por equipa — não há tenant isolado) ============
  teams: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      if (!canManageTeamsTable(user)) return [];
      let q = db.select().from(teams);
      if (!isSuperAdminUser(user) && user.tenantId != null) {
        q = (q as any).where(eq(teams.tenantId, user.tenantId));
      } else if (!isSuperAdminUser(user)) {
        q = (q as any).where(sql`1=0`);
      }
      return await (q as any).orderBy(asc(teams.name));
    }),

    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;
      const canSeeMine =
        user?.isSuperAdmin ||
        user?.crmRole === "coordenador" ||
        ["ce", "cej"].includes(user?.crmRole);
      if (!canSeeMine) return null;
      if (user?.crmRole === "coordenador" || user?.isSuperAdmin) return null;

      const scopeId = await resolveUserTeamScopeId(db, {
        id: user.id,
        teamId: user.teamId ?? null,
        crmRole: user.crmRole,
      });
      if (scopeId == null) return null;
      const tmCond: SQL[] = [eq(teams.id, scopeId)];
      if (!isSuperAdminUser(user) && user.tenantId != null) tmCond.push(eq(teams.tenantId, user.tenantId));
      const row = await db.select().from(teams).where(and(...tmCond)).limit(1);
      return row[0] ?? null;
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          leaderId: z.number().int().positive().optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!canManageTeamsTable(user)) throw new Error("Apenas Coordenadores ou Super Admin podem criar equipas");

        const teamTid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && teamTid == null) throw new Error("Coordenador sem empresa (tenantId).");

        const name = input.name.trim();
        await db.insert(teams).values({
          name,
          leaderId: input.leaderId ?? null,
          tenantId: teamTid,
        } as any);

        const created = await db.select({ id: teams.id }).from(teams).orderBy(desc(teams.id)).limit(1);
        return { id: created[0]?.id ?? 0 };
      }),

    updateContactEmail: protectedProcedure
      .input(
        z.object({
          teamId: z.number().int(),
          contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const raw = typeof input.contactEmail === "string" ? input.contactEmail.trim() : undefined;
        const emailVal =
          raw === undefined || raw === "" ? null : raw;

        const [tm] = await db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
        if (!tm) throw new Error("Equipa não encontrada");

        if (canManageTeamsTable(user)) {
          assertEntityTenant(tm as any, user, "Equipa");
          await db.update(teams).set({ contactEmail: emailVal }).where(eq(teams.id, input.teamId));
          return { success: true as const };
        }

        if (!["ce", "cej"].includes(user?.crmRole ?? "")) {
          throw new Error("Sem permissão para alterar esta equipa");
        }

        const scopeId = await resolveUserTeamScopeId(db, {
          id: user.id,
          teamId: user.teamId ?? null,
          crmRole: user.crmRole,
        });

        if (scopeId !== input.teamId) {
          throw new Error("Só pode definir o e-mail da própria equipa");
        }
        assertEntityTenant(tm as any, user, "Equipa");

        await db.update(teams).set({ contactEmail: emailVal }).where(eq(teams.id, input.teamId));
        return { success: true as const };
      }),

    updateDailyCallsGoal: protectedProcedure
      .input(
        z.object({
          teamId: z.number().int(),
          dailyCallsGoal: z.number().int().min(1).max(999),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!canSetDailyCallsGoal(user)) {
          throw new Error(
            "Apenas Chefes de Equipa, Chefes Jr., Coordenadores ou Super Admin podem definir a meta de ligações.",
          );
        }

        const [tm] = await db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
        if (!tm) throw new Error("Equipa não encontrada");

        if (canManageTeamsTable(user)) {
          assertEntityTenant(tm as any, user, "Equipa");
          await db
            .update(teams)
            .set({ dailyCallsGoal: input.dailyCallsGoal })
            .where(eq(teams.id, input.teamId));
          return { success: true as const };
        }

        if (!["ce", "cej"].includes(user?.crmRole ?? "")) {
          throw new Error("Sem permissão para alterar esta equipa.");
        }

        const scopeId = await resolveUserTeamScopeId(db, {
          id: user.id,
          teamId: user.teamId ?? null,
          crmRole: user.crmRole,
        });

        if (scopeId !== input.teamId) {
          throw new Error("Só pode definir a meta da própria equipa.");
        }
        assertEntityTenant(tm as any, user, "Equipa");

        await db
          .update(teams)
          .set({ dailyCallsGoal: input.dailyCallsGoal })
          .where(eq(teams.id, input.teamId));
        return { success: true as const };
      }),
  }),

  // ============ SOS ============
  sos: router({
    /** Pedidos SOS abertos — só supervisão / coordenação / Super Admin, isolados por tenant. */
    openList: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      if (!["cej", "ce", "coordenador"].includes(user?.crmRole) && !isSuperAdminUser(user)) {
        return [];
      }
      const db = await getDb();
      if (!db) return [];
      const tcond = whereSosRequestsForUser(user as any);
      const statusOpen = eq(sosRequests.status, "aberto");
      const whereClause = tcond ? and(statusOpen, tcond) : statusOpen;

      const rows = await db
        .select({
          id: sosRequests.id,
          vendedorId: sosRequests.vendedorId,
          vendedorName: users.name,
          contactId: sosRequests.contactId,
          message: sosRequests.message,
          createdAt: sosRequests.createdAt,
        })
        .from(sosRequests)
        .innerJoin(users, eq(sosRequests.vendedorId, users.id))
        .where(whereClause as SQL)
        .orderBy(desc(sosRequests.createdAt))
        .limit(50);

      return rows.map((r) => ({
        id: r.id,
        vendedorId: r.vendedorId,
        vendedorName: r.vendedorName,
        contactId: r.contactId,
        message: r.message,
        createdAt: r.createdAt,
      }));
    }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!user?.id) throw new Error("Sessão inválida");

        let tenantIdForRow: number | null = null;
        if (!isSuperAdminUser(user)) {
          if (user.tenantId == null || Number.isNaN(Number(user.tenantId))) {
            throw new Error("Conta sem empresa (tenant); não pode registar SOS.");
          }
          tenantIdForRow = Number(user.tenantId);
        }

        if (input.contactId != null) {
          await assertContactAccessible(db, input.contactId, user);
        }

        await db.insert(sosRequests).values({
          tenantId: tenantIdForRow,
          vendedorId: user.id,
          contactId: input.contactId || null,
          message: input.message || "Preciso de ajuda!",
          status: "aberto",
        } as any);

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
