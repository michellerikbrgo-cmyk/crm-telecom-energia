#!/usr/bin/env node
/**
 * Deploy iniciado pela UI Super Admin (processo separado — sobrevive ao pm2 restart).
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_PATH = join(ROOT, "data", "deploy-status.json");
const MAX_OUTPUT = 24_000;

async function readStatus() {
  if (!existsSync(STATUS_PATH)) return {};
  try {
    return JSON.parse(await readFile(STATUS_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function writeStatus(patch) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  const cur = await readStatus();
  await writeFile(STATUS_PATH, JSON.stringify({ ...cur, ...patch }, null, 2), "utf8");
}

function tail(s) {
  if (s.length <= MAX_OUTPUT) return s;
  return "…\n" + s.slice(-MAX_OUTPUT);
}

async function main() {
  const prev = await readStatus();
  let output = "";
  try {
    output = execSync("pnpm run deploy:pm2", {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        DEPLOY_NOTES:
          process.env.DEPLOY_NOTES?.trim() ||
          `Deploy via Super Admin (${process.env.DEPLOY_UI_ACTOR || "ui"})`,
      },
      maxBuffer: 32 * 1024 * 1024,
    });
    await writeStatus({
      state: "success",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: 0,
      outputTail: tail(output),
      message: "Deploy concluído com sucesso.",
    });
    console.log("[deploy-ui] OK");
  } catch (e) {
    const err = e;
    const stderr = err?.stderr?.toString?.() || "";
    const stdout = err?.stdout?.toString?.() || "";
    output = tail([stdout, stderr, err?.message || String(err)].filter(Boolean).join("\n"));
    await writeStatus({
      state: "error",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: err?.status ?? 1,
      outputTail: output,
      message: `Deploy falhou (código ${err?.status ?? 1}).`,
    });
    console.error("[deploy-ui] FAIL", err?.message || err);
    process.exit(1);
  }
}

main();
