#!/usr/bin/env node
/**
 * Grava uma entrada automática ao final do deploy (`pnpm run deploy:pm2`).
 * Copia bootstrap para data/release-log.json na primeira vez, depois insere sempre no topo.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data", "release-log.json");
const BOOT_PATH = join(ROOT, "release-log-bootstrap.json");
const PKG_PATH = join(ROOT, "package.json");
/** Alinhado com @shared/const RELEASE_LOG_RETENTION_DAYS */
const RELEASE_LOG_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

function parseEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.entries && Array.isArray(raw.entries)) return raw.entries;
  return [];
}

function gitSubject() {
  try {
    return execSync("git log -1 --pretty=%s", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(PKG_PATH, "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version : "unknown";
  const deployRef =
    process.env.DEPLOY_REF?.trim()?.slice(0, 40) ||
    process.env.GITHUB_SHA?.trim()?.slice(0, 12) ||
    null;
  const subject = gitSubject();
  const summary =
    process.env.DEPLOY_NOTES?.trim() ||
    (subject ? `Deploy: ${subject}` : `Build e reinício (${version})`);

  let entries = [];
  if (!existsSync(DATA_PATH)) {
    await mkdir(join(ROOT, "data"), { recursive: true });
    if (existsSync(BOOT_PATH)) {
      const bootRaw = JSON.parse(await readFile(BOOT_PATH, "utf8"));
      entries = [...parseEntries(bootRaw)];
    }
  } else {
    try {
      const cur = JSON.parse(await readFile(DATA_PATH, "utf8"));
      entries = [...parseEntries(cur)];
    } catch {
      entries = [];
    }
  }

  const nowIso = new Date().toISOString();
  entries.unshift({
    at: nowIso,
    version,
    deployRef,
    summary,
    automated: true,
  });

  const horizon = Date.now() - RELEASE_LOG_RETENTION_MS;
  entries = entries.filter((e) => {
    const t = new Date(e.at).getTime();
    return !Number.isNaN(t) && t >= horizon;
  });

  /** Limite razoável para não crescer sem fim (~2 anos deploy diário). */
  const MAX = 200;
  entries = entries.slice(0, MAX);

  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify({ entries }, null, 2), "utf8");

  console.log(`[release-log] Gravado: ${DATA_PATH} (${entries.length} entradas, último: "${summary}")`);
}

main().catch((e) => {
  console.error("[release-log] Falhou:", e);
  process.exit(1);
});
