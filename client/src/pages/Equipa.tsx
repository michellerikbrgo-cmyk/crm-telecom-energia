import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function Equipa() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipa</h1>
          <p className="text-muted-foreground">Gestão de membros e desempenho da equipa</p>
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Gestão de equipa em desenvolvimento</p>
              <p className="text-xs mt-1">Monitorize tempos online, pausas e desempenho</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
