import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  isAnyAdminJobRunning,
  readDbSyncStatus,
  type AdminJobStatus,
} from "./adminJobStatus";

export type DbSyncStatus = AdminJobStatus;
export { readDbSyncStatus };

function projectRoot(): string {
  return process.cwd();
}

async function writeDbSyncStatus(status: DbSyncStatus): Promise<void> {
  await mkdir(join(projectRoot(), "data"), { recursive: true });
  await writeFile(
    join(projectRoot(), "data", "db-sync-status.json"),
    JSON.stringify(status, null, 2),
    "utf8",
  );
}

export async function startDbSync(actor: {
  id: number;
  email?: string | null;
}): Promise<{ started: boolean; message?: string }> {
  if (process.env.DEPLOY_UI_DISABLED === "1" || process.env.DEPLOY_UI_DISABLED === "true") {
    return {
      started: false,
      message: "Operações de manutenção pela interface estão desactivadas (DEPLOY_UI_DISABLED).",
    };
  }

  if (await isAnyAdminJobRunning()) {
    return {
      started: false,
      message: "Já existe uma operação em curso (base de dados ou deploy). Aguarde a conclusão.",
    };
  }

  const startedAt = new Date().toISOString();
  await writeDbSyncStatus({
    state: "running",
    startedAt,
    startedByUserId: actor.id,
    startedByEmail: actor.email ?? null,
    outputTail: "",
    message: "A aplicar migrações Drizzle e reparar colunas em falta…",
  });

  const script = join(projectRoot(), "scripts", "db-sync-ui.mjs");
  const child = spawn(process.execPath, [script], {
    cwd: projectRoot(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DEPLOY_UI_ACTOR: actor.email || String(actor.id),
    },
  });
  child.unref();

  child.on("error", async (err) => {
    await writeDbSyncStatus({
      state: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: actor.id,
      startedByEmail: actor.email ?? null,
      message: `Não foi possível iniciar: ${err.message}`,
    });
  });

  return { started: true };
}
