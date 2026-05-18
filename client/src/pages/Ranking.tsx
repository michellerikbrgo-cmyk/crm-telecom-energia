import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RankEntry = {
  position: number;
  userId: number;
  userName: string;
  avatarUrl?: string | null;
  activoSales?: number;
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

function Podium({ list, title }: { list: RankEntry[]; title: string }) {
  const top3 = list.slice(0, 3);
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!top3.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados este mês nesta categoria.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-end justify-center gap-6 sm:gap-10 pt-2 pb-4">
            {top3[1] ? (
              <div className="flex flex-col items-center">
                <div className="text-sm font-medium text-muted-foreground mb-2">2º</div>
                <Avatar className="h-20 w-20 border-4 border-slate-300 shadow-md">
                  {top3[1].avatarUrl ? <AvatarImage src={top3[1].avatarUrl} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="text-lg bg-slate-100 text-slate-700">
                    {initials(top3[1].userName)}
                  </AvatarFallback>
                </Avatar>
                <Medal className="h-6 w-6 text-slate-400 mt-2" />
                <div className="mt-1 font-semibold text-center max-w-[140px] truncate">{top3[1].userName}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{top3[1].activoSales ?? 0} vendas</div>
              </div>
            ) : (
              <div className="w-24" />
            )}
            {top3[0] ? (
              <div className="flex flex-col items-center -mt-2 sm:-mt-4">
                <div className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">1º</div>
                <Avatar className="h-28 w-28 border-4 border-amber-400 shadow-lg">
                  {top3[0].avatarUrl ? <AvatarImage src={top3[0].avatarUrl} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="text-xl bg-amber-50 text-amber-900">
                    {initials(top3[0].userName)}
                  </AvatarFallback>
                </Avatar>
                <Trophy className="h-8 w-8 text-amber-500 mt-2" />
                <div className="mt-1 font-bold text-center max-w-[160px] truncate">{top3[0].userName}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {top3[0].activoSales ?? 0} vendas activas
                </div>
              </div>
            ) : null}
            {top3[2] ? (
              <div className="flex flex-col items-center">
                <div className="text-sm font-medium text-muted-foreground mb-2">3º</div>
                <Avatar className="h-20 w-20 border-4 border-orange-300 shadow-md">
                  {top3[2].avatarUrl ? <AvatarImage src={top3[2].avatarUrl} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="text-lg bg-orange-50 text-orange-900">
                    {initials(top3[2].userName)}
                  </AvatarFallback>
                </Avatar>
                <Medal className="h-6 w-6 text-orange-400 mt-2" />
                <div className="mt-1 font-semibold text-center max-w-[140px] truncate">{top3[2].userName}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{top3[2].activoSales ?? 0} vendas</div>
              </div>
            ) : (
              <div className="w-24" />
            )}
          </div>
        )}
        {list.length > 3 ? (
          <div className="border-t pt-4 space-y-2">
            {list.slice(3).map((entry) => (
              <div key={entry.userId} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-muted-foreground w-6">#{entry.position}</span>
                  <Avatar className="h-8 w-8">
                    {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="text-xs">{initials(entry.userName)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium">{entry.userName}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">{entry.activoSales ?? 0}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Ranking() {
  const boardQuery = trpc.gamification.rankingBoard.useQuery();
  const board = boardQuery.data ?? { vendedores: [], cej: [], ce: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ranking da Equipa</h1>
        <p className="text-muted-foreground">
          Competição no mesmo coordenador / tenant: três categorias — vendedores, chefes de equipa júnior e chefes
          de equipa. Critério: vendas <strong>Activo</strong> com data de activação ou instalação no mês corrente.
        </p>
      </div>

      <Tabs defaultValue="vendedores" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="cej">Chefes de Equipa Júnior</TabsTrigger>
          <TabsTrigger value="ce">Chefes de Equipa</TabsTrigger>
        </TabsList>
        <TabsContent value="vendedores">
          <Podium list={(board.vendedores || []) as RankEntry[]} title="Pódio — Vendedores" />
        </TabsContent>
        <TabsContent value="cej">
          <Podium list={(board.cej || []) as RankEntry[]} title="Pódio — Chefes de Equipa Júnior" />
        </TabsContent>
        <TabsContent value="ce">
          <Podium list={(board.ce || []) as RankEntry[]} title="Pódio — Chefes de Equipa" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
