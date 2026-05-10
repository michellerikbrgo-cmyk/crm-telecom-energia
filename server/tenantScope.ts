import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { contacts, sosRequests, teams, users } from "../drizzle/schema";

/**
 * Equipa em contexto (CE sem teamId na conta resolve pela equipa onde é líder).
 */
export async function resolveUserTeamScopeId(
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

export function isSuperAdminUser(u: { isSuperAdmin?: unknown } | null | undefined): boolean {
  const v = u?.isSuperAdmin;
  return v === true || v === 1 || v === "1";
}

/**
 * `users.tenantId` = id do **Coordenador** dono da empresa (tenant).
 * O próprio coordenador tem tenantId = próprio id após criação pelo super admin.
 */
export function getScopedTenantCoordinatorUserId(
  u: { tenantId?: number | null; isSuperAdmin?: unknown } | null | undefined,
): number | null | "ALL" {
  if (isSuperAdminUser(u)) return "ALL";
  const tid = u?.tenantId;
  if (tid == null || tid === undefined) return null;
  return Number(tid);
}

export function contactBelongsToUserTenant(
  row: { tenantId?: number | null },
  u: { tenantId?: number | null; isSuperAdmin?: unknown },
): boolean {
  const scope = getScopedTenantCoordinatorUserId(u);
  if (scope === "ALL") return true;
  if (scope === null) return false;
  return row.tenantId != null && Number(row.tenantId) === scope;
}

/** Condição WHERE para contactos conforme o utilizador. Super admin: sem filtro extra. */
export function whereContactsForUser(u: Record<string, unknown> | null | undefined): SQL | undefined {
  const scope = getScopedTenantCoordinatorUserId(u as any);
  if (scope === "ALL") return undefined;
  if (scope === null) return sql`1=0`;
  return eq(contacts.tenantId, scope);
}

/** Condição WHERE para linha de utilizadores (lista / supervisão). */
export function whereUsersForUser(u: Record<string, unknown> | null | undefined): SQL | undefined {
  const scope = getScopedTenantCoordinatorUserId(u as any);
  if (scope === "ALL") return undefined;
  if (scope === null) return sql`1=0`;
  return eq(users.tenantId, scope);
}

/** SOS / pedidos de ajuda — mesmo tenant que contactos/utilizadores. */
export function whereSosRequestsForUser(u: Record<string, unknown> | null | undefined): SQL | undefined {
  const scope = getScopedTenantCoordinatorUserId(u as any);
  if (scope === "ALL") return undefined;
  if (scope === null) return sql`1=0`;
  return eq(sosRequests.tenantId, scope);
}

export async function getUserIdsInTenant(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  u: Record<string, unknown> | null | undefined,
): Promise<number[] | "ALL"> {
  if (isSuperAdminUser(u)) return "ALL";
  const scope = getScopedTenantCoordinatorUserId(u as any);
  if (scope === null || scope === "ALL") return [];
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, scope));
  return rows.map((r) => r.id);
}

export function whereInTenantUserIds(sellerIds: number[] | "ALL", column: any): SQL | undefined {
  if (sellerIds === "ALL") return undefined;
  if (sellerIds.length === 0) return sql`1=0`;
  return inArray(column, sellerIds);
}

/** Junta condições opcionais AND. */
export function andOptional(base: SQL | undefined, extra: SQL | undefined): SQL | undefined {
  if (!base) return extra;
  if (!extra) return base;
  return and(base, extra);
}
