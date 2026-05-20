import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, Plus, Pencil, Search, ShoppingCart } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { OperadoraAtualSelect } from "@/components/OperadoraAtualSelect";
import { PriorityStars, PriorityStarsDisplay } from "@/components/PriorityStars";
import {
  ColumnHeaderFilter,
  matchDateColumnFilter,
  type ColumnSort,
  type DateFilterMode,
} from "@/components/ColumnHeaderFilter";

type PendenteRow = inferRouterOutputs<AppRouter>["pendentes"]["list"][number];
type ContactPickerRow = inferRouterOutputs<AppRouter>["contacts"]["searchPicker"][number];

const STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  fidelizado: "Fidelizado",
  realizado: "Realizado",
  expirado: "Expirado",
  cancelado: "Cancelado",
  nao_fechou: "Não fechou",
};

export default function Pendentes() {
  const { user } = useAuth();
  const search = useSearch();
  const authUserId = (user as { id?: number } | null)?.id;
  const utils = trpc.useUtils();
  const operatorsQuery = trpc.pendentes.assignableOperators.useQuery();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editPendente, setEditPendente] = useState<PendenteRow | null>(null);
  const deepLinkHandled = useRef(false);

  const [colCliente, setColCliente] = useState("");
  const [colNif, setColNif] = useState("");
  const [colOperador, setColOperador] = useState("");
  const [retornoDateMode, setRetornoDateMode] = useState<DateFilterMode>("day");
  const [retornoDay, setRetornoDay] = useState("");
  const [retornoMonth, setRetornoMonth] = useState("");
  const [sortCliente, setSortCliente] = useState<ColumnSort>(null);

  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const openParam = useMemo(() => {
    const v = new URLSearchParams(search).get("open")?.trim();
    return v || "";
  }, [search]);

  const pendentesQuery = trpc.pendentes.list.useQuery(undefined);
  const motivosQuery = trpc.motivosNaoFechamento.list.useQuery();
  const pickerQuery = trpc.contacts.searchPicker.useQuery(
    { q: contactSearch.trim() },
    { enabled: contactSearch.trim().length >= 2 },
  );

  const [newPendente, setNewPendente] = useState({
    phone: "",
    name: "",
    clientNif: "",
    operadoraAtual: "",
    returnDate: "",
    historicoChamada: "",
    notes: "",
    offerDesired: "",
    priorityLevel: "3",
    assignVendedorId: "",
  });

  const [editForm, setEditForm] = useState({
    returnDate: "",
    notes: "",
    offerDesired: "",
    historicoChamada: "",
    status: "agendado",
    priorityLevel: "3",
    motivoNaoFechamentoId: "",
  });

  const invalidatePendentesList = () => {
    void utils.pendentes.list.invalidate();
    void pendentesQuery.refetch();
  };

  const createWithContactMutation = trpc.pendentes.createWithContact.useMutation({
    onSuccess: (res) => {
      toast.success(`Pendente ${res.publicPendingId ?? ""} criado`);
      setShowCreateDialog(false);
      resetNewForm();
      invalidatePendentesList();
    },
    onError: (err) => toast.error(err.message),
  });

  const createPendenteMutation = trpc.pendentes.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Pendente ${res.publicPendingId ?? ""} agendado`);
      resetNewForm();
      setShowCreateDialog(false);
      invalidatePendentesList();
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePendenteMutation = trpc.pendentes.update.useMutation({
    onSuccess: () => {
      toast.success("Pendente actualizado");
      setEditPendente(null);
      invalidatePendentesList();
    },
    onError: (err) => toast.error(err.message),
  });

  const convertMutation = trpc.pendentes.convertToSale.useMutation({
    onSuccess: (res) => {
      toast.success(`Venda criada: ${res.publicSaleId}`);
      invalidatePendentesList();
    },
    onError: (err) => toast.error(err.message),
  });

  const motivoMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const row of motivosQuery.data ?? []) m[row.id] = row.descricao;
    return m;
  }, [motivosQuery.data]);

  const resetNewForm = () => {
    setNewPendente({
      phone: "",
      name: "",
      clientNif: "",
      operadoraAtual: "",
      returnDate: "",
      historicoChamada: "",
      notes: "",
      offerDesired: "",
      priorityLevel: "3",
      assignVendedorId: authUserId != null ? String(authUserId) : "",
    });
    setContactSearch("");
    setSelectedContactId(null);
  };

  useEffect(() => {
    if (authUserId == null) return;
    setNewPendente((p) => ({
      ...p,
      assignVendedorId: p.assignVendedorId || String(authUserId),
    }));
  }, [authUserId]);

  const handleCreate = () => {
    if (!newPendente.returnDate) {
      toast.error("Indique a data de retorno.");
      return;
    }
    if (!newPendente.historicoChamada.trim()) {
      toast.error("O histórico / notas da chamada é obrigatório.");
      return;
    }
    const assignId = Number(newPendente.assignVendedorId);
    if (!Number.isFinite(assignId) || assignId <= 0) {
      toast.error("Seleccione o operador para o retorno.");
      return;
    }
    const base = {
      returnDate: newPendente.returnDate,
      historicoChamada: newPendente.historicoChamada.trim(),
      notes: newPendente.notes || undefined,
      offerDesired: newPendente.offerDesired || undefined,
      priorityLevel: parseInt(newPendente.priorityLevel, 10),
      clientNif: newPendente.clientNif.trim() || undefined,
      operadoraAtual: newPendente.operadoraAtual.trim() || undefined,
      assignVendedorId: assignId,
    };
    if (selectedContactId) {
      createPendenteMutation.mutate({
        contactId: selectedContactId,
        name: newPendente.name.trim() || undefined,
        phone: newPendente.phone.trim() || undefined,
        ...base,
      });
      return;
    }
    if (!newPendente.phone.trim()) {
      toast.error("Telefone ou contacto existente é obrigatório.");
      return;
    }
    createWithContactMutation.mutate({
      phone: newPendente.phone,
      name: newPendente.name.trim() || undefined,
      ...base,
    });
  };

  const openEdit = (p: PendenteRow) => {
    setEditPendente(p);
    const d = new Date(p.returnDate as string);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditForm({
      returnDate: local,
      notes: String(p.notes ?? ""),
      offerDesired: String(p.offerDesired ?? ""),
      historicoChamada: String(p.historicoChamada ?? ""),
      status: String(p.status ?? "agendado"),
      priorityLevel: String(p.priorityLevel ?? 3),
      motivoNaoFechamentoId: p.motivoNaoFechamentoId ? String(p.motivoNaoFechamentoId) : "",
    });
  };

  const allRows: PendenteRow[] = pendentesQuery.data ?? [];

  const rows = useMemo(() => {
    const match = (hay: string, needle: string) =>
      !needle.trim() || hay.toLowerCase().includes(needle.trim().toLowerCase());

    let list = allRows.filter((p) => {
      const operador = String(p.criadorName ?? p.vendedorName ?? "");
      const clienteHay = `${p.contactName ?? ""} ${p.contactPhone ?? ""}`;
      return (
        match(clienteHay, colCliente) &&
        match(String(p.clientNif ?? ""), colNif) &&
        match(operador, colOperador) &&
        matchDateColumnFilter(p.returnDate, retornoDateMode, retornoDay, retornoMonth)
      );
    });

    if (sortCliente) {
      list = [...list].sort((a, b) => {
        const cmp = (a.contactName || a.contactPhone || "").localeCompare(
          b.contactName || b.contactPhone || "",
          "pt",
        );
        return sortCliente === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [allRows, colCliente, colNif, colOperador, retornoDateMode, retornoDay, retornoMonth, sortCliente]);

  useEffect(() => {
    if (!openParam || deepLinkHandled.current || !allRows.length) return;
    const found = allRows.find(
      (p) =>
        (p.publicPendingId && p.publicPendingId.toUpperCase() === openParam.toUpperCase()) ||
        String(p.id) === openParam.replace(/^#/, ""),
    );
    if (found) {
      deepLinkHandled.current = true;
      openEdit(found);
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, [openParam, allRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendentes</h1>
          <p className="text-muted-foreground text-sm">
            Pendentes com PENDING_ID — a venda (SALE_ID) só é gerada na conversão.
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo pendente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Pendente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Procurar contacto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nome ou telefone (mín. 2)"
                    value={contactSearch}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setSelectedContactId(null);
                    }}
                  />
                </div>
                {pickerQuery.data?.length && !selectedContactId ? (
                  <div className="border rounded-md max-h-28 overflow-y-auto divide-y">
                    {pickerQuery.data.map((c: ContactPickerRow) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedContactId(c.id);
                          setNewPendente((p) => ({
                            ...p,
                            phone: c.phone,
                            name: c.name || "",
                          }));
                          setContactSearch(`${c.name || "—"} · ${c.phone}`);
                        }}
                      >
                        #{c.id} · {c.name || "—"} · {c.phone}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do cliente *</Label>
                  <Input
                    value={newPendente.name}
                    onChange={(e) => setNewPendente({ ...newPendente, name: e.target.value })}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input
                    value={newPendente.phone}
                    disabled={!!selectedContactId}
                    onChange={(e) => setNewPendente({ ...newPendente, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>NIF</Label>
                  <Input
                    value={newPendente.clientNif}
                    onChange={(e) => setNewPendente({ ...newPendente, clientNif: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operadora actual</Label>
                  <OperadoraAtualSelect
                    value={newPendente.operadoraAtual}
                    onValueChange={(v) => setNewPendente({ ...newPendente, operadoraAtual: v })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Histórico / notas da chamada *</Label>
                <Textarea
                  className="min-h-[80px]"
                  value={newPendente.historicoChamada}
                  onChange={(e) =>
                    setNewPendente({ ...newPendente, historicoChamada: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Data de retorno *</Label>
                <Input
                  type="datetime-local"
                  value={newPendente.returnDate}
                  onChange={(e) => setNewPendente({ ...newPendente, returnDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Operador (retorno) *</Label>
                <Select
                  value={newPendente.assignVendedorId || undefined}
                  onValueChange={(v) => setNewPendente({ ...newPendente, assignVendedorId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar operador" />
                  </SelectTrigger>
                  <SelectContent>
                    {(operatorsQuery.data ?? []).map((op) => (
                      <SelectItem key={op.id} value={String(op.id)}>
                        {op.name || `Utilizador #${op.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <PriorityStars
                  value={parseInt(newPendente.priorityLevel, 10) || 3}
                  onChange={(n) => setNewPendente({ ...newPendente, priorityLevel: String(n) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={newPendente.notes}
                  onChange={(e) => setNewPendente({ ...newPendente, notes: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={
                  createWithContactMutation.isPending || createPendenteMutation.isPending
                }
              >
                Criar pendente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {pendentesQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Nenhum pendente neste filtro</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PENDING_ID</TableHead>
                    <TableHead>
                      <ColumnHeaderFilter
                        label="Cliente"
                        textFilter={colCliente}
                        onTextFilter={setColCliente}
                        sort={sortCliente}
                        onSort={setSortCliente}
                        active={!!colCliente.trim() || !!sortCliente}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnHeaderFilter
                        label="Operador"
                        textFilter={colOperador}
                        onTextFilter={setColOperador}
                        active={!!colOperador.trim()}
                      />
                    </TableHead>
                    <TableHead>
                      <ColumnHeaderFilter
                        label="NIF"
                        textFilter={colNif}
                        onTextFilter={setColNif}
                        active={!!colNif.trim()}
                      />
                    </TableHead>
                    <TableHead>Operadora</TableHead>
                    <TableHead>
                      <ColumnHeaderFilter
                        label="Retorno"
                        dateFilter={{
                          mode: retornoDateMode,
                          dayValue: retornoDay,
                          monthValue: retornoMonth,
                          onModeChange: setRetornoDateMode,
                          onDayChange: setRetornoDay,
                          onMonthChange: setRetornoMonth,
                        }}
                        active={!!retornoDay.trim() || !!retornoMonth.trim()}
                      />
                    </TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p: PendenteRow) => {
                    const pr = Number(p.priorityLevel ?? 3);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">
                          {p.publicPendingId || `#${p.id}`}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{p.contactName || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {p.contactPhone}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-[9rem] truncate" title={String(p.criadorName ?? p.vendedorName ?? "")}>
                          {p.criadorName || p.vendedorName || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{p.clientNif || "—"}</TableCell>
                        <TableCell className="text-sm">{p.operadoraAtual || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(p.returnDate).toLocaleString("pt-PT")}
                        </TableCell>
                        <TableCell>
                          <PriorityStarsDisplay value={pr} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{STATUS_LABELS[p.status] || p.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {!p.convertedSaleId && p.status === "agendado" ? (
                              <Button
                                variant="outline"
                                size="icon"
                                title="Converter em venda"
                                onClick={() => convertMutation.mutate({ pendenteId: p.id })}
                              >
                                <ShoppingCart className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editPendente} onOpenChange={(o) => !o && setEditPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pendente</DialogTitle>
          </DialogHeader>
          {editPendente ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm font-mono text-muted-foreground">
                {String(editPendente.publicPendingId || `#${editPendente.id}`)}
              </p>
              <div className="space-y-2">
                <Label>Histórico / Notas da Chamada *</Label>
                <Textarea
                  value={editForm.historicoChamada}
                  onChange={(e) => setEditForm({ ...editForm, historicoChamada: e.target.value })}
                  rows={5}
                  placeholder="O que foi dito e acordado com o cliente…"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Retorno</Label>
                <Input
                  type="datetime-local"
                  value={editForm.returnDate}
                  onChange={(e) => setEditForm({ ...editForm, returnDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <PriorityStars
                  value={parseInt(editForm.priorityLevel, 10) || 3}
                  onChange={(n) => setEditForm({ ...editForm, priorityLevel: String(n) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editForm.status === "nao_fechou" ? (
                <div className="space-y-2">
                  <Label>Motivo *</Label>
                  <Select
                    value={editForm.motivoNaoFechamentoId}
                    onValueChange={(v) => setEditForm({ ...editForm, motivoNaoFechamentoId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(motivosQuery.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <Button
                className="w-full"
                onClick={() => {
                  if (!editForm.historicoChamada.trim()) {
                    toast.error("Preencha o histórico / notas da chamada.");
                    return;
                  }
                  if (editForm.status === "nao_fechou" && !editForm.motivoNaoFechamentoId) {
                    toast.error("Seleccione o motivo.");
                    return;
                  }
                  updatePendenteMutation.mutate({
                    id: Number(editPendente.id),
                    returnDate: new Date(editForm.returnDate).toISOString(),
                    notes: editForm.notes || null,
                    offerDesired: editForm.offerDesired || null,
                    historicoChamada: editForm.historicoChamada.trim(),
                    status: editForm.status as
                      | "agendado"
                      | "realizado"
                      | "expirado"
                      | "cancelado"
                      | "nao_fechou",
                    priorityLevel: parseInt(editForm.priorityLevel, 10),
                    motivoNaoFechamentoId:
                      editForm.status === "nao_fechou"
                        ? parseInt(editForm.motivoNaoFechamentoId, 10)
                        : null,
                  });
                }}
              >
                Guardar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
