import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function Relatorios() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">Análises de desempenho e métricas da equipa</p>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Relatórios em desenvolvimento</p>
              <p className="text-xs mt-1">Melhor horário, mapa de calor e conversão por fonte</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
