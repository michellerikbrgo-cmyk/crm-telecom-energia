import type { SQL } from "drizzle-orm";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { teams, users } from "../drizzle/schema";
import { isSuperAdminUser, whereUsersForUser } from "./tenantScope";
import type { getDb } from "./db";

type EquipaManageDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** MySQL às vezes devolve 0/1 em vez de boolean. */
export function truthyFlag(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

export function canAccessEquipaHub(u: Record<string, unknown> | null | undefined): boolean {
  if (!u) return false;
  if (truthyFlag(u.isSuperAdmin)) return true;
  return ["ce", "coordenador", "cej"].includes(String(u.crmRole || ""));
}

function tenantIdForUser(u: Record<string, unknown>): number | null {
  const role = String(u.crmRole || "");
  if (role === "coordenador") {
    const tid = u.tenantId != null ? Number(u.tenantId) : Number(u.id);
    return Number.isNaN(tid) ? null : tid;
  }
  const tid = u.tenantId != null ? Number(u.tenantId) : NaN;
  return Number.isNaN(tid) ? null : tid;
}

/** Condições SQL para listar membros visíveis no hub Equipa (Fase 1). */
export function buildEquipaMembersWhere(currentUser: Record<string, unknown>): SQL[] {
  if (!canAccessEquipaHub(currentUser)) return [eq(users.id, -1)];

  const parts: SQL[] = [];

  if (isSuperAdminUser(currentUser)) {
    const uw = whereUsersForUser(currentUser);
    if (uw) parts.push(uw);
    return parts;
  }

  const role = String(currentUser.crmRole || "");
  const uid = Number(currentUser.id);
  const tid = tenantIdForUser(currentUser);
  if (tid == null) return [eq(users.id, -1)];

  parts.push(eq(users.tenantId, tid));

  const myCcid = (currentUser as { companyId?: number | null }).companyId;
  const companyPart =
    myCcid != null && !Number.isNaN(Number(myCcid)) ? eq(users.companyId, Number(myCcid)) : undefined;

  if (role === "coordenador") {
    return parts;
  }

  if (role === "ce") {
    if (companyPart) parts.push(companyPart);
    parts.push(inArray(users.crmRole, ["vendedor", "cej"]));
    return parts;
  }

  if (role === "cej") {
    /** CEJ: vendedores sob reporte directo, mesma equipa (teamId), equipas onde o CEJ é leaderId, ou mesma sub-empresa (companyId). */
    parts.push(eq(users.crmRole, "vendedor"));
    const cejTeamId =
      (currentUser as { teamId?: number | null }).teamId != null
        ? Number((currentUser as { teamId?: number | null }).teamId)
        : null;
    const ledTeamCond = sql`EXISTS (
      SELECT 1 FROM ${teams} t
      WHERE t.id = ${users.teamId} AND t.leaderId = ${uid}
    )` as SQL;
    const companyMatch =
      myCcid != null && !Number.isNaN(Number(myCcid)) ? eq(users.companyId, Number(myCcid)) : undefined;
    const hierarchyParts: SQL[] = [eq(users.teamLeaderJuniorId, uid), ledTeamCond];
    if (cejTeamId != null && !Number.isNaN(cejTeamId)) {
      hierarchyParts.push(eq(users.teamId, cejTeamId));
    }
    if (companyMatch) hierarchyParts.push(companyMatch);
    parts.push(or(...hierarchyParts)!);
    return parts;
  }

  return [eq(users.id, -1)];
}

/** Verifica se o utilizador autenticado pode gerir o alvo (edição / bloqueio). */
export async function assertCanManageEquipaMember(
  db: EquipaManageDb,
  currentUser: Record<string, unknown>,
  target: {
    id: number;
    crmRole: string | null;
    tenantId: number | null;
    companyId?: number | null;
    teamLeaderJuniorId?: number | null;
    teamId?: number | null;
  },
): Promise<void> {
  if (!canAccessEquipaHub(currentUser)) {
    throw new Error("Sem permissão.");
  }

  if (isSuperAdminUser(currentUser)) return;

  const role = String(currentUser.crmRole || "");
  const uid = Number(currentUser.id);
  const tid = tenantIdForUser(currentUser);
  if (tid == null || Number(target.tenantId) !== tid) {
    throw new Error("Utilizador de outra empresa.");
  }

  if (role === "coordenador") {
    if (target.crmRole === "coordenador" && target.id !== uid) {
      throw new Error("Não pode editar outro coordenador.");
    }
    return;
  }

  if (role !== "cej") {
    const myCcid = (currentUser as { companyId?: number | null }).companyId;
    if (
      myCcid != null &&
      target.companyId != null &&
      Number(target.companyId) !== Number(myCcid)
    ) {
      throw new Error("Utilizador de outra sub-empresa.");
    }
  }

  if (role === "cej") {
    if (target.crmRole !== "vendedor") {
      throw new Error("CEJ só pode gerir vendedores da sua carteira.");
    }
    const cejTeamId = (currentUser as { teamId?: number | null }).teamId;
    const myCcid = (currentUser as { companyId?: number | null }).companyId;
    const companyMatch =
      myCcid != null &&
      target.companyId != null &&
      Number(target.companyId) === Number(myCcid);
    const linkedByLeader = Number(target.teamLeaderJuniorId) === uid;
    const linkedByTeam =
      cejTeamId != null &&
      target.teamId != null &&
      Number(target.teamId) === Number(cejTeamId);
    let linkedByLedTeam = false;
    if (target.teamId != null) {
      const [row] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.id, Number(target.teamId)), eq(teams.leaderId, uid)))
        .limit(1);
      linkedByLedTeam = !!row;
    }
    if (!linkedByLeader && !linkedByTeam && !linkedByLedTeam && !companyMatch) {
      throw new Error("Este vendedor não está vinculado ao seu CEJ ou equipa.");
    }
    return;
  }

  if (role === "ce") {
    if (!["vendedor", "cej"].includes(String(target.crmRole))) {
      throw new Error("CE só pode gerir vendedores e CEJ da sub-empresa.");
    }
    return;
  }

  throw new Error("Sem permissão.");
}
