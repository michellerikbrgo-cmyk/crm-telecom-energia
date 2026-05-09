import { ENV } from "./env";
import crypto from "crypto";

function getKey(): Buffer {
  // Use JWT secret as the base; good enough for at-rest encryption here.
  // If you want to rotate keys later, introduce a dedicated SECRET_KEY.
  const secret = ENV.cookieSecret || process.env.JWT_SECRET || "";
  if (!secret) throw new Error("Missing JWT_SECRET for encryption");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptText(plain: string): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptText(enc: string | null | undefined): string {
  if (!enc) return "";
  if (!enc.startsWith("v1:")) return enc; // backward compatible / unencrypted
  const [, ivB64, tagB64, dataB64] = enc.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Valor exibido por {@link maskSecret} — não gravar como chave nova ao guardar defin settings. */
export function looksLikeMaskedSecret(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t === "********") return true;
  return t.includes("…");
}

