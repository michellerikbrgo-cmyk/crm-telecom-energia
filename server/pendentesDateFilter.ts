import { sql, type SQL } from "drizzle-orm";
import { pendentes } from "../drizzle/schema";

/** Aceita YYYY-MM-DD; compara só a data (ignora hora/fuso). */
export function parseDateOnlyYmd(raw: string): string | null {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export function pendentesReturnDateFromCondition(ymd: string): SQL {
  return sql`DATE(${pendentes.returnDate}) >= ${ymd}`;
}

export function pendentesReturnDateToCondition(ymd: string): SQL {
  return sql`DATE(${pendentes.returnDate}) <= ${ymd}`;
}
