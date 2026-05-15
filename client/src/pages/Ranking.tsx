import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RankEntry = {
  position: number;
  userId: number;
  userName: string;
  avatarUrl?: string | null;
  activoSales?: number;
  totalSales?: number;
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

export default function Ranking() {
  const rankingQuery = trpc.gamification.ranking.useQuery();

  const list = (rankingQuery.data || []) as RankEntry[];
  const top3 = list.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ranking da Equipa</h1>
        <p className="text-muted-foreground">
          Mês corrente: vendas no estado <strong>Activo</strong> com{" "}
          <strong>data de activação ou instalação</strong> registada neste mês.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Pódio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!top3.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
              Ainda não há dados para o pódio este mês.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-end justify-center gap-6 sm:gap-10 pt-2 pb-4">
              {top3[1] ? (
                <div className="flex flex-col items-center order-1 sm:order-none">
                  <div className="text-sm font-medium text-muted-foreground mb-2">2º</div>
                  <Avatar className="h-20 w-20 border-4 border-slate-300 shadow-md">
                    {top3[1].avatarUrl ? (
                      <AvatarImage src={top3[1].avatarUrl} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-lg bg-slate-100 text-slate-700">
                      {initials(top3[1].userName)}
                    </AvatarFallback>
                  </Avatar>
                  <Medal className="h-6 w-6 text-slate-400 mt-2" />
                  <div className="mt-1 font-semibold text-center max-w-[140px] truncate">{top3[1].userName}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {top3[1].activoSales ?? top3[1].totalSales ?? 0} vendas
                  </div>
                </div>
              ) : (
                <div className="w-24" />
              )}
              {top3[0] ? (
                <div className="flex flex-col items-center -mt-2 sm:-mt-4 order-0 sm:order-none">
                  <div className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">1º</div>
                  <Avatar className="h-28 w-28 border-4 border-amber-400 shadow-lg">
                    {top3[0].avatarUrl ? (
                      <AvatarImage src={top3[0].avatarUrl} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-xl bg-amber-50 text-amber-900">
                      {initials(top3[0].userName)}
                    </AvatarFallback>
                  </Avatar>
                  <Trophy className="h-8 w-8 text-amber-500 mt-2" />
                  <div className="mt-1 font-bold text-center max-w-[160px] truncate">{top3[0].userName}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {top3[0].activoSales ?? top3[0].totalSales ?? 0} vendas activas
                  </div>
                </div>
              ) : null}
              {top3[2] ? (
                <div className="flex flex-col items-center order-2 sm:order-none">
                  <div className="text-sm font-medium text-muted-foreground mb-2">3º</div>
                  <Avatar className="h-20 w-20 border-4 border-orange-300 shadow-md">
                    {top3[2].avatarUrl ? (
                      <AvatarImage src={top3[2].avatarUrl} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-lg bg-orange-50 text-orange-900">
                      {initials(top3[2].userName)}
                    </AvatarFallback>
                  </Avatar>
                  <Medal className="h-6 w-6 text-orange-400 mt-2" />
                  <div className="mt-1 font-semibold text-center max-w-[140px] truncate">{top3[2].userName}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {top3[2].activoSales ?? top3[2].totalSales ?? 0} vendas
                  </div>
                </div>
              ) : (
                <div className="w-24" />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Classificação completa ({new Date().toLocaleString("pt-PT", { month: "long", year: "numeric" })})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!list.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Ainda não há vendas activas com data este mês</p>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-lg font-bold shrink-0 ${
                        entry.position === 1
                          ? "text-yellow-500"
                          : entry.position === 2
                            ? "text-gray-400"
                            : entry.position === 3
                              ? "text-orange-400"
                              : "text-muted-foreground"
                      }`}
                    >
                      #{entry.position}
                    </span>
                    <Avatar className="h-9 w-9 shrink-0">
                      {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="text-xs">{initials(entry.userName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{entry.userName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {entry.activoSales ?? entry.totalSales ?? 0} vendas activas
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
