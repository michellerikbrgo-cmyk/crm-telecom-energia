import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedVersion: string | null = null;

/** Versão do `package.json` no cwd do processo (PM2 deve usar cwd do projeto). */
export function getAppVersion(): string {
  if (cachedVersion !== null) return cachedVersion;
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    cachedVersion = typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
}

export function getDeployRef(): string | null {
  const a = process.env.DEPLOY_REF?.trim();
  if (a) return a.slice(0, 40);
  const sha = process.env.GITHUB_SHA?.trim();
  if (sha) return sha.slice(0, 7);
  return null;
}

export function buildHealthPayload() {
  return {
    ok: true as const,
    version: getAppVersion(),
    uptimeSec: Math.floor(process.uptime()),
    deployRef: getDeployRef(),
    node: process.version,
  };
}
