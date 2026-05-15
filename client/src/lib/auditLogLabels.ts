const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Actualização",
  bulk_create: "Importação em massa",
  profile_avatar_upload: "Avatar actualizado",
  calendar_create: "Evento no calendário",
  campaign_file_upload: "Ficheiro de campanha",
  settings_update: "Definições alteradas",
  purge_data: "Limpeza de dados",
  beta_suggestion_submit: "Sugestão Beta enviada",
  beta_suggestion_edit: "Sugestão Beta editada",
  beta_suggestion_completed: "Sugestão Beta concluída",
  beta_suggestion_delete: "Sugestão Beta eliminada",
  beta_suggestion_accept: "Sugestão Beta aceite",
  beta_suggestion_reject: "Sugestão Beta rejeitada",
  sale_created: "Venda registada",
  sale_updated: "Venda actualizada",
  sale_activated: "Venda activada",
  sale_dossier_updated: "Dossiê de venda actualizado",
  user_blocked: "Acesso bloqueado",
  user_unblocked: "Acesso desbloqueado",
};

const ENTITY_LABELS: Record<string, string> = {
  contact: "Contacto",
  contacts: "Contactos",
  pending: "Pendente",
  pendentes: "Pendentes",
  sale: "Venda",
  sales: "Vendas",
  user: "Utilizador",
  users: "Utilizador",
  settings: "Definições",
  featureSuggestion: "Sugestão Beta",
  campaign: "Campanha",
  calendarEvent: "Calendário",
};

export function labelAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function labelAuditEntity(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

export type ParsedAuditDetails = {
  raw: string | null;
  parsed: Record<string, unknown> | null;
  oldValue: unknown;
  newValue: unknown;
};

export function parseAuditDetails(details: string | null | undefined): ParsedAuditDetails {
  const raw = details?.trim() || null;
  if (!raw) {
    return { raw: null, parsed: null, oldValue: undefined, newValue: undefined };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const oldValue =
      parsed.old ?? parsed.oldValue ?? parsed.before ?? parsed.previous;
    const newValue =
      parsed.new ?? parsed.newValue ?? parsed.after ?? parsed.next;
    return { raw, parsed, oldValue, newValue };
  } catch {
    return { raw, parsed: null, oldValue: undefined, newValue: undefined };
  }
}

export function formatAuditValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
