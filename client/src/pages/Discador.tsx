import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PhoneCall, RefreshCw, Ban, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Discador() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "vendedor";

  const statsQuery = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 120000 });
  const queueCount = statsQuery.data?.dialerQueueEligibleCount ?? null;

  const nextQuery = trpc.dialer.next.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const outcomeMutation = trpc.dialer.outcome.useMutation({
    onSuccess: async () => {
      toast.success("Registo guardado. Próximo número...");
      setStep("idle");
      setNotes("");
      setDisposition("");
      setReturnDate("");
      await Promise.all([nextQuery.refetch(), statsQuery.refetch()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const blacklistMutation = trpc.blacklist.add.useMutation({
    onSuccess: async () => {
      toast.success("Número adicionado à lista negra.");
      setBlacklistReason("");
      setBlacklistOpen(false);
      await Promise.all([nextQuery.refetch(), statsQuery.refetch()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const payload: { contact?: { id: number; phone?: string | null; name?: string | null }; source?: string } | null =
    nextQuery.data ?? null;
  const contact = payload?.contact;
  const isPendente = payload?.source === "pendente";

  const [step, setStep] = useState<"idle" | "after_call">("idle");
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");

  useEffect(() => {
    if (contact) {
      setStep("idle");
    }
  }, [contact?.id]);

  const telHref = useMemo(() => {
    const phone = String(contact?.phone || "").trim();
    if (!phone) return "";
    return `tel:${phone}`;
  }, [contact?.phone]);

  const queueLow = typeof queueCount === "number" && queueCount < 10;
  const leadershipStockHint =
    crmRole === "ce" || crmRole === "coordenador"
      ? "Carregue mais contactos na Base de Dados."
      : "Informe o Chefe de Equipa para repor números na base.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discador</h1>
          <p className="text-muted-foreground">Um contacto por vez, com registo obrigatório</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => nextQuery.refetch()} disabled={nextQuery.isFetching}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {queueLow ? (
        <Card className="border border-amber-500/35 bg-amber-500/5 shadow-sm">
          <CardContent className="py-3 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium text-amber-950 dark:text-amber-100">Fila com poucos números</div>
              <p className="text-muted-foreground mt-0.5">
                Contactos elegíveis (novos ou fora do período de 30 dias): <strong>{queueCount}</strong>.{" "}
                {leadershipStockHint}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {nextQuery.isError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {(nextQuery.error as { message?: string })?.message || "Não foi possível carregar o próximo contacto."}
          </CardContent>
        </Card>
      ) : null}

      {!contact ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <p>Sem contactos disponíveis na fila.</p>
            <p className="text-xs max-w-md mx-auto">
              Os números não voltam a ser atribuídos antes de 30 dias após a última marcação. Se a base estiver
              pequena, repõe-se stock na Base de Dados.
            </p>
            {typeof queueCount === "number" ? (
              <p className="text-xs">Elegíveis agora: {queueCount}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-sm lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Contacto ativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isPendente ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Pendente para ligar agora</div>
                  <div className="text-muted-foreground">Este contacto saltou a fila normal.</div>
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Telefone</div>
                <div className="text-xl font-semibold">{contact.phone}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Nome</div>
                <div className="font-medium">{contact.name || "—"}</div>
              </div>

              <Button asChild className="w-full gap-2">
                <a href={telHref}>
                  <PhoneCall className="h-4 w-4" />
                  Ligar (externo)
                </a>
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="default" onClick={() => setStep("after_call")}>
                  Atendeu
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    outcomeMutation.mutate({
                      contactId: contact.id,
                      outcome: "nao_atende",
                      notes: notes || undefined,
                    })
                  }
                  disabled={outcomeMutation.isPending}
                >
                  Não atendeu
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setBlacklistOpen(true)}
                disabled={blacklistMutation.isPending || !contact.phone}
              >
                <Ban className="h-4 w-4" />
                Lista negra (não voltar a ligar)
              </Button>

              <AlertDialog open={blacklistOpen} onOpenChange={setBlacklistOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Adicionar à lista negra?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este número deixa de ser contactado pelo CRM. Confirme apenas se o cliente pediu para não ser
                      chamado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2 py-2">
                    <Label>Motivo (opcional)</Label>
                    <Textarea
                      value={blacklistReason}
                      onChange={(e) => setBlacklistReason(e.target.value)}
                      placeholder="Ex.: pediu não ser contactado"
                      rows={3}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={blacklistMutation.isPending || !contact.phone}
                      onClick={() => {
                        if (!contact.phone) return;
                        blacklistMutation.mutate({
                          phone: String(contact.phone).trim(),
                          reason: blacklistReason.trim() || undefined,
                        });
                      }}
                    >
                      {blacklistMutation.isPending ? "A confirmar…" : "Confirmar lista negra"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Feedback & Qualificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="O que aconteceu na chamada..."
                />
              </div>

              {step === "after_call" ? (
                <>
                  <div className="space-y-2">
                    <Label>Destino *</Label>
                    <Select value={disposition} onValueChange={setDisposition}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {disposition === "pendente" ? (
                    <div className="space-y-2">
                      <Label>Data/Hora de retorno *</Label>
                      <Input
                        type="datetime-local"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={
                      !disposition || (disposition === "pendente" && !returnDate) || outcomeMutation.isPending
                    }
                    onClick={() =>
                      outcomeMutation.mutate({
                        contactId: contact.id,
                        outcome: "atendeu",
                        notes: notes || undefined,
                        disposition: disposition as "lead" | "pendente",
                        pendenteReturnDate:
                          disposition === "pendente" ? new Date(returnDate).toISOString() : undefined,
                        pendenteNotes: disposition === "pendente" ? notes || undefined : undefined,
                      })
                    }
                  >
                    {outcomeMutation.isPending ? "A guardar..." : "Guardar e ir ao próximo"}
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Clique em <strong>Atendeu</strong> para qualificar como Lead ou criar Pendente.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
