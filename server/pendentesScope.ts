import type { SQL } from "drizzle-orm";
import { and, eq, inArray, or } from "drizzle-orm";
import { users } from "../drizzle/schema";
import type { getDb } from "./db";
import { isSuperAdminUser } from "./tenantScope";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Filtro de vendedorId para listagem de pendentes (Fase 3). */
export async function getPendenteVendedorIdsForUser(
  db: Db,
  user: Record<string, unknown>,
): Promise<number[] | "ALL"> {
  if (isSuperAdminUser(user)) return "ALL";
  const role = String(user.crmRole || "");
  const uid = Number(user.id);
  if (!uid) return [];

  if (role === "vendedor") return [uid];

  if (role === "coordenador") {
    const tid =
      user.tenantId != null ? Number(user.tenantId) : uid;
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tid));
    return rows.map((r) => r.id);
  }

  const tenantId =
    user.tenantId != null ? Number(user.tenantId) : NaN;
  const companyId =
    user.companyId != null ? Number(user.companyId) : null;

  if (role === "ce" && !Number.isNaN(tenantId)) {
    const parts: SQL[] = [eq(users.tenantId, tenantId)];
    if (companyId != null) parts.push(eq(users.companyId, companyId));
    parts.push(inArray(users.crmRole, ["vendedor", "cej"]));
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...parts));
    return rows.map((r) => r.id);
  }

  if (role === "cej" && !Number.isNaN(tenantId)) {
    const cejTeamId = user.teamId != null ? Number(user.teamId) : null;
    const teamLink: SQL = cejTeamId
      ? or(eq(users.teamLeaderJuniorId, uid), eq(users.teamId, cejTeamId))!
      : eq(users.teamLeaderJuniorId, uid);

    const parts: SQL[] = [eq(users.tenantId, tenantId), eq(users.crmRole, "vendedor"), teamLink];
    if (companyId != null) parts.push(eq(users.companyId, companyId));

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...parts));

    const ids = rows.map((r) => r.id);
    if (!ids.includes(uid)) ids.push(uid);
    return ids;
  }

  return [];
}
