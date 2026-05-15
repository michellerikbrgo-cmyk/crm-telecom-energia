import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ban, Pencil, Search, Trash2 } from "lucide-react";
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
  const [editRow, setEditRow] = useState<BlacklistRow | null>(null);
  const [editReason, setEditReason] = useState("");
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

  const updateReasonMutation = trpc.blacklist.updateReason.useMutation({
    onSuccess: async () => {
      toast.success("Motivo actualizado.");
      setEditRow(null);
      await utils.blacklist.list.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao guardar."),
  });

  const rows: BlacklistRow[] = listQuery.data ?? [];

  const openEdit = (r: BlacklistRow) => {
    setEditRow(r);
    setEditReason(r.reason ?? "");
  };

  const saveReason = () => {
    if (!editRow) return;
    updateReasonMutation.mutate({
      id: editRow.id,
      reason: editReason.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Ban className="h-7 w-7 text-destructive" />
          Lista negra
        </h1>
        <p className="text-muted-foreground">
          {canSeeNumbers
            ? "Números bloqueados. Pode editar o motivo ou remover linhas indevidas."
            : "Pode adicionar números à lista negra a partir do discador."}
        </p>
      </div>

      {!canSeeNumbers ? (
        <Card className="border-0 shadow-sm border-l-4 border-l-primary/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Use o botão no <strong>Discador</strong> durante ou após uma chamada.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Pesquisar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Telefone…"
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
                  Nenhum registo.
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
                        <th className="p-3 w-28 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
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
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Editar motivo"
                                onClick={() => openEdit(r)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
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
                            </div>
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

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar motivo</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm font-mono text-muted-foreground">{editRow.phone}</p>
              <div className="space-y-2">
                <Label>Motivo do bloqueio</Label>
                <Textarea
                  rows={4}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ex.: pedido do cliente, número inválido…"
                />
              </div>
              <Button
                className="w-full"
                onClick={saveReason}
                disabled={updateReasonMutation.isPending}
              >
                Guardar motivo
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
