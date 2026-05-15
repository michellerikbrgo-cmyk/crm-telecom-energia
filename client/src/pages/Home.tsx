import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Clock, TrendingUp, AlertTriangle, Trophy, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATS_EMPTY = {
  callsToday: 0,
  pendentesToday: 0,
  overduePendenteCount: 0,
  salesMonth: 0,
  totalContacts: 0,
  salesPipeline: {
    aguarda_instalacao: 0,
    em_aberto: 0,
    activo: 0,
    e_switch: 0,
    cancelado: 0,
  },
  pendenteAlerts: [] as Array<{
    id: number;
    contactId: number;
    returnDate: Date;
    contactPhone: string | null;
    contactName: string | null;
    priorityLevel?: number;
    vendedorName?: string | null;
  }>,
  dialerQueueEligibleCount: 0,
  rankingPosition: null as number | null,
  dailyCallsGoal: 80,
};

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const statsQuery = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 60000 });
  const raw = statsQuery.data;
  const stats = {
    ...STATS_EMPTY,
    ...(raw || {}),
    salesPipeline: { ...STATS_EMPTY.salesPipeline, ...(raw?.salesPipeline || {}) },
    pendenteAlerts: raw?.pendenteAlerts ?? STATS_EMPTY.pendenteAlerts,
  };
  const pendentesQuery = trpc.pendentes.list.useQuery(undefined, { refetchInterval: 60000 });

  const sosMutation = trpc.sos.create.useMutation({
    onSuccess: () => toast.success("SOS enviado! O seu chefe foi notificado."),
    onError: () => toast.error("Erro ao enviar SOS. Tente novamente."),
  });

  const crmRole = (user as any)?.crmRole || "vendedor";
  const roleLabelMap: Record<string, string> = {
    vendedor: "Vendedor",
    cej: "Chefe de Equipa Júnior",
    ce: "Chefe de Equipa",
    coordenador: "Coordenador",
  };
  const displayRole = (user as any)?.isSuperAdmin ? "Super Admin" : (roleLabelMap[crmRole] || "Vendedor");
  const seesSupervision =
    !!(user as any)?.isSuperAdmin || ["cej", "ce", "coordenador"].includes(crmRole);

  const u = user as { name?: string | null } | null | undefined;
  const welcomeName = typeof u?.name === "string" && u.name.trim() ? u.name.trim() : "Utilizador";

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bem-vindo, {welcomeName}
            </h1>
            <p className="text-muted-foreground">
              Painel de controlo da sua operação comercial
            </p>
          </div>
          <Badge variant="secondary" className="w-fit text-sm px-3 py-1">
            {displayRole}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-accent/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Chamadas Hoje
              </CardTitle>
              <Phone className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.callsToday}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Meta diária: {stats.dailyCallsGoal}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-accent/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
              <Clock className="h-4 w-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.pendentesToday}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Agendados para hoje
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-accent/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Vendas do Mês
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-chart-2" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.salesMonth}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Activas com instalação registada no mês
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-accent/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ranking
              </CardTitle>
              <Trophy className="h-4 w-4 text-chart-5" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats.rankingPosition != null ? `#${stats.rankingPosition}` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Por vendas activas (instalação este mês)
              </p>
            </CardContent>
          </Card>
        </div>

        {typeof stats.dialerQueueEligibleCount === "number" &&
          stats.dialerQueueEligibleCount < 10 &&
          ["vendedor", "cej", "ce"].includes(crmRole) && (
          <Card className="border border-amber-500/40 bg-amber-500/5 shadow-sm">
            <CardContent className="py-4 text-sm">
              <div className="font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Poucos contactos na fila do discador
              </div>
              <p className="text-muted-foreground mt-1">
                Elegíveis para marcação agora: <strong>{stats.dialerQueueEligibleCount}</strong>.
                {["ce", "coordenador"].includes(crmRole)
                  ? " Carregue mais leads na Base de Dados."
                  : " Avise o Chefe de Equipa para repor o stock de números."}
              </p>
            </CardContent>
          </Card>
        )}

        {stats.overduePendenteCount > 0 && (
          <Card className="border border-destructive/40 bg-destructive/5 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Pendentes em atraso ({stats.overduePendenteCount})
              </CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                Ligações com data de retorno já passada — priorize o contacto ou reagende em Pendentes.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.pendenteAlerts.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-destructive/20 bg-background/80 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium truncate block">
                      {a.contactPhone || `Contacto #${a.contactId}`}
                      {typeof a.priorityLevel === "number" ? (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                          P{a.priorityLevel}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.returnDate).toLocaleString("pt-PT")}
                      {a.vendedorName ? ` · ${a.vendedorName}` : ""}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLocation("/discador")}>
                    Discador
                  </Button>
                </div>
              ))}
              <Button variant="link" className="px-0 h-auto text-xs" onClick={() => setLocation("/pendentes")}>
                Ver todos os pendentes →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-4 lg:grid-cols-7">
          {/* Próximos Pendentes */}
          <Card className="lg:col-span-4 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Próximos Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!pendentesQuery.data?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Nenhum pendente agendado</p>
                  <p className="text-xs mt-1">Os seus retornos aparecerão aqui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendentesQuery.data.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {p.contactPhone
                            ? `${p.contactName ? `${p.contactName} · ` : ""}${p.contactPhone}`
                            : `Contacto #${p.contactId}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.returnDate).toLocaleString("pt-PT")} · {p.status}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setLocation("/pendentes")}>
                        Ver
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alertas e Ações Rápidas */}
          <Card className="lg:col-span-3 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Ações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-11"
                onClick={async () => {
                  if (!["vendedor", "cej", "ce"].includes(crmRole)) {
                    toast.info("Abra o Discador ou Supervisão conforme o seu perfil.");
                    setLocation(seesSupervision ? "/equipa" : "/contactos");
                    return;
                  }
                  try {
                    const next = await utils.dialer.next.fetch();
                    if (!next) toast.info("Não há contactos disponíveis na fila.");
                    setLocation("/discador");
                  } catch (e: any) {
                    toast.error(e?.message || "Não foi possível obter o próximo contacto.");
                  }
                }}
              >
                <Phone className="h-4 w-4" />
                Próximo Contacto
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-11"
                onClick={() => setLocation("/pendentes")}
              >
                <Clock className="h-4 w-4" />
                Novo Pendente
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-11 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => {
                  sosMutation.mutate({ message: "Preciso de ajuda urgente!" });
                }}
                disabled={sosMutation.isPending}
              >
                <AlertTriangle className="h-4 w-4" />
                {sosMutation.isPending ? "A enviar..." : "SOS Vendas"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
