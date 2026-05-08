import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Phone, Users } from "lucide-react";
import { useEffect, useState } from "react";

function formatActiveDuration(startedAt: unknown): string {
  if (!startedAt) return "—";
  const t = new Date(startedAt as string).getTime();
  if (Number.isNaN(t)) return "—";
  const totalMin = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
}

export default function Supervisao() {
  const [durTick, setDurTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDurTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);
  const teamQuery = trpc.supervision.teamStatus.useQuery(undefined, {
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
  const alertsQuery = trpc.supervision.alerts.useQuery(undefined, {
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
  const sosQuery = trpc.sos.openList.useQuery(undefined, {
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supervisão</h1>
          <p className="text-muted-foreground">
            Estado em tempo (quase) real, alertas de pendentes e SOS da sua empresa
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Vendedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!teamQuery.data?.length ? (
                <div className="py-10 text-center text-muted-foreground">Sem dados</div>
              ) : (
                <div className="divide-y">
                  {teamQuery.data.map((u: any) => (
                    <div key={u.id} className="py-4 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.name || u.email}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">{u.dialerState}</Badge>
                          <Badge variant="secondary" className="gap-1">
                            <Phone className="h-3.5 w-3.5" />#{u.dialerContactId || "—"}
                          </Badge>
                          <div className={`h-2 w-2 rounded-full ${u.isOnline ? "bg-green-500" : "bg-gray-300"}`} title={u.isOnline ? "Online" : "Offline"} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">IP: </span>
                          {u.lastSeenIp || "—"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Localização: </span>
                          {u.lastSeenGeo || "—"}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="font-medium text-foreground">Dispositivo: </span>
                          {u.deviceSummary || "—"}
                        </div>
                        {u.isOnline ? (
                          <div className="sm:col-span-2">
                            <span className="font-medium text-foreground">Sessão activa há: </span>
                            {durTick >= 0 ? formatActiveDuration(u.presenceSessionStartedAt) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Alertas (pendentes)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!alertsQuery.data?.length ? (
                <div className="py-10 text-center text-muted-foreground">Sem alertas</div>
              ) : (
                <div className="space-y-2">
                  {alertsQuery.data.map((p: any) => (
                    <div key={p.id} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">Pendente #{p.id}</div>
                      <div className="text-muted-foreground">
                        vendedorId: {p.vendedorId} · contactId: {p.contactId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                SOS Vendas (abertos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!sosQuery.data?.length ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Nenhum SOS aberto</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {sosQuery.data.map((row: any) => (
                    <div key={row.id} className="rounded-md border border-orange-200 bg-orange-50/50 p-3 text-sm">
                      <div className="font-medium text-orange-900">
                        {row.vendedorName || `Vendedor #${row.vendedorId}`}
                      </div>
                      <div className="text-muted-foreground mt-1">{row.message}</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        contacto #{row.contactId ?? "—"} ·{" "}
                        {row.createdAt ? new Date(row.createdAt).toLocaleString("pt-PT") : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}

