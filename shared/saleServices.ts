/** Campos do dossiê revelados por serviço (progressive disclosure). */
export const MOBILE_TECH_KEYS = [
  "cvp_1",
  "kmat_1",
  "cvp_2",
  "kmat_2",
  "cvp_3",
  "kmat_3",
  "cvp_4",
  "kmat_4",
] as const;

export const FIXED_TECH_KEYS = ["cvp_fx", "fixo"] as const;

export const DOC_STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "enviado", label: "Enviado" },
  { value: "assinado", label: "Assinado" },
  { value: "back_office", label: "Back Office" },
] as const;

export type StatusDocumentacao = (typeof DOC_STATUS_OPTIONS)[number]["value"];
