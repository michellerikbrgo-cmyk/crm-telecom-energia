/** Operadoras de origem do cliente (telecom PT). */
export const OPERADORA_ATUAL_OPTIONS = ["NOS", "MEO", "VODAFONE", "NOWO", "DIGI"] as const;

export type OperadoraAtualValue = (typeof OPERADORA_ATUAL_OPTIONS)[number];

export function normalizeOperadoraAtual(raw: string | null | undefined): OperadoraAtualValue | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  return (OPERADORA_ATUAL_OPTIONS as readonly string[]).includes(s) ? (s as OperadoraAtualValue) : null;
}
