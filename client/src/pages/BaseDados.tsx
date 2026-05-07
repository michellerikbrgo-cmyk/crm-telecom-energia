import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Upload, Plus } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function BaseDados() {
  const [bulkNumbers, setBulkNumbers] = useState("");

  const bulkAddMutation = trpc.contacts.bulkAdd.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.count} contactos adicionados com sucesso!`);
      setBulkNumbers("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleBulkAdd = () => {
    const numbers = bulkNumbers
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (numbers.length === 0) {
      toast.error("Insira pelo menos um número");
      return;
    }
    bulkAddMutation.mutate({ phones: numbers });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Base de Dados</h1>
          <p className="text-muted-foreground">Alimentar a base de contactos para distribuição automática</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Adicionar Contactos em Massa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Números de Telefone (um por linha)</Label>
              <Textarea
                placeholder={"910000001\n910000002\n910000003"}
                value={bulkNumbers}
                onChange={(e) => setBulkNumbers(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Origem padrão: <strong>Telemarketing</strong> | Os contactos serão distribuídos automaticamente para os vendedores online.
            </p>
            <Button
              onClick={handleBulkAdd}
              disabled={!bulkNumbers.trim() || bulkAddMutation.isPending}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {bulkAddMutation.isPending ? "A adicionar..." : "Adicionar à Base"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
