import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Redirect } from "wouter";

type CrmRole = "vendedor" | "cej" | "ce" | "coordenador";

/**
 * Protecção de rota por `crmRole` / Super Admin (alinhado ao menu lateral).
 * Super Admin ignora a lista e vê sempre o conteúdo.
 */
export function RoleProtectedRoute({
  allow,
  children,
}: {
  allow: readonly CrmRole[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  if ((user as { isSuperAdmin?: boolean }).isSuperAdmin) {
    return <>{children}</>;
  }
  const crm = String((user as { crmRole?: string }).crmRole || "vendedor") as CrmRole;
  if (!allow.includes(crm)) {
    return <Redirect to="/painel" />;
  }
  return <>{children}</>;
}

/** Variante que mostra mensagem em vez de redireccionar (útil em rotas partilhadas). */
export function RoleDeniedCard({ allow }: { allow: readonly string[] }) {
  return (
    <Card className="border-destructive/30 max-w-lg mx-auto mt-8">
      <CardContent className="pt-6 text-sm text-muted-foreground">
        Não tem permissão para esta área. Papéis autorizados: {allow.join(", ")}.
      </CardContent>
    </Card>
  );
}
