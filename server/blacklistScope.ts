import type { getDb } from "./db";
import { isSuperAdminUser, resolveUserTeamScopeId } from "./tenantScope";

type BlacklistScopeDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type BlacklistInsertScope = {
  tenantId: number | null;
  teamId: number | null;
  companyId: number | null;
};

/**
 * Âmbito para inserir na lista negra.
 * teamId é opcional: utilizadores sem equipa ficam ao nível do tenant (e sub-empresa).
 */
export async function resolveBlacklistInsertScope(
  db: BlacklistScopeDb,
  user: {
    id: number;
    tenantId?: number | null;
    companyId?: number | null;
    crmRole?: string;
    teamId?: number | null;
    isSuperAdmin?: boolean;
  },
): Promise<BlacklistInsertScope> {
  if (isSuperAdminUser(user)) {
    return { tenantId: null, teamId: null, companyId: null };
  }

  const tid = user.tenantId as number | null | undefined;
  if (tid == null || tid === undefined) {
    throw new Error("Conta sem empresa (tenant); não é possível usar a lista negra.");
  }

  const companyId = user.companyId != null ? Number(user.companyId) : null;

  if (user.crmRole === "coordenador") {
    return { tenantId: tid, teamId: null, companyId };
  }

  const teamId = await resolveUserTeamScopeId(db as any, {
    id: user.id,
    teamId: user.teamId ?? null,
    crmRole: user.crmRole ?? "vendedor",
  });

  return { tenantId: tid, teamId: teamId ?? null, companyId };
}
