import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Info,
  Mail,
  Pencil,
  Phone,
  ShieldOff,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Redirect } from "wouter";

const roleLabels: Record<string, string> = {
  vendedor: "Vendedor",
  cej: "Chefe Equipa Jr.",
  ce: "Chefe de Equipa",
  coordenador: "Coordenador",
};

function memberPresenceBadge(m: {
  bloqueado?: boolean | null;
  isOnline?: boolean | null;
  dialerState?: string | null;
}) {
  if (m.bloqueado) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldOff className="h-3 w-3" />
        Bloqueado
      </Badge>
    );
  }
  if (m.dialerState === "in_call") {
    return <Badge className="bg-amber-500 hover:bg-amber-600">Em Chamada</Badge>;
  }
  if (m.isOnline) {
    return <Badge className="bg-emerald-600 hover:bg-emerald-700">Online</Badge>;
  }
  return <Badge variant="secondary">Offline</Badge>;
}

function fallbackGeoFromIp(ip: string | null | undefined): string | null {
  if (!ip?.trim()) return null;
  const s = ip.trim().replace(/^::ffff:/, "");
  if (s === "::1" || s === "127.0.0.1") return "Rede local / IP privado";
  if (
    s.startsWith("192.168.") ||
    s.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(s)
  ) {
    return "Rede local / IP privado";
  }
  return null;
}

function formatActiveDuration(startedAt: unknown): string {
  if (!startedAt) return "—";
  const t = new Date(startedAt as string).getTime();
  if (Number.isNaN(t)) return "—";
  const totalMin = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
}

