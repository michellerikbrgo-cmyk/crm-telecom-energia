import { RELEASE_LOG_RETENTION_DAYS } from "@shared/const";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ReleaseLogItem = {
  at: string;
  version?: string | null;
  deployRef?: string | null;
  title?: string | null;
  bullets?: string[];
  summary?: string | null;
  /** Registo criado pelo script ao final do deploy */
  automated?: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATA_REL = ["data", "release-log.json"] as const;
const BOOTSTRAP = "release-log-bootstrap.json";

function projectRoot(): string {
  return process.cwd();
}

function parseEntries(raw: unknown): ReleaseLogItem[] {
  if (Array.isArray(raw)) return raw as ReleaseLogItem[];
  if (raw && typeof raw === "object" && "entries" in raw) {
    const e = (raw as { entries?: unknown }).entries;
    return Array.isArray(e) ? (e as ReleaseLogItem[]) : [];
  }
  return [];
}

/** Remove entradas com mais de `RELEASE_LOG_RETENTION_DAYS` desde `at` (apenas o que vem de `data/release-log.json`). */
export function filterReleaseLogByRetention(entries: ReleaseLogItem[], nowMs = Date.now()): ReleaseLogItem[] {
  const horizon = nowMs - RELEASE_LOG_RETENTION_DAYS * MS_PER_DAY;
  return entries.filter((e) => {
    const t = new Date(e.at).getTime();
    return !Number.isNaN(t) && t >= horizon;
  });
}

function entryMergeKey(e: ReleaseLogItem): string {
  const b = e.bullets?.join("\n") ?? "";
  return `${e.at}|${e.title ?? ""}|${e.summary ?? ""}|${b}|${e.automated ? "1" : "0"}`;
}

/** Junta deploy (podado aos 15 dias) com o bootstrap (histórico curado na repo, não expira no API). */
export function mergeReleaseLogs(deployFiltered: ReleaseLogItem[], bootstrap: ReleaseLogItem[]): ReleaseLogItem[] {
  const seen = new Set<string>();
  const out: ReleaseLogItem[] = [];
  for (const e of deployFiltered) {
    const k = entryMergeKey(e);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(e);
    }
  }
  for (const e of bootstrap) {
    const k = entryMergeKey(e);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(e);
    }
  }
  out.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
  return out;
}

/**
 * Histórico: `data/release-log.json` (entradas de deploy, com retenção) +
 * `release-log-bootstrap.json` (blocos versionados no git, sempre listados se não duplicarem o deploy).
 */
export async function readReleaseLogMerged(nowMs = Date.now()): Promise<ReleaseLogItem[]> {
  const root = projectRoot();
  const dataPath = join(root, ...DATA_REL);
  const bootPath = join(root, BOOTSTRAP);

  let bootstrapEntries: ReleaseLogItem[] = [];
  if (existsSync(bootPath)) {
    try {
      const txt = await readFile(bootPath, "utf8");
      bootstrapEntries = parseEntries(JSON.parse(txt) as unknown);
    } catch {
      /* ignore */
    }
  }

  let deployFiltered: ReleaseLogItem[] = [];
  if (existsSync(dataPath)) {
    try {
      const txt = await readFile(dataPath, "utf8");
      const raw = parseEntries(JSON.parse(txt) as unknown);
      deployFiltered = filterReleaseLogByRetention(raw, nowMs);
    } catch {
      /* ignore */
    }
  }

  if (deployFiltered.length && bootstrapEntries.length) {
    return mergeReleaseLogs(deployFiltered, bootstrapEntries);
  }
  if (deployFiltered.length) return deployFiltered;
  if (bootstrapEntries.length) return bootstrapEntries;
  return [];
}
