import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Bell, Plus, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Pendentes() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editPendente, setEditPendente] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    returnDate: "",
    notes: "",
    offerDesired: "",
    status: "agendado" as string,
    priorityLevel: "3",
    motivoNaoFechamentoId: "" as string,
  });
  const [newPendente, setNewPendente] = useState({
    phone: "",
    name: "",
    returnDate: "",
    notes: "",
    offerDesired: "",
    priorityLevel: "3",
  });

  const pendentesQuery = trpc.pendentes.list.useQuery();
  const motivosQuery = trpc.motivosNaoFechamento.list.useQuery();
  const pickerQuery = trpc.contacts.searchPicker.useQuery(
    { q: contactSearch.trim() },
    { enabled: contactSearch.trim().length >= 2 },
  );

  const createWithContactMutation = trpc.pendentes.createWithContact.useMutation({
    onSuccess: () => {
      toast.success("Pendente agendado com sucesso!");
      setShowCreateDialog(false);
      setNewPendente({ phone: "", name: "", returnDate: "", notes: "", offerDesired: "", priorityLevel: "3" });
      setContactSearch("");
      setSelectedContactId(null);
      pendentesQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createPendenteMutation = trpc.pendentes.create.useMutation({
    onSuccess: () => {
      toast.success("Pendente agendado!");
      setSelectedContactId(null);
      setContactSearch("");
      pendentesQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updatePendenteMutation = trpc.pendentes.update.useMutation({
    onSuccess: () => {
      toast.success("Pendente actualizado!");
      setEditPendente(null);
      pendentesQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const motivoMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const row of motivosQuery.data ?? []) {
      m[row.id] = row.descricao;
    }
    return m;
  }, [motivosQuery.data]);

  const openEdit = (p: any) => {
    setEditPendente(p);
    const d = new Date(p.returnDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditForm({
      returnDate: local,
      notes: p.notes || "",
      offerDesired: p.offerDesired || "",
      status: p.status || "agendado",
      priorityLevel: String(p.priorityLevel ?? 3),
      motivoNaoFechamentoId: p.motivoNaoFechamentoId ? String(p.motivoNaoFechamentoId) : "",
    });
  };

  const handleCreate = () => {
    if (!newPendente.returnDate) {
      toast.error("Indique a data de retorno.");
      return;
    }
    if (selectedContactId) {
      createPendenteMutation.mutate({
        contactId: selectedContactId,
        returnDate: newPendente.returnDate,
        notes: newPendente.notes || undefined,
        offerDesired: newPendente.offerDesired || undefined,
        priorityLevel: parseInt(newPendente.priorityLevel, 10),
      });
      setShowCreateDialog(false);
      return;
    }
    if (!newPendente.phone.trim()) {
      toast.error("Telefone ou contacto existente é obrigatório.");
      return;
    }
    createWithContactMutation.mutate({
      phone: newPendente.phone,
      name: newPendente.name || undefined,
      returnDate: newPendente.returnDate,
      notes: newPendente.notes || undefined,
      offerDesired: newPendente.offerDesired || undefined,
      priorityLevel: parseInt(newPendente.priorityLevel, 10),
    });
  };

  const statusColors: Record<string, string> = {
    agendado: "bg-blue-100 text-blue-700",
    realizado: "bg-green-100 text-green-700",
    expirado: "bg-red-100 text-red-700",
    cancelado: "bg-gray-100 text-gray-700",
    nao_fechou: "bg-amber-100 text-amber-800",
  };

  const statusLabels: Record<string, string> = {
    agendado: "Agendado",
    realizado: "Realizado",
    expirado: "Expirado",
    cancelado: "Cancelado",
    nao_fechou: "Não fechou",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendentes</h1>
          <p className="text-muted-foreground">Retornos agendados aos clientes</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Pendente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agendar retorno</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Procurar contacto existente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nome ou telefone (mín. 2 caracteres)"
                    value={contactSearch}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setSelectedContactId(null);
                    }}
                  />
                </div>
                {pickerQuery.data && pickerQuery.data.length > 0 && !selectedContactId && (
                  <div className="border rounded-md max-h-32 overflow-y-auto divide-y">
                    {pickerQuery.data.map((c: { id: number; phone: string; name: string | null }) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedContactId(c.id);
                          setNewPendente((p) => ({ ...p, phone: c.phone, name: c.name || "" }));
                          setContactSearch(`${c.name || "—"} · ${c.phone}`);
                        }}
                      >
                        #{c.id} · {c.name || "—"} · {c.phone}
                      </button>
                    ))}
                  </div>
                )}
                {selectedContactId && (
                  <p className="text-xs text-green-700">Contacto #{selectedContactId} seleccionado</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefone (novo contacto)</Label>
                  <Input
                    placeholder="Se não escolher da lista"
                    value={newPendente.phone}
                    disabled={!!selectedContactId}
                    onChange={(e) => setNewPendente({ ...newPendente, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={newPendente.name}
                    disabled={!!selectedContactId}
                    onChange={(e) => setNewPendente({ ...newPendente, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data e hora do retorno *</Label>
                <Input
                  type="datetime-local"
                  value={newPendente.returnDate}
                  onChange={(e) => setNewPendente({ ...newPendente, returnDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={newPendente.notes}
                  onChange={(e) => setNewPendente({ ...newPendente, notes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Oferta desejada</Label>
                <Input
                  value={newPendente.offerDesired}
                  onChange={(e) => setNewPendente({ ...newPendente, offerDesired: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade (1–5)</Label>
                <Select
                  value={newPendente.priorityLevel}
                  onValueChange={(v) => setNewPendente({ ...newPendente, priorityLevel: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createWithContactMutation.isPending || createPendenteMutation.isPending}
              >
                Agendar retorno
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editPendente} onOpenChange={(o) => !o && setEditPendente(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar pendente</DialogTitle>
            </DialogHeader>
            {editPendente && (
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  {editPendente.contactName || "—"} · {editPendente.contactPhone || `#${editPendente.contactId}`}
                </p>
                <div className="space-y-2">
                  <Label>Data e hora do retorno *</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.returnDate}
                    onChange={(e) => setEditForm({ ...editForm, returnDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="expirado">Expirado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                      <SelectItem value="nao_fechou">Não fechou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.status === "nao_fechou" && (
                  <div className="space-y-2">
                    <Label>Motivo *</Label>
                    <Select
                      value={editForm.motivoNaoFechamentoId}
                      onValueChange={(v) => setEditForm({ ...editForm, motivoNaoFechamentoId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione o motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {(motivosQuery.data ?? []).map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Prioridade (1–5)</Label>
                  <Select
                    value={editForm.priorityLevel}
                    onValueChange={(v) => setEditForm({ ...editForm, priorityLevel: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Oferta desejada</Label>
                  <Input
                    value={editForm.offerDesired}
                    onChange={(e) => setEditForm({ ...editForm, offerDesired: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!editForm.returnDate || updatePendenteMutation.isPending}
                  onClick={() => {
                    if (editForm.status === "nao_fechou" && !editForm.motivoNaoFechamentoId) {
                      toast.error("Seleccione o motivo de não fechamento.");
                      return;
                    }
                    updatePendenteMutation.mutate({
                      id: editPendente.id,
                      returnDate: new Date(editForm.returnDate).toISOString(),
                      notes: editForm.notes || null,
                      offerDesired: editForm.offerDesired || null,
                      status: editForm.status as any,
                      priorityLevel: parseInt(editForm.priorityLevel, 10),
                      motivoNaoFechamentoId:
                        editForm.status === "nao_fechou"
                          ? parseInt(editForm.motivoNaoFechamentoId, 10)
                          : null,
                    });
                  }}
                >
                  Guardar
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {pendentesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !pendentesQuery.data?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum pendente agendado</p>
            </div>
          ) : (
            <div className="divide-y">
              {pendentesQuery.data.map((p: any) => (
                <div key={p.id} className="p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4 text-orange-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {p.contactName || "—"} · {p.contactPhone || `#${p.contactId}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Retorno: {new Date(p.returnDate).toLocaleString("pt-PT")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        P{p.priorityLevel ?? 3}
                      </Badge>
                      <Badge className={statusColors[p.status] || ""}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {p.motivoNaoFechamentoId && (
                    <p className="text-sm text-amber-800 ml-13">
                      Motivo: {motivoMap[p.motivoNaoFechamentoId] || `#${p.motivoNaoFechamentoId}`}
                    </p>
                  )}
                  {p.notes && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>Notas:</strong> {p.notes}
                    </p>
                  )}
                  {p.offerDesired && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Oferta:</strong> {p.offerDesired}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
