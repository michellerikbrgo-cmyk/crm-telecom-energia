import { and, eq } from "drizzle-orm";
import { companies, users } from "../drizzle/schema";

/** Instância Drizzle ou transacção (`db.transaction`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = any;

/** Empresa raiz (coordenador) para um `coordinatorUserId`. */
export async function getRootCompanyForCoordinator(db: DbLike, coordinatorUserId: number) {
  const [row] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.coordinatorUserId, coordinatorUserId))
    .limit(1);
  return row ?? null;
}

/** Garante que `companyId` é a raiz do coordenador ou uma sub-empresa directa sob essa raiz. */
export async function assertCompanyInCoordinatorTree(
  db: DbLike,
  coordinatorUserId: number,
  companyId: number,
): Promise<void> {
  const root = await getRootCompanyForCoordinator(db, coordinatorUserId);
  if (!root) throw new Error("Empresa raiz não encontrada para este coordenador.");
  if (Number(root.id) === Number(companyId)) return;
  const [sub] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.parentCompanyId, root.id)))
    .limit(1);
  if (!sub) throw new Error("A empresa escolhida não pertence a este coordenador.");
}

/** Utilizador com papel de membro (vendedor/CEJ) deve estar numa sub-empresa (`parentCompanyId` não nulo). */
export async function assertUserIsSubCompanyTeamLeader(db: DbLike, userId: number): Promise<number> {
  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1);
  const cid = u?.companyId != null ? Number(u.companyId) : null;
  if (cid == null) throw new Error("Conta sem empresa (companyId).");
  const [c] = await db
    .select({ parentCompanyId: companies.parentCompanyId })
    .from(companies)
    .where(eq(companies.id, cid))
    .limit(1);
  if (!c?.parentCompanyId) {
    throw new Error("Só o Chefe de Equipa (sub-empresa) pode criar membros.");
  }
  return cid;
}

/** Visibilidade de contacto em memória (testes / reutilização). */
export function contactRowInUserCompanyScope(
  user: {
    isSuperAdmin?: unknown;
    crmRole?: string;
    tenantId?: number | null;
    companyId?: number | null;
  },
  row: { tenantId?: number | null; companyId?: number | null },
): boolean {
  const sa = user.isSuperAdmin === true || user.isSuperAdmin === 1 || user.isSuperAdmin === "1";
  if (sa) return true;
  const crm = String(user.crmRole || "");
  const ut = user.tenantId != null ? Number(user.tenantId) : null;
  const rt = row.tenantId != null ? Number(row.tenantId) : null;
  if (ut == null || rt == null || ut !== rt) return false;
  if (crm === "coordenador") return true;
  const uc = user.companyId != null ? Number(user.companyId) : null;
  const rc = row.companyId != null ? Number(row.companyId) : null;
  if (uc == null) return true;
  if (rc == null) return true;
  return uc === rc;
}
