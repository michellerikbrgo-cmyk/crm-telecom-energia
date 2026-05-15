import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { contacts, users } from "../drizzle/schema";
import {
  CONTACT_EXPORT_COLUMNS,
  type ContactExportColumnKey,
} from "../shared/contactsExport";
import { buildContactsListConditions } from "./contactListScope";
export function canAccessContactsInventory(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || u?.crmRole === "ce" || u?.crmRole === "coordenador");
}

export function canExportContactsInventory(user: unknown): boolean {
  return canAccessContactsInventory(user);
}

export type ContactInventoryRow = {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  status: string;
  isVodafoneClient?: boolean;
  origin: string;
  listName: string | null;
  importBatchLabel: string | null;
  createdAt: Date | string;
  lastOperatorName: string | null;
  lastFeedbackAt: Date | string | null;
};

const lastOp = alias(users, "last_feedback_operator");

/** Lista inventário com último operador/data de `call_feedback`. */
export async function fetchContactsInventoryList(
  db: any,
  user: Record<string, unknown>,
  input?: { search?: string; status?: string },
  limit = 500,
): Promise<ContactInventoryRow[]> {
  const conditions = buildContactsListConditions(user, input);

  let q = db
    .select({
      id: contacts.id,
      phone: contacts.phone,
      name: contacts.name,
      email: contacts.email,
      status: contacts.status,
      isVodafoneClient: contacts.isVodafoneClient,
      origin: contacts.origin,
      listName: contacts.listName,
      importBatchLabel: contacts.importBatchLabel,
      createdAt: contacts.createdAt,
      lastOperatorName: lastOp.name,
      lastFeedbackAt: sql<Date | null>`last_cf.createdAt`.as("lastFeedbackAt"),
    })
    .from(contacts)
    .leftJoin(
      sql`(
        SELECT cf.contactId, cf.userId, cf.createdAt
        FROM call_feedback cf
        INNER JOIN (
          SELECT contactId, MAX(createdAt) AS maxCreated
          FROM call_feedback
          GROUP BY contactId
        ) mx ON mx.contactId = cf.contactId AND mx.maxCreated = cf.createdAt
      ) AS last_cf`,
      sql`${contacts.id} = last_cf.contactId`,
    )
    .leftJoin(lastOp, sql`last_cf.userId = ${lastOp.id}`);

  if (conditions.length > 0) {
    q = (q as any).where(and(...conditions));
  }

  return await (q as any).orderBy(desc(contacts.createdAt)).limit(limit);
}

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  pendente: "Pendente",
  venda: "Fechado",
  nao_atende: "Não atende",
  sem_interesse: "Sem interesse",
  blacklist: "Blacklist",
  sem_cobertura_fibra: "Sem cobertura",
  vodafone_client: "Cliente Vodafone",
};

function formatCell(key: ContactExportColumnKey, row: ContactInventoryRow): string {
  switch (key) {
    case "id":
      return String(row.id);
    case "phone":
      return row.phone ?? "";
    case "name":
      return row.name ?? "";
    case "email":
      return row.email ?? "";
    case "status":
      return STATUS_LABELS[row.status] ?? row.status;
    case "origin":
      return row.origin ?? "";
    case "listName":
      return row.listName ?? "";
    case "importBatchLabel":
      return row.importBatchLabel ?? "";
    case "lastOperatorName":
      return row.lastOperatorName ?? "";
    case "lastFeedbackAt":
      return row.lastFeedbackAt
        ? new Date(row.lastFeedbackAt as string).toLocaleString("pt-PT")
        : "";
    case "createdAt":
      return row.createdAt
        ? new Date(row.createdAt as string).toLocaleString("pt-PT")
        : "";
    default:
      return "";
  }
}

export function buildContactsExportCsv(
  rows: ContactInventoryRow[],
  columns: ContactExportColumnKey[],
): string {
  const defs = CONTACT_EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = defs.map((d) => csvEscape(d.label)).join(";");
  const body = rows.map((row) =>
    defs.map((d) => csvEscape(formatCell(d.key, row))).join(";"),
  );
  return "\uFEFF" + [header, ...body].join("\n");
}
