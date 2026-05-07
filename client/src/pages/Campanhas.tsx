import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Campanhas() {
  const campaignsQuery = trpc.campaigns.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas Vigentes</h1>
          <p className="text-muted-foreground">Promoções e ofertas ativas para apresentar aos clientes</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {campaignsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !campaignsQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Megaphone className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhuma campanha ativa</p>
                <p className="text-xs mt-1">As campanhas serão adicionadas pelo CE/CEJ</p>
              </div>
            ) : (
              <div className="divide-y">
                {campaignsQuery.data.map((c: any) => (
                  <div key={c.id} className="p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{c.title}</h3>
                      <Badge variant={c.product === "telecom" ? "default" : c.product === "energia" ? "secondary" : "outline"}>
                        {c.product === "ambos" ? "Telecom + Energia" : c.product}
                      </Badge>
                    </div>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
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
