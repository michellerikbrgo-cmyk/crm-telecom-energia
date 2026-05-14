/**
 * Regras de detecção automática de «cliente Vodafone» (exclusão do discador + `contact_subcontacts`).
 * Ajustar aqui ou via futura integração que chame o mesmo fluxo no servidor.
 */
export const VODAFONE_CLIENT_AUTOMATION_SNIPPETS = ["cliente vodafone", "clientes vodafone"] as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/** Origem ou nome de lista contém um dos fragmentos configurados. */
export function contactMatchesVodafoneAutomation(
  origin: string | null | undefined,
  listName: string | null | undefined,
): boolean {
  const hay = `${norm(origin)} ${norm(listName)}`.trim();
  if (!hay) return false;
  return VODAFONE_CLIENT_AUTOMATION_SNIPPETS.some((frag) => hay.includes(frag));
}
