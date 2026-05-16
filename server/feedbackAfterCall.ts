import { and, eq, exists, isNull, isNotNull, lte, not, or, sql, type SQL } from "drizzle-orm";
import {
  blacklist,
  callFeedback,
  contactSubcontacts,
  contacts,
  callLogs,
  users,
} from "../drizzle/schema";
import { resolveBlacklistInsertScope } from "./blacklistScope";
import { isSuperAdminUser } from "./tenantScope";
import type { getDb } from "./db";

export const FEEDBACK_DESTINATIONS = [
  "nao_atende",
  "no_interest",
  "vodafone_client",
  "no_fiber_coverage",
  "lista_negra",
] as const;
export type FeedbackDestination = (typeof FEEDBACK_DESTINATIONS)[number];

export type SubmitAfterAnsweredInput = {
  contactId: number;
  destination: FeedbackDestination;
  observacoes?: string | null;
  /** Opcional (legado / referência interna). */
  fidelEndDate?: string | null;
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function assertSameSubcompany(
  contact: { companyId?: number | null },
  user: { companyId?: number | null; isSuperAdmin?: boolean },
) {
  if (isSuperAdminUser(user as any)) return;
  const uc = user.companyId != null ? Number(user.companyId) : null;
  const cc = contact.companyId != null ? Number(contact.companyId) : null;
  if (uc != null && cc != null && uc !== cc) {
    throw new Error("O contacto não pertence à sua sub-empresa.");
  }
}

function optionalFidelDate(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function executeSubmitAfterAnsweredCall(
  db: Db,
  user: { id: number; companyId?: number | null; tenantId?: number | null; crmRole?: string; teamId?: number | null; isSuperAdmin?: boolean },
  input: SubmitAfterAnsweredInput,
): Promise<void> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  if (!contact) throw new Error("Contacto não encontrado");
  assertSameSubcompany(contact as any, user as any);

  const dataFidelOpt = optionalFidelDate(input.fidelEndDate);

  const obs = input.observacoes?.trim() || null;
  const notesForLog = obs ?? undefined;
  const resolvedDestination: FeedbackDestination = input.destination;

  const fidelPatch = dataFidelOpt ? { dataFidelizacao: dataFidelOpt } : {};

  await db.transaction(async (tx) => {
    const logOutcome =
      resolvedDestination === "nao_atende" ? ("nao_atende" as const) : ("atendeu" as const);
    await tx.insert(callLogs).values({
      contactId: input.contactId,
      vendedorId: user.id,
      outcome: logOutcome,
      notes: notesForLog ?? null,
    } as any);

    if (resolvedDestination !== "nao_atende") {
      await tx.insert(callFeedback).values({
        contactId: input.contactId,
        userId: user.id,
        destination: resolvedDestination,
        observacoes: obs,
      } as any);
    }

    const baseAttempt = {
      lastAttemptAt: new Date(),
      attempts: sql`${contacts.attempts} + 1` as any,
    };

    switch (resolvedDestination) {
      case "nao_atende": {
        await tx
          .update(contacts)
          .set({
            status: "nao_atende",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            ...fidelPatch,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "no_interest": {
        await tx
          .update(contacts)
          .set({
            status: "sem_interesse",
            discardUntil: addDays(new Date(), 90),
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            ...fidelPatch,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "vodafone_client": {
        await tx
          .update(contacts)
          .set({
            isVodafoneClient: true,
            status: "sem_interesse",
            lossReason: "Cliente Vodafone",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            ...fidelPatch,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        await tx
          .insert(contactSubcontacts)
          .values({
            contactId: input.contactId,
            phone: contact.phone,
            category: "vodafone_client",
            source: "feedback",
          } as any)
          .onDuplicateKeyUpdate({ set: { source: "feedback" } });
        break;
      }
      case "no_fiber_coverage": {
        await tx
          .update(contacts)
          .set({
            status: "sem_cobertura_fibra",
            discardUntil: null,
            lossReason: "Sem cobertura de fibra",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            ...fidelPatch,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "lista_negra": {
        const phone = String(contact.phone || "").trim();
        if (!phone) throw new Error("Contacto sem telefone.");
        const scope = await resolveBlacklistInsertScope(tx as any, user as any);
        await tx.insert(blacklist).values({
          phone,
          tenantId: scope.tenantId,
          teamId: scope.teamId,
          companyId: scope.companyId,
          reason: obs,
          addedBy: user.id,
        } as any);
        await tx
          .update(contacts)
          .set({
            status: "blacklist",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            ...fidelPatch,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      default:
        throw new Error("Destino inválido.");
    }

    await tx
      .update(users)
      .set({
        dialerState: "idle",
        dialerContactId: null,
        dialerUpdatedAt: new Date(),
      } as any)
      .where(eq(users.id, user.id));
  });
}

/** Exclui contactos cujo telefone está na lista negra da sub-empresa (ou legado por tenant). */
export function dialerBlacklistExcludeSql(db: Db): SQL {
  return not(
    exists(
      db
        .select({ id: blacklist.id })
        .from(blacklist)
        .where(
          and(
            eq(blacklist.phone, contacts.phone),
            or(
              and(isNotNull(blacklist.companyId), eq(blacklist.companyId, contacts.companyId)),
              and(isNull(blacklist.companyId), eq(blacklist.tenantId, contacts.tenantId)),
            ),
          ),
        ),
    ),
  ) as SQL;
}

/** Estados elegíveis para a fila aleatória do discador (centralizado). */
export function dialerStatusEligibleSql(db: Db): SQL {
  return or(
    eq(contacts.status, "novo"),
    eq(contacts.status, "nao_atende"),
    and(
      eq(contacts.status, "sem_interesse"),
      or(isNull(contacts.discardUntil), lte(contacts.discardUntil, sql`NOW()`)),
    ),
  ) as SQL;
}
