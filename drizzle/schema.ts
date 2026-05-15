import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  varchar,
  boolean,
  bigint,
  uniqueIndex,
  date,
  primaryKey,
  index,
} from "drizzle-orm/mysql-core";

// ============ USERS ============
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  crmRole: mysqlEnum("crmRole", ["vendedor", "cej", "ce", "coordenador"]).default("vendedor").notNull(),
  isSuperAdmin: boolean("isSuperAdmin").default(false).notNull(),
  /** ID do utilizador Coordenador dono do tenant (empresa). Super admin: null. Coordenador: = próprio users.id. */
  tenantId: int("tenantId"),
  /** Empresa ou sub-empresa (hierarquia `companies`). Null = legado / Super Admin. */
  companyId: int("companyId"),
  teamId: int("teamId"),
  isOnline: boolean("isOnline").default(false).notNull(),
  dialerState: mysqlEnum("dialerState", ["idle", "ready", "in_call", "wrap_up"]).default("idle").notNull(),
  dialerContactId: int("dialerContactId"),
  dialerSource: mysqlEnum("dialerSource", ["queue", "pendente"]).default("queue").notNull(),
  dialerUpdatedAt: timestamp("dialerUpdatedAt"),
  lastOnlineAt: timestamp("lastOnlineAt"),
  pauseStartedAt: timestamp("pauseStartedAt"),
  totalPauseMinutes: int("totalPauseMinutes").default(0).notNull(),
  totalOnlineMinutes: int("totalOnlineMinutes").default(0).notNull(),
  /** Início da sessão de trabalho actual (presença); não reinicia ao mudar de página. */
  presenceSessionStartedAt: timestamp("presenceSessionStartedAt"),
  lastSeenIp: varchar("lastSeenIp", { length: 45 }),
  lastSeenUserAgent: varchar("lastSeenUserAgent", { length: 512 }),
  lastSeenGeo: varchar("lastSeenGeo", { length: 255 }),
  /** URL servida via `/manus-storage/...` após upload local. */
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  nif: varchar("nif", { length: 20 }),
  sfid: varchar("sfid", { length: 64 }),
  /** Bloqueio de login (RH / coordenação). */
  bloqueado: boolean("bloqueado").default(false).notNull(),
  /** Chefe de Equipa Júnior (CEJ) a que o vendedor reporta, quando aplicável. */
  teamLeaderJuniorId: int("team_leader_junior_id"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ COMPANIES (empresa > sub-empresa) ============
/** Empresa raiz: `parentCompanyId` null e `coordinatorUserId` = id do coordenador. Sub-empresa: `parentCompanyId` = id da raiz. */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  coordinatorUserId: int("coordinatorUserId"),
  parentCompanyId: int("parentCompanyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ============ APP SETTINGS ============
export const appSettings = mysqlTable("appSettings", {
  id: int("id").autoincrement().primaryKey(),
  // AI
  aiEnabled: boolean("aiEnabled").default(true).notNull(),
  openaiApiKeyEnc: text("openaiApiKeyEnc"),
  geminiApiKeyEnc: text("geminiApiKeyEnc"),
  deepseekApiKeyEnc: text("deepseekApiKeyEnc"),
  claudeApiKeyEnc: text("claudeApiKeyEnc"),
  preferredAiProvider: mysqlEnum("preferredAiProvider", ["openai", "gemini", "deepseek", "claude"]).default("openai").notNull(),
  // WhatsApp (Cloud API)
  whatsappEnabled: boolean("whatsappEnabled").default(false).notNull(),
  whatsappAccessTokenEnc: text("whatsappAccessTokenEnc"),
  whatsappPhoneNumberId: varchar("whatsappPhoneNumberId", { length: 64 }),
  whatsappBusinessAccountId: varchar("whatsappBusinessAccountId", { length: 64 }),
  whatsappVerifyTokenEnc: text("whatsappVerifyTokenEnc"),
  /** Legado (não usado pela app). */
  forgeApiUrl: varchar("forgeApiUrl", { length: 512 }),
  forgeApiKeyEnc: text("forgeApiKeyEnc"),
  /** Mensagem global mostrada aos utilizadores (exc. Super Admin). Incrementa revisão ao guardar. */
  userBroadcastAlert: text("userBroadcastAlert"),
  userBroadcastAlertRevision: int("userBroadcastAlertRevision").default(0).notNull(),
  /** Página /planos e menu «Planos» — desactivado por defeito; só Super Admin activa. */
  pricingPlansEnabled: boolean("pricingPlansEnabled").default(false).notNull(),
  // Pagamentos (credenciais sensíveis encriptadas como os demais segredos)
  stripeEnabled: boolean("stripeEnabled").default(false).notNull(),
  stripePublishableKey: varchar("stripePublishableKey", { length: 255 }),
  stripeSecretKeyEnc: text("stripeSecretKeyEnc"),
  stripeWebhookSecretEnc: text("stripeWebhookSecretEnc"),
  sumupEnabled: boolean("sumupEnabled").default(false).notNull(),
  sumupApiKeyEnc: text("sumupApiKeyEnc"),
  paypalEnabled: boolean("paypalEnabled").default(false).notNull(),
  paypalClientId: varchar("paypalClientId", { length: 255 }),
  paypalClientSecretEnc: text("paypalClientSecretEnc"),
  /** sandbox | live */
  paypalMode: varchar("paypalMode", { length: 16 }).default("sandbox").notNull(),
  // audit
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;

// ============ TEAMS ============
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  leaderId: int("leaderId"),
  /** E-mail operacional da equipa (notificações, resposta «de» só para esta equipa; não há multi-tenant SaaS). */
  contactEmail: varchar("contactEmail", { length: 320 }),
  /** Dono do tenant (coordenador user id) para isolar equipas por empresa. */
  tenantId: int("tenantId"),
  /** Sub-empresa (equipa) quando criada pelo fluxo hierárquico. */
  companyId: int("companyId"),
  /** Meta diária de chamadas para a equipa (dashboard); null = usar valor por defeito da app (80). */
  dailyCallsGoal: int("dailyCallsGoal"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ CONTACTS ============
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  /** ID do coordenador dono dos dados (mesmo valor que users.tenantId da equipa). */
  tenantId: int("tenantId"),
  /** Sub-empresa / equipa para isolamento entre chefes (ver `companies`). */
  companyId: int("companyId"),
  phone: varchar("phone", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  postalCode: varchar("postalCode", { length: 10 }),
  origin: varchar("origin", { length: 100 }).default("Telemarketing").notNull(),
  status: mysqlEnum("status", [
    "novo",
    "pendente",
    "venda",
    "nao_atende",
    "sem_interesse",
    "blacklist",
    "sem_cobertura_fibra",
  ]).default("novo").notNull(),
  assignedTo: int("assignedTo"),
  lastAssignedAt: timestamp("lastAssignedAt"),
  /** Após qualificação «sem interesse» / «outros»: não voltar ao discador até esta data. */
  discardUntil: timestamp("discardUntil"),
  attempts: int("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  addedBy: int("addedBy"),
  hasEnergy: boolean("hasEnergy").default(false).notNull(),
  hasTelecom: boolean("hasTelecom").default(false).notNull(),
  lossReason: varchar("lossReason", { length: 100 }),
  notes: text("notes"),
  campaignOffered: varchar("campaignOffered", { length: 255 }),
  offerValue: varchar("offerValue", { length: 100 }),
  listName: varchar("listName", { length: 255 }),
  /** manual = formulário Contactos (48h exclusividade para outros vendedores); bulk = importação; import = legado. */
  addedSource: mysqlEnum("addedSource", ["manual", "bulk", "import", "system"]).default("import").notNull(),
  /** Rótulo do lote na importação CSV (rastreabilidade). */
  importBatchLabel: varchar("import_batch_label", { length: 255 }),
  /** Data de referência de fidelização (obrigatória no fluxo do discador / feedback). */
  dataFidelizacao: date("data_fidelizacao", { mode: "date" }),
  isLead: boolean("isLead").default(false).notNull(),
  /** Cliente Vodafone (concorrente): excluído do discador; registo em `contact_subcontacts`. */
  isVodafoneClient: boolean("isVodafoneClient").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;

/** Sub-contactos (ex.: número classificado como cliente Vodafone); o contacto principal mantém-se. */
export const contactSubcontacts = mysqlTable(
  "contact_subcontacts",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contactId").notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    category: varchar("category", { length: 32 }).default("vodafone_client").notNull(),
    source: varchar("source", { length: 16 }).default("automatic").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniqContactCategoryPhone: uniqueIndex("contact_subcontacts_contact_category_phone").on(
      t.contactId,
      t.category,
      t.phone,
    ),
  }),
);

export type ContactSubcontact = typeof contactSubcontacts.$inferSelect;
export type InsertContactSubcontact = typeof contactSubcontacts.$inferInsert;
export type InsertContact = typeof contacts.$inferInsert;

// ============ CALL FEEDBACK (pós-chamada atendida) ============
export const callFeedback = mysqlTable("call_feedback", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  destination: varchar("destination", { length: 32 }).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallFeedback = typeof callFeedback.$inferSelect;

// ============ FIDELIZAÇÕES A TERMINAR ============
export const fidelizacoesTerminando = mysqlTable("fidelizacoes_terminando", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  dataFimFidelizacao: date("data_fim_fidelizacao", { mode: "date" }).notNull(),
  operadora: varchar("operadora", { length: 32 }).notNull(),
  observacoes: text("observacoes"),
  createdBy: int("createdBy").notNull(),
  companyId: int("companyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FidelizacaoTerminando = typeof fidelizacoesTerminando.$inferSelect;

// ============ NOTIFICAÇÕES INTERNAS (CRM) ============
export const crmNotifications = mysqlTable("crm_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 32 }).default("info").notNull(),
  message: text("message").notNull(),
  link: varchar("link", { length: 512 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CrmNotification = typeof crmNotifications.$inferSelect;

// ============ PENDENTES ============
export const pendentes = mysqlTable("pendentes", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  returnDate: timestamp("returnDate").notNull(),
  notes: text("notes"),
  offerDesired: text("offerDesired"),
  status: mysqlEnum("status", ["agendado", "realizado", "expirado", "cancelado", "nao_fechou"]).default("agendado").notNull(),
  motivoNaoFechamentoId: int("motivo_nao_fechamento_id"),
  notified: boolean("notified").default(false).notNull(),
  /** 1 = mais fraco … 5 = mais forte (prioridade nos alertas). */
  priorityLevel: tinyint("priorityLevel", { unsigned: true }).default(3).notNull(),
  /** Identificador legível (ex.: PEND-2026-1024). */
  publicPendingId: varchar("public_pending_id", { length: 32 }),
  clientNif: varchar("client_nif", { length: 32 }),
  operadoraAtual: varchar("operadora_atual", { length: 64 }),
  /** Venda criada na conversão pré-venda → venda. */
  convertedSaleId: int("converted_sale_id"),
  /** Resumo obrigatório na edição (operacional) — o que foi dito na chamada. */
  historicoChamada: text("historico_chamada"),
  /** Quem criou o registo (discador / formulário); pode coincidir com vendedorId. */
  criadorId: int("criador_id"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Pendente = typeof pendentes.$inferSelect;
export type InsertPendente = typeof pendentes.$inferInsert;

// ============ MOTIVOS NÃO FECHAMENTO ============
export const motivosNaoFechamento = mysqlTable("motivos_nao_fechamento", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MotivoNaoFechamento = typeof motivosNaoFechamento.$inferSelect;

// ============ CALENDAR EVENTS ============
export const calendarEvents = mysqlTable("calendarEvents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId"),
  companyId: int("company_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["geral", "pendente", "venda", "instalacao"]).default("geral").notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt"),
  allDay: boolean("allDay").default(true).notNull(),
  contactId: int("contactId"),
  assignedTo: int("assignedTo"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

export const calendarEventInvitees = mysqlTable(
  "calendar_event_invitees",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: int("event_id").notNull(),
    userId: int("user_id").notNull(),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqEventUser: uniqueIndex("uniq_calendar_event_invitee").on(t.eventId, t.userId),
  }),
);

export type CalendarEventInvitee = typeof calendarEventInvitees.$inferSelect;

// ============ CONTRACTS ============
export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  type: mysqlEnum("type", ["contrato", "portabilidade", "rescisao"]).notNull(),
  product: mysqlEnum("product", ["telecom", "energia"]).notNull(),
  status: mysqlEnum("status", ["gerado", "enviado", "lido", "assinado", "cancelado"]).default("gerado").notNull(),
  emailSentAt: timestamp("emailSentAt"),
  emailReadAt: timestamp("emailReadAt"),
  signedAt: timestamp("signedAt"),
  installationDate: timestamp("installationDate"),
  documentUrl: text("documentUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

// ============ CAMPAIGNS ============
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  product: mysqlEnum("product", ["telecom", "energia", "ambos"]).default("ambos").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ============ CAMPAIGN FILES ============
export const campaignFiles = mysqlTable("campaignFiles", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignFile = typeof campaignFiles.$inferSelect;
export type InsertCampaignFile = typeof campaignFiles.$inferInsert;

// ============ COMPETITOR SCRIPTS ============
export const competitorScripts = mysqlTable("competitorScripts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId"),
  competitor: varchar("competitor", { length: 255 }).notNull(),
  weakness: text("weakness").notNull(),
  ourStrength: text("ourStrength").notNull(),
  product: mysqlEnum("product", ["telecom", "energia", "ambos"]).default("ambos").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============ GAMIFICATION ============
export const gamification = mysqlTable("gamification", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  points: int("points").default(0).notNull(),
  totalCalls: int("totalCalls").default(0).notNull(),
  totalSales: int("totalSales").default(0).notNull(),
  totalPendentes: int("totalPendentes").default(0).notNull(),
  badges: text("badges"),
  month: int("month").notNull(),
  year: int("year").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Gamification = typeof gamification.$inferSelect;

// ============ AUDIT LOGS ============
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: int("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ============ FEATURE SUGGESTIONS (Beta / roadmap) ============
export const featureSuggestions = mysqlTable("featureSuggestions", {
  id: int("id").autoincrement().primaryKey(),
  /** Dono do tenant (coordenador user id); null = sugestão global (ex.: Super Admin). */
  tenantId: int("tenantId"),
  authorId: int("authorId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected", "completed"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewNote: text("reviewNote"),
  /** Data em que foi marcada como concluída (Beta); não altera o ENUM quando a BD não suporta `completed`. */
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureSuggestion = typeof featureSuggestions.$inferSelect;

// ============ FEATURE SUGGESTION EDITS (audit de edições) ============
export const featureSuggestionEdits = mysqlTable("featureSuggestionEdits", {
  id: int("id").autoincrement().primaryKey(),
  suggestionId: int("suggestionId").notNull(),
  editedBy: int("editedBy").notNull(),
  oldTitle: varchar("oldTitle", { length: 255 }).notNull(),
  oldBody: text("oldBody").notNull(),
  newTitle: varchar("newTitle", { length: 255 }).notNull(),
  newBody: text("newBody").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FeatureSuggestionEdit = typeof featureSuggestionEdits.$inferSelect;

// ============ SALES ============
export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  product: mysqlEnum("product", ["telecom", "energia"]).notNull(),
  offer: text("offer"),
  value: text("value"),
  status: mysqlEnum("status", [
    "aguarda_instalacao",
    "em_aberto",
    "activo",
    "e_switch",
    "cancelado",
    "pendente",
    "nao_fechou",
  ])
    .default("aguarda_instalacao")
    .notNull(),
  cancelReason: text("cancelReason"),
  installationDate: timestamp("installationDate"),
  /** Data em que o serviço foi activado (ranking / relatórios). */
  dataAtivacao: timestamp("data_ativacao"),
  /** Identificador legível único (ex.: SALE-2026-01234). */
  publicSaleId: varchar("public_sale_id", { length: 32 }),
  antigoTitularNome: varchar("antigo_titular_nome", { length: 255 }),
  antigoTitularNif: varchar("antigo_titular_nif", { length: 32 }),
  motivoNaoFechamentoId: int("motivo_nao_fechamento_id"),
  preAgendamentoAt: timestamp("pre_agendamento_at"),
  titularTroca: boolean("titular_troca").default(false).notNull(),
  portabilidadeMovel: boolean("portabilidade_movel").default(false).notNull(),
  portabilidadeFixa: boolean("portabilidade_fixa").default(false).notNull(),
  desativacaoApoiada: boolean("desativacao_apoiada").default(false).notNull(),
  statusDocumentacao: mysqlEnum("status_documentacao", [
    "pendente",
    "enviado",
    "assinado",
    "back_office",
  ])
    .default("pendente")
    .notNull(),
  /** JSON: campos extendidos do formulário de venda/pendente. */
  saleDetailJson: text("sale_detail_json"),
  /** JSON (texto): campos opcionais da ficha de contrato — ver shared/saleContractDossier.ts */
  saleContractDossier: text("saleContractDossier"),
  closedAt: timestamp("closedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sale = typeof sales.$inferSelect;
export type InsertSale = typeof sales.$inferInsert;

// ============ BLACKLIST ============
export const blacklist = mysqlTable(
  "blacklist",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId"),
    /** Sub-empresa — isolamento da lista negra no discador. */
    companyId: int("company_id"),
    /** Equipa do chefe (mesmo teamId que users.teamId); null = linha antiga ou coordenador. */
    teamId: int("teamId"),
    phone: varchar("phone", { length: 20 }).notNull(),
    reason: text("reason"),
    addedBy: int("addedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    idxPhoneCompany: index("idx_blacklist_phone_company").on(t.phone, t.companyId),
  }),
);

// ============ CALL LOGS ============
export const callLogs = mysqlTable("callLogs", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  outcome: mysqlEnum("outcome", ["atendeu", "nao_atende", "ocupado", "numero_errado", "venda", "pendente", "sem_interesse"]).notNull(),
  duration: int("duration"),
  notes: text("notes"),
  calledAt: timestamp("calledAt").defaultNow().notNull(),
});

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// ============ ENERGY CALCULATIONS ============
export const energyCalculations = mysqlTable("energyCalculations", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),
  vendedorId: int("vendedorId").notNull(),
  currentProvider: varchar("currentProvider", { length: 100 }),
  currentMonthlyBill: text("currentMonthlyBill"),
  currentConsumptionKwh: text("currentConsumptionKwh"),
  ourOffer: text("ourOffer"),
  estimatedSavings: text("estimatedSavings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ CONTACT ORIGINS ============
export const contactOrigins = mysqlTable(
  "contactOrigins",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId"),
    name: varchar("name", { length: 100 }).notNull(),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniqTenantName: uniqueIndex("contact_origins_tenant_name").on(t.tenantId, t.name),
  }),
);

// ============ ENERGY CONFIG ============
export const energyConfig = mysqlTable("energyConfig", {
  id: int("id").autoincrement().primaryKey(),
  /** null = modelo global (super admin); senão = cópia por coordenador / tenant. */
  tenantCoordinatorUserId: int("tenantCoordinatorUserId"),
  priceKwhSimples: text("priceKwhSimples").default("0.1500").notNull(),
  priceKwhBiHorariaPonta: text("priceKwhBiHorariaPonta").default("0.2000").notNull(),
  priceKwhBiHorariaVazio: text("priceKwhBiHorariaVazio").default("0.1000").notNull(),
  baseDiscountPercent: text("baseDiscountPercent").default("23.00").notNull(),
  vdfClientExtraPercent: text("vdfClientExtraPercent").default("2.00").notNull(),
  vdfGasClientExtraPercent: text("vdfGasClientExtraPercent").default("3.00").notNull(),
  reembolsoPercent: text("reembolsoPercent").default("3.00").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============ SOS REQUESTS ============
export const sosRequests = mysqlTable("sosRequests", {
  id: int("id").autoincrement().primaryKey(),
  /** Igual a `users.tenantId` do coordenador da empresa (null = legado ou Super Admin). */
  tenantId: int("tenantId"),
  vendedorId: int("vendedorId").notNull(),
  contactId: int("contactId"),
  message: text("message"),
  status: mysqlEnum("status", ["aberto", "em_atendimento", "resolvido"]).default("aberto").notNull(),
  respondedBy: int("respondedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

// ============ GLOBAL API USAGE (Gemini, Tavily) — contagem por instalação, não por empresa ============
export const systemApiUsage = mysqlTable(
  "system_api_usage",
  {
    provider: varchar("provider", { length: 32 }).notNull(),
    periodKey: varchar("periodKey", { length: 16 }).notNull(),
    requestCount: int("requestCount", { unsigned: true }).default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.periodKey] }),
  }),
);

export const systemApiUsageAlerts = mysqlTable(
  "system_api_usage_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    periodKey: varchar("periodKey", { length: 16 }).notNull(),
    alertCode: varchar("alertCode", { length: 32 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniqProviderPeriodAlert: uniqueIndex("uniq_provider_period_alert").on(
      t.provider,
      t.periodKey,
      t.alertCode,
    ),
  }),
);
