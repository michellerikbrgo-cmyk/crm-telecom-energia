import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BetaPurgeCountdown } from "@/components/BetaPurgeCountdown";
import { BETA_COMPLETED_RETENTION_DAYS } from "@shared/const";
import { trpc } from "@/lib/trpc";
import { Beaker, Check, Hourglass, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

/** Concluído no fluxo: ENUM legacy ou data completedAt (funciona sem migração do ENUM). */
function betaIsDone(s: { status: string; completedAt?: unknown }) {
  if (s.status === "completed") return true;
  return s.completedAt != null;
}

function betaNeedsConclude(s: { status: string; completedAt?: unknown }) {
  return s.status === "accepted" && !betaIsDone(s);
}

type RoadmapRow = {
  id: number;
  tenantId?: number | null;
  tenantLabel: string;
  title: string;
  body: string;
  status: string;
  completedAt?: unknown;
  acceptedAt?: unknown;
  purgeAt?: string | null;
  authorName?: string | null;
};

function RoadmapItem({
  s,
  isSuper,
  crmRole,
  userTenantId,
  completeMutation,
  deleteMutation,
}: {
  s: RoadmapRow;
  isSuper: boolean;
  crmRole: string;
  userTenantId: number | null | undefined;
  completeMutation: { isPending: boolean; mutate: (a: { id: number }) => void };
  deleteMutation: { isPending: boolean; mutate: (a: { id: number }) => void };
}) {
  return (
    <li className="border-b border-border/60 pb-3 last:border-0">
      <div className="flex flex-wrap gap-2 items-center mb-1">
        <span className="font-medium">{s.title}</span>
        {betaIsDone(s) ? (
          <Badge variant="secondary" className="text-[10px] font-normal">
            Concluída
          </Badge>
        ) : null}
        <Badge variant="outline" className="text-[10px] font-normal">
          {s.tenantLabel}
        </Badge>
      </div>
      <p className="text-muted-foreground whitespace-pre-wrap text-xs">{s.body}</p>
      <p className="text-[11px] text-muted-foreground mt-1">
        {s.authorName ?? "—"}
        {s.acceptedAt ? ` · Aceite em ${new Date(s.acceptedAt as string).toLocaleString("pt-PT")}` : ""}
      </p>
      {betaIsDone(s) && s.purgeAt ? (
        <p className="text-[11px] mt-1.5">
          <BetaPurgeCountdown purgeAtIso={s.purgeAt} />
        </p>
      ) : null}
      {canReviewSuggestionRow(s, isSuper, crmRole, userTenantId) ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {betaNeedsConclude(s) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate({ id: s.id })}
              className="gap-1"
            >
              <Check className="h-4 w-4" />
              Concluir
            </Button>
          ) : betaIsDone(s) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate({ id: s.id })}
              className="gap-1 text-destructive border-destructive/40"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Alinhado com assertSuggestionReviewableByUser no servidor (SA ou coordenador da mesma empresa). */
function canReviewSuggestionRow(
  row: { tenantId?: number | null },
  isSuper: boolean,
  crmRole: string,
  userTenantId: number | null | undefined,
) {
  if (isSuper) return true;
  if (crmRole !== "coordenador") return false;
  if (row.tenantId == null) return false;
  return Number(row.tenantId) === Number(userTenantId);
}

export default function Beta() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "";
  const isSuper = !!(user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin;
  const userTenantId = (user as { tenantId?: number | null } | null)?.tenantId;
  const canReview = isSuper || crmRole === "coordenador";
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editOpenId, setEditOpenId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const utils = trpc.useUtils();
  const mineQuery = trpc.beta.listMine.useQuery();
  const acceptedQuery = trpc.beta.listAccepted.useQuery();

  const currentEditRow = useMemo(() => {
    if (!editOpenId) return null;
    return (mineQuery.data ?? []).find((r) => r.id === editOpenId) ?? null;
  }, [editOpenId, mineQuery.data]);

  const editsQuery = trpc.beta.listEdits.useQuery(
    { id: editOpenId as number },
    { enabled: editOpenId != null },
  );

  const submitMutation = trpc.beta.submit.useMutation({
    onSuccess: async () => {
      toast.success("Sugestão enviada. Obrigado!");
      setTitle("");
      setBody("");
      await utils.beta.listMine.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao enviar."),
  });

  const editMutation = trpc.beta.edit.useMutation({
    onSuccess: async () => {
      toast.success("Sugestão editada");
      await utils.beta.listMine.invalidate();
      await utils.beta.listAccepted.invalidate();
      if (editOpenId != null) await utils.beta.listEdits.invalidate({ id: editOpenId });
      setEditOpenId(null);
    },
    onError: (e) => toast.error(e.message ?? "Erro."),
  });

  const completeMutation = trpc.beta.markCompleted.useMutation({
    onSuccess: async () => {
      toast.success("Sugestão concluída");
      await utils.beta.listAccepted.invalidate();
      await utils.beta.listMine.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro."),
  });

  const deleteMutation = trpc.beta.delete.useMutation({
    onSuccess: async () => {
      toast.success("Sugestão excluída");
      await utils.beta.listAccepted.invalidate();
      await utils.beta.listMine.invalidate();
      setEditOpenId(null);
    },
    onError: (e) => toast.error(e.message ?? "Erro."),
  });

  const roadmapSections = useMemo(() => {
    const data = (acceptedQuery.data ?? []) as RoadmapRow[];
    const inProgress: RoadmapRow[] = [];
    const completed: RoadmapRow[] = [];
    for (const s of data) {
      if (betaIsDone(s)) completed.push(s);
      else inProgress.push(s);
    }
    completed.sort((a, b) => {
      const ta = a.purgeAt ? new Date(a.purgeAt).getTime() : Infinity;
      const tb = b.purgeAt ? new Date(b.purgeAt).getTime() : Infinity;
      return ta - tb;
    });
    return { inProgress, completed };
  }, [acceptedQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Beaker className="h-8 w-8 text-primary shrink-0" aria-hidden />
            Beta — sugestões de funcionalidades
          </h1>
          <p className="text-muted-foreground">
            Envie ideias para melhorar o CRM. Esta página mostra apenas o <strong>roadmap</strong> — sugestões{" "}
            <strong>aceites</strong> e <strong>concluídas</strong> visíveis em <strong>todo o sistema</strong> (todas as
            empresas), para evitar repetir a mesma ideia. As <strong>concluídas</strong> mostram um{" "}
            <strong>cronómetro</strong> até serem <strong>removidas automaticamente</strong> (
            {BETA_COMPLETED_RETENTION_DAYS} dias após conclusão).
          </p>
        </div>
        {canReview ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shrink-0 self-start"
            onClick={() => setLocation("/beta/revisao")}
          >
            <Hourglass className="h-4 w-4" aria-hidden />
            Revisar pendentes
          </Button>
        ) : null}
      </div>

      <Card className="border-0 shadow-sm border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg">Nova sugestão</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Título curto e descrição clara (mín. 10 caracteres no texto).
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="beta-title">Título</Label>
            <Input
              id="beta-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Exportar relatório para Excel"
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="beta-body">Descrição</Label>
            <Textarea
              id="beta-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explique o problema e o comportamento desejado…"
              rows={5}
              maxLength={8000}
            />
          </div>
          <Button
            type="button"
            disabled={submitMutation.isPending || title.trim().length < 3 || body.trim().length < 10}
            onClick={() => submitMutation.mutate({ title: title.trim(), body: body.trim() })}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                A enviar…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar sugestão
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Aceites para próxima versão (todas as empresas)</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Roadmap global: aceites em curso e concluídas. Para cada concluída, vê o tempo até remoção automática (
            {BETA_COMPLETED_RETENTION_DAYS} dias após conclusão).
          </p>
        </CardHeader>
        <CardContent>
          {acceptedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !roadmapSections.inProgress.length && !roadmapSections.completed.length ? (
            <p className="text-sm text-muted-foreground">Ainda não há sugestões aceites.</p>
          ) : (
            <ScrollArea className="h-[min(420px,52vh)] pr-4">
              <div className="space-y-6 text-sm">
                {roadmapSections.inProgress.length ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Aceites em curso
                    </p>
                    <ul className="space-y-3">
                      {roadmapSections.inProgress.map((s) => (
                        <RoadmapItem
                          key={s.id}
                          s={s}
                          isSuper={isSuper}
                          crmRole={crmRole}
                          userTenantId={userTenantId}
                          completeMutation={completeMutation}
                          deleteMutation={deleteMutation}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
                {roadmapSections.completed.length ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Concluídas (remoção automática)
                    </p>
                    <ul className="space-y-3">
                      {roadmapSections.completed.map((s) => (
                        <RoadmapItem
                          key={s.id}
                          s={s}
                          isSuper={isSuper}
                          crmRole={crmRole}
                          userTenantId={userTenantId}
                          completeMutation={completeMutation}
                          deleteMutation={deleteMutation}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">As minhas sugestões</CardTitle>
        </CardHeader>
        <CardContent>
          {mineQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !mineQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">Ainda não enviou sugestões.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2 font-medium">Título</th>
                    <th className="p-2 font-medium">Estado</th>
                    <th className="p-2 font-medium">Data</th>
                    <th className="p-2 font-medium w-[140px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {mineQuery.data.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="p-2 max-w-[220px] truncate" title={r.title}>
                        {r.title}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            betaIsDone(r as any)
                              ? "secondary"
                              : r.status === "accepted"
                                ? "default"
                                : r.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {r.status === "pending"
                            ? "Pendente"
                            : betaIsDone(r as any)
                              ? "Concluída"
                              : r.status === "accepted"
                                ? "Aceite"
                                : "Recusada"}
                        </Badge>
                        {betaIsDone(r as any) && r.purgeAt ? (
                          <div className="mt-2 max-w-[min(300px,70vw)]">
                            <BetaPurgeCountdown purgeAtIso={r.purgeAt} />
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap text-xs">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString("pt-PT") : "—"}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              setEditOpenId(r.id);
                              setEditTitle(r.title);
                              setEditBody(r.body);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            Ver / Editar
                          </Button>
                          {(r.status === "pending" || r.status === "rejected") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive border-destructive/40"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate({ id: r.id })}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </Button>
                          ) : null}
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

      <Sheet
        open={editOpenId != null}
        onOpenChange={(o) => {
          if (!o) setEditOpenId(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
          <SheetHeader className="p-6 pb-3 border-b shrink-0 text-left">
            <SheetTitle>Sugestão</SheetTitle>
            <SheetDescription className="text-left">
              {!currentEditRow
                ? ""
                : currentEditRow.status === "pending"
                  ? "Pendente — pode editar."
                  : currentEditRow.status === "rejected"
                    ? "Recusada — pode editar e reenviar como nova, ou excluir."
                    : betaIsDone(currentEditRow as any)
                      ? "Concluída."
                      : "Aceite."}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="py-4 space-y-5 pr-3">
              <div className="space-y-2">
                <Label htmlFor="beta-edit-title">Título</Label>
                <Input
                  id="beta-edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={255}
                  disabled={currentEditRow?.status !== "pending"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beta-edit-body">Descrição</Label>
                <Textarea
                  id="beta-edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={7}
                  maxLength={8000}
                  disabled={currentEditRow?.status !== "pending"}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Histórico de edições</p>
                {editsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">A carregar…</p>
                ) : !editsQuery.data?.length ? (
                  <p className="text-xs text-muted-foreground">Sem edições.</p>
                ) : (
                  <div className="space-y-2">
                    {editsQuery.data.map((e) => (
                      <div key={e.id} className="rounded-md border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">
                          {e.editedByName ?? `#${e.editedBy}`} ·{" "}
                          {e.editedAt ? new Date(e.editedAt as any).toLocaleString("pt-PT") : ""}
                        </p>
                        <p className="text-sm mt-1">
                          <span className="text-muted-foreground">De:</span> {e.oldTitle}
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Para:</span> {e.newTitle}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="p-4 border-t gap-2 shrink-0 flex-row sm:justify-end bg-muted/20">
            <Button type="button" variant="outline" onClick={() => setEditOpenId(null)}>
              Fechar
            </Button>
            {currentEditRow?.status === "pending" ? (
              <Button
                type="button"
                disabled={editMutation.isPending || editTitle.trim().length < 3 || editBody.trim().length < 10}
                onClick={() =>
                  editMutation.mutate({ id: editOpenId as number, title: editTitle.trim(), body: editBody.trim() })
                }
              >
                {editMutation.isPending ? "A guardar…" : "Guardar edição"}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
