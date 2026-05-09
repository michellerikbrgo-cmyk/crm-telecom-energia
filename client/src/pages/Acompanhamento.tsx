import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

const STATUS_OPTIONS = [
  { value: "__all", label: "Todas (excepto canceladas)" },
  { value: "aguarda_instalacao", label: "Aguarda instalação" },
  { value: "em_aberto", label: "Em aberto / problema técnico" },
  { value: "activo", label: "Activo" },
  { value: "e_switch", label: "e-switch (energia)" },
  { value: "cancelado", label: "Cancelado" },
] as const;

export default function Acompanhamento() {
  const [filter, setFilter] = useState<string>("__all");

  const queryInput = useMemo(() => {
    if (filter === "__all") return undefined;
    return { status: filter as "aguarda_instalacao" | "em_aberto" | "activo" | "e_switch" | "cancelado" };
  }, [filter]);

  const pipelineQuery = trpc.sales.pipeline.useQuery(queryInput);

  const rows = pipelineQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-primary" />
          Acompanhamento de vendas
        </h1>
        <p className="text-muted-foreground">
          Visão das suas vendas ou da sua equipa, conforme o seu perfil. Estados alinhados ao pipeline em Relatórios.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Filtrar por estado</CardTitle>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {pipelineQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sem vendas neste filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Contacto</th>
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium">Instalação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-mono">{r.id}</td>
                      <td className="p-3">
                        <div>{r.contactName || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.contactPhone || ""}</div>
                      </td>
                      <td className="p-3 capitalize">{r.product}</td>
                      <td className="p-3">{r.status}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {r.installationDate
                          ? new Date(r.installationDate as unknown as string).toLocaleString("pt-PT", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
