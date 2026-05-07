import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon } from "lucide-react";

export default function Calendario() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
          <p className="text-muted-foreground">Visão diária de pendentes, vendas e instalações</p>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Calendário em desenvolvimento</p>
              <p className="text-xs mt-1">Aqui verá os pendentes, vendas e instalações do dia</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
