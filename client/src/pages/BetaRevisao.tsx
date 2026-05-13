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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Beaker, Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

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

/** Revisão de sugestões pendentes — não aparece em /beta (só roadmap aceites). */
export default function BetaRevisao() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "";
  const isSuper = !!(user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin;
  const userTenantId = (user as { tenantId?: number | null } | null)?.tenantId;
  const allowed = isSuper || crmRole === "coordenador";

  const [reviewOpen, setReviewOpen] = useState<{ id: number; decision: "accepted" | "rejected" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const utils = trpc.useUtils();
  const pendingQuery = trpc.beta.listPending.useQuery(undefined, { enabled: allowed });

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

  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Beta — revisão</h1>
        <p className="text-muted-foreground">Sem permissão para rever sugestões.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => setLocation("/beta")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar ao Beta
        </Button>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Beaker className="h-8 w-8 text-primary" aria-hidden />
          Beta — revisão de pendentes
        </h1>
        <p className="text-muted-foreground">
          Aceitar ou recusar sugestões em fila. O item <strong>Beta</strong> no menu abre o roadmap; este ecrã acede-se a
          partir do botão «Revisar pendentes» na página Beta (coordenadores e Super Admin).
        </p>
      </div>

      <Card className="border-0 shadow-sm border-l-4 border-l-amber-500/80">
        <CardHeader>
          <CardTitle className="text-lg">Pendentes</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Lista global. Só pode rever linhas da sua empresa (coordenador) ou todas (Super Admin).
          </p>
        </CardHeader>
        <CardContent>
          {pendingQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !pendingQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma sugestão pendente.</p>
          ) : (
            <div className="space-y-4">
              {pendingQuery.data.map((row) => {
                const canAct = canReviewSuggestionRow(row, isSuper, crmRole, userTenantId);
                return (
                  <div key={row.id} className="rounded-lg border p-4 space-y-2 bg-card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{row.title}</p>
                          <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                            {row.tenantLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Por {row.authorName ?? `#${row.authorId}`} ·{" "}
                          {row.createdAt ? new Date(row.createdAt).toLocaleString("pt-PT") : ""}
                        </p>
                      </div>
                      {canAct ? (
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
                      ) : (
                        <p className="text-xs text-muted-foreground shrink-0">Outra empresa</p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.body}</p>
                  </div>
                );
              })}
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
                reviewOpen?.decision === "rejected"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  A guardar…
                </>
              ) : (
                "Confirmar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
