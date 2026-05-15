#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ROOT,
  backupDir,
  readStatus,
  rotateBackups,
  tail,
  timestampSlug,
  writeStatus,
} from "./backup-lib.mjs";

async function main() {
  const prev = await readStatus("system");
  let output = "";
  try {
    const dir = backupDir("system");
    await mkdir(dir, { recursive: true });
    const name = `system-${timestampSlug()}.tar.gz`;
    const outPath = join(dir, name);

    execSync(
      `tar -czf ${JSON.stringify(outPath)} ` +
        `--exclude=node_modules --exclude=dist --exclude=.git ` +
        `--exclude=data/backups --exclude=local --exclude='*.log' ` +
        `-C ${JSON.stringify(ROOT)} .`,
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );

    const rotated = rotateBackups("system", ".tar.gz");
    output = `Criado: ${name}\n`;
    if (rotated.removed.length) {
      output += `Removidos (retenção ${2}): ${rotated.removed.join(", ")}\n`;
    }

    await writeStatus("system", {
      state: "success",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: 0,
      outputTail: tail(output),
      message: `Backup do sistema guardado (${name}). Mantidos: actual + anterior.`,
      lastFile: name,
    });
    console.log("[backup-system] OK", name);
  } catch (e) {
    const err = e;
    output = tail([output, err?.stderr?.toString?.(), err?.stdout?.toString?.(), err?.message].filter(Boolean).join("\n"));
    await writeStatus("system", {
      state: "error",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: err?.status ?? 1,
      outputTail: output,
      message: `Backup do sistema falhou (código ${err?.status ?? 1}).`,
    });
    console.error("[backup-system] FAIL", err?.message || err);
    process.exit(1);
  }
}

main();
