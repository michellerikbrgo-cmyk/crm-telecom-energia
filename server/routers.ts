import { BETA_COMPLETED_RETENTION_DAYS, COOKIE_NAME } from "@shared/const";
import { betaPurgeDeadlineMs } from "@shared/betaRetention";
import { mergeSaleContractDossier, parseSaleContractDossier, SALE_CONTRACT_DOSSIER_FIELDS } from "@shared/saleContractDossier";
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
  featureSuggestionEdits,
  contactSubcontacts,
  crmNotifications,
  fidelizacoesTerminando,
  motivosNaoFechamento,
  calendarEventInvitees,
} from "../drizzle/schema";
import { alias } from "drizzle-orm/mysql-core";
import {
  eq,
  desc,
  asc,
  and,
  sql,
  like,
  or,
  inArray,
  lte,
  gte,
  lt,
  isNull,
  isNotNull,
  ne,
  exists,
  not,
  count,
  type SQL,
} from "drizzle-orm";
import { getGlobalApiUsageSnapshot } from "./_core/globalApiUsage";
import { invokeLLM } from "./_core/llm";
import { detectImageMimeFromBuffer } from "./_core/imageMagic";
import {
  contactBelongsToUserTenant,
  getScopedTenantCoordinatorUserId,
  getUserIdsInTenant,
  isSuperAdminUser,
  resolveUserTeamScopeId,
  whereContactsForUser,
  whereSosRequestsForUser,
  whereUsersForUser,
  whereInTenantUserIds,
} from "./tenantScope";
import { buildContactsListConditions, canExportContacts } from "./contactListScope";
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
import { applyAutomaticVodafoneClientIfNeeded, batchApplyVodafoneAutomationAfterBulk } from "./vodafoneClient";
import { dialerBlacklistExcludeSql, dialerStatusEligibleSql, executeSubmitAfterAnsweredCall } from "./feedbackAfterCall";
import { readReleaseLogMerged } from "./releaseLogStore";
import { createPaymentCheckoutUrl } from "./payments/createCheckout";
import { getAppPublicUrl } from "./payments/appBaseUrl";
import { dedupeSnippetsByUrl, searchWebTavily } from "./_core/webSearch";

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
  return ["vendedor", "cej", "ce", "coordenador"].includes(u?.crmRole || "");
}

/** Feedback pós-chamada atendida: quem pode usar o discador (vendedor, CEJ, CE, coordenador). */
function canSubmitCallFeedback(user: unknown): boolean {
  return canUseDialer(user);
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
): Promise<{ tenantId: number | null; teamId: number | null; companyId: number | null }> {
  if (isSuperAdminUser(user)) return { tenantId: null, teamId: null, companyId: null };
  const tid = user?.tenantId as number | null | undefined;
  if (tid == null || tid === undefined) {
    throw new Error("Conta sem empresa (coordenador); não é possível usar a lista negra.");
  }
  const companyId = user?.companyId != null ? Number(user.companyId) : null;
  if (user.crmRole === "coordenador") {
    return { tenantId: tid, teamId: null, companyId };
  }
  const teamId = await resolveUserTeamScopeId(db, {
    id: user.id,
    teamId: user.teamId ?? null,
    crmRole: user.crmRole,
  });
  if (teamId == null) {
    throw new Error("Associe o utilizador a uma equipa (teamId) para usar a lista negra.");
  }
  return { tenantId: tid, teamId, companyId };
}

const INSTALL_CAL_TITLE_PREFIX = "Instalação #";

function canReviewBetaSuggestions(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || u?.crmRole === "coordenador");
}

async function purgeStaleCompletedBetaSuggestions(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  try {
    const olderThan = sql`DATE_SUB(NOW(), INTERVAL ${sql.raw(String(BETA_COMPLETED_RETENTION_DAYS))} DAY)`;
    const staleIds = await db
      .select({ id: featureSuggestions.id })
      .from(featureSuggestions)
      .where(
        or(
          and(isNotNull(featureSuggestions.completedAt), lt(featureSuggestions.completedAt, olderThan)),
          and(
            eq(featureSuggestions.status, "completed"),
            isNull(featureSuggestions.completedAt),
            lt(featureSuggestions.updatedAt, olderThan),
          ),
        ),
      );
    const ids = staleIds.map((r) => r.id);
    if (ids.length === 0) return;
    await db.delete(featureSuggestionEdits).where(inArray(featureSuggestionEdits.suggestionId, ids));
    await db.delete(featureSuggestions).where(inArray(featureSuggestions.id, ids));
    console.warn(
      `[Beta] Auto-removidas ${ids.length} sugestão(ões) concluídas há mais de ${BETA_COMPLETED_RETENTION_DAYS} dias.`,
    );
  } catch (e) {
    console.warn("[purgeStaleCompletedBetaSuggestions]", e);
  }
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

function assertSuggestionEditableByUser(
  row: { tenantId?: number | null; authorId?: number; status?: string },
  user: { id?: number; tenantId?: number | null; crmRole?: string; isSuperAdmin?: boolean },
) {
  // Coordenador / Super Admin podem editar (com auditoria), dentro do âmbito.
  if (isSuperAdminUser(user) || user?.crmRole === "coordenador") {
    assertSuggestionReviewableByUser(row, user);
    return;
  }
  // Autor pode editar, mas só dentro do seu tenant (evita leaks).
  if (!user?.id || Number(row.authorId) !== Number(user.id)) {
    throw new Error("Só o autor pode editar esta sugestão.");
  }
  // Para vendedor/chefes, usamos tenantId como ângulo de segurança.
  if (row.tenantId == null || user.tenantId == null || Number(row.tenantId) !== Number(user.tenantId)) {
    throw new Error("Esta sugestão não pertence à sua empresa.");
  }
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

/** Contacto manual: outros vendedores não acedem nas primeiras 48h (coord/CE/CEJ/SA ignoram). */
const MANUAL_EXCLUSIVE_HOURS = 48;

function sqlVendedorBypassManualExclusive(c: typeof contacts, vendedorId: number): SQL {
  return sql`(
    ${c.addedSource} <> 'manual'
    OR ${c.addedBy} IS NULL
    OR ${c.addedBy} = ${vendedorId}
    OR ${c.createdAt} <= DATE_SUB(NOW(), INTERVAL 48 HOUR)
  )` as SQL;
}

/** Fila aleatória do discador: `novo`, não Vodafone, sem chamada **atendida** pelo utilizador nos últimos 30 dias. */
function buildDialerNovoQueueSqls(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: any,
  opts: { skipAnsweredCooldown: boolean },
): SQL[] {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const parts: SQL[] = [dialerStatusEligibleSql(db), eq(contacts.isVodafoneClient, false)];

  const dtc = whereContactsForUser(user);
  if (dtc) parts.unshift(dtc);

  if (user?.crmRole === "vendedor" && user?.id != null) {
    parts.push(sqlVendedorBypassManualExclusive(contacts, user.id));
  }

  if (
    !opts.skipAnsweredCooldown &&
    user?.id != null &&
    ["vendedor", "cej", "ce", "coordenador"].includes(String(user?.crmRole || ""))
  ) {
    parts.push(
      not(
        exists(
          db
            .select({ id: callLogs.id })
            .from(callLogs)
            .where(
              and(
                eq(callLogs.contactId, contacts.id),
                eq(callLogs.vendedorId, user.id),
                eq(callLogs.outcome, "atendeu"),
                gte(callLogs.calledAt, thirtyDaysAgo),
              ),
            ),
        ),
      ) as SQL,
    );
  }

  parts.push(
    not(
      exists(
        db
          .select({ id: fidelizacoesTerminando.id })
          .from(fidelizacoesTerminando)
          .where(
            and(
              eq(fidelizacoesTerminando.contactId, contacts.id),
              gte(fidelizacoesTerminando.dataFimFidelizacao, sql`CURDATE()`),
            ),
          ),
      ),
    ) as SQL,
  );

  parts.push(dialerBlacklistExcludeSql(db));

  return parts;
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
  const src = (c as { addedSource?: string }).addedSource;
  if (
    user?.crmRole === "vendedor" &&
    src === "manual" &&
    c.addedBy != null &&
    Number(c.addedBy) !== Number(user.id)
  ) {
    const createdAt = c.createdAt ? new Date(c.createdAt as Date).getTime() : 0;
    if (Date.now() - createdAt < MANUAL_EXCLUSIVE_HOURS * 60 * 60 * 1000) {
      throw new Error(
        "Este número está em período exclusivo de 48h do vendedor que o adicionou manualmente.",
      );
    }
  }
}

/** Venda só acessível se o contacto for da empresa e o vendedor da venda estiver no âmbito (equipa / tenant). */
async function assertSalePipelineAccessForSale(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sale: { contactId: number; vendedorId: number },
  user: any,
) {
  await assertContactAccessible(db, sale.contactId, user);
  const ids = await getSellerIdsForPipelineScope(db, user);
  if (ids === "ALL") return;
  if (!ids.includes(Number(sale.vendedorId))) {
    throw new Error("Sem permissão para aceder a esta venda (fora da sua equipa).");
  }
}

function assertEntityTenant(row: { tenantId?: number | null; companyId?: number | null }, user: any, label = "Registo") {
  if (isSuperAdminUser(user)) return;
  const ut = user?.tenantId;
  const rt = row?.tenantId;
  if (ut == null || rt == null || Number(rt) !== Number(ut)) {
    throw new Error(`${label} não pertence à esta empresa.`);
  }
  const crm = String(user?.crmRole || "");
  if (crm === "coordenador") return;
  const uc = user?.companyId != null ? Number(user.companyId) : null;
  const rc = row?.companyId != null ? Number(row.companyId) : null;
  if (uc != null && rc != null && uc !== rc) {
    throw new Error(`${label} não pertence à sua sub-empresa.`);
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

type SalesChatResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

/** Mensagem em português para o utilizador, sem expor detalhes sensíveis da API. */
function userFacingLlmFailureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (
    m.includes("429") ||
    m.includes("resource exhausted") ||
    m.includes("resourceexhausted") ||
    m.includes("rate limit") ||
    m.includes("ratelimit") ||
    m.includes("quota") ||
    m.includes("too many requests")
  ) {
    return "Limite ou quota do fornecedor de IA foi atingido. Aguarde ou configure outro fornecedor (OpenAI, Gemini, DeepSeek, Claude) na Super Admin.";
  }
  if (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("invalid api key") ||
    m.includes("incorrect api key") ||
    m.includes("permission denied") ||
    m.includes("api key not valid")
  ) {
    return "Chave de API rejeitada ou sem permissão. Verifique as chaves na Super Admin ou OPENAI_API_KEY / GEMINI_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY no servidor.";
  }
  if (
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("network") ||
    m.includes("socket hang up")
  ) {
    return "Erro de rede ao contactar o fornecedor de IA. Tente mais tarde.";
  }
  if (
    m.includes("indisponível") ||
    m.includes("configure pelo menos um fornecedor") ||
    m.includes("sem chave")
  ) {
    return "Nenhum fornecedor de IA está configurado com chave válida. Na Super Admin defina pelo menos OpenAI (sk-…), Gemini (AIza…), DeepSeek ou Claude; ou use variáveis de ambiente no servidor.";
  }
  return "IA indisponível. Verifique a Super Admin (fornecedor preferido e chaves) e os logs do servidor (PM2) para o detalhe técnico.";
}

async function completeSalesChat(
  systemPrompt: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<SalesChatResult> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversation.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await invokeLLM({ messages });
    const raw = response.choices?.[0]?.message?.content;
    const text = extractAssistantText(raw).trim();
    if (text) return { ok: true, text };
    console.warn("[completeSalesChat] resposta vazia do modelo");
    return {
      ok: false,
      message:
        "A IA não devolveu texto útil. Tente de novo; se persistir, verifique o fornecedor e as chaves na Super Admin.",
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.warn("[completeSalesChat] invokeLLM falhou:", detail);
    return { ok: false, message: userFacingLlmFailureMessage(e) };
  }
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

const feedbackAfterAnsweredInputSchema = z
  .object({
    contactId: z.number(),
    destination: z.enum([
      "none",
      "no_interest",
      "vodafone_client",
      "other",
      "no_fiber_coverage",
      "fidelizado",
      "lead",
      "pendente",
    ]),
    observacoes: z.string().optional(),
    pendenteReturnDate: z.string().optional(),
    fidelEndDate: z.string().min(1, "Data de fidelização obrigatória."),
    operadora: z.enum(["NOS", "MEO", "NOWO", "DIGI", "WOO", "AMIGO", "UZO"]).optional(),
    pendentePriorityLevel: z.coerce.number().int().min(1).max(5).optional(),
    pendenteSaleDetail: z.record(z.string(), z.string()).optional(),
    titularTroca: z.boolean().optional(),
    antigoTitularNome: z.string().optional(),
    antigoTitularNif: z.string().optional(),
    preAgendamentoAt: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.destination === "pendente" && !String(d.pendenteReturnDate ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defina a data de retorno para o pendente.",
        path: ["pendenteReturnDate"],
      });
    }
    if (d.titularTroca) {
      if (!String(d.antigoTitularNome ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nome do antigo titular obrigatório.",
          path: ["antigoTitularNome"],
        });
      }
      if (!String(d.antigoTitularNif ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NIF do antigo titular obrigatório.",
          path: ["antigoTitularNif"],
        });
      }
    }
  });

