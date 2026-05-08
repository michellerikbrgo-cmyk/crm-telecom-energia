import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Ranking() {
  const rankingQuery = trpc.gamification.ranking.useQuery();

  const list = rankingQuery.data || [];
  const top = list[0];

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking da Equipa</h1>
          <p className="text-muted-foreground">
            Classificação do mês atual por vendas <strong>activas</strong> com data de instalação registada
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-0 shadow-sm text-center bg-gradient-to-br from-yellow-50 to-yellow-100/50">
            <CardContent className="pt-6">
              <Medal className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
              <p className="text-sm text-muted-foreground">Líder do mês</p>
              <p className="font-semibold mt-1">
                {top?.userName || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {top ? `${top.activoSales ?? top.totalSales} vendas activas (instalação este mês)` : ""}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm text-center bg-gradient-to-br from-green-50 to-green-100/50">
            <CardContent className="pt-6">
              <Trophy className="h-8 w-8 mx-auto text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">Critério</p>
              <p className="font-semibold mt-1">Instalação manual confirmada</p>
              <p className="text-xs text-muted-foreground px-2">
                Só contam vendas no estado Activo, após definir a data de instalação nos relatórios ou na API.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Classificação ({new Date().toLocaleString("pt-PT", { month: "long", year: "numeric" })})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!list.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Trophy className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Ainda não há vendas activas com instalação registada este mês</p>
              </div>
            ) : (
              <div className="space-y-2">
                {list.map((entry: any) => (
                  <div key={entry.userId} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${entry.position === 1 ? "text-yellow-500" : entry.position === 2 ? "text-gray-400" : entry.position === 3 ? "text-orange-400" : "text-muted-foreground"}`}>
                        #{entry.position}
                      </span>
                      <div>
                        <p className="font-medium">{entry.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.activoSales ?? entry.totalSales} vendas activas
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
