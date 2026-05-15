/** Colunas disponíveis na exportação CSV de contactos (Fase 2). */
export const CONTACT_EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "phone", label: "Telefone" },
  { key: "name", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "status", label: "Estado" },
  { key: "origin", label: "Fonte / Origem" },
  { key: "listName", label: "Lista" },
  { key: "importBatchLabel", label: "Lote de importação" },
  { key: "lastOperatorName", label: "Último operador" },
  { key: "lastFeedbackAt", label: "Data/hora feedback" },
  { key: "createdAt", label: "Criado em" },
] as const;

export type ContactExportColumnKey = (typeof CONTACT_EXPORT_COLUMNS)[number]["key"];

export const DEFAULT_CONTACT_EXPORT_COLUMNS: ContactExportColumnKey[] = [
  "phone",
  "name",
  "origin",
  "status",
  "lastOperatorName",
  "lastFeedbackAt",
];
