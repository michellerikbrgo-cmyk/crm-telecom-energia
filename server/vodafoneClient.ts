import { and, eq, gte } from "drizzle-orm";
import { contactMatchesVodafoneAutomation } from "@shared/vodafoneClientAutomation";
import { contactSubcontacts, contacts } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const VODAFONE_CATEGORY = "vodafone_client";
const VODAFONE_LOSS = "Cliente Vodafone (automático)";

/**
 * Se origem/lista corresponder às regras automáticas, marca o contacto, regista sub-contacto
 * e retira da discagem (status sem interesse quando ainda era lead frio / tentativa).
 */
export async function applyAutomaticVodafoneClientIfNeeded(db: Db, contactId: number): Promise<void> {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!row) return;

  if (!row.isVodafoneClient && !contactMatchesVodafoneAutomation(row.origin, row.listName)) {
    return;
  }

  if (!row.isVodafoneClient) {
    const patch: Record<string, unknown> = { isVodafoneClient: true };
    const st = String(row.status);
    if (st === "novo" || st === "em_contacto" || st === "nao_atende") {
      patch.status = "sem_interesse";
      patch.lossReason = row.lossReason || VODAFONE_LOSS;
      patch.assignedTo = null;
      patch.lastAssignedAt = null;
    }
    await db.update(contacts).set(patch as any).where(eq(contacts.id, contactId));
  }

  const [fresh] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!fresh?.isVodafoneClient) return;

  await db
    .insert(contactSubcontacts)
    .values({
      contactId: fresh.id,
      phone: fresh.phone,
      category: VODAFONE_CATEGORY,
      source: "automatic",
    })
    .onDuplicateKeyUpdate({ set: { source: "automatic" } });
}

/** Após importação em massa: aplica regras a linhas criadas desde `createdAfter` (tenant e/ou utilizador que importou). */
export async function batchApplyVodafoneAutomationAfterBulk(
  db: Db,
  opts: { tenantId: number | null; createdAfter: Date; addedByUserId: number },
): Promise<void> {
  const parts = [gte(contacts.createdAt, opts.createdAfter), eq(contacts.addedBy, opts.addedByUserId)];
  if (opts.tenantId != null) parts.push(eq(contacts.tenantId, opts.tenantId));
  const rows = await db
    .select({ id: contacts.id, origin: contacts.origin, listName: contacts.listName })
    .from(contacts)
    .where(and(...parts));

  for (const r of rows) {
    if (contactMatchesVodafoneAutomation(r.origin, r.listName)) {
      await applyAutomaticVodafoneClientIfNeeded(db, r.id);
    }
  }
}
