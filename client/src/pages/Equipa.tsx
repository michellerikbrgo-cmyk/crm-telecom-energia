import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Wifi, WifiOff } from "lucide-react";

export default function Equipa() {
  // In a full implementation, this would query team members
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipa</h1>
          <p className="text-muted-foreground">Gestão de membros e monitorização de desempenho</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Wifi className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Online Agora</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Clock className="h-6 w-6 mx-auto text-orange-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Em Pausa</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <WifiOff className="h-6 w-6 mx-auto text-gray-500 mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Offline</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Membros da Equipa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Gestão de equipa</p>
              <p className="text-xs mt-1">Os membros da equipa e os seus tempos online aparecerão aqui</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
