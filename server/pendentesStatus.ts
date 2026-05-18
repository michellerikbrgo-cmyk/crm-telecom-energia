import { inArray } from "drizzle-orm";
import { pendentes } from "../drizzle/schema";

/** Pendentes ainda em fila (agendados ou cliente fidelizado com retorno). */
export const PENDENTE_OPEN_STATUSES = ["agendado", "fidelizado"] as const;

export function wherePendenteOpenStatus() {
  return inArray(pendentes.status, [...PENDENTE_OPEN_STATUSES]);
}
