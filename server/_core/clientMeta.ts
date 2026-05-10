import type { Request } from "express";

/** IPv4 mapeado em IPv6 (`::ffff:192.168.x.x`). */
export function normalizeClientIp(ip: string): string {
  let s = ip.trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  return s;
}

/** Cliente por detrás de proxy (Nginx, Cloudflare, etc.). Ordem: CF → X-Real-IP → X-Forwarded-For → req.ip → socket. */
export function getClientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return normalizeClientIp(cf);

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return normalizeClientIp(realIp);

  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") {
    const first = xf.split(",")[0]?.trim();
    if (first) return normalizeClientIp(first);
  }
  if (Array.isArray(xf) && xf[0]) {
    const first = xf[0].split(",")[0]?.trim();
    if (first) return normalizeClientIp(first);
  }

  const expressIp = (req as { ip?: string }).ip;
  if (expressIp && typeof expressIp === "string" && expressIp.trim()) {
    return normalizeClientIp(expressIp);
  }

  const rip = req.socket?.remoteAddress ?? "";
  return normalizeClientIp(String(rip));
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

export function isPrivateOrLocalIp(ip: string): boolean {
  const raw = ip.trim();
  if (!raw) return true;
  const s = normalizeClientIp(raw);
  if (s === "::1" || s === "127.0.0.1") return true;
  if (s.startsWith("192.168.")) return true;
  if (s.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(s)) return true;
  // IPv6 unique local (approx.)
  if (/^fe[c-f][0-9a-f]:/i.test(s)) return true;
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
