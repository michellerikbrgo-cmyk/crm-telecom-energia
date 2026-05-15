import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Plus, Trash2, Search } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Calendario() {
  const search = useSearch();
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [showDialog, setShowDialog] = useState(false);
  const [prefillContactId, setPrefillContactId] = useState<number | null>(null);
  const [inviteeSearch, setInviteeSearch] = useState("");
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "geral",
    allDay: true,
  });

  useEffect(() => {
    const idStr = new URLSearchParams(search).get("contactId");
    if (!idStr) {
      setPrefillContactId(null);
      return;
    }
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id) || id < 1) {
      setPrefillContactId(null);
      return;
    }
    setPrefillContactId(id);
    setForm((s) => ({
      ...s,
      title: s.title.trim() ? s.title : `Follow-up contacto #${id}`,
    }));
    setShowDialog(true);
  }, [search]);

  const range = useMemo(() => {
    const from = startOfDay(selectedDate);
    const to = addDays(from, 1);
    return { from, to };
  }, [selectedDate]);

  const eventsQuery = trpc.calendar.list.useQuery({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });

  const todayAgendaQuery = trpc.calendar.todayAgenda.useQuery({
    date: selectedDate.toISOString(),
  });

  const pendingInvitesQuery = trpc.calendar.myPendingInvites.useQuery();
  const userSearchQuery = trpc.calendar.searchUsersByName.useQuery(
    { q: inviteeSearch.trim() },
    { enabled: inviteeSearch.trim().length >= 2 },
  );

  const setInviteesMutation = trpc.calendar.setInvitees.useMutation();
  const respondInviteMutation = trpc.calendar.respondInvite.useMutation({
    onSuccess: () => {
      void pendingInvitesQuery.refetch();
      void eventsQuery.refetch();
    },
  });

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: async (data) => {
      if (data.eventId && selectedInviteeIds.length) {
        await setInviteesMutation.mutateAsync({ eventId: data.eventId, userIds: selectedInviteeIds });
      }
      toast.success("Evento criado");
      setShowDialog(false);
      setPrefillContactId(null);
      setSelectedInviteeIds([]);
      setInviteeSearch("");
      setForm({ title: "", description: "", type: "geral", allDay: true });
      await eventsQuery.refetch();
      await todayAgendaQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const removeMutation = trpc.calendar.remove.useMutation({
    onSuccess: async () => {
      toast.success("Evento removido");
      await eventsQuery.refetch();
      await todayAgendaQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message),
  });

  const goToday = () => setSelectedDate(startOfDay(new Date()));

  const handleCreate = () => {
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      type: form.type as "geral" | "pendente" | "venda" | "instalacao",
      startAt: range.from.toISOString(),
      allDay: true,
      contactId: prefillContactId ?? undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-muted-foreground">
            Vista do dia — eventos, instalações e pré-agendamentos
          </p>
        </div>
        <Button type="button" variant="outline" onClick={goToday}>
          Hoje
        </Button>
      </div>

      {(pendingInvitesQuery.data?.length ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Convites pendentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvitesQuery.data!.map((inv) => (
              <div key={inv.inviteId} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2">
                <div className="text-sm">
                  <span className="font-medium">{inv.title}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(inv.startAt).toLocaleString("pt-PT")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={respondInviteMutation.isPending}
                    onClick={() =>
                      respondInviteMutation.mutate({ inviteId: inv.inviteId, status: "accepted" })
                    }
                  >
                    Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respondInviteMutation.isPending}
                    onClick={() =>
                      respondInviteMutation.mutate({ inviteId: inv.inviteId, status: "declined" })
                    }
                  >
                    Recusar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              {isSameDay(selectedDate, new Date()) ? "Hoje" : "Selecionar data"}
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
              <Dialog
                open={showDialog}
                onOpenChange={(o) => {
                  setShowDialog(o);
                  if (!o) {
                    setSelectedInviteeIds([]);
                    setInviteeSearch("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Novo evento
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Criar evento</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Título *</Label>
                      <Input
                        value={form.title}
                        onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                        placeholder="Ex.: Follow-up cliente"
                      />
                    </div>
                    {prefillContactId != null ? (
                      <p className="text-xs text-muted-foreground">
                        Contacto <span className="font-mono">#{prefillContactId}</span>
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={form.type} onValueChange={(v) => setForm((s) => ({ ...s, type: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="geral">Geral</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="venda">Venda</SelectItem>
                          <SelectItem value="instalacao">Instalação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Convidar (só nome)</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Pesquisar por nome"
                          value={inviteeSearch}
                          onChange={(e) => setInviteeSearch(e.target.value)}
                        />
                      </div>
                      {userSearchQuery.data && userSearchQuery.data.length > 0 && (
                        <div className="border rounded-md max-h-28 overflow-y-auto divide-y">
                          {userSearchQuery.data.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                              onClick={() => {
                                if (!selectedInviteeIds.includes(u.id)) {
                                  setSelectedInviteeIds((ids) => [...ids, u.id]);
                                }
                                setInviteeSearch(u.name || "");
                              }}
                            >
                              {u.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedInviteeIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedInviteeIds.map((id) => {
                            const name =
                              userSearchQuery.data?.find((u) => u.id === id)?.name || `#${id}`;
                            return (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="cursor-pointer"
                                onClick={() =>
                                  setSelectedInviteeIds((ids) => ids.filter((x) => x !== id))
                                }
                              >
                                {name} ×
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea
                        value={form.description}
                        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!form.title || createMutation.isPending}
                      onClick={handleCreate}
                    >
                      {createMutation.isPending ? "A criar…" : "Criar"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Agenda do dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Eventos</h3>
                {!eventsQuery.data?.length ? (
                  <p className="text-sm text-muted-foreground">Sem eventos neste dia.</p>
                ) : (
                  <div className="space-y-2">
                    {eventsQuery.data.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{ev.title}</div>
                          {ev.description ? (
                            <p className="text-sm text-muted-foreground">{ev.description}</p>
                          ) : null}
                          <Badge variant="outline" className="mt-1 text-xs">
                            {ev.type}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMutation.mutate({ id: ev.id })}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Instalações agendadas</h3>
                {!todayAgendaQuery.data?.installations?.length ? (
                  <p className="text-sm text-muted-foreground">Nenhuma.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {todayAgendaQuery.data.installations.map((s: { id: number; contactName?: string | null; contactPhone?: string | null }) => (
                      <li key={s.id}>
                        #{s.id} · {s.contactName || "—"} · {s.contactPhone || ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Pré-agendamentos</h3>
                {!todayAgendaQuery.data?.preAgendamentos?.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {todayAgendaQuery.data.preAgendamentos.map((s: { id: number; contactName?: string | null }) => (
                      <li key={s.id}>
                        Venda #{s.id} · {s.contactName || "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
