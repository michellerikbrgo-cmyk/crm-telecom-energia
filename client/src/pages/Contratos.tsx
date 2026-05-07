import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Send, Eye, CheckCircle, Plus } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Contratos() {
  const [showDialog, setShowDialog] = useState(false);
  const [newContract, setNewContract] = useState({
    contactId: "",
    type: "contrato",
    product: "telecom",
  });

  const contractsQuery = trpc.contracts.list.useQuery();
  const createMutation = trpc.contracts.create.useMutation({
    onSuccess: () => {
      toast.success("Contrato gerado com sucesso!");
      setShowDialog(false);
      setNewContract({ contactId: "", type: "contrato", product: "telecom" });
      contractsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusIcons: Record<string, any> = {
    gerado: FileText,
    enviado: Send,
    lido: Eye,
    assinado: CheckCircle,
  };

  const statusColors: Record<string, string> = {
    gerado: "bg-blue-100 text-blue-700",
    enviado: "bg-orange-100 text-orange-700",
    lido: "bg-purple-100 text-purple-700",
    assinado: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const stats = {
    gerado: contractsQuery.data?.filter((c: any) => c.status === "gerado").length || 0,
    enviado: contractsQuery.data?.filter((c: any) => c.status === "enviado").length || 0,
    lido: contractsQuery.data?.filter((c: any) => c.status === "lido").length || 0,
    assinado: contractsQuery.data?.filter((c: any) => c.status === "assinado").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contratos</h1>
            <p className="text-muted-foreground">Gestão de documentos e assinaturas</p>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Gerar Contrato
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Gerar Novo Documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>ID do Contacto *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 1"
                    value={newContract.contactId}
                    onChange={(e) => setNewContract({ ...newContract, contactId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Documento *</Label>
                  <Select value={newContract.type} onValueChange={(v) => setNewContract({ ...newContract, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contrato">Contrato</SelectItem>
                      <SelectItem value="portabilidade">Portabilidade</SelectItem>
                      <SelectItem value="rescisao">Rescisão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select value={newContract.product} onValueChange={(v) => setNewContract({ ...newContract, product: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telecom">Telecom</SelectItem>
                      <SelectItem value="energia">Energia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate({
                    contactId: parseInt(newContract.contactId),
                    type: newContract.type as any,
                    product: newContract.product as any,
                  })}
                  disabled={!newContract.contactId || createMutation.isPending}
                >
                  {createMutation.isPending ? "A gerar..." : "Gerar Documento"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <FileText className="h-6 w-6 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{stats.gerado}</p>
              <p className="text-xs text-muted-foreground">Gerados</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Send className="h-6 w-6 mx-auto text-orange-500 mb-2" />
              <p className="text-2xl font-bold">{stats.enviado}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Eye className="h-6 w-6 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">{stats.lido}</p>
              <p className="text-xs text-muted-foreground">Lidos</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <CheckCircle className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{stats.assinado}</p>
              <p className="text-xs text-muted-foreground">Assinados</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Lista de Contratos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {contractsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !contractsQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum contrato gerado</p>
              </div>
            ) : (
              <div className="divide-y">
                {contractsQuery.data.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm capitalize">{c.type} - {c.product}</p>
                        <p className="text-xs text-muted-foreground">
                          Contacto #{c.contactId} | {new Date(c.createdAt).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                    </div>
                    <Badge className={statusColors[c.status] || ""}>
                      {c.status}
                    </Badge>
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
