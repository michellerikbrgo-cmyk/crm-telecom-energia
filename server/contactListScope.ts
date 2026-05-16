import { and, eq, like, or, sql, type SQL } from "drizzle-orm";
import { contacts } from "../drizzle/schema";
import { isSuperAdminUser, whereContactsForUser } from "./tenantScope";

export const CONTACT_STATUS_VALUES = [
  "novo",
  "pendente",
  "venda",
  "nao_atende",
  "sem_interesse",
  "blacklist",
  "sem_cobertura_fibra",
  "cliente_fidelizado",
  "vodafone_client",
] as const;

export type ContactFilterStatusValue = (typeof CONTACT_STATUS_VALUES)[number];
export type ContactStatusValue = Exclude<ContactFilterStatusValue, "vodafone_client">;

/** UI "fechado" mapeia para venda (sem enum dedicado na BD). */
export function resolveContactStatusFilter(status?: string): string | undefined {
  if (!status || status === "todos") return undefined;
  if (status === "fechado") return "venda";
  if (status === "vodafone_client") return "vodafone_client";
  return status;
}

function sqlVendedorBypassManualExclusive(c: typeof contacts, vendedorId: number): SQL {
  return sql`(
    ${c.addedSource} <> 'manual'
    OR ${c.addedBy} IS NULL
    OR ${c.addedBy} = ${vendedorId}
    OR ${c.createdAt} <= DATE_SUB(NOW(), INTERVAL 48 HOUR)
  )` as SQL;
}

/** Condições partilhadas por contacts.list, countByStatus e export. */
export function buildContactsListConditions(
  user: Record<string, unknown> | null | undefined,
  input?: { search?: string; status?: string },
): SQL[] {
  const conditions: SQL[] = [];

  if (input?.search?.trim()) {
    const cleaned = input.search.trim().replace(/[%_\\\\]/g, "");
    if (cleaned.length > 0) {
      conditions.push(
        or(
          and(sql`${contacts.name} IS NOT NULL`, like(contacts.name, `%${cleaned}%`)),
          like(contacts.phone, `%${cleaned}%`),
        ) as SQL,
      );
    }
  }

  const resolvedStatus = resolveContactStatusFilter(input?.status);
  if (resolvedStatus === "vodafone_client") {
    conditions.push(eq(contacts.isVodafoneClient, true));
  } else if (resolvedStatus) {
    conditions.push(eq(contacts.status, resolvedStatus as ContactStatusValue));
  }

  const tcond = whereContactsForUser(user);
  if (tcond) conditions.push(tcond);

  const crmRole = String((user as { crmRole?: string })?.crmRole || "");
  const uid = Number((user as { id?: number })?.id);
  const utid = (user as { tenantId?: number })?.tenantId as number | undefined;

  if (crmRole === "vendedor" && uid) {
    conditions.push(eq(contacts.assignedTo, uid));
    conditions.push(sqlVendedorBypassManualExclusive(contacts, uid));
  }

  if (crmRole === "ce" && utid != null) {
    conditions.push(
      sql`NOT (
        ${contacts.status} IN ('novo')
        AND ${contacts.addedBy} IS NOT NULL
        AND ${contacts.addedBy} = ${contacts.assignedTo}
        AND ${contacts.addedBy} IN (
          SELECT id FROM users WHERE crmRole IN ('vendedor', 'cej') AND tenantId = ${utid}
        )
      )` as SQL,
    );
  }

  if (crmRole === "cej" && utid != null && uid) {
    conditions.push(
      sql`NOT (
        ${contacts.status} IN ('novo')
        AND ${contacts.addedBy} IS NOT NULL
        AND ${contacts.addedBy} = ${contacts.assignedTo}
        AND ${contacts.addedBy} <> ${uid}
        AND ${contacts.addedBy} IN (
          SELECT id FROM users WHERE crmRole IN ('vendedor', 'cej') AND tenantId = ${utid}
        )
      )` as SQL,
    );
  }

  return conditions;
}

/** @deprecated usar canExportContactsInventory em contactsInventory.ts */
export function canExportContacts(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || u?.crmRole === "ce" || u?.crmRole === "coordenador");
}

export function canManageUserDirectory(user: unknown): boolean {
  const u = user as { isSuperAdmin?: boolean; crmRole?: string } | null;
  return !!(u?.isSuperAdmin || ["cej", "ce", "coordenador"].includes(u?.crmRole || ""));
}

export function isSuperAdmin(user: { isSuperAdmin?: unknown } | null | undefined): boolean {
  return isSuperAdminUser(user);
}
