import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  isAnyAdminJobRunning,
  readDeployStatus,
  type AdminJobStatus,
} from "./adminJobStatus";

export type DeployStatus = AdminJobStatus;
export { readDeployStatus };

function projectRoot(): string {
  return process.cwd();
}

async function writeDeployStatus(status: DeployStatus): Promise<void> {
  await mkdir(join(projectRoot(), "data"), { recursive: true });
  await writeFile(
    join(projectRoot(), "data", "deploy-status.json"),
    JSON.stringify(status, null, 2),
    "utf8",
  );
}

export async function startDeployPm2(actor: {
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

  const current = await readDeployStatus();
  if (current.state === "running") {
    return {
      started: false,
      message: "Já existe um deploy em curso. Aguarde a conclusão.",
    };
  }

  const startedAt = new Date().toISOString();
  await writeDeployStatus({
    state: "running",
    startedAt,
    startedByUserId: actor.id,
    startedByEmail: actor.email ?? null,
    outputTail: "",
    message: "Deploy em curso (migrações, build, reinício PM2)…",
  });

  const script = join(projectRoot(), "scripts", "deploy-pm2-ui.mjs");
  const child = spawn(process.execPath, [script], {
    cwd: projectRoot(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DEPLOY_UI_ACTOR: actor.email || String(actor.id),
      DEPLOY_NOTES: `Deploy via Super Admin (${actor.email || actor.id})`,
    },
  });
  child.unref();

  child.on("error", async (err) => {
    await writeDeployStatus({
      state: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: actor.id,
      startedByEmail: actor.email ?? null,
      message: `Não foi possível iniciar o deploy: ${err.message}`,
    });
  });

  return { started: true };
}
