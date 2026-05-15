import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type AdminJobState = "idle" | "running" | "success" | "error";

export type AdminJobStatus = {
  state: AdminJobState;
  startedAt?: string;
  finishedAt?: string;
  startedByUserId?: number;
  startedByEmail?: string | null;
  exitCode?: number | null;
  outputTail?: string;
  message?: string;
};

const RUNNING_STALE_MS = 20 * 60 * 1000;
const DB_SYNC_STALE_MS = 10 * 60 * 1000;
const BACKUP_STALE_MS = 45 * 60 * 1000;

function projectRoot(): string {
  return process.cwd();
}

async function readStatusFile(relPath: string, staleMs: number): Promise<AdminJobStatus> {
  const full = join(projectRoot(), ...relPath.split("/"));
  try {
    if (!existsSync(full)) return { state: "idle" };
    const raw = JSON.parse(await readFile(full, "utf8")) as AdminJobStatus;
    if (!raw?.state) return { state: "idle" };

    if (raw.state === "running" && raw.startedAt) {
      const started = new Date(raw.startedAt).getTime();
      if (!Number.isNaN(started) && Date.now() - started > staleMs) {
        return {
          ...raw,
          state: "error",
          message: "Operação em curso há demasiado tempo (possível interrupção).",
        };
      }
    }
    return raw;
  } catch {
    return { state: "idle" };
  }
}

export async function readDeployStatus(): Promise<AdminJobStatus> {
  return readStatusFile("data/deploy-status.json", RUNNING_STALE_MS);
}

export async function readDbSyncStatus(): Promise<AdminJobStatus> {
  return readStatusFile("data/db-sync-status.json", DB_SYNC_STALE_MS);
}

export async function readBackupSystemStatus(): Promise<AdminJobStatus> {
  return readStatusFile("data/backup-system-status.json", BACKUP_STALE_MS);
}

export async function readBackupDatabaseStatus(): Promise<AdminJobStatus> {
  return readStatusFile("data/backup-database-status.json", BACKUP_STALE_MS);
}

export async function isAnyAdminJobRunning(): Promise<boolean> {
  const [deploy, db, sys, dbBk] = await Promise.all([
    readDeployStatus(),
    readDbSyncStatus(),
    readBackupSystemStatus(),
    readBackupDatabaseStatus(),
  ]);
  return (
    deploy.state === "running" ||
    db.state === "running" ||
    sys.state === "running" ||
    dbBk.state === "running"
  );
}
