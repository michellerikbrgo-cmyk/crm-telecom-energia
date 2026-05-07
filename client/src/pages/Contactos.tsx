import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Plus, Search, Filter, UserPlus, PhoneCall, PhoneOff } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Contactos() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({
    phone: "",
    name: "",
    email: "",
    origin: "Indicação",
    notes: "",
  });

  const contactsQuery = trpc.contacts.list.useQuery({ search, status: statusFilter });
  const nextContactQuery = trpc.distribution.getNext.useQuery(undefined, { enabled: false });
  const logCallMutation = trpc.calls.log.useMutation({
    onSuccess: () => {
      toast.success("Chamada registada!");
      contactsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleGetNext = async () => {
    const result = await nextContactQuery.refetch();
    if (result.data) {
      toast.success(`Contacto atribuído: ${result.data.phone}`);
      contactsQuery.refetch();
    } else {
      toast.info("Não há contactos disponíveis de momento.");
    }
  };
  const addContactMutation = trpc.contacts.add.useMutation({
    onSuccess: () => {
      toast.success("Contacto adicionado com sucesso!");
      setShowAddDialog(false);
      setNewContact({ phone: "", name: "", email: "", origin: "Indicação", notes: "" });
      contactsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColors: Record<string, string> = {
    novo: "bg-blue-100 text-blue-700",
    em_contacto: "bg-yellow-100 text-yellow-700",
    pendente: "bg-orange-100 text-orange-700",
    venda: "bg-green-100 text-green-700",
    nao_atende: "bg-gray-100 text-gray-700",
    sem_interesse: "bg-red-100 text-red-700",
    blacklist: "bg-black text-white",
  };

  const statusLabels: Record<string, string> = {
    novo: "Novo",
    em_contacto: "Em Contacto",
    pendente: "Pendente",
    venda: "Venda",
    nao_atende: "Não Atende",
    sem_interesse: "Sem Interesse",
    blacklist: "Blacklist",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
            <p className="text-muted-foreground">Gerir a sua lista de contactos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleGetNext}>
              <PhoneCall className="h-4 w-4" />
              Próximo Contacto
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Adicionar Contacto
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Contacto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input
                    placeholder="+351 900 000 000"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    placeholder="Nome do contacto"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    placeholder="email@exemplo.com"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Select value={newContact.origin} onValueChange={(v) => setNewContact({ ...newContact, origin: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Indicação">Indicação</SelectItem>
                      <SelectItem value="Telemarketing">Telemarketing</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Redes Sociais">Redes Sociais</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea
                    placeholder="Observações sobre o contacto..."
                    value={newContact.notes}
                    onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => addContactMutation.mutate(newContact)}
                  disabled={!newContact.phone || addContactMutation.isPending}
                >
                  {addContactMutation.isPending ? "A guardar..." : "Guardar Contacto"}
                </Button>
              </div>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por nome ou telefone..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="em_contacto">Em Contacto</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="nao_atende">Não Atende</SelectItem>
                  <SelectItem value="sem_interesse">Sem Interesse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contacts List */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {contactsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : contactsQuery.data?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Phone className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum contacto encontrado</p>
                <p className="text-xs mt-1">Os contactos aparecerão aqui quando forem distribuídos</p>
              </div>
            ) : (
              <div className="divide-y">
                {contactsQuery.data?.map((contact: any) => (
                  <div key={contact.id} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{contact.name || "Sem nome"}</p>
                        <p className="text-sm text-muted-foreground">{contact.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-xs">
                        {contact.origin}
                      </Badge>
                      <Badge className={`text-xs ${statusColors[contact.status] || ""}`}>
                        {statusLabels[contact.status] || contact.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
