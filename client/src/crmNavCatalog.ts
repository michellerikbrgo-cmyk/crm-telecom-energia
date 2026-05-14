/** Entradas de menu (sem ícones) — fonte única para sidebar e busca global. */
export type NavCatalogEntry = {
  path: string;
  label: string;
  roles?: readonly string[];
};

export const NAV_CATALOG: readonly NavCatalogEntry[] = [
  { path: "/painel", label: "Dashboard", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/notificacoes", label: "Notificações", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/beta", label: "Beta", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/discador", label: "Discador", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/acompanhamento", label: "Acompanhamento", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/contactos", label: "Contactos", roles: ["cej", "ce", "coordenador"] },
  { path: "/lista-negra", label: "Lista negra", roles: ["ce", "coordenador"] },
  { path: "/pendentes", label: "Pendentes", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/contratos", label: "Contratos", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/calculadora", label: "Calculadora", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/planos", label: "Planos (exemplo)", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/ia-objecoes", label: "IA Objeções", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/campanhas", label: "Campanhas", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/ranking", label: "Ranking", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/calendario", label: "Calendário", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { path: "/supervisao", label: "Supervisão", roles: ["cej", "ce", "coordenador"] },
  { path: "/relatorios", label: "Relatórios", roles: ["cej", "ce", "coordenador"] },
  { path: "/equipa", label: "Equipa", roles: ["cej", "ce", "coordenador"] },
  { path: "/auditoria", label: "Auditoria", roles: ["ce", "coordenador"] },
  { path: "/base-dados", label: "Base de Dados", roles: ["ce", "coordenador"] },
  { path: "/utilizadores", label: "Utilizadores", roles: ["cej", "ce", "coordenador"] },
  { path: "/super-admin", label: "Super Admin", roles: ["super_admin"] },
] as const;

export function filterNavCatalog(
  entries: readonly NavCatalogEntry[],
  opts: { crmRole: string; isSuperAdmin: boolean; planosEnabled: boolean },
): NavCatalogEntry[] {
  return entries.filter((item) => {
    if (item.path === "/planos" && !opts.planosEnabled) return false;
    if (item.path === "/utilizadores" && opts.crmRole === "vendedor") return false;
    if (!item.roles) return true;
    if (opts.isSuperAdmin) return true;
    if (item.roles.includes("super_admin")) return false;
    return item.roles.includes(opts.crmRole);
  });
}
