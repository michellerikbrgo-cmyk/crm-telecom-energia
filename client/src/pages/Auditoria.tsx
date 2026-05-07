import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function Auditoria() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
          <p className="text-muted-foreground">Logs de todas as ações realizadas no sistema</p>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Shield className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Logs de auditoria em desenvolvimento</p>
              <p className="text-xs mt-1">Todas as alterações serão registadas aqui</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
