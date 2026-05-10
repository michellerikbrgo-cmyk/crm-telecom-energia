import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Mail, Info, Target } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export default function Equipa() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole ?? "vendedor";
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  const isCoordLike = crmRole === "coordenador" || isSuperAdmin;
  const isTeamLeadRole = ["ce", "cej"].includes(crmRole);

  const listQuery = trpc.teams.list.useQuery(undefined, { enabled: isCoordLike });
  const mineQuery = trpc.teams.mine.useQuery(undefined, { enabled: isTeamLeadRole });

  const [newTeamName, setNewTeamName] = useState("");
  const [localEmails, setLocalEmails] = useState<Record<number, string>>({});
  const [localDailyGoals, setLocalDailyGoals] = useState<Record<number, string>>({});

  const createMutation = trpc.teams.create.useMutation({
    onSuccess: () => {
      toast.success("Equipa criada");
      setNewTeamName("");
      void listQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar equipa"),
  });

  const saveEmailMutation = trpc.teams.updateContactEmail.useMutation({
    onSuccess: () => {
      toast.success("E-mail da equipa guardado");
      void listQuery.refetch();
      void mineQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao guardar e-mail"),
  });

  const saveDailyGoalMutation = trpc.teams.updateDailyCallsGoal.useMutation({
    onSuccess: () => {
      toast.success("Meta de ligações guardada");
      void listQuery.refetch();
      void mineQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao guardar meta"),
  });

  const getDisplayEmailForTeamRow = (teamId: number, serverEmail: string | null | undefined) =>
    localEmails[teamId] !== undefined ? localEmails[teamId] : (serverEmail ?? "");

  const mineTeam = mineQuery.data;
  const [mineEmail, setMineEmail] = useState("");
  const [mineDailyGoal, setMineDailyGoal] = useState("");

  useEffect(() => {
    if (!listQuery.data?.length) return;
    setLocalDailyGoals(() => {
      const next: Record<number, string> = {};
      for (const t of listQuery.data as Array<{ id: number; dailyCallsGoal?: number | null }>) {
        next[t.id] = String(t.dailyCallsGoal ?? 80);
      }
      return next;
    });
  }, [listQuery.data]);

  useEffect(() => {
    if (!mineTeam) {
      setMineEmail("");
      setMineDailyGoal("");
      return;
    }
    setMineEmail(mineTeam.contactEmail ?? "");
    setMineDailyGoal(String((mineTeam as { dailyCallsGoal?: number | null }).dailyCallsGoal ?? 80));
  }, [mineTeam]);

  const roleBadge =
    crmRole === "coordenador"
      ? "Coordenador"
      : crmRole === "ce"
        ? "Chefe de Equipa"
        : crmRole === "cej"
          ? "Chefe Equipa Jr."
          : crmRole;

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipa</h1>
          <p className="text-muted-foreground">
            Uma instância do CRM; várias empresas (tenants por coordenador) e dentro de cada empresa várias equipas.
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-muted-foreground" />
              Como a hierarquia funciona neste momento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-foreground">Tenant (empresa)</span> — cada Coordenador criado pelo Super Admin é uma empresa isolada: todos os utilizadores e dados (contactos, vendas, campanhas, …) têm{' '}
                <span className="font-medium text-foreground">tenantId</span> igual ao <span className="font-medium text-foreground">id desse coordenador</span>.
                O próprio coordenador tem <span className="font-medium text-foreground">tenantId = próprio id</span>.
              </li>
              <li>
                <span className="font-medium text-foreground">Coordenador</span> — vê todas as equipas {" "}
                <em>da sua empresa</em> aqui e na Supervisão; o e-mail oficial é por equipa (<span className="font-medium text-foreground">teams</span>).
                Membros podem ter <span className="font-medium text-foreground">teamId</span> para subdivisão dentro da mesma empresa.
              </li>
              <li>
                <span className="font-medium text-foreground">Chefe de Equipa (CE)</span> — na Supervisão só vê vendedores
                da mesma equipa: pelo seu <span className="font-medium text-foreground">teamId</span> ou quando é <span className="font-medium text-foreground">leaderId</span> da equipa na tabela <span className="font-medium text-foreground">teams</span>.
              </li>
              <li>
                <span className="font-medium text-foreground">Chefe Jr. (CEJ)</span> — igual ao CE ao nível da equipa, mas apenas com o papel júnior; visão restrita pela mesma equipa.
              </li>
              <li>
                <span className="font-medium text-foreground">Vendedor</span> — contactos assignados só a si distribuição, sem esta página no menu lateral.
              </li>
              <li>
                <span className="font-medium text-foreground">Meta diária de ligações</span> — objectivo por equipa para o cartão «Chamadas hoje» no painel; só{" "}
                <span className="font-medium text-foreground">CE / CE Jr. / Coordenador / Super Admin</span> podem definir ou alterar (vendedor não).
              </li>
              <li>
                <span className="font-medium text-foreground">E-mail da equipa</span> — contacto oficial por equipa. O isolamento entre empresas é o <span className="font-medium text-foreground">tenantId</span>; dentro da empresa o refinamento usa <span className="font-medium text-foreground">teamId</span>.
              </li>
            </ul>
          </CardContent>
        </Card>

        {isCoordLike ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Equipas e e-mail oficial
              </CardTitle>
              <Badge variant="outline">{crmRole}</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2 rounded-lg border p-3 bg-muted/30">
                <Input
                  placeholder="Nome da nova equipa"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="max-w-md"
                />
                <Button
                  type="button"
                  disabled={!newTeamName.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({ name: newTeamName.trim() })}
                >
                  {createMutation.isPending ? "…" : "Criar equipa"}
                </Button>
              </div>

              {listQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : !listQuery.data?.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Ainda não existem registos na tabela de equipas.</p>
              ) : (
                <div className="space-y-4">
                  {listQuery.data.map(
                    (t: {
                      id: number;
                      name: string;
                      contactEmail: string | null;
                      leaderId: number | null;
                      dailyCallsGoal?: number | null;
                    }) => (
                    <div key={t.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{t.name}</div>
                        <Badge variant="secondary" className="text-xs">
                          id {t.id}
                          {t.leaderId != null ? ` · líder utilizador ${t.leaderId}` : ""}
                        </Badge>
                      </div>
                      <div className="space-y-2 max-w-xl">
                        <Label htmlFor={`team-email-${t.id}`}>E-mail oficial da equipa</Label>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            id={`team-email-${t.id}`}
                            type="email"
                            placeholder="ex.: equipa.norte@empresa.pt"
                            value={getDisplayEmailForTeamRow(t.id, t.contactEmail)}
                            onChange={(e) =>
                              setLocalEmails((prev) => ({ ...prev, [t.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={saveEmailMutation.isPending}
                            onClick={() => {
                              const v = getDisplayEmailForTeamRow(t.id, t.contactEmail).trim();
                              saveEmailMutation.mutate({
                                teamId: t.id,
                                contactEmail: v === "" ? "" : v,
                              });
                            }}
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 max-w-xl border-t border-border/60 pt-3">
                        <Label htmlFor={`team-goal-${t.id}`} className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
                          Meta diária de ligações
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Chamadas visadas por dia no painel («Chamadas hoje»). Apenas CE, CE Jr., Coordenador ou Super Admin.
                        </p>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Input
                            id={`team-goal-${t.id}`}
                            type="number"
                            min={1}
                            max={999}
                            className="w-28"
                            value={
                              localDailyGoals[t.id] !== undefined
                                ? localDailyGoals[t.id]
                                : String(t.dailyCallsGoal ?? 80)
                            }
                            onChange={(e) =>
                              setLocalDailyGoals((prev) => ({ ...prev, [t.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={saveDailyGoalMutation.isPending}
                            onClick={() => {
                              const raw =
                                localDailyGoals[t.id] ?? String(t.dailyCallsGoal ?? 80);
                              const n = Number(String(raw).trim());
                              if (!Number.isFinite(n) || n < 1 || n > 999) {
                                toast.error("Indique um número entre 1 e 999.");
                                return;
                              }
                              saveDailyGoalMutation.mutate({
                                teamId: t.id,
                                dailyCallsGoal: Math.floor(n),
                              });
                            }}
                          >
                            Guardar meta
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {isTeamLeadRole && !isCoordLike ? (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                E-mail da minha equipa
              </CardTitle>
              <p className="text-sm font-normal text-muted-foreground pt-1">
                Só pode configurar o e-mail para a equipa a que está associado (teamId ou liderança na tabela de equipas). Perfil atual:{" "}
                <Badge variant="outline">{roleBadge}</Badge>
              </p>
            </CardHeader>
            <CardContent>
              {mineQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : !mineTeam ? (
                <p className="text-sm text-muted-foreground">
                  Não foi encontrada equipa neste momento. Um coordenador precisa criar a equipa, definir-o como líder (<span className="font-medium">leaderId</span>) ou definir o seu <span className="font-medium">teamId</span> no utilizador.
                </p>
              ) : (
                <div className="space-y-3 max-w-xl">
                  <div className="text-sm font-medium">{mineTeam.name}</div>
                  <div className="space-y-2">
                    <Label htmlFor="mine-team-email">E-mail oficial da equipa</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id="mine-team-email"
                        type="email"
                        placeholder="equipa@empresa.pt"
                        value={mineEmail}
                        onChange={(e) => setMineEmail(e.target.value)}
                      />
                      <Button
                        type="button"
                        disabled={saveEmailMutation.isPending}
                        onClick={() => {
                          const v = mineEmail.trim();
                          saveEmailMutation.mutate({
                            teamId: mineTeam.id,
                            contactEmail: v === "" ? "" : v,
                          });
                        }}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <Label htmlFor="mine-team-goal" className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
                      Meta diária de ligações
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Objectivo de chamadas por dia no painel. Vendedores não podem alterar este valor.
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Input
                        id="mine-team-goal"
                        type="number"
                        min={1}
                        max={999}
                        className="w-28"
                        value={mineDailyGoal}
                        onChange={(e) => setMineDailyGoal(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={saveDailyGoalMutation.isPending}
                        onClick={() => {
                          const n = Number(String(mineDailyGoal).trim());
                          if (!Number.isFinite(n) || n < 1 || n > 999) {
                            toast.error("Indique um número entre 1 e 999.");
                            return;
                          }
                          saveDailyGoalMutation.mutate({
                            teamId: mineTeam.id,
                            dailyCallsGoal: Math.floor(n),
                          });
                        }}
                      >
                        Guardar meta
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
  );
}
