import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Star, Award } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Ranking() {
  const rankingQuery = trpc.gamification.ranking.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking da Equipa</h1>
          <p className="text-muted-foreground">Classificação e conquistas dos vendedores</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm text-center bg-gradient-to-br from-yellow-50 to-yellow-100/50">
            <CardContent className="pt-6">
              <Medal className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
              <p className="text-sm text-muted-foreground">Mais Vendas</p>
              <p className="font-semibold mt-1">
                {rankingQuery.data?.[0] ? `User #${rankingQuery.data[0].userId}` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {rankingQuery.data?.[0] ? `${rankingQuery.data[0].totalSales} vendas` : ""}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center bg-gradient-to-br from-blue-50 to-blue-100/50">
            <CardContent className="pt-6">
              <Star className="h-8 w-8 mx-auto text-blue-500 mb-2" />
              <p className="text-sm text-muted-foreground">Mais Chamadas</p>
              <p className="font-semibold mt-1">
                {rankingQuery.data?.[0] ? `User #${rankingQuery.data[0].userId}` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {rankingQuery.data?.[0] ? `${rankingQuery.data[0].totalCalls} chamadas` : ""}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center bg-gradient-to-br from-green-50 to-green-100/50">
            <CardContent className="pt-6">
              <Trophy className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">Mais Pontos</p>
              <p className="font-semibold mt-1">
                {rankingQuery.data?.[0] ? `User #${rankingQuery.data[0].userId}` : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {rankingQuery.data?.[0] ? `${rankingQuery.data[0].points} pts` : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Classificação Geral do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!rankingQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Trophy className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Ranking será atualizado com dados reais</p>
                <p className="text-xs mt-1">Pontos: Chamada=1pt | Pendente=2pts | Venda=10pts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rankingQuery.data.map((entry: any, index: number) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${index === 0 ? "text-yellow-500" : index === 1 ? "text-gray-400" : index === 2 ? "text-orange-400" : "text-muted-foreground"}`}>
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium">Utilizador #{entry.userId}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.totalCalls} chamadas | {entry.totalSales} vendas
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-primary">{entry.points} pts</span>
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
