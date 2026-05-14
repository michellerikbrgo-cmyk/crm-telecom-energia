import { and, asc, eq, exists, gte, inArray, isNull, isNotNull, lte, not, or, sql, type SQL } from "drizzle-orm";
import {
  blacklist,
  callFeedback,
  contactSubcontacts,
  contacts,
  crmNotifications,
  fidelizacoesTerminando,
  pendentes,
  callLogs,
  sales,
  users,
} from "../drizzle/schema";
import { isSuperAdminUser } from "./tenantScope";
import type { getDb } from "./db";
import { generateUniquePublicSaleId } from "./salePublicId";

export const FEEDBACK_DESTINATIONS = [
  "none",
  "no_interest",
  "vodafone_client",
  "other",
  "no_fiber_coverage",
  "fidelizado",
  "lead",
  "pendente",
] as const;
export type FeedbackDestination = (typeof FEEDBACK_DESTINATIONS)[number];

export const FIDEL_OPERADORAS = ["NOS", "MEO", "NOWO", "DIGI", "WOO", "AMIGO", "UZO"] as const;

export type SubmitAfterAnsweredInput = {
  contactId: number;
  destination: FeedbackDestination;
  observacoes?: string | null;
  pendenteReturnDate?: string | null;
  /** Obrigatório em todos os destinos (referência de fidelização). */
  fidelEndDate?: string | null;
  operadora?: (typeof FIDEL_OPERADORAS)[number] | null;
  pendentePriorityLevel?: number | null;
  pendenteSaleDetail?: Record<string, string> | null;
  titularTroca?: boolean | null;
  antigoTitularNome?: string | null;
  antigoTitularNif?: string | null;
  preAgendamentoAt?: string | null;
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function assertSameSubcompany(contact: { companyId?: number | null }, user: { companyId?: number | null; isSuperAdmin?: boolean }) {
  if (isSuperAdminUser(user as any)) return;
  const uc = user.companyId != null ? Number(user.companyId) : null;
  const cc = contact.companyId != null ? Number(contact.companyId) : null;
  if (uc != null && cc != null && uc !== cc) {
    throw new Error("O contacto não pertence à sua sub-empresa.");
  }
}

async function notifyFidelizacao(
  tx: any,
  opts: {
    message: string;
    link: string;
    submitterId: number;
    companyId: number | null;
    tenantId: number | null;
  },
) {
  const ids = new Set<number>([opts.submitterId]);
  /** Um chefe CE (`team_leader`) e um CEJ (`team_leader_junior`) por sub-empresa, se existirem. */
  if (opts.companyId != null) {
    const [ce] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, opts.companyId), eq(users.crmRole, "ce")))
      .orderBy(asc(users.id))
      .limit(1);
    const [cej] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, opts.companyId), eq(users.crmRole, "cej")))
      .orderBy(asc(users.id))
      .limit(1);
    if (ce?.id != null) ids.add(ce.id);
    if (cej?.id != null) ids.add(cej.id);
  } else if (opts.tenantId != null) {
    const [ce] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, opts.tenantId), eq(users.crmRole, "ce")))
      .orderBy(asc(users.id))
      .limit(1);
    const [cej] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, opts.tenantId), eq(users.crmRole, "cej")))
      .orderBy(asc(users.id))
      .limit(1);
    if (ce?.id != null) ids.add(ce.id);
    if (cej?.id != null) ids.add(cej.id);
  }
  for (const userId of Array.from(ids)) {
    await tx.insert(crmNotifications).values({
      userId,
      type: "fidelizacao",
      message: opts.message,
      link: opts.link,
    } as any);
  }
}

