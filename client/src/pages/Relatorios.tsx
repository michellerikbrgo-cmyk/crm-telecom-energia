import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Phone, TrendingUp, Users, Clock, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

const STATS_FALLBACK = {
  callsToday: 0,
  pendentesToday: 0,
  salesMonth: 0,
  totalContacts: 0,
  salesPipeline: {
    aguarda_instalacao: 0,
    em_aberto: 0,
    activo: 0,
    e_switch: 0,
    cancelado: 0,
  },
};

function toDateInputVal(v: Date | string | null | undefined) {
  if (!v) return "";
  const d = new Date(v as any);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function SalePipelineRow({ sale }: { sale: any }) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string>(sale.status);
  const [installationDate, setInstallationDate] = useState(toDateInputVal(sale.installationDate));
  const mutation = trpc.sales.update.useMutation({
    onSuccess: async () => {
      toast.success("Venda actualizada");
      await utils.dashboard.stats.invalidate();
      await utils.sales.list.invalidate();
      await utils.gamification.ranking.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:flex-wrap md:items-end">
      <div className="flex-1 min-w-[180px] space-y-1">
        <Label className="text-xs text-muted-foreground">Venda #{sale.id}</Label>
        <p className="text-sm font-medium">Contacto #{sale.contactId} · {sale.product}</p>
      </div>
      <div className="w-full md:w-44 space-y-1">
        <Label className="text-xs">Estado</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aguarda_instalacao">Aguarda instalação</SelectItem>
            <SelectItem value="em_aberto">Em aberto</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="e_switch">e_switch</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full md:w-44 space-y-1">
        <Label className="text-xs">Data instalação</Label>
        <Input type="date" value={installationDate} onChange={(e) => setInstallationDate(e.target.value)} />
      </div>
      <Button
        size="sm"
        className="md:mb-0"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            saleId: sale.id,
            status: status as any,
            installationDate: installationDate ? `${installationDate}T12:00:00` : null,
          })
        }
      >
        {mutation.isPending ? "…" : "Guardar"}
      </Button>
    </div>
  );
}

export default function Relatorios() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const canManageSales =
    !!(user as any)?.isSuperAdmin || ["cej", "ce", "coordenador"].includes(crmRole);

  const statsQuery = trpc.dashboard.stats.useQuery();
  const rawStats = statsQuery.data;
  const stats = {
    ...STATS_FALLBACK,
    ...(rawStats || {}),
    salesPipeline: {
      ...STATS_FALLBACK.salesPipeline,
      ...(rawStats?.salesPipeline || {}),
    },
  };

  const salesQuery = trpc.sales.list.useQuery(undefined, { enabled: canManageSales });

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">Análises de desempenho e métricas da equipa</p>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.callsToday}</p>
                  <p className="text-xs text-muted-foreground">Chamadas Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pendentesToday}</p>
                  <p className="text-xs text-muted-foreground">Pendentes Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.salesMonth}</p>
                  <p className="text-xs text-muted-foreground">Activas (instalação este mês)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {stats.callsToday > 0 && stats.salesMonth > 0
                      ? ((stats.salesMonth / stats.callsToday) * 100).toFixed(1) + "%"
                      : "0%"}
                  </p>
                  <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Pipeline de vendas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <span><strong>{stats.salesPipeline.aguarda_instalacao}</strong> aguardam instalação</span>
            <span className="text-muted-foreground">|</span>
            <span><strong>{stats.salesPipeline.em_aberto}</strong> em aberto</span>
            <span className="text-muted-foreground">|</span>
            <span><strong>{stats.salesPipeline.activo}</strong> activos</span>
            <span className="text-muted-foreground">|</span>
            <span><strong>{stats.salesPipeline.cancelado}</strong> cancelados</span>
          </CardContent>
        </Card>

        {canManageSales && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Estados e instalação (equipa)
              </CardTitle>
              <p className="text-xs text-muted-foreground font-normal pt-1">
                Para contar no ranking, marque a venda como <strong>Activo</strong> e defina a data de instalação.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!salesQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda registada no mês corrente.</p>
              ) : (
                salesQuery.data.map((sale: any) => <SalePipelineRow key={sale.id} sale={sale} />)
              )}
            </CardContent>
          </Card>
        )}

        {/* Metrics Cards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Chamadas por Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Os dados aparecerão quando houver chamadas registadas</p>
                <p className="text-xs mt-1">Métrica: Total de chamadas por cada vendedor</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Vendas por Fonte
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Análise de conversão por origem do contacto</p>
                <p className="text-xs mt-1">Telemarketing vs Indicação vs Rua</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                Melhor Horário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Horários com maior taxa de atendimento</p>
                <p className="text-xs mt-1">Baseado nos registos de chamadas</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                Motivos de Perda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Distribuição dos motivos de não-venda</p>
                <p className="text-xs mt-1">Preço, Fidelização, Cobertura, etc.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
