/** URL pública da app (redirects dos gateways). Preferir variável de ambiente em produção. */
export function getAppPublicUrl(): string {
  const fromEnv = process.env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}
