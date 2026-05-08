import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Bell, Plus, Pencil } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Pendentes() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editPendente, setEditPendente] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    returnDate: "",
    notes: "",
    offerDesired: "",
    status: "agendado" as string,
  });
  const [newPendente, setNewPendente] = useState({
    contactId: "",
    returnDate: "",
    notes: "",
    offerDesired: "",
  });

  const pendentesQuery = trpc.pendentes.list.useQuery();
  const createPendenteMutation = trpc.pendentes.create.useMutation({
    onSuccess: () => {
      toast.success("Pendente agendado com sucesso!");
      setShowCreateDialog(false);
      setNewPendente({ contactId: "", returnDate: "", notes: "", offerDesired: "" });
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

  const openEdit = (p: any) => {
    setEditPendente(p);
    const d = new Date(p.returnDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditForm({
      returnDate: local,
      notes: p.notes || "",
      offerDesired: p.offerDesired || "",
      status: p.status || "agendado",
    });
  };

  const handleCreate = () => {
    if (!newPendente.contactId || !newPendente.returnDate) {
      toast.error("Preencha o ID do contacto e a data de retorno.");
      return;
    }
    createPendenteMutation.mutate({
      contactId: parseInt(newPendente.contactId),
      returnDate: newPendente.returnDate,
      notes: newPendente.notes || undefined,
      offerDesired: newPendente.offerDesired || undefined,
    });
  };

  const statusColors: Record<string, string> = {
    agendado: "bg-blue-100 text-blue-700",
    realizado: "bg-green-100 text-green-700",
    expirado: "bg-red-100 text-red-700",
    cancelado: "bg-gray-100 text-gray-700",
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agendar Retorno</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>ID do Contacto *</Label>
                  <Input
                    type="number"
                    placeholder="Insira o ID do contacto"
                    value={newPendente.contactId}
                    onChange={(e) => setNewPendente({ ...newPendente, contactId: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Pode ver o ID na lista de contactos</p>
                </div>
                <div className="space-y-2">
                  <Label>Data e Hora do Retorno *</Label>
                  <Input
                    type="datetime-local"
                    value={newPendente.returnDate}
                    onChange={(e) => setNewPendente({ ...newPendente, returnDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notas da Conversa</Label>
                  <Textarea
                    placeholder="O que foi discutido com o cliente..."
                    value={newPendente.notes}
                    onChange={(e) => setNewPendente({ ...newPendente, notes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Oferta Desejada</Label>
                  <Input
                    placeholder="Ex: Fibra 500Mbps + TV por 29.99€"
                    value={newPendente.offerDesired}
                    onChange={(e) => setNewPendente({ ...newPendente, offerDesired: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={createPendenteMutation.isPending}
                >
                  {createPendenteMutation.isPending ? "A agendar..." : "Agendar Retorno"}
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
                    Contacto #{editPendente.contactId}
                    {editPendente.contactPhone ? ` · ${editPendente.contactPhone}` : ""}
                  </p>
                  <div className="space-y-2">
                    <Label>Data e Hora do Retorno *</Label>
                    <Input
                      type="datetime-local"
                      value={editForm.returnDate}
                      onChange={(e) => setEditForm({ ...editForm, returnDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agendado">Agendado</SelectItem>
                        <SelectItem value="realizado">Realizado</SelectItem>
                        <SelectItem value="expirado">Expirado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
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
                    onClick={() =>
                      updatePendenteMutation.mutate({
                        id: editPendente.id,
                        returnDate: new Date(editForm.returnDate).toISOString(),
                        notes: editForm.notes || null,
                        offerDesired: editForm.offerDesired || null,
                        status: editForm.status as any,
                      })
                    }
                  >
                    {updatePendenteMutation.isPending ? "A guardar..." : "Guardar"}
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
                <p className="text-xs mt-1">Quando marcar um retorno, ele aparecerá aqui</p>
              </div>
            ) : (
              <div className="divide-y">
                {pendentesQuery.data.map((p: any) => (
                  <div key={p.id} className="p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                          <Bell className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {p.contactPhone || p.contactName
                              ? `${p.contactName || "—"} · ${p.contactPhone || ""}`
                              : `Contacto #${p.contactId}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Retorno: {new Date(p.returnDate).toLocaleString("pt-PT")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[p.status] || ""}>
                          {p.status}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {p.notes && (
                      <p className="text-sm text-muted-foreground ml-13 pl-13">
                        <strong>Notas:</strong> {p.notes}
                      </p>
                    )}
                    {p.offerDesired && (
                      <p className="text-sm text-muted-foreground ml-13 pl-13">
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
