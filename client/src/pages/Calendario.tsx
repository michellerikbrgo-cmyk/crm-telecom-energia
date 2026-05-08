import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Plus, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export default function Calendario() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "geral",
    allDay: true,
  });

  const range = useMemo(() => {
    const from = startOfDay(selectedDate);
    const to = addDays(from, 1);
    return { from, to };
  }, [selectedDate]);

  const eventsQuery = trpc.calendar.list.useQuery({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  } as any);

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: async () => {
      toast.success("Evento criado");
      setShowDialog(false);
      setForm({ title: "", description: "", type: "geral", allDay: true });
      await eventsQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMutation = trpc.calendar.remove.useMutation({
    onSuccess: async () => {
      toast.success("Evento removido");
      await eventsQuery.refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-muted-foreground">Eventos e lembretes por dia</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-sm lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                Selecionar data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(startOfDay(d))}
                className="rounded-lg border"
              />
              <div className="mt-4 flex gap-2">
                <Dialog open={showDialog} onOpenChange={setShowDialog}>
                  <DialogTrigger asChild>
                    <Button className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      Novo evento
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar evento</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Título *</Label>
                        <Input
                          value={form.title}
                          onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                          placeholder="Ex: Follow-up cliente"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select value={form.type} onValueChange={(v) => setForm((s) => ({ ...s, type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="geral">Geral</SelectItem>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="venda">Venda</SelectItem>
                            <SelectItem value="instalacao">Instalação</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Textarea
                          value={form.description}
                          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                          placeholder="Notas (opcional)"
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!form.title || createMutation.isPending}
                        onClick={() =>
                          createMutation.mutate({
                            title: form.title,
                            description: form.description || undefined,
                            type: form.type as any,
                            startAt: range.from.toISOString(),
                            endAt: undefined,
                            allDay: true,
                          } as any)
                        }
                      >
                        {createMutation.isPending ? "A criar..." : "Criar"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">
                Eventos do dia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!eventsQuery.data?.length ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <CalendarIcon className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Sem eventos</p>
                  <p className="text-xs mt-1">Crie um evento para esta data</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {eventsQuery.data.map((ev: any) => (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ev.title}</div>
                        {ev.description ? (
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {ev.description}
                          </div>
                        ) : null}
                        <div className="text-xs text-muted-foreground mt-1">
                          Tipo: {ev.type}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate({ id: ev.id } as any)}
                        disabled={removeMutation.isPending}
                        aria-label="Remover evento"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
