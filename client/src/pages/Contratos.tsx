import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Send, Eye, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Contratos() {
  const contractsQuery = trpc.contracts.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos</h1>
          <p className="text-muted-foreground">Gestão de documentos e assinaturas</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <FileText className="h-6 w-6 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Gerados</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Send className="h-6 w-6 mx-auto text-orange-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Eye className="h-6 w-6 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Lidos</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <CheckCircle className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Assinados</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Contratos Pendentes de Assinatura</CardTitle>
          </CardHeader>
          <CardContent>
            {contractsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !contractsQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum contrato pendente</p>
                <p className="text-xs mt-1">Os contratos gerados aparecerão aqui</p>
              </div>
            ) : (
              <div className="divide-y">
                {contractsQuery.data.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{c.type} - {c.product}</p>
                      <p className="text-xs text-muted-foreground">Contacto #{c.contactId}</p>
                    </div>
                    <Badge variant={c.status === "assinado" ? "default" : "secondary"}>
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
