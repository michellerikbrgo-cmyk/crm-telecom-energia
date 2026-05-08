import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function Discador() {
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
      await nextQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payload: any = nextQuery.data;
  const contact = payload?.contact;
  const isPendente = payload?.source === "pendente";

  const [step, setStep] = useState<"idle" | "after_call">("idle");
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState("");
  const [returnDate, setReturnDate] = useState("");

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

        {!contact ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              Sem contactos disponíveis.
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
                  <Button
                    variant="default"
                    onClick={() => setStep("after_call")}
                  >
                    Atendeu
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      outcomeMutation.mutate({
                        contactId: contact.id,
                        outcome: "nao_atende",
                        notes: notes || undefined,
                      } as any)
                    }
                    disabled={outcomeMutation.isPending}
                  >
                    Não atendeu
                  </Button>
                </div>
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
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
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
                      disabled={!disposition || (disposition === "pendente" && !returnDate) || outcomeMutation.isPending}
                      onClick={() =>
                        outcomeMutation.mutate({
                          contactId: contact.id,
                          outcome: "atendeu",
                          notes: notes || undefined,
                          disposition: disposition as any,
                          pendenteReturnDate: disposition === "pendente" ? new Date(returnDate).toISOString() : undefined,
                          pendenteNotes: disposition === "pendente" ? notes || undefined : undefined,
                        } as any)
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

