// Uploads: apenas disco local (`LOCAL_UPLOAD_ROOT`). Ficheiros servidos via `/manus-storage/…`.

import { ENV } from "./_core/env";
import {
  getLocalUploadRoot,
  normalizeStorageKey,
  writeLocalUpload,
} from "./_core/localUpload";

function normalizeKey(relKey: string): string {
  return normalizeStorageKey(relKey);
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const root = getLocalUploadRoot();
  if (!root) {
    throw new Error(
      "Armazenamento não configurado: defina LOCAL_UPLOAD_ROOT no servidor com um caminho absoluto (ex. /var/www/.../data/uploads).",
    );
  }

  const key = appendHashSuffix(normalizeKey(relKey));
  const buf =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data as Buffer | Uint8Array);

  await writeLocalUpload(key, buf);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const path = `/manus-storage/${key}`;
  const base = ENV.publicBaseUrl.trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}