async function runFeedbackAfterAnsweredMutation(
  ctx: { user?: unknown },
  input: z.infer<typeof feedbackAfterAnsweredInputSchema>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const user = ctx.user as any;
  if (!canSubmitCallFeedback(user)) {
    throw new Error("Só quem pode usar o discador pode submeter este feedback de chamada atendida.");
  }
  await assertContactAccessible(db, input.contactId, user);
  await executeSubmitAfterAnsweredCall(db, user, {
    contactId: input.contactId,
    destination: input.destination,
    observacoes: input.observacoes,
    pendenteReturnDate: input.pendenteReturnDate,
    fidelEndDate: input.fidelEndDate,
    operadora: input.operadora ?? null,
    pendentePriorityLevel: input.pendentePriorityLevel,
    pendenteSaleDetail: input.pendenteSaleDetail,
    titularTroca: input.titularTroca,
    antigoTitularNome: input.antigoTitularNome,
    antigoTitularNif: input.antigoTitularNif,
    preAgendamentoAt: input.preAgendamentoAt,
  });
  return { success: true as const };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      const u = ctx.user as Record<string, unknown> | null;
      if (!u) return null;
      const { password: _omit, ...safe } = u as Record<string, unknown> & { password?: unknown };

      let tenantLabel: string | null = null;
      if (isSuperAdminUser(u)) {
        tenantLabel = "Todas as empresas";
      } else if (String(safe.crmRole) === "coordenador") {
        const nm = typeof safe.name === "string" ? safe.name.trim() : "";
        tenantLabel = nm || (typeof safe.email === "string" ? safe.email : null) || "Empresa";
      } else {
        const tid = safe.tenantId != null ? Number(safe.tenantId) : null;
        if (tid != null && !Number.isNaN(tid)) {
          const db = await getDb();
          if (db) {
            const [row] = await db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(and(eq(users.id, tid), eq(users.crmRole, "coordenador")))
              .limit(1);
            const label = typeof row?.name === "string" ? row.name.trim() : "";
            tenantLabel = label || row?.email || `Empresa #${tid}`;
          }
        }
      }

      return { ...safe, tenantLabel };
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
        const user = ctx.user as any;
        const conditions = buildContactsListConditions(user, input);
        let query = db.select().from(contacts);
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
        return await (query as any).orderBy(desc(contacts.createdAt)).limit(100);
      }),

    countByStatus: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { total: 0, byStatus: {} as Record<string, number> };
        const user = ctx.user as any;
        const conditions = buildContactsListConditions(user, { search: input?.search });
        const base =
          conditions.length > 0
            ? db.select({ status: contacts.status, c: count() }).from(contacts).where(and(...conditions))
            : db.select({ status: contacts.status, c: count() }).from(contacts);
        const rows = await (base as any).groupBy(contacts.status);
        const byStatus: Record<string, number> = {};
        let total = 0;
        for (const r of rows as { status: string; c: number }[]) {
          const n = Number(r.c) || 0;
          byStatus[r.status] = n;
          total += n;
        }
        return { total, byStatus };
      }),

    exportCsv: protectedProcedure
      .input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!canExportContacts(ctx.user)) {
          throw new Error("Sem permissão para exportar contactos.");
        }
        const db = await getDb();
        if (!db) return { csv: "", count: 0 };
        const user = ctx.user as any;
        const conditions = buildContactsListConditions(user, input);
        let query = db
          .select({
            id: contacts.id,
            phone: contacts.phone,
            name: contacts.name,
            email: contacts.email,
            status: contacts.status,
            origin: contacts.origin,
            listName: contacts.listName,
            importBatchLabel: contacts.importBatchLabel,
            createdAt: contacts.createdAt,
          })
          .from(contacts);
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
        const rows = await (query as any).orderBy(desc(contacts.createdAt)).limit(10_000);
        const esc = (v: unknown) => {
          const s = v == null ? "" : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header = [
          "id",
          "telefone",
          "nome",
          "email",
          "estado",
          "origem",
          "lista",
          "lote_importacao",
          "criado_em",
        ];
        const lines = [
          header.join(","),
          ...rows.map((r: Record<string, unknown>) =>
            [
              r.id,
              r.phone,
              r.name,
              r.email,
              r.status,
              r.origin,
              r.listName,
              r.importBatchLabel,
              r.createdAt,
            ]
              .map(esc)
              .join(","),
          ),
        ];
        return { csv: "\uFEFF" + lines.join("\n"), count: rows.length };
      }),

    searchPicker: protectedProcedure
      .input(z.object({ q: z.string().min(1).max(120) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const conditions = buildContactsListConditions(user, { search: input.q });
        let query = db
          .select({
            id: contacts.id,
            phone: contacts.phone,
            name: contacts.name,
            status: contacts.status,
          })
          .from(contacts);
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
        return await (query as any).orderBy(desc(contacts.createdAt)).limit(20);
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

        const contactCompanyId =
          isSuperAdminUser(user) ? null : (user?.companyId != null ? Number(user.companyId) : null);

        await db.insert(contacts).values({
          phone: input.phone,
          name: input.name || null,
          email: input.email || null,
          origin: user?.crmRole === "ce" ? "Telemarketing" : input.origin,
          notes: input.notes || null,
          addedBy: user?.id,
          addedSource: "manual",
          assignedTo: manualAssign,
          lastAssignedAt: manualAssign ? new Date() : null,
          status: "novo",
          tenantId: contactTenantId,
          companyId: contactCompanyId,
        } as any);

        const [created] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.phone, input.phone), eq(contacts.addedBy, user.id)))
          .orderBy(desc(contacts.id))
          .limit(1);
        if (created?.id != null) {
          await applyAutomaticVodafoneClientIfNeeded(db, created.id);
        }

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
        importBatchLabel: z.string().max(255).optional(),
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
        let assigneeCompanyId: number | null = null;
        if (!isSuperAdminUser(user) && input.assignTo) {
          const a = await db
            .select({ tenantId: users.tenantId, companyId: users.companyId })
            .from(users)
            .where(eq(users.id, input.assignTo))
            .limit(1);
          assigneeTenantOk = !!a[0] && Number(a[0].tenantId) === Number(user.tenantId);
          assigneeCompanyId = a[0]?.companyId != null ? Number(a[0].companyId) : null;
        }
        if (!assigneeTenantOk) throw new Error("O vendedor de destino não pertence à mesma empresa.");

        if (input.assignTo && ["ce", "cej"].includes(user?.crmRole ?? "")) {
          const allowed = await getSellerIdsForPipelineScope(db, user);
          if (allowed !== "ALL" && !allowed.includes(input.assignTo)) {
            throw new Error("Só pode atribuir listas a membros da sua equipa.");
          }
        }

        const bulkCompanyId =
          isSuperAdminUser(user)
            ? null
            : input.assignTo && assigneeCompanyId != null
              ? assigneeCompanyId
              : user?.companyId != null
                ? Number(user.companyId)
                : null;

        const bulkStartedAt = new Date();

        const batchLabel =
          input.importBatchLabel?.trim() ||
          input.listName?.trim() ||
          null;

        const values = input.phones.map((phone, i) => ({
          phone,
          name: input.names?.[i] || null,
          origin: "Telemarketing",
          status: "novo" as const,
          addedBy: user?.id,
          addedSource: "bulk" as const,
          listName: input.listName || null,
          importBatchLabel: batchLabel,
          assignedTo: input.assignTo || null,
          lastAssignedAt: input.assignTo ? new Date() : null,
          tenantId: contactTenantId,
          companyId: bulkCompanyId,
        }));

        // Insert in batches of 500 to avoid query limits
        for (let i = 0; i < values.length; i += 500) {
          const batch = values.slice(i, i + 500);
          await db.insert(contacts).values(batch);
        }

        await batchApplyVodafoneAutomationAfterBulk(db, {
          tenantId: contactTenantId,
          createdAfter: bulkStartedAt,
          addedByUserId: user.id,
        });

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
        status: z
          .enum([
            "novo",
            "em_contacto",
            "pendente",
            "venda",
            "nao_atende",
            "sem_interesse",
            "blacklist",
            "outros",
            "sem_cobertura_fibra",
            "fidelizado",
          ])
          .optional(),
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
        await applyAutomaticVodafoneClientIfNeeded(db, id);
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "update",
          entity: "contact",
          entityId: id,
          details: "Atualizou contacto",
        });
        return { success: true };
      }),

    /** Linhas em `contact_subcontacts` (ex.: número classificado como cliente Vodafone). */
    subcontactsByContact: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        await assertContactAccessible(db, input.contactId, user);
        return db
          .select()
          .from(contactSubcontacts)
          .where(eq(contactSubcontacts.contactId, input.contactId))
          .orderBy(desc(contactSubcontacts.createdAt));
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
        motivoNaoFechamentoId: pendentes.motivoNaoFechamentoId,
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

    createWithContact: protectedProcedure
      .input(
        z.object({
          phone: z.string().min(1),
          name: z.string().optional(),
          returnDate: z.string(),
          notes: z.string().optional(),
          offerDesired: z.string().optional(),
          priorityLevel: z.number().int().min(1).max(5).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const phone = input.phone.replace(/\s+/g, "").trim();
        if (!phone) throw new Error("Telefone obrigatório");

        const contactTenantId = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && contactTenantId == null) {
          throw new Error("Conta sem empresa (tenant).");
        }

        const manualAssign =
          user?.crmRole === "vendedor" || user?.crmRole === "cej" ? user.id : null;
        const contactCompanyId = isSuperAdminUser(user)
          ? null
          : user?.companyId != null
            ? Number(user.companyId)
            : null;

        const phoneParts: SQL[] = [eq(contacts.phone, phone)];
        const tPhone = whereContactsForUser(user);
        if (tPhone) phoneParts.push(tPhone);
        const [existing] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(...phoneParts))
          .limit(1);

        let contactId = existing?.id;
        if (!contactId) {
          await db.insert(contacts).values({
            phone,
            name: input.name?.trim() || null,
            origin: "Telemarketing",
            status: "novo",
            addedBy: user?.id,
            addedSource: "manual",
            assignedTo: manualAssign,
            lastAssignedAt: manualAssign ? new Date() : null,
            tenantId: contactTenantId,
            companyId: contactCompanyId,
          } as any);
          const [created] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.phone, phone))
            .orderBy(desc(contacts.id))
            .limit(1);
          contactId = created?.id;
        }
        if (!contactId) throw new Error("Falha ao criar contacto");

        await assertContactAccessible(db, contactId, user);

        await db.insert(pendentes).values({
          contactId,
          vendedorId: user?.id,
          returnDate: new Date(input.returnDate),
          notes: input.notes || null,
          offerDesired: input.offerDesired || null,
          status: "agendado",
          priorityLevel: input.priorityLevel ?? 3,
        });

        await db.update(contacts).set({ status: "pendente" }).where(eq(contacts.id, contactId));

        return { success: true, contactId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        returnDate: z.string().optional(),
        notes: z.string().optional().nullable(),
        offerDesired: z.string().optional().nullable(),
        status: z
          .enum(["agendado", "realizado", "expirado", "cancelado", "nao_fechou"])
          .optional(),
        motivoNaoFechamentoId: z.number().int().positive().nullable().optional(),
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

        if (input.status === "nao_fechou" && !input.motivoNaoFechamentoId) {
          throw new Error("Seleccione o motivo de não fechamento.");
        }

        const payload: Record<string, unknown> = {};
        if (input.returnDate !== undefined) payload.returnDate = new Date(input.returnDate);
        if (input.notes !== undefined) payload.notes = input.notes;
        if (input.offerDesired !== undefined) payload.offerDesired = input.offerDesired;
        if (input.status !== undefined) {
          payload.status = input.status;
          if (input.status !== "nao_fechou") {
            payload.motivoNaoFechamentoId = null;
          }
        }
        if (input.motivoNaoFechamentoId !== undefined) {
          payload.motivoNaoFechamentoId = input.motivoNaoFechamentoId;
        }
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

  motivosNaoFechamento: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canSubmitCallFeedback(ctx.user)) return [];
      return db.select().from(motivosNaoFechamento).orderBy(asc(motivosNaoFechamento.id));
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

        if (!["coordenador", "ce", "cej", "vendedor"].includes(user?.crmRole ?? "") && !isSuperAdminUser(user)) {
          throw new Error("Sem permissão para criar eventos de calendário.");
        }

        if (input.contactId != null) {
          await assertContactAccessible(db, input.contactId, user);
        }
        const startAt = new Date(input.startAt);
        const endAt = input.endAt ? new Date(input.endAt) : null;

        const evtTid = isSuperAdminUser(user) ? null : user.tenantId;
        if (!isSuperAdminUser(user) && evtTid == null) throw new Error("Conta sem empresa.");

        const companyId =
          !isSuperAdminUser(user) && user?.companyId != null ? Number(user.companyId) : null;

        const insertRes = await db.insert(calendarEvents).values({
          title: input.title,
          description: input.description || null,
          type: input.type,
          startAt,
          endAt,
          allDay: input.allDay,
          contactId: input.contactId ?? null,
          assignedTo: input.assignedTo ?? user?.id ?? null,
          createdBy: user?.id,
          tenantId: evtTid,
          companyId,
        } as any);

        const eventId = Number((insertRes as { insertId?: number })?.insertId ?? 0);

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "calendar_create",
          entity: "calendarEvent",
          details: `Criou evento: ${input.title}`,
        });

        return { success: true, eventId: eventId || undefined };
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

    todayAgenda: protectedProcedure
      .input(z.object({ date: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { events: [], installations: [], preAgendamentos: [] };
        const user = ctx.user as any;
        const day = input.date ? new Date(input.date) : new Date();
        const from = new Date(day);
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);

        const baseRange = and(
          sql`${calendarEvents.startAt} >= ${from}`,
          sql`${calendarEvents.startAt} < ${to}`,
        ) as SQL;

        let events: (typeof calendarEvents.$inferSelect)[] = [];
        if (user?.crmRole === "vendedor") {
          events = await db
            .select()
            .from(calendarEvents)
            .where(
              and(
                baseRange,
                or(eq(calendarEvents.assignedTo, user.id), eq(calendarEvents.createdBy, user.id)),
              ),
            )
            .orderBy(asc(calendarEvents.startAt));
        } else if (["ce", "cej"].includes(user?.crmRole)) {
          const teamIdsRaw = await getSellerIdsForPipelineScope(db, user);
          if (teamIdsRaw !== "ALL" && teamIdsRaw.length) {
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
              visibility.push(
                and(isNull(calendarEvents.assignedTo), inArray(calendarEvents.createdBy, coordIds)) as SQL,
              );
            }
            events = await db
              .select()
              .from(calendarEvents)
              .where(and(baseRange, or(...visibility)))
              .orderBy(asc(calendarEvents.startAt));
          }
        } else {
          const calParts: SQL[] = [baseRange];
          if (!isSuperAdminUser(user) && user.tenantId != null) {
            calParts.push(eq(calendarEvents.tenantId, user.tenantId));
          }
          events = await db
            .select()
            .from(calendarEvents)
            .where(and(...calParts))
            .orderBy(asc(calendarEvents.startAt));
        }

        const sellerIds = await getSellerIdsForPipelineScope(db, user);
        const saleParts: SQL[] = [
          sql`COALESCE(${sales.dataAtivacao}, ${sales.installationDate}) >= ${from}`,
          sql`COALESCE(${sales.dataAtivacao}, ${sales.installationDate}) < ${to}`,
        ];
        const vcond = whereInTenantUserIds(sellerIds, sales.vendedorId);
        if (vcond) saleParts.push(vcond);
        const cten = whereContactsForUser(user);
        if (cten) saleParts.push(cten);

        const saleRows = await db
          .select({
            sale: sales,
            contactName: contacts.name,
            contactPhone: contacts.phone,
          })
          .from(sales)
          .innerJoin(contacts, eq(sales.contactId, contacts.id))
          .where(and(...saleParts))
          .orderBy(asc(sales.installationDate))
          .limit(100);

        const installations = saleRows
          .filter((r) => r.sale.installationDate)
          .map((r) => ({ ...r.sale, contactName: r.contactName, contactPhone: r.contactPhone }));
        const preAgendamentos = saleRows
          .filter((r) => r.sale.preAgendamentoAt)
          .map((r) => ({ ...r.sale, contactName: r.contactName, contactPhone: r.contactPhone }));

        return { events, installations, preAgendamentos };
      }),

    listInvitees: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const invUser = alias(users, "inv_user");
        return db
          .select({
            id: calendarEventInvitees.id,
            eventId: calendarEventInvitees.eventId,
            userId: calendarEventInvitees.userId,
            status: calendarEventInvitees.status,
            userName: invUser.name,
          })
          .from(calendarEventInvitees)
          .innerJoin(invUser, eq(calendarEventInvitees.userId, invUser.id))
          .where(eq(calendarEventInvitees.eventId, input.eventId));
      }),

    setInvitees: protectedProcedure
      .input(z.object({ eventId: z.number(), userIds: z.array(z.number().int().positive()) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [evt] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, input.eventId)).limit(1);
        if (!evt) throw new Error("Evento não encontrado");
        if (user?.crmRole === "vendedor" && evt.createdBy !== user.id) {
          throw new Error("Sem permissão para convidar neste evento");
        }
        assertEntityTenant(evt as any, user, "Evento");

        await db.delete(calendarEventInvitees).where(eq(calendarEventInvitees.eventId, input.eventId));
        const unique = Array.from(new Set(input.userIds)).filter((id) => id !== user.id);
        if (unique.length) {
          await db.insert(calendarEventInvitees).values(
            unique.map((userId) => ({
              eventId: input.eventId,
              userId,
              status: "pending",
            })),
          );
        }
        return { success: true };
      }),

    respondInvite: protectedProcedure
      .input(
        z.object({
          inviteId: z.number(),
          status: z.enum(["accepted", "declined"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [row] = await db
          .select()
          .from(calendarEventInvitees)
          .where(
            and(eq(calendarEventInvitees.id, input.inviteId), eq(calendarEventInvitees.userId, user.id)),
          )
          .limit(1);
        if (!row) throw new Error("Convite não encontrado");
        await db
          .update(calendarEventInvitees)
          .set({ status: input.status } as any)
          .where(eq(calendarEventInvitees.id, input.inviteId));
        return { success: true };
      }),

    myPendingInvites: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      const invEvt = alias(calendarEvents, "inv_evt");
      return db
        .select({
          inviteId: calendarEventInvitees.id,
          status: calendarEventInvitees.status,
          eventId: invEvt.id,
          title: invEvt.title,
          startAt: invEvt.startAt,
          type: invEvt.type,
        })
        .from(calendarEventInvitees)
        .innerJoin(invEvt, eq(calendarEventInvitees.eventId, invEvt.id))
        .where(
          and(eq(calendarEventInvitees.userId, user.id), eq(calendarEventInvitees.status, "pending")),
        )
        .orderBy(asc(invEvt.startAt))
        .limit(50);
    }),

    searchUsersByName: protectedProcedure
      .input(z.object({ q: z.string().min(1).max(80) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const cleaned = input.q.trim().replace(/[%_\\\\]/g, "");
        if (!cleaned) return [];
        const parts: SQL[] = [
          and(sql`${users.name} IS NOT NULL`, like(users.name, `%${cleaned}%`)) as SQL,
        ];
        const uwhere = whereUsersForUser(user);
        if (uwhere) parts.push(uwhere);
        if (!isSuperAdminUser(user) && user.tenantId != null) {
          parts.push(eq(users.tenantId, user.tenantId));
        }
        return db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(and(...parts))
          .orderBy(users.name)
          .limit(25);
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
        const safeName =
          input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 180) || "document.pdf";
        const relKey = `${keyPrefix}/${safeName}`;
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

        const r = await completeSalesChat(systemPrompt, [
          {
            role: "user",
            content: `O cliente disse: "${input.objection}"\n\nComo devo responder para ultrapassar esta objeção?`,
          },
        ]);
        return { response: r.ok ? r.text : r.message };
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

        if (input.stage === "start") {
          const conversation: Array<{ role: "user" | "assistant"; content: string }> = [
            {
              role: "user",
              content:
                "Inicia a simulação. Responde APENAS com a primeira fala do cliente ao telefone (objeção, dúvida ou recusa suave). Sem prefixos tipo «Cliente:» nem aspas.",
            },
          ];
          const r = await completeSalesChat(systemPrompt, conversation);
          return { customerMessage: r.ok ? r.text : r.message };
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

        const r = await completeSalesChat(systemPrompt, conversation);
        return { customerMessage: r.ok ? r.text : r.message };
      }),

    /**
     * Pesquisa web (Tavily) + síntese LLM: ofertas Vodafone e/ou concorrentes em Portugal.
     * Requer `TAVILY_API_KEY` no ambiente do servidor.
     */
    marketResearch: protectedProcedure
      .input(
        z.object({
          scope: z.enum(["vodafone", "competitors", "geral"]).default("geral"),
          extra: z.string().max(300).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const extra = String(input.extra ?? "").trim();
        const suffix = extra ? ` ${extra}` : "";

        const queries: string[] = [];
        if (input.scope === "vodafone" || input.scope === "geral") {
          queries.push(`site:vodafone.pt pacotes fibra móvel TV preços Portugal${suffix}`);
        }
        if (input.scope === "competitors" || input.scope === "geral") {
          queries.push(
            `MEO NOS NOWO Digi pacotes fibra TV preços Portugal residencial empresa 2026${suffix}`,
          );
        }

        const merged: Awaited<ReturnType<typeof searchWebTavily>> = [];
        for (const q of queries) {
          merged.push(...(await searchWebTavily(q)));
        }
        const snippets = dedupeSnippetsByUrl(merged).slice(0, 12);

        if (!snippets.length) {
          const noKey = !process.env.TAVILY_API_KEY?.trim();
          return {
            response: noKey
              ? "Para pesquisar na internet (ofertas Vodafone e concorrentes), configure **TAVILY_API_KEY** no servidor (https://tavily.com). Sem esta chave, use apenas o assistente de objeções com conhecimento geral."
              : "Não foram obtidos resultados de pesquisa. Tente outras palavras-chave ou mais tarde.",
            sources: [] as { title: string; url: string }[],
          };
        }

        const excerptBlock = snippets
          .map((s, i) => `### Fonte ${i + 1}: ${s.title}\nURL: ${s.url}\n${s.content}`)
          .join("\n\n");

        const systemPrompt = `É um analista comercial em Portugal (telecomunicações). Use APENAS os excertos abaixo (podem estar desactualizados). Não invente preços que não constem dos excertos; quando citar valores, indique a fonte (Fonte 1, 2…).
Responda em **português de Portugal** para um vendedor: síntese útil, comparação quando os dados permitirem, e avise sempre de confirmar no site oficial ou no sistema interno antes de fechar.`;

        const userContent = `Excertos de pesquisa web:\n\n${excerptBlock}\n\n---\nTarefa: orientações práticas e argumentos de venda; destaque Vodafone vs concorrentes quando fizer sentido com estes dados.`;

        const r = await completeSalesChat(systemPrompt, [{ role: "user", content: userContent }]);

        return {
          response: r.ok
            ? r.text
            : `${r.message} (Há excertos de pesquisa web; falhou só a síntese por LLM.)`,
          sources: snippets.map((s) => ({ title: s.title, url: s.url })),
        };
      }),
  }),

  // ============ SUPER ADMIN SETTINGS ============
  admin: router({
    /** Log de actualização (bootstrap + entrada automática por deploy). */
    getReleaseLog: superAdminProcedure.query(async () => {
      const entries = await readReleaseLogMerged();
      return { entries };
    }),

    /** Contagem global de pedidos Gemini e pesquisas Tavily no período actual (env: GEMINI_QUOTA_PERIOD, etc.). */
    getGlobalApiUsage: superAdminProcedure.query(async () => getGlobalApiUsageSnapshot()),

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
          pricingPlansEnabled: false,
          stripeEnabled: false,
          stripePublishableKey: "",
          stripeSecretKey: "",
          stripeWebhookSecret: "",
          sumupEnabled: false,
          sumupApiKey: "",
          paypalEnabled: false,
          paypalClientId: "",
          paypalClientSecret: "",
          paypalMode: "sandbox" as const,
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
        pricingPlansEnabled: s.pricingPlansEnabled ?? false,
        stripeEnabled: s.stripeEnabled ?? false,
        stripePublishableKey: s.stripePublishableKey || "",
        stripeSecretKey: maskSecret(decryptText(s.stripeSecretKeyEnc)),
        stripeWebhookSecret: maskSecret(decryptText(s.stripeWebhookSecretEnc)),
        sumupEnabled: s.sumupEnabled ?? false,
        sumupApiKey: maskSecret(decryptText(s.sumupApiKeyEnc)),
        paypalEnabled: s.paypalEnabled ?? false,
        paypalClientId: s.paypalClientId || "",
        paypalClientSecret: maskSecret(decryptText(s.paypalClientSecretEnc)),
        paypalMode: s.paypalMode === "live" ? ("live" as const) : ("sandbox" as const),
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
        pricingPlansEnabled: z.boolean().optional(),
        stripeEnabled: z.boolean().optional(),
        stripePublishableKey: z.string().optional(),
        stripeSecretKey: z.string().optional(),
        stripeWebhookSecret: z.string().optional(),
        sumupEnabled: z.boolean().optional(),
        sumupApiKey: z.string().optional(),
        paypalEnabled: z.boolean().optional(),
        paypalClientId: z.string().optional(),
        paypalClientSecret: z.string().optional(),
        paypalMode: z.enum(["sandbox", "live"]).optional(),
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

        if (input.stripeEnabled !== undefined) update.stripeEnabled = input.stripeEnabled;
        if (input.stripePublishableKey !== undefined) update.stripePublishableKey = input.stripePublishableKey || null;
        setSecret("stripeSecretKeyEnc", input.stripeSecretKey);
        setSecret("stripeWebhookSecretEnc", input.stripeWebhookSecret);
        if (input.sumupEnabled !== undefined) update.sumupEnabled = input.sumupEnabled;
        setSecret("sumupApiKeyEnc", input.sumupApiKey);
        if (input.paypalEnabled !== undefined) update.paypalEnabled = input.paypalEnabled;
        if (input.paypalClientId !== undefined) update.paypalClientId = input.paypalClientId || null;
        setSecret("paypalClientSecretEnc", input.paypalClientSecret);
        if (input.paypalMode !== undefined) update.paypalMode = input.paypalMode;

        if (input.userBroadcastAlert !== undefined) {
          const trimmed =
            input.userBroadcastAlert === null ? "" : String(input.userBroadcastAlert).trim();
          update.userBroadcastAlert = trimmed || null;
          const prevRev = Number(existing[0]?.userBroadcastAlertRevision ?? 0);
          update.userBroadcastAlertRevision = prevRev + 1;
        }

        if (input.pricingPlansEnabled !== undefined) update.pricingPlansEnabled = input.pricingPlansEnabled;

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
            pricingPlansEnabled: update.pricingPlansEnabled ?? false,
            stripeEnabled: update.stripeEnabled ?? false,
            stripePublishableKey: update.stripePublishableKey ?? null,
            stripeSecretKeyEnc: update.stripeSecretKeyEnc ?? null,
            stripeWebhookSecretEnc: update.stripeWebhookSecretEnc ?? null,
            sumupEnabled: update.sumupEnabled ?? false,
            sumupApiKeyEnc: update.sumupApiKeyEnc ?? null,
            paypalEnabled: update.paypalEnabled ?? false,
            paypalClientId: update.paypalClientId ?? null,
            paypalClientSecretEnc: update.paypalClientSecretEnc ?? null,
            paypalMode: update.paypalMode ?? "sandbox",
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

    /** Abre pagamento de teste no gateway (Stripe Checkout, SumUp ou PayPal). */
    createPaymentCheckout: superAdminProcedure
      .input(
        z.object({
          provider: z.enum(["stripe", "sumup", "paypal"]),
          amountEUR: z.number().min(0.5).max(50000).optional().default(1),
          description: z.string().max(200).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Base de dados indisponível");

        const rows = await db.select().from(appSettings).limit(1);
        const s = rows[0];
        if (!s) throw new Error("Guarde primeiro as definições da aplicação (criar appSettings).");

        if (input.provider === "stripe" && !s.stripeEnabled) {
          throw new Error("Active o Stripe no separador Pagamentos e guarde.");
        }
        if (input.provider === "sumup" && !s.sumupEnabled) {
          throw new Error("Active o SumUp no separador Pagamentos e guarde.");
        }
        if (input.provider === "paypal" && !s.paypalEnabled) {
          throw new Error("Active o PayPal no separador Pagamentos e guarde.");
        }

        const checkoutUrl = await createPaymentCheckoutUrl(input.provider, {
          amountEUR: input.amountEUR,
          description: input.description?.trim() ?? "",
          appBaseUrl: getAppPublicUrl(),
          secrets: {
            stripeSecretKey: decryptText(s.stripeSecretKeyEnc),
            sumupApiKey: decryptText(s.sumupApiKeyEnc),
            paypalClientId: s.paypalClientId || null,
            paypalClientSecret: decryptText(s.paypalClientSecretEnc),
            paypalSandbox: (s.paypalMode || "sandbox") !== "live",
          },
        });

        return { checkoutUrl };
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
          if (t === "users" && input.scope === "all_except_audit" && user?.id != null) {
            // Manter a linha do Super Admin que corre o purge — senão o re-insert não traz `password`
            // e o login local falha sempre com «E-mail ou senha incorretos».
            await db.delete(users).where(ne(users.id, user.id));
          } else {
            await db.execute(sql.raw(`DELETE FROM \`${t}\``));
          }
        }
        await db.execute(sql`SET FOREIGN_KEY_CHECKS=1`);

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
      await purgeStaleCompletedBetaSuggestions(db);
      const user = ctx.user as any;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sellerIds = await getSellerIdsForPipelineScope(db, user);
      const tenantCallLogs = whereInTenantUserIds(sellerIds, callLogs.vendedorId);
      const tenantPendentesV = whereInTenantUserIds(sellerIds, pendentes.vendedorId);
      const tenantSalesV = whereInTenantUserIds(sellerIds, sales.vendedorId);
      const contactTenant = whereContactsForUser(user);

      const queueParts = buildDialerNovoQueueSqls(db, user, {
        skipAnsweredCooldown: !["vendedor", "cej", "ce", "coordenador"].includes(String(user?.crmRole || "")),
      });
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

      let overdueResult;
      if (user?.crmRole === "vendedor" && user?.id != null) {
        const oc = [...overdueConditions, sqlVendedorBypassManualExclusive(contacts, user.id)];
        overdueResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .innerJoin(contacts, eq(pendentes.contactId, contacts.id))
          .where(and(...oc));
      } else {
        overdueResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .where(and(...overdueConditions));
      }

      const alertParts = [...overdueConditions];
      if (contactTenant) alertParts.push(contactTenant);
      if (user?.crmRole === "vendedor" && user?.id != null) {
        alertParts.push(
          or(isNull(contacts.id), sqlVendedorBypassManualExclusive(contacts, user.id)) as SQL,
        );
      }
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
        sql`(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) IS NOT NULL`,
        sql`MONTH(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${mo}`,
        sql`YEAR(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${yr}`,
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
        sql`(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) IS NOT NULL`,
        sql`MONTH(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${mo}`,
        sql`YEAR(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${yr}`,
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

      const cand = buildDialerNovoQueueSqls(db, user, { skipAnsweredCooldown: false });

      const result = await db
        .select()
        .from(contacts)
        .where(and(...cand))
        .orderBy(sql`RAND()`)
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
      const parts: SQL[] = [
        eq(contacts.status, "nao_atende"),
        sql`${contacts.attempts} >= 3`,
        eq(contacts.isVodafoneClient, false),
      ];
      if (tcond) parts.unshift(tcond);
      if (user?.crmRole === "vendedor" && user?.id != null) {
        parts.push(sqlVendedorBypassManualExclusive(contacts, user.id));
      }
      return await db
        .select()
        .from(contacts)
        .where(and(...parts))
        .orderBy(desc(contacts.lastAttemptAt))
        .limit(20);
    }),
  }),

  // ============ FEEDBACK PÓS-CHAMADA ============
  feedback: router({
    /** Nome preferido no spec; mesmo contrato que `submitAfterAnswered`. */
    submitFeedback: protectedProcedure
      .input(feedbackAfterAnsweredInputSchema)
      .mutation(async ({ ctx, input }) => runFeedbackAfterAnsweredMutation(ctx, input)),
    submitAfterAnswered: protectedProcedure
      .input(feedbackAfterAnsweredInputSchema)
      .mutation(async ({ ctx, input }) => runFeedbackAfterAnsweredMutation(ctx, input)),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;
      if (!user?.id) return [];
      return await db
        .select()
        .from(crmNotifications)
        .where(eq(crmNotifications.userId, user.id))
        .orderBy(desc(crmNotifications.createdAt))
        .limit(50);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return 0;
      const user = ctx.user as any;
      if (!user?.id) return 0;
      const [row] = await db
        .select({ n: count() })
        .from(crmNotifications)
        .where(and(eq(crmNotifications.userId, user.id), isNull(crmNotifications.readAt)));
      return Number(row?.n ?? 0);
    }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!user?.id) throw new Error("Sessão inválida");
        await db
          .update(crmNotifications)
          .set({ readAt: new Date() } as any)
          .where(and(eq(crmNotifications.id, input.id), eq(crmNotifications.userId, user.id)));
        return { ok: true as const };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const user = ctx.user as any;
      if (!user?.id) throw new Error("Sessão inválida");
      await db
        .update(crmNotifications)
        .set({ readAt: new Date() } as any)
        .where(and(eq(crmNotifications.userId, user.id), isNull(crmNotifications.readAt)));
      return { ok: true as const };
    }),
  }),

  search: router({
    global: protectedProcedure
      .input(z.object({ q: z.string().min(1).max(80) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { contacts: [] as { id: number; name: string | null; phone: string | null; status: string | null }[] };
        const user = ctx.user as any;
        const cleaned = input.q.trim().replace(/[%_\\\\]/g, "");
        if (cleaned.length === 0) return { contacts: [] };

        const conditions: SQL[] = [
          or(
            and(sql`${contacts.name} IS NOT NULL`, like(contacts.name, `%${cleaned}%`)),
            like(contacts.phone, `%${cleaned}%`),
          ) as SQL,
        ];

        const tcond = whereContactsForUser(user);
        if (tcond) conditions.push(tcond);

        if (user?.crmRole === "vendedor") {
          conditions.push(eq(contacts.assignedTo, user.id));
          conditions.push(sqlVendedorBypassManualExclusive(contacts, user.id));
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

        const rows = await db
          .select({
            id: contacts.id,
            name: contacts.name,
            phone: contacts.phone,
            status: contacts.status,
          })
          .from(contacts)
          .where(and(...conditions))
          .orderBy(desc(contacts.createdAt))
          .limit(20);

        return { contacts: rows };
      }),
  }),

  // ============ DIALER ============
  dialer: router({
    next: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;
      if (!canUseDialer(user)) {
        throw new Error("Discador disponível para vendedores, chefes de equipa e coordenadores.");
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
        if (user?.id != null) dueWhere.push(sqlVendedorBypassManualExclusive(contacts, user.id));
        dueWhere.push(eq(contacts.isVodafoneClient, false));
        dueWhere.push(dialerBlacklistExcludeSql(db));

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

      // 2) Fila aleatória: novo, não Vodafone, sem chamada atendida pelo utilizador nos últimos 30 dias
      const dq = buildDialerNovoQueueSqls(db, user, { skipAnsweredCooldown: false });
      const result = await db
        .select()
        .from(contacts)
        .where(and(...dq))
        .orderBy(sql`RAND()`)
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
      .input(
        z.object({
          contactId: z.number(),
          outcome: z.literal("nao_atende"),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (!canUseDialer(user)) {
          throw new Error("Discador disponível para vendedores, chefes de equipa e coordenadores.");
        }

        await assertContactAccessible(db, input.contactId, user);

        await db.insert(callLogs).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          outcome: "nao_atende",
          notes: input.notes || null,
        });

        await db.update(contacts).set({
          status: "nao_atende",
          attempts: sql`attempts + 1`,
          lastAttemptAt: new Date(),
        }).where(eq(contacts.id, input.contactId));

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

          if (user?.crmRole === "ce" && user?.companyId != null) {
            parts.push(eq(blacklist.companyId, Number(user.companyId)));
          } else if (user?.crmRole === "ce") {
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

        const { tenantId: tidIns, teamId: teamIns, companyId: companyIns } = await blacklistTeamScopeForInsert(db, user);

        await db.insert(blacklist).values({
          phone: input.phone.trim(),
          tenantId: tidIns,
          teamId: teamIns,
          companyId: companyIns,
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
      const mineRows = await db
        .select({
          id: featureSuggestions.id,
          title: featureSuggestions.title,
          body: featureSuggestions.body,
          status: featureSuggestions.status,
          completedAt: featureSuggestions.completedAt,
          createdAt: featureSuggestions.createdAt,
          reviewedAt: featureSuggestions.reviewedAt,
          reviewNote: featureSuggestions.reviewNote,
          updatedAt: featureSuggestions.updatedAt,
        })
        .from(featureSuggestions)
        .where(eq(featureSuggestions.authorId, user.id))
        .orderBy(desc(featureSuggestions.createdAt))
        .limit(100);

      return mineRows.map((r) => {
        const purgeMs = betaPurgeDeadlineMs({
          status: r.status,
          completedAt: r.completedAt,
          updatedAt: r.updatedAt,
        });
        return {
          ...r,
          purgeAt: purgeMs != null ? new Date(purgeMs).toISOString() : null,
        };
      });
    }),

    listPending: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      /** Todas as empresas — evitar ideias duplicadas e dar contexto global. */
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
        .where(eq(featureSuggestions.status, "pending"))
        .orderBy(desc(featureSuggestions.createdAt))
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
        ...r,
        tenantLabel:
          r.tenantId != null ? tenantLabels[r.tenantId] ?? `Empresa #${r.tenantId}` : "Global / Super Admin",
      }));
    }),

    listAccepted: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      await purgeStaleCompletedBetaSuggestions(db);
      /* Roadmap global (todas as empresas): aligned com visibilidade Beta para evitar duplicar ideias. */
      const parts: SQL[] = [inArray(featureSuggestions.status, ["accepted", "completed"] as any)];
      const rows = await db
        .select({
          id: featureSuggestions.id,
          tenantId: featureSuggestions.tenantId,
          title: featureSuggestions.title,
          body: featureSuggestions.body,
          status: featureSuggestions.status,
          createdAt: featureSuggestions.createdAt,
          reviewedAt: featureSuggestions.reviewedAt,
          completedAt: featureSuggestions.completedAt,
          updatedAt: featureSuggestions.updatedAt,
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

      return rows.map((r) => {
        const purgeMs = betaPurgeDeadlineMs({
          status: r.status,
          completedAt: r.completedAt,
          updatedAt: r.updatedAt,
        });
        return {
          id: r.id,
          tenantId: r.tenantId,
          tenantLabel:
            r.tenantId != null ? tenantLabels[r.tenantId] ?? `Empresa #${r.tenantId}` : "Global / Super Admin",
          title: r.title,
          body: r.body,
          status: r.status,
          createdAt: r.createdAt,
          acceptedAt: r.reviewedAt,
          completedAt: r.completedAt,
          /** ISO UTC — remoção automática após BETA_COMPLETED_RETENTION_DIAS a partir da conclusão. */
          purgeAt: purgeMs != null ? new Date(purgeMs).toISOString() : null,
          authorName: r.authorName,
        };
      });
    }),

    listEdits: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const [row] = await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, input.id)).limit(1);
        if (!row) throw new Error("Sugestão não encontrada.");

        // Autor sempre pode ver; coordenador/SA pode ver no âmbito.
        const isAuthor = user?.id != null && Number(row.authorId) === Number(user.id);
        if (!isAuthor) {
          if (!canReviewBetaSuggestions(user)) throw new Error("Sem permissão.");
          assertSuggestionReviewableByUser(row as any, user);
        }

        const editor = alias(users, "editor_user");
        const edits = await db
          .select({
            id: featureSuggestionEdits.id,
            editedAt: featureSuggestionEdits.createdAt,
            editedBy: featureSuggestionEdits.editedBy,
            editedByName: editor.name,
            oldTitle: featureSuggestionEdits.oldTitle,
            newTitle: featureSuggestionEdits.newTitle,
          })
          .from(featureSuggestionEdits)
          .leftJoin(editor, eq(featureSuggestionEdits.editedBy, editor.id))
          .where(eq(featureSuggestionEdits.suggestionId, input.id))
          .orderBy(desc(featureSuggestionEdits.id))
          .limit(50);
        return edits;
      }),

    edit: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(3).max(255),
          body: z.string().min(10).max(8000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [row] = await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, input.id)).limit(1);
        if (!row) throw new Error("Sugestão não encontrada.");

        // Por requisito: editável também por coordenador/SA; qualquer edit fica com histórico.
        assertSuggestionEditableByUser(row as any, user);
        if (row.status !== "pending") {
          throw new Error("Só pode editar sugestões pendentes.");
        }

        const newTitle = input.title.trim();
        const newBody = input.body.trim();
        if (newTitle === row.title && newBody === row.body) return { success: true };

        await db.insert(featureSuggestionEdits).values({
          suggestionId: row.id,
          editedBy: user.id,
          oldTitle: row.title,
          oldBody: row.body,
          newTitle,
          newBody,
        } as any);

        await db.update(featureSuggestions).set({
          title: newTitle,
          body: newBody,
        } as any).where(eq(featureSuggestions.id, row.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "beta_suggestion_edit",
          entity: "featureSuggestion",
          entityId: row.id,
          details: newTitle.slice(0, 255),
        });

        return { success: true };
      }),

    markCompleted: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!canReviewBetaSuggestions(ctx.user)) {
          throw new Error("Só Super Admin ou Coordenador podem concluir sugestões.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [row] = await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, input.id)).limit(1);
        if (!row) throw new Error("Sugestão não encontrada.");
        assertSuggestionReviewableByUser(row as any, user);
        // Legacy: ENUM completed (migração 0022); actual: accepted + completedAt (migração 0023).
        if (row.status === "completed") return { success: true };
        if (row.completedAt != null) return { success: true };
        if (row.status !== "accepted") throw new Error("Só pode concluir sugestões aceites.");

        try {
          await db
            .update(featureSuggestions)
            .set({ completedAt: new Date() } as any)
            .where(eq(featureSuggestions.id, input.id));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("completedAt") || msg.includes("Unknown column")) {
            throw new Error(
              "Falta actualizar a base de dados (coluna completedAt). No servidor execute: pnpm exec drizzle-kit migrate",
            );
          }
          throw e;
        }

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "beta_suggestion_completed",
          entity: "featureSuggestion",
          entityId: input.id,
          details: `${row.title}`.slice(0, 255),
        });

        await purgeStaleCompletedBetaSuggestions(db);

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [row] = await db.select().from(featureSuggestions).where(eq(featureSuggestions.id, input.id)).limit(1);
        if (!row) throw new Error("Sugestão não encontrada.");

        const canReview = canReviewBetaSuggestions(user);
        const isAuthor = user?.id != null && Number(row.authorId) === Number(user.id);

        const isWorkflowDone = row.status === "completed" || row.completedAt != null;
        if (isWorkflowDone) {
          if (!canReview) throw new Error("Só Coordenador/Super Admin pode excluir sugestões concluídas.");
          assertSuggestionReviewableByUser(row as any, user);
        } else if (row.status === "pending" || row.status === "rejected") {
          if (!isAuthor && !canReview) throw new Error("Sem permissão.");
          if (canReview) assertSuggestionReviewableByUser(row as any, user);
          else {
            if (row.tenantId == null || user.tenantId == null || Number(row.tenantId) !== Number(user.tenantId)) {
              throw new Error("Esta sugestão não pertence à sua empresa.");
            }
          }
        } else {
          throw new Error("Só pode excluir pendentes/recusadas ou concluídas.");
        }

        await db.delete(featureSuggestionEdits).where(eq(featureSuggestionEdits.suggestionId, row.id));
        await db.delete(featureSuggestions).where(eq(featureSuggestions.id, row.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "beta_suggestion_delete",
          entity: "featureSuggestion",
          entityId: row.id,
          details: `${row.status}: ${row.title}`.slice(0, 255),
        });

        return { success: true };
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
        sql`(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) IS NOT NULL`,
        sql`MONTH(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${mo}`,
        sql`YEAR(COALESCE(${sales.dataAtivacao}, ${sales.installationDate})) = ${yr}`,
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
      const nameRows = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users)
        .where(inArray(users.id, ids));
      const nameMap = Object.fromEntries(nameRows.map(r => [r.id, r.name]));
      const avatarMap = Object.fromEntries(nameRows.map(r => [r.id, r.avatarUrl ?? null]));

      return counts.map((c, position) => ({
        position: position + 1,
        userId: c.userId,
        userName: nameMap[c.userId] || `Utilizador #${c.userId}`,
        avatarUrl: avatarMap[c.userId] ?? null,
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
            status: z
              .enum([
                "aguarda_instalacao",
                "em_aberto",
                "activo",
                "e_switch",
                "cancelado",
                "pendente",
                "nao_fechou",
              ])
              .optional(),
            contactId: z.number().int().positive().optional(),
            createdFrom: z.string().optional(),
            createdTo: z.string().optional(),
            activatedFrom: z.string().optional(),
            activatedTo: z.string().optional(),
            limit: z.number().int().min(1).max(100).optional(),
            cursor: z.number().int().positive().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { items: [], nextCursor: null as number | null };
        const user = ctx.user as any;
        const ids = await getSellerIdsForPipelineScope(db, user);
        const parts: SQL[] = [];
        const vcond = whereInTenantUserIds(ids, sales.vendedorId);
        if (vcond) parts.push(vcond);
        const cten = whereContactsForUser(user);
        if (cten) parts.push(cten);
        if (input?.contactId != null) parts.push(eq(sales.contactId, input.contactId));
        if (input?.status) parts.push(eq(sales.status, input.status));
        else parts.push(sql`${sales.status} <> 'cancelado'`);

        if (input?.createdFrom?.trim()) {
          const d = new Date(input.createdFrom);
          if (!Number.isNaN(d.getTime())) parts.push(gte(sales.createdAt, d));
        }
        if (input?.createdTo?.trim()) {
          const d = new Date(input.createdTo);
          if (!Number.isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            parts.push(lte(sales.createdAt, d));
          }
        }
        if (input?.activatedFrom?.trim()) {
          const d = new Date(input.activatedFrom);
          if (!Number.isNaN(d.getTime())) {
            parts.push(sql`COALESCE(${sales.dataAtivacao}, ${sales.installationDate}) >= ${d}`);
          }
        }
        if (input?.activatedTo?.trim()) {
          const d = new Date(input.activatedTo);
          if (!Number.isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            parts.push(sql`COALESCE(${sales.dataAtivacao}, ${sales.installationDate}) <= ${d}`);
          }
        }

        const lim = input?.limit != null ? Math.min(100, input.limit) : 50;
        if (input?.cursor != null) {
          parts.push(lt(sales.id, input.cursor));
        }
        const saleVendedor = alias(users, "sale_vendedor");
        const rows = await db
          .select({
            sale: sales,
            contactName: contacts.name,
            contactPhone: contacts.phone,
            vendedorName: saleVendedor.name,
          })
          .from(sales)
          .innerJoin(contacts, eq(sales.contactId, contacts.id))
          .leftJoin(saleVendedor, eq(sales.vendedorId, saleVendedor.id))
          .where(and(...parts))
          .orderBy(desc(sales.id))
          .limit(lim + 1);
        const hasMore = rows.length > lim;
        const page = hasMore ? rows.slice(0, lim) : rows;
        const items = page.map((r) => ({
          ...r.sale,
          contactName: r.contactName,
          contactPhone: r.contactPhone,
          vendedorName: r.vendedorName ?? null,
        }));
        const nextCursor =
          hasMore && items.length > 0 ? items[items.length - 1]!.id : null;
        return { items, nextCursor };
      }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        product: z.enum(["telecom", "energia"]),
        offer: z.string().optional(),
        value: z.string().optional(),
        installationDate: z.string().optional(),
        /** Campos opcionais da ficha de contrato (nenhum obrigatório). */
        contractDossier: z.record(z.string(), z.string().max(4000)).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await assertContactAccessible(db, input.contactId, user);

        const dossierJson =
          input.contractDossier && Object.keys(input.contractDossier).length > 0
            ? mergeSaleContractDossier(null, input.contractDossier as Record<string, string | null | undefined>)
            : null;

        await db.insert(sales).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          product: input.product,
          offer: input.offer || null,
          value: input.value || null,
          installationDate: input.installationDate ? new Date(input.installationDate) : null,
          status: "aguarda_instalacao",
          saleContractDossier: dossierJson,
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
        status: z.enum(["aguarda_instalacao", "em_aberto", "activo", "e_switch", "cancelado", "pendente", "nao_fechou"]).optional(),
        installationDate: z.string().optional().nullable(),
        dataAtivacao: z.string().optional().nullable(),
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

        await assertSalePipelineAccessForSale(db, s, user);

        const patch: Record<string, unknown> = {};
        if (input.status !== undefined) patch.status = input.status;
        if (input.cancelReason !== undefined) patch.cancelReason = input.cancelReason;
        if (input.installationDate !== undefined) {
          patch.installationDate = input.installationDate ? new Date(input.installationDate) : null;
        }
        if (input.dataAtivacao !== undefined) {
          patch.dataAtivacao = input.dataAtivacao ? new Date(input.dataAtivacao) : null;
        }
        const nextStatus = input.status !== undefined ? input.status : s.status;
        const nextInstallationDate =
          input.installationDate !== undefined
            ? (input.installationDate ? new Date(input.installationDate) : null)
            : s.installationDate;
        const nextDataAtivacao =
          input.dataAtivacao !== undefined
            ? (input.dataAtivacao ? new Date(input.dataAtivacao) : null)
            : (s as { dataAtivacao?: Date | null }).dataAtivacao ?? null;
        if (
          nextStatus === "activo" &&
          !nextInstallationDate &&
          (!nextDataAtivacao || Number.isNaN(new Date(nextDataAtivacao as Date).getTime()))
        ) {
          throw new Error("Defina a data de instalação ou a data de activação ao marcar como Activo");
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

    /** Marca venda como Activa com data de activação = agora (vendedor próprio ou gestão). */
    activateService: protectedProcedure
      .input(z.object({ saleId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [s] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
        if (!s) throw new Error("Venda não encontrada");
        await assertSalePipelineAccessForSale(db, s, user);
        if (user?.crmRole === "vendedor" && Number(s.vendedorId) !== Number(user.id)) {
          throw new Error("Só pode activar as suas vendas.");
        }
        const now = new Date();
        await db
          .update(sales)
          .set({ status: "activo", dataAtivacao: now } as any)
          .where(eq(sales.id, input.saleId));
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "sale_activated",
          entity: "sale",
          entityId: input.saleId,
          details: `Activou serviço (data activação automática)`,
        });
        return { success: true as const };
      }),

    /** Ficha de contrato / dados para exportação — todos os campos opcionais. */
    saveContractDossier: protectedProcedure
      .input(
        z.object({
          saleId: z.number(),
          patch: z.record(z.string(), z.union([z.string().max(4000), z.literal(""), z.null()]).optional()),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        const [s] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
        if (!s) throw new Error("Venda não encontrada");
        await assertSalePipelineAccessForSale(db, s, user);
        const nextJson = mergeSaleContractDossier(
          (s as { saleContractDossier?: string | null }).saleContractDossier ?? null,
          input.patch as Record<string, string | null | undefined>,
        );
        await db
          .update(sales)
          .set({ saleContractDossier: nextJson } as any)
          .where(eq(sales.id, input.saleId));
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "sale_dossier_updated",
          entity: "sale",
          entityId: input.saleId,
          details: `Actualizou ficha de contrato da venda #${input.saleId}`,
        });
        return { success: true };
      }),

    /** Exportação CSV (Excel-friendly) do Acompanhamento + ficha de contrato. */
    exportContractDossierCsv: protectedProcedure
      .input(
        z
          .object({
            status: z
              .enum([
                "aguarda_instalacao",
                "em_aberto",
                "activo",
                "e_switch",
                "cancelado",
                "pendente",
                "nao_fechou",
                "__all",
              ])
              .optional(),
          })
          .optional(),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const ids = await getSellerIdsForPipelineScope(db, user);
        const parts: SQL[] = [];
        const vcond = whereInTenantUserIds(ids, sales.vendedorId);
        if (vcond) parts.push(vcond);
        const cten = whereContactsForUser(user);
        if (cten) parts.push(cten);

        const status = input?.status;
        if (status && status !== "__all") parts.push(eq(sales.status, status as any));
        else parts.push(sql`${sales.status} <> 'cancelado'`);

        const saleVendedor = alias(users, "sale_vendedor_csv");
        const rows = await db
          .select({
            sale: sales,
            contactName: contacts.name,
            contactPhone: contacts.phone,
            vendedorName: saleVendedor.name,
          })
          .from(sales)
          .innerJoin(contacts, eq(sales.contactId, contacts.id))
          .leftJoin(saleVendedor, eq(sales.vendedorId, saleVendedor.id))
          .where(and(...parts))
          .orderBy(desc(sales.updatedAt))
          .limit(5000);

        const headers = [
          "SALE_DB_ID",
          "SALE_PUBLIC_ID",
          "VENDEDOR",
          "PRODUTO",
          "ESTADO",
          "CONTACTO_NOME",
          "CONTACTO_TEL",
          "DATA_ATIVACAO",
          "ANTIGO_TITULAR_NOME",
          "ANTIGO_TITULAR_NIF",
          ...SALE_CONTRACT_DOSSIER_FIELDS.map((f) => f.label),
        ];

        const csvEscape = (v: unknown) => {
          const s = v == null ? "" : String(v);
          return `"${s.replace(/\"/g, '""')}"`;
        };

        const lines: string[] = [];
        // BOM para Excel + separador ; (pt-PT)
        lines.push("\uFEFF" + headers.map(csvEscape).join(";"));

        for (const r of rows as any[]) {
          const sale = r.sale as any;
          const dossier = parseSaleContractDossier(sale.saleContractDossier ?? null);
          const dataAtiv =
            sale.dataAtivacao != null
              ? new Date(sale.dataAtivacao).toISOString()
              : "";
          const base = [
            sale.id,
            sale.publicSaleId ?? "",
            r.vendedorName ?? `#${sale.vendedorId}`,
            sale.product,
            sale.status,
            r.contactName ?? "",
            r.contactPhone ?? "",
            dataAtiv,
            sale.antigoTitularNome ?? "",
            sale.antigoTitularNif ?? "",
          ];
          const extra = SALE_CONTRACT_DOSSIER_FIELDS.map((f) => dossier[f.key] ?? "");
          lines.push([...base, ...extra].map(csvEscape).join(";"));
        }

        const stamp = new Date();
        const yyyy = stamp.getFullYear();
        const mm = String(stamp.getMonth() + 1).padStart(2, "0");
        const dd = String(stamp.getDate()).padStart(2, "0");
        const filename = `acompanhamento-${yyyy}${mm}${dd}.csv`;

        return { filename, csv: lines.join("\n") };
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
