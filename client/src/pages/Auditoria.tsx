import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Shield } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";

type AuditLogRow = inferRouterOutputs<AppRouter>["audit"]["list"][number];
import {
  formatAuditValue,
  labelAuditAction,
  labelAuditEntity,
  parseAuditDetails,
} from "@/lib/auditLogLabels";

export default function Auditoria() {
  const [userId, setUserId] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [entity, setEntity] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<{
    id: number;
    actorLabel: string;
    action: string;
    entity: string;
    entityId: number | null;
    details: string | null;
    createdAt: string | Date;
  } | null>(null);

  const usersQuery = trpc.authLocal.listUsers.useQuery();
  const auditQuery = trpc.audit.list.useQuery({
    limit: 200,
    userId: userId ? Number(userId) : undefined,
    action: action || undefined,
    entity: entity || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of auditQuery.data ?? []) set.add(row.action);
    return Array.from(set).sort();
  }, [auditQuery.data]);

  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of auditQuery.data ?? []) set.add(row.entity);
    return Array.from(set).sort();
  }, [auditQuery.data]);

  const parsed = selected ? parseAuditDetails(selected.details) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground">
          Registo de acções no sistema — textos em português e detalhe ao clicar.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>Utilizador</Label>
            <Select value={userId || "all"} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name || u.email || `#${u.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo de acção</Label>
            <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {labelAuditAction(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entidade</Label>
            <Select value={entity || "all"} onValueChange={(v) => setEntity(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {entityOptions.map((e) => (
                  <SelectItem key={e} value={e}>
                    {labelAuditEntity(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {auditQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !auditQuery.data?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma acção registada</p>
            </div>
          ) : (
            <div className="divide-y">
              {auditQuery.data.map((log: AuditLogRow) => (
                <button
                  key={log.id}
                  type="button"
                  className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors gap-4 text-left"
                  onClick={() => setSelected(log)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-primary mb-0.5 truncate">
                      {log.actorLabel}
                    </p>
                    <p className="font-medium text-sm">{labelAuditAction(log.action)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {log.details || "Sem detalhe adicional"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {labelAuditEntity(log.entity)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("pt-PT")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhe da acção</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Autor</p>
                <p className="font-medium">{selected.actorLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Acção</p>
                <p className="font-medium">{labelAuditAction(selected.action)}</p>
                <p className="text-xs text-muted-foreground font-mono">{selected.action}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entidade</p>
                <p className="font-medium">
                  {labelAuditEntity(selected.entity)}
                  {selected.entityId != null ? ` #${selected.entityId}` : ""}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Data</p>
                <p>{new Date(selected.createdAt).toLocaleString("pt-PT")}</p>
              </div>
              {parsed?.oldValue !== undefined || parsed?.newValue !== undefined ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-muted-foreground mb-1">Valor anterior</p>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {formatAuditValue(parsed.oldValue)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Valor novo</p>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {formatAuditValue(parsed.newValue)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground mb-1">Detalhes</p>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {parsed?.raw || "—"}
                  </pre>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => setSelected(null)}>
                Fechar
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
