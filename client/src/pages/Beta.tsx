import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Beaker, Check, Loader2, Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Beta() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "";
  const isSuper = !!(user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin;
  const canReview = isSuper || crmRole === "coordenador";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState<{ id: number; decision: "accepted" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const utils = trpc.useUtils();
  const mineQuery = trpc.beta.listMine.useQuery();
  const pendingQuery = trpc.beta.listPending.useQuery(undefined, { enabled: canReview });
  const acceptedQuery = trpc.beta.listAccepted.useQuery();

  const submitMutation = trpc.beta.submit.useMutation({
    onSuccess: async () => {
      toast.success("Sugestão enviada. Obrigado!");
      setTitle("");
      setBody("");
      await utils.beta.listMine.invalidate();
      if (canReview) await utils.beta.listPending.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro ao enviar."),
  });

  const reviewMutation = trpc.beta.review.useMutation({
    onSuccess: async () => {
      toast.success(reviewOpen?.decision === "accepted" ? "Sugestão aceite." : "Sugestão recusada.");
      setReviewOpen(null);
      setReviewNote("");
      await utils.beta.listPending.invalidate();
      await utils.beta.listMine.invalidate();
      await utils.beta.listAccepted.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Erro."),
  });

  function confirmReview() {
    if (!reviewOpen) return;
    reviewMutation.mutate({
      id: reviewOpen.id,
      decision: reviewOpen.decision,
      reviewNote: reviewNote.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Beaker className="h-8 w-8 text-primary" aria-hidden />
          Beta — sugestões de funcionalidades
        </h1>
        <p className="text-muted-foreground">
          Envie ideias para melhorar o CRM. O{" "}
          <strong>Coordenador</strong> da sua empresa e o <strong>Super Admin</strong> podem aceitar ou recusar.
          Sugestões <strong>aceites</strong> entram no roadmap da próxima versão (visível ao Super Admin para todo o
          sistema; na sua empresa vê-se o que foi aceite para o seu tenant).
        </p>
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

      {canReview ? (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-500/80">
          <CardHeader>
            <CardTitle className="text-lg">Pendentes de revisão</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              {isSuper
                ? "Todas as empresas."
                : "Apenas sugestões do seu tenant (coordenador)."}
            </p>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : !pendingQuery.data?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma sugestão pendente.</p>
            ) : (
              <div className="space-y-4">
                {pendingQuery.data.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border p-4 space-y-2 bg-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{row.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Por {row.authorName ?? `#${row.authorId}`} ·{" "}
                          {row.createdAt ? new Date(row.createdAt).toLocaleString("pt-PT") : ""}
                          {row.tenantId != null ? ` · Tenant #${row.tenantId}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="gap-1"
                          onClick={() => {
                            setReviewNote("");
                            setReviewOpen({ id: row.id, decision: "accepted" });
                          }}
                        >
                          <Check className="h-4 w-4" />
                          Aceitar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/40"
                          onClick={() => {
                            setReviewNote("");
                            setReviewOpen({ id: row.id, decision: "rejected" });
                          }}
                        >
                          <X className="h-4 w-4" />
                          Recusar
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.body}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">
            Aceites para próxima versão {isSuper ? "(todas as empresas)" : "(a sua empresa)"}
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Sugestões já aprovadas e consideradas para desenvolvimento futuro.
          </p>
        </CardHeader>
        <CardContent>
          {acceptedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !acceptedQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">Ainda não há sugestões aceites neste âmbito.</p>
          ) : (
            <ScrollArea className="h-[min(320px,40vh)] pr-4">
              <ul className="space-y-3 text-sm">
                {acceptedQuery.data.map((s) => (
                  <li key={s.id} className="border-b border-border/60 pb-3 last:border-0">
                    <div className="flex flex-wrap gap-2 items-center mb-1">
                      <span className="font-medium">{s.title}</span>
                      {isSuper ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {s.tenantLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap text-xs">{s.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {s.authorName ?? "—"}
                      {s.acceptedAt ? ` · Aceite em ${new Date(s.acceptedAt).toLocaleString("pt-PT")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
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
                            r.status === "accepted"
                              ? "default"
                              : r.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {r.status === "pending"
                            ? "Pendente"
                            : r.status === "accepted"
                              ? "Aceite"
                              : "Recusada"}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap text-xs">
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

      <AlertDialog open={!!reviewOpen} onOpenChange={(o) => !o && setReviewOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewOpen?.decision === "accepted" ? "Aceitar sugestão?" : "Recusar sugestão?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Opcional: nota interna visível no histórico da sugestão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Nota (opcional)"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            className="max-h-32"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmReview();
              }}
              disabled={reviewMutation.isPending}
              className={
                reviewOpen?.decision === "rejected" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""
              }
            >
              {reviewMutation.isPending ? "A guardar…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
