import { eq } from "drizzle-orm";
import { sales } from "../drizzle/schema";

/** Gera identificador legível único, ex.: SALE-2026-48291 */
export async function generateUniquePublicSaleId(db: any): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = Math.floor(10000 + Math.random() * 90000);
    const id = `SALE-${year}-${n}`;
    const [ex] = await db.select({ id: sales.id }).from(sales).where(eq(sales.publicSaleId, id)).limit(1);
    if (!ex) return id;
  }
  throw new Error("Não foi possível gerar SALE_ID único.");
}
