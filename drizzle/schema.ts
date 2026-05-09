import { int, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar, boolean, bigint, uniqueIndex } from "drizzle-orm/mysql-core";

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ CONTACTS ============
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  /** ID do coordenador dono dos dados (mesmo valor que users.tenantId da equipa). */
  tenantId: int("tenantId"),
  phone: varchar("phone", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  postalCode: varchar("postalCode", { length: 10 }),
  origin: varchar("origin", { length: 100 }).default("Telemarketing").notNull(),
  status: mysqlEnum("status", ["novo", "em_contacto", "pendente", "venda", "nao_atende", "sem_interesse", "blacklist"]).default("novo").notNull(),
  assignedTo: int("assignedTo"),
  lastAssignedAt: timestamp("lastAssignedAt"),
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
  isLead: boolean("isLead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ============ PENDENTES ============
export const pendentes = mysqlTable("pendentes", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  returnDate: timestamp("returnDate").notNull(),
  notes: text("notes"),
  offerDesired: text("offerDesired"),
  status: mysqlEnum("status", ["agendado", "realizado", "expirado", "cancelado"]).default("agendado").notNull(),
  notified: boolean("notified").default(false).notNull(),
  /** 1 = mais fraco … 5 = mais forte (prioridade nos alertas). */
  priorityLevel: tinyint("priorityLevel", { unsigned: true }).default(3).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Pendente = typeof pendentes.$inferSelect;
export type InsertPendente = typeof pendentes.$inferInsert;

// ============ CALENDAR EVENTS ============
export const calendarEvents = mysqlTable("calendarEvents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId"),
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

// ============ SALES ============
export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  vendedorId: int("vendedorId").notNull(),
  product: mysqlEnum("product", ["telecom", "energia"]).notNull(),
  offer: text("offer"),
  value: text("value"),
  status: mysqlEnum("status", ["aguarda_instalacao", "em_aberto", "activo", "e_switch", "cancelado"]).default("aguarda_instalacao").notNull(),
  cancelReason: text("cancelReason"),
  installationDate: timestamp("installationDate"),
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
    phone: varchar("phone", { length: 20 }).notNull(),
    reason: text("reason"),
    addedBy: int("addedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    uniqPhoneTenant: uniqueIndex("blacklist_phone_tenant").on(t.phone, t.tenantId),
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
