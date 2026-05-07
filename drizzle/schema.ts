import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint } from "drizzle-orm/mysql-core";

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
  teamId: int("teamId"),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastOnlineAt: timestamp("lastOnlineAt"),
  pauseStartedAt: timestamp("pauseStartedAt"),
  totalPauseMinutes: int("totalPauseMinutes").default(0).notNull(),
  totalOnlineMinutes: int("totalOnlineMinutes").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ TEAMS ============
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  leaderId: int("leaderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ CONTACTS ============
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Pendente = typeof pendentes.$inferSelect;
export type InsertPendente = typeof pendentes.$inferInsert;

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

// ============ COMPETITOR SCRIPTS ============
export const competitorScripts = mysqlTable("competitorScripts", {
  id: int("id").autoincrement().primaryKey(),
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
export const blacklist = mysqlTable("blacklist", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  reason: text("reason"),
  addedBy: int("addedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
export const contactOrigins = mysqlTable("contactOrigins", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============ ENERGY CONFIG ============
export const energyConfig = mysqlTable("energyConfig", {
  id: int("id").autoincrement().primaryKey(),
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
  vendedorId: int("vendedorId").notNull(),
  contactId: int("contactId"),
  message: text("message"),
  status: mysqlEnum("status", ["aberto", "em_atendimento", "resolvido"]).default("aberto").notNull(),
  respondedBy: int("respondedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});
