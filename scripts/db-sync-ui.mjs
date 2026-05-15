#!/usr/bin/env node
/**
 * Sincroniza a BD com o schema (migrações Drizzle + reparação idempotente).
 * Iniciado pela UI Super Admin em processo separado.
 */
import { execSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_PATH = join(ROOT, "data", "db-sync-status.json");
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

function runStep(cmd, label) {
  return `\n--- ${label} ---\n${execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  })}`;
}

async function main() {
  const prev = await readStatus();
  let output = "";
  try {
    output += runStep("pnpm exec drizzle-kit migrate", "drizzle-kit migrate");
    output += runStep("pnpm run db:repair", "db:repair (colunas em falta)");
    await writeStatus({
      state: "success",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: 0,
      outputTail: tail(output),
      message: "Base de dados actualizada a partir do schema.",
    });
    console.log("[db-sync-ui] OK");
  } catch (e) {
    const err = e;
    const stderr = err?.stderr?.toString?.() || "";
    const stdout = err?.stdout?.toString?.() || "";
    output = tail([output, stdout, stderr, err?.message || String(err)].filter(Boolean).join("\n"));
    await writeStatus({
      state: "error",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: err?.status ?? 1,
      outputTail: output,
      message: `Actualização da base de dados falhou (código ${err?.status ?? 1}).`,
    });
    console.error("[db-sync-ui] FAIL", err?.message || err);
    process.exit(1);
  }
}

main();
