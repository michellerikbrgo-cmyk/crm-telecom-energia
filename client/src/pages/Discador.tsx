import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PhoneCall, RefreshCw, Ban, AlertTriangle, Calendar, ClipboardList, FileText, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";

const FEEDBACK_DESTINATIONS = [
  { value: "none", label: "Sem qualificação" },
  { value: "no_interest", label: "Sem interesse" },
  { value: "vodafone_client", label: "Cliente Vodafone" },
  { value: "other", label: "Outros" },
  { value: "no_fiber_coverage", label: "Cliente não tem cobertura de fibra" },
  { value: "fidelizado", label: "Fidelizado" },
  { value: "pendente", label: "Pendente (venda em curso)" },
] as const;

const OPERADORAS = ["NOS", "MEO", "NOWO", "DIGI", "WOO", "AMIGO", "UZO"] as const;

type Destination = (typeof FEEDBACK_DESTINATIONS)[number]["value"];

export default function Discador() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "vendedor";
  const canSubmitDialerFeedback = ["vendedor", "cej", "ce", "coordenador"].includes(crmRole);

  const statsQuery = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 120000 });
  const queueCount = statsQuery.data?.dialerQueueEligibleCount ?? null;

  const nextQuery = trpc.dialer.next.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const feedbackMutation = trpc.feedback.submitFeedback.useMutation({
    onSuccess: async () => {
      toast.success("Feedback guardado. A carregar o próximo contacto…");
      setStep("idle");
      setNotes("");
      setDestination("none");
      setObservacoes("");
      setFidelDate("");
      setOperadora("");
      setPendenteReturn("");
      setPendentePriority(3);
      setTitularTroca(false);
      setAntigoNome("");
      setAntigoNif("");
      setPreAgendamento("");
      await Promise.all([nextQuery.refetch(), statsQuery.refetch()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const outcomeMutation = trpc.dialer.outcome.useMutation({
    onSuccess: async () => {
      toast.success("Registo guardado. Próximo número…");
      setStep("idle");
      setNotes("");
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
  const [destination, setDestination] = useState<Destination>("none");
  const [observacoes, setObservacoes] = useState("");
  const [fidelDate, setFidelDate] = useState("");
  const [operadora, setOperadora] = useState<(typeof OPERADORAS)[number] | "">("");
  const [pendenteReturn, setPendenteReturn] = useState("");
  const [pendentePriority, setPendentePriority] = useState(3);
  const [titularTroca, setTitularTroca] = useState(false);
  const [antigoNome, setAntigoNome] = useState("");
  const [antigoNif, setAntigoNif] = useState("");
  const [preAgendamento, setPreAgendamento] = useState("");
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");

  useEffect(() => {
    if (!contact?.id) return;
    setNotes("");
    setDestination("none");
    setObservacoes("");
    setFidelDate("");
    setOperadora("");
    setPendenteReturn("");
    setPendentePriority(3);
    setTitularTroca(false);
    setAntigoNome("");
    setAntigoNif("");
    setPreAgendamento("");
    setStep(canSubmitDialerFeedback ? "after_call" : "idle");
  }, [contact?.id, canSubmitDialerFeedback]);

  useEffect(() => {
    if (step === "after_call" && !canSubmitDialerFeedback) setStep("idle");
  }, [step, canSubmitDialerFeedback]);

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

  const canSubmitFeedback = !!contact;

  const submitFeedback = () => {
    if (!contact) return;
    if (!fidelDate.trim()) {
      toast.error("A data de fidelização é obrigatória.");
      return;
    }
    if (destination === "pendente" && !pendenteReturn.trim()) {
      toast.error("Defina a data de retorno para o pendente.");
      return;
    }
    if (titularTroca && (!antigoNome.trim() || !antigoNif.trim())) {
      toast.error("Com troca de titularidade, preencha nome e NIF do antigo titular.");
      return;
    }
    const detail: Record<string, string> = {
      produto: "telecom",
      nome_cliente: String(contact.name || "").trim(),
      contacto_tel: String(contact.phone || "").trim(),
    };
    feedbackMutation.mutate({
      contactId: contact.id,
      destination,
      observacoes: observacoes.trim() || notes.trim() || undefined,
      fidelEndDate: fidelDate,
      operadora: destination === "fidelizado" ? (operadora || undefined) : undefined,
      pendenteReturnDate: destination === "pendente" ? pendenteReturn : undefined,
      pendentePriorityLevel: destination === "pendente" ? pendentePriority : undefined,
      pendenteSaleDetail: destination === "pendente" ? detail : undefined,
      titularTroca: titularTroca || undefined,
      antigoTitularNome: titularTroca ? antigoNome.trim() : undefined,
      antigoTitularNif: titularTroca ? antigoNif.trim() : undefined,
      preAgendamentoAt: preAgendamento.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discador</h1>
          <p className="text-muted-foreground">Um contacto de cada vez</p>
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
                Contactos elegíveis na fila: <strong>{queueCount}</strong>. {leadershipStockHint}
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
              A fila inclui contactos novos, com exclusões por feedback (90 dias), fidelização activa, Vodafone, etc.
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

              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label className="text-xs font-medium">Data de fidelização (obrigatória)</Label>
                <Input type="date" value={fidelDate} onChange={(e) => setFidelDate(e.target.value)} />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Preencha antes de ligar e ao submeter o feedback — fica registada no contacto.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Continuar noutras áreas</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="h-auto min-h-10 py-2 gap-1.5 text-xs justify-start px-2" asChild>
                    <Link href={`/calendario?contactId=${contact.id}`}>
                      <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Calendário
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto min-h-10 py-2 gap-1.5 text-xs justify-start px-2" asChild>
                    <Link href={`/acompanhamento?contactId=${contact.id}`}>
                      <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Acompanhamento
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto min-h-10 py-2 gap-1.5 text-xs justify-start px-2" asChild>
                    <Link href={`/contratos?contactId=${contact.id}`}>
                      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Contratos
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto min-h-10 py-2 gap-1.5 text-xs justify-start px-2" asChild>
                    <Link href="/ia-objecoes?tab=mercado">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      IA & mercado
                    </Link>
                  </Button>
                </div>
              </div>

              {telHref ? (
                <Button asChild className="w-full gap-2" disabled={!fidelDate.trim()}>
                  <a href={telHref}>
                    <PhoneCall className="h-4 w-4" />
                    Ligar (externo)
                  </a>
                </Button>
              ) : (
                <Button type="button" className="w-full gap-2" disabled>
                  <PhoneCall className="h-4 w-4" />
                  Ligar (externo)
                </Button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {canSubmitDialerFeedback ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep((s) => (s === "after_call" ? "idle" : "after_call"))}
                  >
                    {step === "after_call" ? "Ocultar feedback" : "Mostrar feedback"}
                  </Button>
                ) : (
                  <Button variant="default" disabled title="Sem acesso ao discador nesta conta.">
                    Atendeu
                  </Button>
                )}
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
                <Label>Notas da chamada</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Resumo da chamada…"
                />
              </div>

              {step === "after_call" && canSubmitDialerFeedback ? (
                <>
                  <div className="space-y-2">
                    <Label>Destino</Label>
                    <Select value={destination} onValueChange={(v) => setDestination(v as Destination)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_DESTINATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {destination === "fidelizado" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2 text-xs text-muted-foreground rounded-md border p-2">
                        A data de fidelização foi preenchida na coluna do contacto (obrigatória antes da chamada).
                      </div>
                      <div className="space-y-2">
                        <Label>Operadora actual</Label>
                        <Select value={operadora || undefined} onValueChange={(v) => setOperadora(v as (typeof OPERADORAS)[number])}>
                          <SelectTrigger>
                            <SelectValue placeholder="Operadora…" />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERADORAS.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Observações</Label>
                        <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
                      </div>
                    </div>
                  ) : null}

                  {destination === "pendente" ? (
                    <div className="grid gap-4 sm:grid-cols-2 rounded-lg border p-3">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Data de retorno *</Label>
                        <Input
                          type="datetime-local"
                          value={pendenteReturn}
                          onChange={(e) => setPendenteReturn(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prioridade (1–5)</Label>
                        <Select
                          value={String(pendentePriority)}
                          onValueChange={(v) => setPendentePriority(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {n === 5 ? "(máx.)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Pré-agendamento (opcional)</Label>
                        <Input
                          type="datetime-local"
                          value={preAgendamento}
                          onChange={(e) => setPreAgendamento(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="titular-troca"
                      checked={titularTroca}
                      onCheckedChange={(c) => setTitularTroca(!!c)}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="titular-troca" className="cursor-pointer font-medium leading-snug">
                        Contrato no operador actual em nome de outra pessoa?
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se activo, preencha os dados do antigo titular abaixo.
                      </p>
                    </div>
                  </div>
                  {titularTroca ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nome do antigo titular *</Label>
                        <Input value={antigoNome} onChange={(e) => setAntigoNome(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>NIF do antigo titular *</Label>
                        <Input value={antigoNif} onChange={(e) => setAntigoNif(e.target.value)} />
                      </div>
                    </div>
                  ) : null}

                  {destination === "other" ? (
                    <div className="space-y-2">
                      <Label>Observações</Label>
                      <Textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Descreva o motivo, se quiser"
                        rows={4}
                      />
                    </div>
                  ) : null}

                  {(destination === "no_interest" ||
                    destination === "vodafone_client" ||
                    destination === "no_fiber_coverage") &&
                  destination ? (
                    <div className="space-y-2">
                      <Label>Observações</Label>
                      <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
                    </div>
                  ) : null}

                  <Button
                    className="w-full"
                    disabled={!canSubmitFeedback || feedbackMutation.isPending || !fidelDate.trim()}
                    onClick={() => submitFeedback()}
                  >
                    {feedbackMutation.isPending ? "A guardar…" : "Submeter e ir ao próximo"}
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {canSubmitDialerFeedback ? (
                    <p>
                      Clica em <strong className="text-foreground">Mostrar feedback</strong> na coluna do contacto se
                      tiveres ocultado o formulário.
                    </p>
                  ) : (
                    <p>
                      Sem permissão para qualificar nesta vista. Usa «Não atendeu» ou lista negra, se aplicável.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
