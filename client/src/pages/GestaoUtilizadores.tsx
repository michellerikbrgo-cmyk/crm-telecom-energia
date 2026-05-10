import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus } from "lucide-react";
import { useState } from "react";
import { Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function GestaoUtilizadores() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;

  if (!isSuperAdmin && crmRole === "vendedor") {
    return <Redirect to="/painel" />;
  }
  const [showDialog, setShowDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    crmRole: "vendedor",
    tenantCoordinatorUserId: "" as string | number,
  });

  const usersQuery = trpc.authLocal.listUsers.useQuery();
  const coordinatorsQuery = trpc.authLocal.listCoordinators.useQuery(undefined, {
    enabled: isSuperAdmin,
  });

  const registerMutation = trpc.authLocal.register.useMutation({
    onSuccess: () => {
      toast.success("Utilizador criado com sucesso!");
      setShowDialog(false);
      setNewUser({
        name: "",
        email: "",
        password: "",
        crmRole: "vendedor",
        tenantCoordinatorUserId: "",
      });
      usersQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const roleLabels: Record<string, string> = {
    vendedor: "Vendedor",
    cej: "Chefe Equipa Jr.",
    ce: "Chefe de Equipa",
    coordenador: "Coordenador",
  };

  const roleColors: Record<string, string> = {
    vendedor: "bg-blue-100 text-blue-700",
    cej: "bg-orange-100 text-orange-700",
    ce: "bg-purple-100 text-purple-700",
    coordenador: "bg-red-100 text-red-700",
  };

  const getDisplayRole = (u: any) => {
    if (u?.isSuperAdmin) return "Super Admin";
    return roleLabels[u?.crmRole] || u?.crmRole || "-";
  };

  const getRoleColor = (u: any) => {
    if (u?.isSuperAdmin) return "bg-black text-white";
    return roleColors[u?.crmRole] || "";
  };

  const allowedRoles = isSuperAdmin
    ? (["vendedor", "cej", "ce", "coordenador"] as const)
    : crmRole === "coordenador"
      ? (["vendedor", "cej", "ce"] as const)
      : crmRole === "ce"
        ? (["vendedor", "cej"] as const)
        : crmRole === "cej"
          ? (["vendedor"] as const)
          : ([] as const);

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
        toast.error("Escolha a empresa (coordenador) onde o utilizador fica isolado.");
        return;
      }
      registerMutation.mutate({ ...base, tenantCoordinatorUserId: tc });
      return;
    }

    registerMutation.mutate(base);
  };

  const disableSubmit =
    !newUser.name.trim() ||
    !newUser.email.trim() ||
    newUser.password.length < 6 ||
    registerMutation.isPending ||
    (isSuperAdmin &&
      newUser.crmRole !== "coordenador" &&
      !Number(newUser.tenantCoordinatorUserId));

  return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Utilizadores</h1>
            <p className="text-muted-foreground">
              Hierarquia: só pode criar cargos abaixo do seu; cada coordenador é uma empresa (tenant) isolada nos dados.
              O Super Admin cria coordenadores e, para os outros cargos, escolhe a empresa.
            </p>
          </div>
          {allowedRoles.length > 0 && (
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Novo Utilizador
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Utilizador</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome Completo *</Label>
                    <Input
                      placeholder="Ex: João Silva"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input
                      type="email"
                      placeholder="joao@empresa.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha *</Label>
                    <Input
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cargo *</Label>
                    <Select
                      value={newUser.crmRole}
                      onValueChange={(v) => setNewUser({ ...newUser, crmRole: v, tenantCoordinatorUserId: "" })}
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
                      <Label>Empresa (coordenador dono do tenant) *</Label>
                      <Select
                        value={newUser.tenantCoordinatorUserId ? String(newUser.tenantCoordinatorUserId) : ""}
                        onValueChange={(v) => setNewUser({ ...newUser, tenantCoordinatorUserId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione o coordenador" />
                        </SelectTrigger>
                        <SelectContent>
                          {(coordinatorsQuery.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {(c.name || c.email || `ID ${c.id}`) + (c.email ? ` · ${c.email}` : "")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        O novo utilizador só verá dados desta empresa, como o coordenador e toda a cadeia abaixo dele.
                      </p>
                    </div>
                  ) : null}

                  <Button className="w-full" onClick={submitCreate} disabled={disableSubmit}>
                    {registerMutation.isPending ? "A criar..." : "Criar Utilizador"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {usersQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : !usersQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum utilizador encontrado</p>
              </div>
            ) : (
              <div className="divide-y">
                {usersQuery.data.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{u.name || "Sem nome"}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                        {(u.companyName || u.tenantId != null) && (
                          <p className="text-xs text-muted-foreground">
                            Empresa: {typeof u.companyName === "string" && u.companyName.trim()
                              ? u.companyName.trim()
                              : `coordenador #${u.tenantId}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getRoleColor(u)}>{getDisplayRole(u)}</Badge>
                      <div className={`h-2 w-2 rounded-full ${u.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
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