function EquipaSupervisaoPanel() {
  const [durTick, setDurTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDurTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const teamQuery = trpc.supervision.teamStatus.useQuery(undefined, {
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
  const alertsQuery = trpc.supervision.alerts.useQuery(undefined, {
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-0 shadow-sm lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Estado em tempo real
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!teamQuery.data?.length ? (
            <div className="py-10 text-center text-muted-foreground">Sem dados</div>
          ) : (
            <div className="divide-y">
              {teamQuery.data.map((u: Record<string, unknown>) => (
                <div key={u.id as number} className="py-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {(u.name as string) || (u.email as string)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email as string}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{String(u.dialerState ?? "—")}</Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Phone className="h-3.5 w-3.5" />#{String(u.dialerContactId || "—")}
                      </Badge>
                      <div
                        className={`h-2 w-2 rounded-full ${u.isOnline ? "bg-green-500" : "bg-gray-300"}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">IP: </span>
                      {(u.lastSeenIp as string) || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Localização: </span>
                      {(u.lastSeenGeo as string) ||
                        fallbackGeoFromIp(u.lastSeenIp as string) ||
                        "—"}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-foreground">Dispositivo: </span>
                      {(u.deviceSummary as string) || "—"}
                    </div>
                    {u.isOnline ? (
                      <div className="sm:col-span-2">
                        <span className="font-medium text-foreground">Sessão activa há: </span>
                        {durTick >= 0 ? formatActiveDuration(u.presenceSessionStartedAt) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Alertas (pendentes)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!alertsQuery.data?.length ? (
            <div className="py-10 text-center text-muted-foreground">Sem alertas</div>
          ) : (
            alertsQuery.data.map((p: { id: number; vendedorId?: number; contactId?: number }) => (
              <div key={p.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">Pendente #{p.id}</div>
                <div className="text-muted-foreground">
                  vendedorId: {p.vendedorId} · contactId: {p.contactId}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}


export default function Equipa() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string })?.crmRole ?? "vendedor";
  const isSuperAdmin = !!(user as { isSuperAdmin?: boolean })?.isSuperAdmin;

  if (!isSuperAdmin && crmRole === "vendedor") {
    return <Redirect to="/painel" />;
  }

  const isCoordLike = crmRole === "coordenador" || isSuperAdmin;
  const isTeamLeadRole = ["ce", "cej"].includes(crmRole);

  const membersQuery = trpc.authLocal.listEquipaMembers.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const usersDirectoryQuery = trpc.authLocal.listUsers.useQuery();
  const cejListQuery = trpc.authLocal.listCejForAssignment.useQuery();
  const coordinatorsQuery = trpc.authLocal.listCoordinators.useQuery(undefined, {
    enabled: isSuperAdmin,
  });

  const listQuery = trpc.teams.list.useQuery(undefined, { enabled: isCoordLike });
  const mineQuery = trpc.teams.mine.useQuery(undefined, { enabled: isTeamLeadRole });

  const [editUser, setEditUser] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    nif: "",
    sfid: "",
    bloqueado: false,
    teamLeaderJuniorId: "",
    password: "",
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    crmRole: "vendedor",
    tenantCoordinatorUserId: "" as string | number,
  });

  const [newTeamName, setNewTeamName] = useState("");
  const [localEmails, setLocalEmails] = useState<Record<number, string>>({});
  const [localDailyGoals, setLocalDailyGoals] = useState<Record<number, string>>({});
  const [mineEmail, setMineEmail] = useState("");
  const [mineDailyGoal, setMineDailyGoal] = useState("");

  const updateUserMutation = trpc.authLocal.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Utilizador actualizado");
      setEditUser(null);
      void membersQuery.refetch();
      void usersDirectoryQuery.refetch();
    },
    onError: (err: { message?: string }) => toast.error(err.message ?? "Erro"),
  });

  const registerMutation = trpc.authLocal.register.useMutation({
    onSuccess: () => {
      toast.success("Utilizador criado");
      setShowCreate(false);
      setNewUser({
        name: "",
        email: "",
        password: "",
        crmRole: "vendedor",
        tenantCoordinatorUserId: "",
      });
      void membersQuery.refetch();
      void usersDirectoryQuery.refetch();
    },
    onError: (err: { message?: string }) => toast.error(err.message ?? "Erro"),
  });

  const createMutation = trpc.teams.create.useMutation({
    onSuccess: () => {
      toast.success("Equipa criada");
      setNewTeamName("");
      void listQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const saveEmailMutation = trpc.teams.updateContactEmail.useMutation({
    onSuccess: () => {
      toast.success("E-mail guardado");
      void listQuery.refetch();
      void mineQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const saveDailyGoalMutation = trpc.teams.updateDailyCallsGoal.useMutation({
    onSuccess: () => {
      toast.success("Meta guardada");
      void listQuery.refetch();
      void mineQuery.refetch();
      void membersQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const allowedRoles = isSuperAdmin
    ? (["vendedor", "cej", "ce", "coordenador"] as const)
    : crmRole === "coordenador"
      ? (["vendedor", "cej", "ce"] as const)
      : crmRole === "ce"
        ? (["vendedor", "cej"] as const)
        : crmRole === "cej"
          ? (["vendedor"] as const)
          : ([] as const);

  const getDisplayRole = (u: { isSuperAdmin?: boolean; crmRole?: string }) => {
    if (u?.isSuperAdmin) return "Super Admin";
    return roleLabels[u?.crmRole ?? ""] || u?.crmRole || "—";
  };

  const openEdit = (u: Record<string, unknown>) => {
    setEditUser(u);
    setEditForm({
      name: String(u.name ?? ""),
      nif: String(u.nif ?? ""),
      sfid: String(u.sfid ?? ""),
      bloqueado: !!u.bloqueado,
      teamLeaderJuniorId: u.teamLeaderJuniorId ? String(u.teamLeaderJuniorId) : "",
      password: "",
    });
  };

  const saveEdit = () => {
    if (!editUser) return;
    updateUserMutation.mutate({
      id: Number(editUser.id),
      name: editForm.name.trim(),
      nif: editForm.nif.trim() || null,
      sfid: editForm.sfid.trim() || null,
      bloqueado: editForm.bloqueado,
      teamLeaderJuniorId:
        editUser.crmRole === "vendedor" && editForm.teamLeaderJuniorId
          ? parseInt(editForm.teamLeaderJuniorId, 10)
          : null,
      password: editForm.password.length >= 6 ? editForm.password : undefined,
    });
  };

  const submitCreate = () => {
    const base = {
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      password: newUser.password,
      crmRole: newUser.crmRole as "vendedor" | "cej" | "ce" | "coordenador",
    };
    if (isSuperAdmin && newUser.crmRole !== "coordenador") {
      const tc = Number(newUser.tenantCoordinatorUserId);
      if (!tc) {
        toast.error("Escolha a empresa (coordenador).");
        return;
      }
      registerMutation.mutate({ ...base, tenantCoordinatorUserId: tc });
      return;
    }
    registerMutation.mutate(base);
  };

  const mineTeam = mineQuery.data;

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

  const getDisplayEmailForTeamRow = (teamId: number, serverEmail: string | null | undefined) =>
    localEmails[teamId] !== undefined ? localEmails[teamId] : (serverEmail ?? "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipa</h1>
          <p className="text-muted-foreground">
            Membros, metas, supervisão em tempo real e configuração — hub único de gestão humana.
          </p>
        </div>
        {allowedRoles.length > 0 ? (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Novo utilizador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar utilizador</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cargo *</Label>
                  <Select
                    value={newUser.crmRole}
                    onValueChange={(v) =>
                      setNewUser({ ...newUser, crmRole: v, tenantCoordinatorUserId: "" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isSuperAdmin && newUser.crmRole !== "coordenador" ? (
                  <div className="space-y-2">
                    <Label>Empresa (coordenador) *</Label>
                    <Select
                      value={
                        newUser.tenantCoordinatorUserId
                          ? String(newUser.tenantCoordinatorUserId)
                          : ""
                      }
                      onValueChange={(v) =>
                        setNewUser({ ...newUser, tenantCoordinatorUserId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione" />
                      </SelectTrigger>
                      <SelectContent>
                        {(coordinatorsQuery.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name || c.email || `ID ${c.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  onClick={submitCreate}
                  disabled={
                    !newUser.name.trim() ||
                    !newUser.email.trim() ||
                    newUser.password.length < 6 ||
                    registerMutation.isPending
                  }
                >
                  Criar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Tabs defaultValue="membros" className="space-y-4">
        <TabsList>
          <TabsTrigger value="membros">Membros</TabsTrigger>
          <TabsTrigger value="supervisao">Supervisão</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="membros">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0 pt-4">
              {membersQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : !membersQuery.data?.length ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Nenhum membro visível no seu âmbito.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Meta diária</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersQuery.data.map((m) => (
                      <TableRow
                        key={m.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openEdit(m as Record<string, unknown>)}
                      >
                        <TableCell className="font-medium">{m.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getDisplayRole(m)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.email}</TableCell>
                        <TableCell>{memberPresenceBadge(m)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.dailyCallsGoal ?? 80}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(m as Record<string, unknown>);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supervisao">
          <EquipaSupervisaoPanel />
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                Hierarquia (Fase 1)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">CEJ</strong> — vê vendedores com{" "}
                <code className="text-xs">team_leader_junior_id</code> igual ao seu ID ou da mesma
                equipa (<code className="text-xs">teamId</code>).
              </p>
              <p>
                <strong className="text-foreground">CE</strong> — vê CEJ e vendedores da mesma
                sub-empresa (<code className="text-xs">companyId</code>).
              </p>
              <p>
                <strong className="text-foreground">Coordenador / Super Admin</strong> — visão
                global no tenant.
              </p>
            </CardContent>
          </Card>

          {isCoordLike ? (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Equipas e metas
                </CardTitle>
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
                    Criar equipa
                  </Button>
                </div>
                {listQuery.data?.map(
                  (t: {
                    id: number;
                    name: string;
                    contactEmail: string | null;
                    dailyCallsGoal?: number | null;
                  }) => (
                    <div key={t.id} className="rounded-lg border p-4 space-y-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="space-y-2 max-w-xl">
                        <Label>E-mail oficial</Label>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="email"
                            value={getDisplayEmailForTeamRow(t.id, t.contactEmail)}
                            onChange={(e) =>
                              setLocalEmails((prev) => ({ ...prev, [t.id]: e.target.value }))
                            }
                          />
                          <Button
                            variant="secondary"
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
                      <div className="space-y-2 max-w-xl border-t pt-3">
                        <Label className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Meta diária de ligações
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          <Input
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
                            variant="secondary"
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
                  ),
                )}
              </CardContent>
            </Card>
          ) : null}

          {isTeamLeadRole && !isCoordLike && mineTeam ? (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Meta da minha equipa — {mineTeam.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-w-xs space-y-2">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={mineDailyGoal}
                  onChange={(e) => setMineDailyGoal(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const n = Number(mineDailyGoal);
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
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
          </DialogHeader>
          {editUser ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">{String(editUser.email)}</p>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>NIF</Label>
                  <Input
                    value={editForm.nif}
                    onChange={(e) => setEditForm({ ...editForm, nif: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SFID</Label>
                  <Input
                    value={editForm.sfid}
                    onChange={(e) => setEditForm({ ...editForm, sfid: e.target.value })}
                  />
                </div>
              </div>
              {editUser.crmRole === "vendedor" ? (
                <div className="space-y-2">
                  <Label>CEJ responsável</Label>
                  <Select
                    value={editForm.teamLeaderJuniorId || "none"}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, teamLeaderJuniorId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {(cejListQuery.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name || `ID ${c.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Bloquear acesso</Label>
                  <p className="text-xs text-muted-foreground">
                    Invalida a sessão activa de imediato
                  </p>
                </div>
                <Switch
                  checked={editForm.bloqueado}
                  onCheckedChange={(v) => setEditForm({ ...editForm, bloqueado: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nova senha (opcional)</Label>
                <Input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                />
              </div>
              <Button className="w-full" onClick={saveEdit} disabled={updateUserMutation.isPending}>
                Guardar alterações
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
