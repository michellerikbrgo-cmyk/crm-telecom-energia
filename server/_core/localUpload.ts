import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

/** Diretório absoluto para uploads quando definido em `LOCAL_UPLOAD_ROOT`. */
export function getLocalUploadRoot(): string | null {
  const r = process.env.LOCAL_UPLOAD_ROOT?.trim();
  return r ? r : null;
}

/** Remove barras iniciais e resolve `..` / `.` sem sair da árvore lógica da key. */
export function normalizeStorageKey(relKey: string): string {
  const parts = relKey.replace(/^[/\\]+/, "").split(/[/\\]+/).filter(Boolean);
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "..") stack.pop();
    else if (p !== ".") stack.push(p);
  }
  return stack.join("/");
}

/** Resolve caminho seguro dentro do root (bloqueia path traversal). */
export function resolveSafeUploadPath(rootEnv: string, key: string): string {
  const root = resolve(rootEnv);
  const normalizedKey = normalizeStorageKey(key);
  const full = resolve(join(root, normalizedKey));
  const rel = relative(root, full);
  if (rel.startsWith("..") || rel.startsWith("/") || rel === "") {
    throw new Error("Caminho de armazenamento inválido.");
  }
  return full;
}

export async function writeLocalUpload(key: string, data: Buffer | Uint8Array): Promise<void> {
  const root = getLocalUploadRoot();
  if (!root) throw new Error("LOCAL_UPLOAD_ROOT não definido");
  const full = resolveSafeUploadPath(root, key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}
