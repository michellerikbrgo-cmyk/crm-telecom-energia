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

/** Histórico: após primeiro deploy existe data/release-log.json; antes disso só o bootstrap commitado. */
export async function readReleaseLogMerged(): Promise<ReleaseLogItem[]> {
  const root = projectRoot();
  const dataPath = join(root, ...DATA_REL);

  if (existsSync(dataPath)) {
    try {
      const txt = await readFile(dataPath, "utf8");
      const j = JSON.parse(txt) as unknown;
      const entries = parseEntries(j);
      if (entries.length) return entries;
    } catch {
      /* fall through */
    }
  }

  const bootPath = join(root, BOOTSTRAP);
  if (existsSync(bootPath)) {
    try {
      const txt = await readFile(bootPath, "utf8");
      return parseEntries(JSON.parse(txt) as unknown);
    } catch {
      return [];
    }
  }

  return [];
}
