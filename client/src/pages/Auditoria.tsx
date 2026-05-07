import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Auditoria() {
  const auditQuery = trpc.audit.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
          <p className="text-muted-foreground">Logs de todas as ações realizadas no sistema</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {auditQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !auditQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Shield className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhuma ação registada</p>
                <p className="text-xs mt-1">As ações dos utilizadores serão registadas aqui</p>
              </div>
            ) : (
              <div className="divide-y">
                {auditQuery.data.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div>
                      <p className="font-medium text-sm">{log.action}</p>
                      <p className="text-xs text-muted-foreground">{log.details}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{log.entity}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("pt-PT")}
                      </span>
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
