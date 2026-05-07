import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Bell, CheckCircle, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Pendentes() {
  const pendentesQuery = trpc.pendentes.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pendentes</h1>
            <p className="text-muted-foreground">Retornos agendados aos clientes</p>
          </div>
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
                  <div key={p.id} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium">{p.contactName || "Contacto #" + p.contactId}</p>
                        <p className="text-sm text-muted-foreground">
                          Retorno: {new Date(p.returnDate).toLocaleString("pt-PT")}
                        </p>
                        {p.offerDesired && (
                          <p className="text-xs text-muted-foreground mt-1">Oferta: {p.offerDesired}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "agendado" ? "default" : "secondary"}>
                        {p.status}
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
