import type { Request } from "express";

/** Cliente por detrás de proxy (Nginx, Cloudflare, etc.). */
export function getClientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0]?.trim() || "";
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]?.trim() || "";
  const rip = req.socket?.remoteAddress ?? "";
  return String(rip).replace(/^::ffff:/, "") || "";
}

export function getClientUserAgent(req: Request): string {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 500) : "";
}

/** Resumo legível para supervisão (sem dependências extra). */
export function summarizeUserAgent(ua: string): string {
  if (!ua) return "—";
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  const parts = [mobile ? "Telemóvel/tablet" : "Desktop", browser, os].filter(Boolean);
  return parts.join(" · ");
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

/** Geo aproximado (API pública; falhas silenciosas). */
export async function lookupGeoLabel(ip: string): Promise<string | null> {
  if (!ip || isPrivateOrLocalIp(ip)) return "Rede local / IP privado";

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    const j = (await res.json()) as { status?: string; city?: string; country?: string };
    if (j.status !== "success") return null;
    const parts = [j.city, j.country].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  } catch {
    return null;
  }
}