export async function executeSubmitAfterAnsweredCall(
  db: Db,
  user: { id: number; companyId?: number | null; tenantId?: number | null },
  input: SubmitAfterAnsweredInput,
): Promise<void> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  if (!contact) throw new Error("Contacto não encontrado");
  assertSameSubcompany(contact as any, user as any);

  const fidRaw = String(input.fidelEndDate ?? "").trim();
  if (!fidRaw) throw new Error("A data de fidelização é obrigatória.");
  const dataFidelRef = new Date(fidRaw.includes("T") ? fidRaw : `${fidRaw}T12:00:00`);
  if (Number.isNaN(dataFidelRef.getTime())) throw new Error("Data de fidelização inválida.");

  if (input.titularTroca) {
    if (!String(input.antigoTitularNome ?? "").trim()) {
      throw new Error("Indique o nome do antigo titular.");
    }
    if (!String(input.antigoTitularNif ?? "").trim()) {
      throw new Error("Indique o NIF do antigo titular.");
    }
  }

  if (input.destination === "fidelizado" && !input.operadora) {
    throw new Error("Seleccione a operadora para clientes fidelizados.");
  }

  const obs = input.observacoes?.trim() || null;
  const notesForLog = obs ?? undefined;

  const resolvedDestination: FeedbackDestination = input.destination;

  await db.transaction(async (tx) => {
    await tx.insert(callLogs).values({
      contactId: input.contactId,
      vendedorId: user.id,
      outcome: "atendeu",
      notes: notesForLog ?? null,
    } as any);

    await tx.insert(callFeedback).values({
      contactId: input.contactId,
      userId: user.id,
      destination: resolvedDestination,
      observacoes: obs,
    } as any);

    const baseAttempt = {
      lastAttemptAt: new Date(),
      attempts: sql`${contacts.attempts} + 1` as any,
    };

    switch (resolvedDestination) {
      case "none": {
        await tx
          .update(contacts)
          .set({
            status: "em_contacto",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            dataFidelizacao: dataFidelRef,
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
            dataFidelizacao: dataFidelRef,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "other": {
        await tx
          .update(contacts)
          .set({
            status: "outros",
            discardUntil: addDays(new Date(), 90),
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            dataFidelizacao: dataFidelRef,
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
            dataFidelizacao: dataFidelRef,
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
            dataFidelizacao: dataFidelRef,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "fidelizado": {
        const d = dataFidelRef;
        await tx.insert(fidelizacoesTerminando).values({
          contactId: input.contactId,
          dataFimFidelizacao: d,
          operadora: input.operadora,
          observacoes: obs,
          createdBy: user.id,
          companyId: user.companyId != null ? Number(user.companyId) : null,
        } as any);
        await tx
          .update(contacts)
          .set({
            status: "fidelizado",
            assignedTo: null,
            lastAssignedAt: null,
            notes: obs ?? contact.notes,
            dataFidelizacao: dataFidelRef,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));

        const nome = (contact.name && String(contact.name).trim()) || contact.phone || `#${contact.id}`;
        const dataStr = d.toLocaleDateString("pt-PT");
        const msg = `Cliente ${nome} com fidelização a terminar em ${dataStr}. Operadora: ${input.operadora}.`;
        await notifyFidelizacao(tx, {
          message: msg,
          link: "/discador",
          submitterId: user.id,
          companyId: user.companyId != null ? Number(user.companyId) : null,
          tenantId: contact.tenantId != null ? Number(contact.tenantId) : null,
        });
        break;
      }
      case "lead": {
        await tx
          .update(contacts)
          .set({
            status: "em_contacto",
            isLead: true,
            notes: obs ?? contact.notes,
            dataFidelizacao: dataFidelRef,
            ...baseAttempt,
          } as any)
          .where(eq(contacts.id, input.contactId));
        break;
      }
      case "pendente": {
        if (!input.pendenteReturnDate) throw new Error("Defina data de retorno para o pendente.");
        const pr = Math.min(5, Math.max(1, Math.floor(Number(input.pendentePriorityLevel ?? 3))));
        const det = input.pendenteSaleDetail ?? {};
        const prodRaw = String(det.produto ?? det.PRODUTO ?? "telecom").toLowerCase();
        const product = prodRaw.includes("energ") ? "energia" : "telecom";
        const preAgRaw = String(input.preAgendamentoAt ?? det.pre_agendamento ?? det.PRE_AGENDAMENTO ?? "").trim();
        const preAg = preAgRaw ? new Date(preAgRaw) : null;
        if (preAgRaw && preAg && Number.isNaN(preAg.getTime())) {
          throw new Error("Data/hora de pré-agendamento inválida.");
        }

        const publicSaleId = await generateUniquePublicSaleId(tx);
        const detailJson = Object.keys(det).length ? JSON.stringify(det) : null;

        await tx.insert(sales).values({
          contactId: input.contactId,
          vendedorId: user.id,
          product,
          status: "pendente",
          publicSaleId,
          titularTroca: !!input.titularTroca,
          antigoTitularNome: input.antigoTitularNome?.trim() || null,
          antigoTitularNif: input.antigoTitularNif?.trim() || null,
          preAgendamentoAt: preAg && !Number.isNaN(preAg.getTime()) ? preAg : null,
          saleDetailJson: detailJson,
          offer: String(det.oferta ?? det.OFERTA ?? "").trim() || null,
          value: String(det.valor_final ?? det.VALOR_FINAL ?? "").trim() || null,
        } as any);

        await tx.insert(pendentes).values({
          contactId: input.contactId,
          vendedorId: user.id,
          returnDate: new Date(input.pendenteReturnDate),
          notes: obs,
          offerDesired: null,
          status: "agendado",
          priorityLevel: pr,
        } as any);
        await tx
          .update(contacts)
          .set({
            status: "pendente",
            notes: obs ?? contact.notes,
            dataFidelizacao: dataFidelRef,
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
  }  );
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
    and(
      inArray(contacts.status, ["sem_interesse", "outros"]),
      or(isNull(contacts.discardUntil), lte(contacts.discardUntil, sql`NOW()`)),
    ),
    and(
      eq(contacts.status, "fidelizado"),
      not(
        exists(
          db
            .select({ id: fidelizacoesTerminando.id })
            .from(fidelizacoesTerminando)
            .where(
              and(
                eq(fidelizacoesTerminando.contactId, contacts.id),
                gte(fidelizacoesTerminando.dataFimFidelizacao, sql`CURDATE()`),
              ),
            ),
        ),
      ),
    ),
  ) as SQL;
}
