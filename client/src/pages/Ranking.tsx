import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Star } from "lucide-react";

export default function Ranking() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking da Equipa</h1>
          <p className="text-muted-foreground">Classificação e conquistas dos vendedores</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Medal className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
              <p className="text-sm text-muted-foreground">Mais Vendas</p>
              <p className="font-semibold mt-1">-</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Star className="h-8 w-8 mx-auto text-blue-500 mb-2" />
              <p className="text-sm text-muted-foreground">Mais Chamadas</p>
              <p className="font-semibold mt-1">-</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center">
            <CardContent className="pt-6">
              <Trophy className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">Melhor Conversão</p>
              <p className="font-semibold mt-1">-</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Classificação Geral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Ranking será atualizado com dados reais</p>
              <p className="text-xs mt-1">Pontos são atribuídos por chamadas, pendentes e vendas</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
