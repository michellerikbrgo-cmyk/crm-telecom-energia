import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Ban, Search } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";

type BlacklistRow = inferRouterOutputs<AppRouter>["blacklist"]["list"][number];

export default function ListaNegra() {
  const [search, setSearch] = useState("");
  const term = search.trim();

  const listQuery = trpc.blacklist.list.useQuery(term ? { search: term } : undefined);

  const rows = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Ban className="h-7 w-7 text-destructive" />
          Lista negra
        </h1>
        <p className="text-muted-foreground">
          Números que não devem ser contactados (mesma empresa). Adicionados pelo discador ou manualmente.
        </p>
      </div>

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
