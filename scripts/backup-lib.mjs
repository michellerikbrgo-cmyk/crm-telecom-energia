import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MAX_OUTPUT = 24_000;
/** Mantém o backup mais recente e o anterior; apaga o resto. */
export const KEEP_BACKUPS = 2;

export function backupDir(kind) {
  return join(ROOT, "data", "backups", kind);
}

export function statusPath(kind) {
  return join(ROOT, "data", `backup-${kind}-status.json`);
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function tail(s) {
  if (s.length <= MAX_OUTPUT) return s;
  return "…\n" + s.slice(-MAX_OUTPUT);
}

export async function readStatus(kind) {
  const p = statusPath(kind);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return {};
  }
}

export async function writeStatus(kind, patch) {
  await mkdir(join(ROOT, "data"), { recursive: true });
  const cur = await readStatus(kind);
  await writeFile(statusPath(kind), JSON.stringify({ ...cur, ...patch }, null, 2), "utf8");
}

/** Após novo ficheiro, mantém só os `KEEP_BACKUPS` mais recentes (por data de modificação). */
export function rotateBackups(kind, extension) {
  const dir = backupDir(kind);
  if (!existsSync(dir)) return { removed: [] };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(extension))
    .map((name) => {
      const full = join(dir, name);
      return { name, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const removed = [];
  for (const f of files.slice(KEEP_BACKUPS)) {
    unlinkSync(join(dir, f.name));
    removed.push(f.name);
  }
  return { removed };
}

export function parseMysqlUrl(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname || "localhost",
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}
