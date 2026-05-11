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
  /** Rótulo alinhado às colunas habituais de contrato */
  label: string;
  section: SaleContractDossierSection;
};

export const SALE_CONTRACT_DOSSIER_FIELDS: readonly SaleContractDossierFieldDef[] = [
  { key: "nome_cliente", label: "NOME_CLIENTE", section: "cliente" },
  { key: "email", label: "E_MAIL", section: "cliente" },
  { key: "contacto", label: "CONTACTO", section: "cliente" },
  { key: "contribuinte", label: "CONTRIBUINTE", section: "cliente" },
  { key: "morada", label: "MORADA", section: "morada" },
  { key: "cp", label: "CP", section: "morada" },
  { key: "col_7", label: "7", section: "morada" },
  { key: "localidade", label: "LOCALIDADE", section: "morada" },
  { key: "rc", label: "RC", section: "morada" },
  { key: "pacote", label: "PACOTE", section: "pacote" },
  { key: "valor_final", label: "VALORFINAL", section: "pacote" },
  { key: "oferta", label: "OFERTA", section: "pacote" },
  { key: "nr_1", label: "NR_1", section: "linhas_moveis" },
  { key: "cvp_1", label: "CVP_1", section: "linhas_moveis" },
  { key: "kmat_1", label: "KMAT_1", section: "linhas_moveis" },
  { key: "nr_2", label: "NR_2", section: "linhas_moveis" },
  { key: "cvp_2", label: "CVP_2", section: "linhas_moveis" },
  { key: "kmat_2", label: "KMAT_2", section: "linhas_moveis" },
  { key: "nr_3", label: "NR_3", section: "linhas_moveis" },
  { key: "cvp_3", label: "CVP_3", section: "linhas_moveis" },
  { key: "kmat_3", label: "KMAT_3", section: "linhas_moveis" },
  { key: "nr_4", label: "NR_4", section: "linhas_moveis" },
  { key: "cvp_4", label: "CVP_4", section: "linhas_moveis" },
  { key: "kmat_4", label: "KMAT_4", section: "linhas_moveis" },
  { key: "fixo", label: "FIXO", section: "linha_fixa" },
  { key: "cvp_fx", label: "CVP_FX", section: "linha_fixa" },
  { key: "id_contrato", label: "ID", section: "contrato" },
  { key: "pre_agendamento", label: "PRÉ-AGENDAMENTO", section: "contrato" },
  { key: "status_contrato", label: "STATUS", section: "contrato" },
  { key: "vendedor_sfid", label: "VENDEDOR/SFID", section: "contrato" },
  { key: "capitao", label: "CAPITÃO", section: "contrato" },
  { key: "subscricao_via", label: "SUBSCRIÇÃOVIA", section: "contrato" },
  { key: "enviado_pbo", label: "ENVIADOPBO", section: "contrato" },
  { key: "contrato_assinado", label: "CONTRATO ASSINADO", section: "contrato" },
  { key: "numero_fixo", label: "NUMEROFIXO", section: "contrato" },
  { key: "portabilidade", label: "PORTABILIDADE", section: "contrato" },
  { key: "desat_apoiada", label: "DESAT.APOIADA", section: "contrato" },
  { key: "iban", label: "IBAN", section: "pagamento" },
  { key: "dia_registo", label: "DIA_REGISTO", section: "registo" },
  { key: "mes_registo", label: "MES_REGISTO", section: "registo" },
  { key: "ano_registo", label: "ANO_REGISTO", section: "registo" },
] as const;

const ALLOWED_KEYS = new Set(SALE_CONTRACT_DOSSIER_FIELDS.map((f) => f.key));

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
    const o = JSON.parse(String(raw)) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      if (v == null) continue;
      out[k] = String(v).slice(0, 4000);
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeSaleContractDossier(data: Record<string, string | undefined | null>): string | null {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    cleaned[k] = s.slice(0, 4000);
  }
  return Object.keys(cleaned).length === 0 ? null : JSON.stringify(cleaned);
}

export function mergeSaleContractDossier(
  existingRaw: string | null | undefined,
  patch: Record<string, string | undefined | null>,
): string | null {
  const base = parseSaleContractDossier(existingRaw);
  const merged = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v == null || String(v).trim() === "") {
      delete merged[k];
    } else {
      merged[k] = String(v).trim().slice(0, 4000);
    }
  }
  return Object.keys(merged).length === 0 ? null : JSON.stringify(merged);
}

export function dossierFilledCount(data: Record<string, string>): number {
  return SALE_CONTRACT_DOSSIER_FIELDS.filter((f) => {
    const v = data[f.key];
    return v != null && String(v).trim() !== "";
  }).length;
}
