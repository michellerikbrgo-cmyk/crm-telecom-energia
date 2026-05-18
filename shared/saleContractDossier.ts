/**
 * Campos opcionais da ficha de contrato / acompanhamento (exportação para contrato).
 * Nenhum é obrigatório; quanto mais preenchido, melhor o acompanhamento.
 */
export type SaleContractDossierSection =
  | "cliente"
  | "morada"
  | "pacote"
  | "linhas_moveis"
  | "linha_fixa"
  | "contrato"
  | "pagamento"
  | "registo";

export type SaleContractDossierFieldDef = {
  key: string;
  /** Rótulo legível na UI */
  label: string;
  section: SaleContractDossierSection;
};

/** Não mostrar na ficha manual (preenchimento automático ou redundante). */
export const SALE_CONTRACT_DOSSIER_HIDDEN_KEYS = new Set([
  "pre_agendamento",
  "vendedor_sfid",
  "dia_registo",
  "mes_registo",
  "ano_registo",
]);

export const SALE_CONTRACT_DOSSIER_FIELDS: readonly SaleContractDossierFieldDef[] = [
  { key: "nome_cliente", label: "Nome do cliente", section: "cliente" },
  { key: "email", label: "E-mail", section: "cliente" },
  { key: "contacto", label: "Telefone de contacto", section: "cliente" },
  { key: "contribuinte", label: "NIF / Contribuinte", section: "cliente" },
  { key: "morada", label: "Morada", section: "morada" },
  { key: "cp", label: "Código postal", section: "morada" },
  { key: "col_7", label: "Complemento", section: "morada" },
  { key: "localidade", label: "Localidade", section: "morada" },
  { key: "rc", label: "RC ID", section: "morada" },
  { key: "conta_cliente", label: "Conta de Cliente", section: "contrato" },
  { key: "pacote", label: "Pacote", section: "pacote" },
  { key: "valor_final", label: "Valor final", section: "pacote" },
  { key: "oferta", label: "Oferta", section: "pacote" },
  { key: "nr_1", label: "N.º linha móvel 1", section: "linhas_moveis" },
  { key: "cvp_1", label: "Código de ativação (móvel 1)", section: "linhas_moveis" },
  { key: "kmat_1", label: "KMAT móvel 1", section: "linhas_moveis" },
  { key: "nr_2", label: "N.º linha móvel 2", section: "linhas_moveis" },
  { key: "cvp_2", label: "Código de ativação (móvel 2)", section: "linhas_moveis" },
  { key: "kmat_2", label: "KMAT móvel 2", section: "linhas_moveis" },
  { key: "nr_3", label: "N.º linha móvel 3", section: "linhas_moveis" },
  { key: "cvp_3", label: "Código de ativação (móvel 3)", section: "linhas_moveis" },
  { key: "kmat_3", label: "KMAT móvel 3", section: "linhas_moveis" },
  { key: "nr_4", label: "N.º linha móvel 4", section: "linhas_moveis" },
  { key: "cvp_4", label: "Código de ativação (móvel 4)", section: "linhas_moveis" },
  { key: "kmat_4", label: "KMAT móvel 4", section: "linhas_moveis" },
  { key: "fixo", label: "Telefone fixo", section: "linha_fixa" },
  { key: "cvp_fx", label: "Código de ativação (fixo)", section: "linha_fixa" },
  { key: "id_contrato", label: "ID contrato", section: "contrato" },
  { key: "pre_agendamento", label: "Pré-agendamento", section: "contrato" },
  { key: "status_contrato", label: "Estado do contrato", section: "contrato" },
  { key: "vendedor_sfid", label: "Vendedor / SFID", section: "contrato" },
  { key: "capitao", label: "Capitão", section: "contrato" },
  { key: "subscricao_via", label: "Subscrição via", section: "contrato" },
  { key: "enviado_pbo", label: "Enviado PBO", section: "contrato" },
  { key: "contrato_assinado", label: "Contrato assinado", section: "contrato" },
  { key: "numero_fixo", label: "Número fixo", section: "contrato" },
  { key: "portabilidade", label: "Portabilidade", section: "contrato" },
  { key: "desat_apoiada", label: "Desativação apoiada", section: "contrato" },
  { key: "iban", label: "IBAN", section: "pagamento" },
  { key: "dia_registo", label: "Dia de registo", section: "registo" },
  { key: "mes_registo", label: "Mês de registo", section: "registo" },
  { key: "ano_registo", label: "Ano de registo", section: "registo" },
] as const;

const ALLOWED_KEYS = new Set(SALE_CONTRACT_DOSSIER_FIELDS.map((f) => f.key));

/** Rótulo UI — nunca expõe a chave técnica (ex. nome_cliente). */
export function dossierFieldDisplayLabel(field: SaleContractDossierFieldDef): string {
  const label = String(field.label ?? "").trim();
  if (label) return label;
  return field.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SALE_CONTRACT_DOSSIER_SECTION_LABELS: Record<SaleContractDossierSection, string> = {
  cliente: "Cliente",
  morada: "Morada",
  pacote: "Pacote e valores",
  linhas_moveis: "Linhas móveis (até 4)",
  linha_fixa: "Linha fixa",
  contrato: "Contrato e operação",
  pagamento: "Pagamento",
  registo: "Registo",
};

export function parseSaleContractDossier(raw: string | null | undefined): Record<string, string> {
  if (raw == null || String(raw).trim() === "") return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (ALLOWED_KEYS.has(k) && v != null) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeSaleContractDossier(
  existing: string | null | undefined,
  patch: Record<string, string | null | undefined>,
): string {
  const base = parseSaleContractDossier(existing);
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v == null || String(v).trim() === "") delete base[k];
    else base[k] = String(v).trim();
  }
  return JSON.stringify(base);
}

export function dossierFilledCount(d: Record<string, string>): number {
  let n = 0;
  for (const f of SALE_CONTRACT_DOSSIER_FIELDS) {
    if (SALE_CONTRACT_DOSSIER_HIDDEN_KEYS.has(f.key)) continue;
    if (String(d[f.key] ?? "").trim()) n++;
  }
  return n;
}

/** Preenche dia/mês/ano de registo a partir da data de fecho da venda. */
export function dossierRegistoPatchFromDate(d: Date): Record<string, string> {
  return {
    dia_registo: String(d.getDate()),
    mes_registo: String(d.getMonth() + 1),
    ano_registo: String(d.getFullYear()),
  };
}

export function formatDossierRegistoDate(d: Record<string, string>): string {
  const day = String(d.dia_registo ?? "").trim();
  const month = String(d.mes_registo ?? "").trim();
  const year = String(d.ano_registo ?? "").trim();
  if (!day || !month || !year) return "";
  const dt = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("pt-PT");
}

/** Código de ativação preferencial para a grelha de acompanhamento. */
/** Código de ativação (CVP) — nunca o ID da venda. */
export function dossierActivationCode(d: Record<string, string>): string {
  for (const k of ["cvp_1", "cvp_fx", "cvp_2", "cvp_3", "cvp_4"]) {
    const v = String(d[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}
