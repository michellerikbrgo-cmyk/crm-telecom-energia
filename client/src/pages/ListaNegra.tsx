import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, Search, Trash2 } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type BlacklistRow = inferRouterOutputs<AppRouter>["blacklist"]["list"][number];

export default function ListaNegra() {
  const { user } = useAuth();
  const crmRole = ((user as { crmRole?: string } | null)?.crmRole ?? "") as string;
  const isSuper = !!(user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin;
  const canSeeNumbers = isSuper || ["ce", "coordenador"].includes(crmRole);

  const [search, setSearch] = useState("");
  const term = search.trim();

  const listQuery = trpc.blacklist.list.useQuery(term ? { search: term } : undefined, {
    enabled: canSeeNumbers,
  });

  const utils = trpc.useUtils();
  const removeMutation = trpc.blacklist.remove.useMutation({
    onSuccess: async () => {
      toast.success("Removido da lista negra.");
      await utils.blacklist.list.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao remover."),
  });

  const rows = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Ban className="h-7 w-7 text-destructive" />
          Lista negra
        </h1>
        <p className="text-muted-foreground">
          {canSeeNumbers
            ? "Números bloqueados à escala da sua equipa ou empresa. Pode remover linhas indevidas."
            : "Pode adicionar números à lista negra a partir do discador; por política interna, o telefone não é mostrado nesta página para o seu perfil."}
        </p>
      </div>

      {!canSeeNumbers ? (
        <Card className="border-0 shadow-sm border-l-4 border-l-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Adicionar à lista negra</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Use o botão no <strong>Discador</strong> durante ou após uma chamada. O número fica bloqueado para a
              equipa do chefe e visível apenas para Chefes de Equipa e Coordenadores.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Pesquisar por telefone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Filtrar…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {listQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Nenhum registo na lista negra.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="p-3 font-medium">Telefone</th>
                        <th className="p-3 font-medium">Motivo</th>
                        <th className="p-3 font-medium">Adicionado por</th>
                        <th className="p-3 font-medium">Data</th>
                        <th className="p-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r: BlacklistRow) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-mono">{r.phone}</td>
                          <td className="p-3 max-w-xs truncate" title={r.reason ?? ""}>
                            {r.reason || "—"}
                          </td>
                          <td className="p-3">{r.addedByName || "—"}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {r.createdAt ? new Date(r.createdAt).toLocaleString("pt-PT") : "—"}
                          </td>
                          <td className="p-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              disabled={removeMutation.isPending}
                              onClick={() => removeMutation.mutate({ id: r.id })}
                              aria-label="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
