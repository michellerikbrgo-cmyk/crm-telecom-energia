import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OperadoraAtualSelect } from "@/components/OperadoraAtualSelect";
import { PriorityStars } from "@/components/PriorityStars";
import { PhoneCall, Ban, AlertTriangle, Calendar, ClipboardList, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";

const FEEDBACK_DESTINATIONS = [
  { value: "nao_atende", label: "Não atende" },
  { value: "pendente", label: "Pendente" },
  { value: "cliente_fidelizado", label: "Cliente Fidelizado" },
  { value: "no_interest", label: "Sem interesse" },
  { value: "no_fiber_coverage", label: "Sem cobertura" },
  { value: "vodafone_client", label: "Cliente Vodafone" },
  { value: "fechado_venda", label: "Venda" },
  { value: "lista_negra", label: "Blacklist" },
] as const;

type Destination = (typeof FEEDBACK_DESTINATIONS)[number]["value"];

export default function Discador() {
  const { user } = useAuth();
  const authUser = user as { id?: number; crmRole?: string } | null;
  const authUserId = authUser?.id;
  const crmRole = authUser?.crmRole ?? "vendedor";
  const canSubmitDialerFeedback = ["vendedor", "cej", "ce", "coordenador"].includes(crmRole);

  const statsQuery = trpc.dashboard.stats.useQuery(undefined, { refetchInterval: 120000 });
  const queueCount = statsQuery.data?.dialerQueueEligibleCount ?? null;

  const nextQuery = trpc.dialer.next.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  const utils = trpc.useUtils();

  const feedbackMutation = trpc.feedback.submitFeedback.useMutation({
    onSuccess: async () => {
      toast.success("Feedback guardado. A carregar o próximo contacto…");
      setStep("idle");
      setNotes("");
      setDestination("pendente");
      await Promise.all([nextQuery.refetch(), statsQuery.refetch()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const createPendenteMutation = trpc.pendentes.create.useMutation({
    onSuccess: async () => {
      toast.success("Pendente criado.");
      pendCloseOkRef.current = true;
      setPendModalOpen(false);
      setStep("idle");
      setNotes("");
      setDestination("pendente");
      await Promise.all([nextQuery.refetch(), statsQuery.refetch(), utils.pendentes.list.invalidate()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const createSaleMutation = trpc.sales.create.useMutation({
    onSuccess: async () => {
      toast.success("Venda registada.");
      saleCloseOkRef.current = true;
      setSaleModalOpen(false);
      setStep("idle");
      setNotes("");
      setDestination("pendente");
      await Promise.all([nextQuery.refetch(), statsQuery.refetch(), utils.sales.pipeline.invalidate()]);
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const releaseCancelMutation = trpc.dialer.releaseWorkflowCancel.useMutation();
  const pendCloseOkRef = useRef(false);
  const saleCloseOkRef = useRef(false);

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
  const [destination, setDestination] = useState<Destination>("pendente");
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");

  const [pendModalOpen, setPendModalOpen] = useState(false);
  const [pendForm, setPendForm] = useState({
    contactName: "",
    contactPhone: "",
    operadoraAtual: "",
    historicoChamada: "",
    returnDate: "",
    returnTime: "",
    assignVendedorId: "" as string,
    priorityLevel: 3,
    notes: "",
    offerDesired: "",
    mode: "pendente" as "pendente" | "cliente_fidelizado",
  });

  const operatorsQuery = trpc.pendentes.assignableOperators.useQuery(undefined, {
    enabled: pendModalOpen,
  });

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleForm, setSaleForm] = useState({
    contactName: "",
    operadoraAtual: "",
    product: "telecom" as "telecom" | "energia",
    offer: "",
    value: "",
    installationDate: "",
  });

  useEffect(() => {
    if (!contact?.id) return;
    setNotes("");
    setDestination("pendente");
    setStep(canSubmitDialerFeedback ? "after_call" : "idle");
    setPendModalOpen(false);
    setSaleModalOpen(false);
    pendCloseOkRef.current = false;
    saleCloseOkRef.current = false;
    setPendForm({
      contactName: contact.name?.trim() || "",
      contactPhone: contact.phone?.trim() || "",
      operadoraAtual: "",
      historicoChamada: "",
      returnDate: "",
      returnTime: "",
      assignVendedorId: authUserId != null ? String(authUserId) : "",
      priorityLevel: 3,
      notes: "",
      offerDesired: "",
      mode: "pendente",
    });
    setSaleForm({
      contactName: contact.name?.trim() || "",
      operadoraAtual: "",
      product: "telecom",
      offer: "",
      value: "",
      installationDate: "",
    });
  }, [contact?.id, canSubmitDialerFeedback, authUserId]);

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

  const onPendModalOpenChange = (open: boolean) => {
    if (open) pendCloseOkRef.current = false;
    if (!open && contact?.id && !pendCloseOkRef.current) {
      void releaseCancelMutation.mutate({ contactId: contact.id });
    }
    if (!open) pendCloseOkRef.current = false;
    setPendModalOpen(open);
  };

  const onSaleModalOpenChange = (open: boolean) => {
    if (open) saleCloseOkRef.current = false;
    if (!open && contact?.id && !saleCloseOkRef.current) {
      void releaseCancelMutation.mutate({ contactId: contact.id });
    }
    if (!open) saleCloseOkRef.current = false;
    setSaleModalOpen(open);
  };

  const submitFeedback = () => {
    if (!contact) return;
    if (destination === "pendente" || destination === "cliente_fidelizado") {
      pendCloseOkRef.current = false;
      setPendForm((f) => ({
        ...f,
        contactName: contact.name?.trim() || f.contactName,
        contactPhone: contact.phone?.trim() || f.contactPhone,
        historicoChamada: notes.trim() || "",
        notes: f.notes,
        mode: destination === "cliente_fidelizado" ? "cliente_fidelizado" : "pendente",
        assignVendedorId: f.assignVendedorId || (authUserId != null ? String(authUserId) : ""),
      }));
      setPendModalOpen(true);
      return;
    }
    if (destination === "fechado_venda") {
      saleCloseOkRef.current = false;
      setSaleForm((f) => ({
        ...f,
        contactName: contact.name?.trim() || f.contactName,
      }));
      setSaleModalOpen(true);
      return;
    }
    feedbackMutation.mutate({
      contactId: contact.id,
      destination,
      observacoes: notes.trim() || undefined,
    });
  };

  const savePendenteFromModal = () => {
    if (!contact) return;
    if (!pendForm.returnDate.trim()) {
      toast.error("Indique a data de retorno.");
      return;
    }
    if (!pendForm.returnTime.trim()) {
      toast.error("Indique a hora de retorno.");
      return;
    }
    if (!pendForm.historicoChamada.trim()) {
      toast.error("O histórico / notas da chamada é obrigatório.");
      return;
    }
    const assignId = Number(pendForm.assignVendedorId);
    if (!Number.isFinite(assignId) || assignId <= 0) {
      toast.error("Seleccione o operador para o retorno.");
      return;
    }
    const returnIso = `${pendForm.returnDate.trim()}T${pendForm.returnTime.trim()}`;
    const returnParsed = new Date(returnIso);
    if (Number.isNaN(returnParsed.getTime())) {
      toast.error("Data ou hora de retorno inválida.");
      return;
    }
    createPendenteMutation.mutate({
      contactId: contact.id,
      name: pendForm.contactName.trim() || undefined,
      phone: pendForm.contactPhone.trim() || undefined,
      operadoraAtual: pendForm.operadoraAtual || undefined,
      returnDate: returnParsed.toISOString(),
      historicoChamada: pendForm.historicoChamada.trim(),
      notes: pendForm.notes.trim() || undefined,
      offerDesired: pendForm.offerDesired.trim() || undefined,
      priorityLevel: pendForm.priorityLevel,
      assignVendedorId: assignId,
      contactStatusAfter:
        pendForm.mode === "cliente_fidelizado" ? "cliente_fidelizado" : "pendente",
      finalizeDialer: true,
    });
  };

  const saveSaleFromModal = () => {
    if (!contact) return;
    createSaleMutation.mutate({
      contactId: contact.id,
      name: saleForm.contactName.trim() || undefined,
      operadoraAtual: saleForm.operadoraAtual || undefined,
      product: saleForm.product,
      offer: saleForm.offer.trim() || undefined,
      value: saleForm.value.trim() || undefined,
      installationDate: saleForm.installationDate.trim() || undefined,
      finalizeDialer: true,
      dialerNotes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Discador</h1>
        <p className="text-muted-foreground">Um contacto de cada vez</p>
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
              A fila inclui contactos novos, recontactos «não atende» e reaberturas após exclusão temporária (ex.: sem
              interesse).
            </p>
            {typeof queueCount === "number" ? (
              <p className="text-xs">Elegíveis agora: {queueCount}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-sm lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Contacto ativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {isPendente ? (
                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">Pendente prioritário</div>
                  <div className="text-xs text-muted-foreground">Fora da fila normal.</div>
                </div>
              ) : null}

              <div>
                <div className="text-xs text-muted-foreground">Telefone</div>
                <div className="text-xl font-semibold">{contact.phone}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Nome</div>
                <div className="font-medium">{contact.name || "—"}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/calendario?contactId=${contact.id}`}>
                    <Calendar className="h-3.5 w-3.5" />
                    Calendário
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/acompanhamento?contactId=${contact.id}`}>
                    <ClipboardList className="h-3.5 w-3.5" />
                    Acompanhamento
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href="/ia-objecoes?tab=mercado">
                    <Sparkles className="h-3.5 w-3.5" />
                    IA
                  </Link>
                </Button>
              </div>

              {telHref ? (
                <Button asChild className="w-full gap-2">
                  <a href={telHref}>
                    <PhoneCall className="h-4 w-4" />
                    Ligar
                  </a>
                </Button>
              ) : (
                <Button type="button" className="w-full gap-2" disabled>
                  <PhoneCall className="h-4 w-4" />
                  Ligar
                </Button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {canSubmitDialerFeedback ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStep((s) => (s === "after_call" ? "idle" : "after_call"))}
                  >
                    {step === "after_call" ? "Ocultar feedback" : "Feedback"}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
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
                size="sm"
                className="w-full gap-2 border-destructive/40 text-destructive"
                onClick={() => setBlacklistOpen(true)}
                disabled={blacklistMutation.isPending || !contact.phone}
              >
                <Ban className="h-4 w-4" />
                Lista negra rápida
              </Button>

              <AlertDialog open={blacklistOpen} onOpenChange={setBlacklistOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Lista negra</AlertDialogTitle>
                    <AlertDialogDescription>
                      O número deixa de ser contactado. Confirme se o cliente pediu para não voltar a ser chamado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2 py-2">
                    <Label>Motivo (opcional)</Label>
                    <Textarea
                      value={blacklistReason}
                      onChange={(e) => setBlacklistReason(e.target.value)}
                      rows={2}
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
                      {blacklistMutation.isPending ? "…" : "Confirmar"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  className="min-h-[72px] resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Resumo da chamada…"
                />
              </div>

              {step === "after_call" && canSubmitDialerFeedback ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Resultado</Label>
                    <Select value={destination} onValueChange={(v) => setDestination(v as Destination)}>
                      <SelectTrigger className="h-9">
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

                  {destination === "lista_negra" ? (
                    <p className="text-xs text-muted-foreground">
                      O motivo pode ir nas notas. Equivale a adicionar o número à lista negra.
                    </p>
                  ) : null}

                  {destination === "pendente" ? (
                    <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                      Ao submeter, abrimos o formulário de <strong>novo pendente</strong> com este contacto para
                      preencher retorno, prioridade e histórico.
                    </p>
                  ) : null}

                  {destination === "cliente_fidelizado" ? (
                    <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                      Ao submeter, abrimos o <strong>pendente de retorno</strong> para cliente fidelizado (data, hora e
                      operador).
                    </p>
                  ) : null}

                  {destination === "fechado_venda" ? (
                    <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                      Ao submeter, abrimos a <strong>ficha de venda</strong> (produto, oferta e instalação).
                    </p>
                  ) : null}

                  <Button
                    className="w-full"
                    size="lg"
                    disabled={
                      !canSubmitFeedback ||
                      feedbackMutation.isPending ||
                      createPendenteMutation.isPending ||
                      createSaleMutation.isPending
                    }
                    onClick={() => submitFeedback()}
                  >
                    {feedbackMutation.isPending || createPendenteMutation.isPending || createSaleMutation.isPending
                      ? "A processar…"
                      : "Submeter e próximo"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {canSubmitDialerFeedback
                    ? "Use «Feedback» para qualificar ou o atalho «Não atendeu»."
                    : "Sem permissão para qualificar — use «Não atendeu» ou lista negra."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={pendModalOpen} onOpenChange={onPendModalOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendForm.mode === "cliente_fidelizado" ? "Cliente fidelizado — retorno" : "Novo pendente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label>Contacto (telefone)</Label>
              <Input
                value={pendForm.contactPhone}
                onChange={(e) => setPendForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className="h-9 font-mono"
                placeholder="9xxxxxxxx"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome do cliente</Label>
              <Input
                value={pendForm.contactName}
                onChange={(e) => setPendForm((f) => ({ ...f, contactName: e.target.value }))}
                className="h-9"
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-1">
              <Label>Operadora actual</Label>
              <OperadoraAtualSelect
                value={pendForm.operadoraAtual}
                onValueChange={(v) => setPendForm((f) => ({ ...f, operadoraAtual: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Histórico / notas da chamada *</Label>
              <Textarea
                value={pendForm.historicoChamada}
                onChange={(e) => setPendForm((f) => ({ ...f, historicoChamada: e.target.value }))}
                className="min-h-[88px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data de retorno *</Label>
                <Input
                  type="date"
                  value={pendForm.returnDate}
                  onChange={(e) => setPendForm((f) => ({ ...f, returnDate: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label>Hora *</Label>
                <Input
                  type="time"
                  value={pendForm.returnTime}
                  onChange={(e) => setPendForm((f) => ({ ...f, returnTime: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Operador (retorno) *</Label>
              <Select
                value={pendForm.assignVendedorId || undefined}
                onValueChange={(v) => setPendForm((f) => ({ ...f, assignVendedorId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar operador" />
                </SelectTrigger>
                <SelectContent>
                  {(operatorsQuery.data ?? []).map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>
                      {op.name || `Utilizador #${op.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridade</Label>
              <PriorityStars
                value={pendForm.priorityLevel}
                onChange={(n) => setPendForm((f) => ({ ...f, priorityLevel: n }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas internas (opcional)</Label>
              <Textarea
                className="min-h-[56px]"
                value={pendForm.notes}
                onChange={(e) => setPendForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Oferta desejada (opcional)</Label>
              <Input
                value={pendForm.offerDesired}
                onChange={(e) => setPendForm((f) => ({ ...f, offerDesired: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onPendModalOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={savePendenteFromModal} disabled={createPendenteMutation.isPending}>
              {createPendenteMutation.isPending ? "A guardar…" : "Guardar pendente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saleModalOpen} onOpenChange={onSaleModalOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <div>
                <span className="text-muted-foreground">Tel.</span>{" "}
                <span className="font-mono font-medium">{contact?.phone || "—"}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nome do cliente</Label>
              <Input
                value={saleForm.contactName}
                onChange={(e) => setSaleForm((f) => ({ ...f, contactName: e.target.value }))}
                className="h-9"
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-1">
              <Label>Operadora actual</Label>
              <OperadoraAtualSelect
                value={saleForm.operadoraAtual}
                onValueChange={(v) => setSaleForm((f) => ({ ...f, operadoraAtual: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Produto</Label>
              <Select
                value={saleForm.product}
                onValueChange={(v) => setSaleForm((f) => ({ ...f, product: v as "telecom" | "energia" }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telecom">Telecom</SelectItem>
                  <SelectItem value="energia">Energia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Oferta (opcional)</Label>
              <Input
                value={saleForm.offer}
                onChange={(e) => setSaleForm((f) => ({ ...f, offer: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor (opcional)</Label>
              <Input
                value={saleForm.value}
                onChange={(e) => setSaleForm((f) => ({ ...f, value: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de instalação (opcional)</Label>
              <Input
                type="datetime-local"
                value={saleForm.installationDate}
                onChange={(e) => setSaleForm((f) => ({ ...f, installationDate: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onSaleModalOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveSaleFromModal} disabled={createSaleMutation.isPending}>
              {createSaleMutation.isPending ? "A guardar…" : "Guardar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
