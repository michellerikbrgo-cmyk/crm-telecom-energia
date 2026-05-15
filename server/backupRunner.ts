import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  isAnyAdminJobRunning,
  readBackupDatabaseStatus,
  readBackupSystemStatus,
  type AdminJobStatus,
} from "./adminJobStatus";

export type BackupFileInfo = {
  name: string;
  sizeBytes: number;
  createdAt: string;
  label: "actual" | "anterior";
};

export type BackupInventory = {
  system: BackupFileInfo[];
  database: BackupFileInfo[];
};

const KEEP = 2;

function projectRoot(): string {
  return process.cwd();
}

function backupDir(kind: "system" | "database"): string {
  return join(projectRoot(), "data", "backups", kind);
}

function extensionFor(kind: "system" | "database"): string {
  return kind === "system" ? ".tar.gz" : ".sql.gz";
}

async function writeBackupStatus(kind: "system" | "database", status: AdminJobStatus): Promise<void> {
  await mkdir(join(projectRoot(), "data"), { recursive: true });
  await writeFile(
    join(projectRoot(), "data", `backup-${kind}-status.json`),
    JSON.stringify(status, null, 2),
    "utf8",
  );
}

function spawnBackupScript(kind: "system" | "database", actor: { id: number; email?: string | null }) {
  const script = join(projectRoot(), "scripts", `backup-${kind}-ui.mjs`);
  const startedAt = new Date().toISOString();

  void writeBackupStatus(kind, {
    state: "running",
    startedAt,
    startedByUserId: actor.id,
    startedByEmail: actor.email ?? null,
    outputTail: "",
    message: kind === "system" ? "A criar arquivo do sistema…" : "A exportar base de dados…",
  });

  const child = spawn(process.execPath, [script], {
    cwd: projectRoot(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DEPLOY_UI_ACTOR: actor.email || String(actor.id) },
  });
  child.unref();

  child.on("error", async (err) => {
    await writeBackupStatus(kind, {
      state: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: actor.id,
      startedByEmail: actor.email ?? null,
      message: `Não foi possível iniciar: ${err.message}`,
    });
  });
}

async function startBackup(
  kind: "system" | "database",
  actor: { id: number; email?: string | null },
): Promise<{ started: boolean; message?: string }> {
  if (process.env.DEPLOY_UI_DISABLED === "1" || process.env.DEPLOY_UI_DISABLED === "true") {
    return {
      started: false,
      message: "Operações de manutenção pela interface estão desactivadas (DEPLOY_UI_DISABLED).",
    };
  }

  if (await isAnyAdminJobRunning()) {
    return {
      started: false,
      message: "Já existe uma operação em curso. Aguarde a conclusão.",
    };
  }

  const current =
    kind === "system" ? await readBackupSystemStatus() : await readBackupDatabaseStatus();
  if (current.state === "running") {
    return { started: false, message: "Já existe um backup deste tipo em curso." };
  }

  spawnBackupScript(kind, actor);
  return { started: true };
}

export const startSystemBackup = (actor: { id: number; email?: string | null }) =>
  startBackup("system", actor);

export const startDatabaseBackup = (actor: { id: number; email?: string | null }) =>
  startBackup("database", actor);

export function listBackupInventory(): BackupInventory {
  const readKind = (kind: "system" | "database"): BackupFileInfo[] => {
    const dir = backupDir(kind);
    const ext = extensionFor(kind);
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(ext))
      .map((name) => {
        const full = join(dir, name);
        const st = statSync(full);
        return {
          name,
          sizeBytes: st.size,
          createdAt: st.mtime.toISOString(),
          mtime: st.mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, KEEP);

    const labels: Array<"actual" | "anterior"> = ["actual", "anterior"];
    return files.map((f, i) => ({
      name: f.name,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
      label: labels[i] ?? "anterior",
    }));
  };

  return {
    system: readKind("system"),
    database: readKind("database"),
  };
}
