#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { spawn } from "node:child_process";
import {
  backupDir,
  parseMysqlUrl,
  readStatus,
  rotateBackups,
  tail,
  timestampSlug,
  writeStatus,
} from "./backup-lib.mjs";

function dumpToGzip(outPath, cfg) {
  return new Promise((resolve, reject) => {
    const args = [
      "-h",
      cfg.host,
      "-P",
      cfg.port,
      "-u",
      cfg.user,
      "--single-transaction",
      "--routines",
      "--triggers",
      "--set-gtid-purged=OFF",
      cfg.database,
    ];
    const dump = spawn("mysqldump", args, {
      env: { ...process.env, MYSQL_PWD: cfg.password },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = createWriteStream(outPath);
    const gzip = createGzip();
    let errText = "";
    dump.stderr.on("data", (d) => {
      errText += d.toString();
    });
    dump.on("error", reject);
    dump.on("close", (code) => {
      if (code !== 0) reject(new Error(errText || `mysqldump exit ${code}`));
    });
    pipeline(dump.stdout, gzip, out).then(resolve).catch(reject);
  });
}

async function main() {
  const prev = await readStatus("database");
  let output = "";
  try {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL em falta");

    const cfg = parseMysqlUrl(url);
    if (!cfg.database) throw new Error("Nome da base de dados inválido em DATABASE_URL");

    const dir = backupDir("database");
    await mkdir(dir, { recursive: true });
    const name = `database-${timestampSlug()}.sql.gz`;
    const outPath = join(dir, name);

    await dumpToGzip(outPath, cfg);

    const rotated = rotateBackups("database", ".sql.gz");
    output = `Criado: ${name} (${cfg.database}@${cfg.host})\n`;
    if (rotated.removed.length) {
      output += `Removidos (retenção ${2}): ${rotated.removed.join(", ")}\n`;
    }

    await writeStatus("database", {
      state: "success",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: 0,
      outputTail: tail(output),
      message: `Backup da base de dados guardado (${name}). Mantidos: actual + anterior.`,
      lastFile: name,
    });
    console.log("[backup-database] OK", name);
  } catch (e) {
    const err = e;
    output = tail([output, err?.message || String(err)].filter(Boolean).join("\n"));
    await writeStatus("database", {
      state: "error",
      startedAt: prev.startedAt,
      finishedAt: new Date().toISOString(),
      startedByUserId: prev.startedByUserId,
      startedByEmail: prev.startedByEmail,
      exitCode: 1,
      outputTail: output,
      message: "Backup da base de dados falhou.",
    });
    console.error("[backup-database] FAIL", err?.message || err);
    process.exit(1);
  }
}

main();
