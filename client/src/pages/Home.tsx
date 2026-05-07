import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Users, Clock, TrendingUp, AlertTriangle, Trophy, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Home() {
  const { user } = useAuth();

  const statsQuery = trpc.dashboard.stats.useQuery();
  const stats = statsQuery.data || { callsToday: 0, pendentesToday: 0, salesMonth: 0, totalContacts: 0 };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bem-vindo, {user?.name || "Utilizador"}
            </h1>
            <p className="text-muted-foreground">
              Painel de controlo da sua operação comercial
            </p>
          </div>
          <Badge variant="secondary" className="w-fit text-sm px-3 py-1">
            {roleLabelMap[crmRole] || "Vendedor"}
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
                Meta diária: 80
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
                Telecom + Energia
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
              <div className="text-3xl font-bold">-</div>
              <p className="text-xs text-muted-foreground mt-1">
                Posição na equipa
              </p>
            </CardContent>
          </Card>
        </div>

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
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhum pendente agendado</p>
                <p className="text-xs mt-1">Os seus retornos aparecerão aqui</p>
              </div>
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
              <Button variant="outline" className="w-full justify-start gap-2 h-11">
                <Phone className="h-4 w-4" />
                Próximo Contacto
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 h-11">
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

        {/* Status Bar */}
        <Card className="border-0 shadow-sm">
          <CardContent className="py-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-muted-foreground">Online</span>
                </div>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">Tempo de sessão: 0h 0min</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-xs">
                  Iniciar Pausa
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
