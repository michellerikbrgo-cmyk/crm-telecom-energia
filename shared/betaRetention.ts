import { BETA_COMPLETED_RETENTION_DAYS } from "./const";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Data-alvo de remoção automática (aceite + completedAt ou legacy status completed). */
export function betaPurgeDeadlineMs(row: {
  status: string;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}): number | null {
  const done = row.status === "completed" || row.completedAt != null;
  if (!done) return null;
  let t: number | null = null;
  if (row.completedAt != null) {
    t = new Date(row.completedAt as string | number | Date).getTime();
  } else if (row.status === "completed" && row.updatedAt != null) {
    t = new Date(row.updatedAt as string | number | Date).getTime();
  }
  if (t == null || Number.isNaN(t)) return null;
  return t + BETA_COMPLETED_RETENTION_DAYS * MS_PER_DAY;
}
