import { eq } from "drizzle-orm";
import { pendentes } from "../drizzle/schema";

/** Gera identificador legível único, ex.: PEND-2026-1024 */
export async function generateUniquePublicPendingId(db: any): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = Math.floor(1000 + Math.random() * 9000);
    const id = `PEND-${year}-${n}`;
    const rows = (await db
      .select({ id: pendentes.id })
      .from(pendentes)
      .where(eq(pendentes.publicPendingId, id))
      .limit(1)) as { id: number }[];
    if (!rows[0]) return id;
  }
  throw new Error("Não foi possível gerar PENDING_ID único.");
}
