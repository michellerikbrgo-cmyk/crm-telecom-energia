import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Download, Pencil, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import {
  CONTACT_EXPORT_COLUMNS,
  DEFAULT_CONTACT_EXPORT_COLUMNS,
  type ContactExportColumnKey,
} from "@shared/contactsExport";

/** Filtro na grelha. «Novo» só aqui; «Cliente Vodafone» filtra por `isVodafoneClient`. */
const CONTACT_STATUSES = [
  ["todos", "Todos"],
  ["novo", "Novo"],
  ["nao_atende", "Não atende"],
  ["pendente", "Pendente"],
  ["cliente_fidelizado", "Cliente fidelizado"],
  ["sem_interesse", "Sem interesse"],
  ["sem_cobertura_fibra", "Sem cobertura"],
  ["vodafone_client", "Cliente Vodafone"],
  ["venda", "Venda"],
  ["blacklist", "Blacklist"],
] as const;

const VALID_EDIT_STATUS = CONTACT_STATUSES.filter(
  ([v]) => v !== "todos" && v !== "vodafone_client",
).map(([v]) => v);

type ContactRowStatus = Exclude<(typeof CONTACT_STATUSES)[number][0], "todos">;
/** Estados persistidos em `contacts.status` (exclui pseudo-estado de filtro «Cliente Vodafone»). */
type ContactPersistedStatus = Exclude<ContactRowStatus, "vodafone_client">;

const STATUS_SUMMARY_KEYS = [
  ["total", "Total"],
  ["novo", "Novos"],
  ["nao_atende", "Não atende"],
  ["pendente", "Pendentes"],
  ["cliente_fidelizado", "Cliente fidelizado"],
  ["venda", "Vendas"],
  ["sem_interesse", "Sem interesse"],
  ["sem_cobertura_fibra", "Sem cobertura"],
  ["vodafone_client", "Cliente Vodafone"],
  ["blacklist", "Blacklist"],
] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const statusColors: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  pendente: "bg-orange-100 text-orange-700",
  venda: "bg-green-100 text-green-700",
  nao_atende: "bg-gray-100 text-gray-700",
  sem_interesse: "bg-red-100 text-red-700",
  sem_cobertura_fibra: "bg-slate-200 text-slate-800",
  vodafone_client: "bg-rose-100 text-rose-800",
  blacklist: "bg-black text-white",
};

const statusLabels = Object.fromEntries(
  CONTACT_STATUSES.filter(([k]) => k !== "todos").map(([k, l]) => [k, l]),
);

function displayContactStatus(s: string, isVodafone?: boolean) {
  if (isVodafone) return "Cliente Vodafone";
  if (s === "venda") return "Venda";
  return statusLabels[s] || s;
}

export default function Contactos() {
  const searchString = useSearch();
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string })?.crmRole ?? "vendedor";
  const isSuperAdmin = !!(user as { isSuperAdmin?: boolean })?.isSuperAdmin;
  const canAccess =
    isSuperAdmin || crmRole === "ce" || crmRole === "coordenador";

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCols, setExportCols] = useState<ContactExportColumnKey[]>(
    () => [...DEFAULT_CONTACT_EXPORT_COLUMNS],
  );

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get("q");
    if (q?.trim()) setSearchInput(q.trim());
  }, [searchString]);

  const listInput = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter === "todos" ? undefined : statusFilter,
    }),
    [debouncedSearch, statusFilter],
  );

  const contactsQuery = trpc.contacts.list.useQuery(listInput, {
    enabled: canAccess,
    staleTime: 15_000,
  });

  const countsQuery = trpc.contacts.countByStatus.useQuery(
    { search: debouncedSearch.trim() || undefined },
    { enabled: canAccess, staleTime: 15_000 },
  );

  const utils = trpc.useUtils();

  const statusCount = (key: string) => {
    if (key === "total") return countsQuery.data?.total ?? 0;
    if (key === "fechado" || key === "venda") return countsQuery.data?.byStatus?.venda ?? 0;
    if (key === "vodafone_client") return countsQuery.data?.byStatus?.vodafone_client ?? 0;
    return countsQuery.data?.byStatus?.[key] ?? 0;
  };

  const handleExport = async () => {
    if (exportCols.length === 0) {
      toast.error("Seleccione pelo menos uma coluna.");
      return;
    }
    try {
      const res = await utils.contacts.exportCsv.fetch({
        ...listInput,
        columns: exportCols,
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contactos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportados ${res.count} contactos`);
      setExportOpen(false);
    } catch (err) {
      toast.error(err instanceof TRPCClientError ? err.message : "Erro ao exportar");
    }
  };

  const [editContact, setEditContact] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({
    phone: "",
    name: "",
    email: "",
    notes: "",
    origin: "Indicação",
    status: "novo",
    address: "",
    postalCode: "",
  });

  const updateMutation = trpc.contacts.update.useMutation();

  const openEdit = useCallback((contact: Record<string, unknown>) => {
    const status = typeof contact.status === "string" ? contact.status : "novo";
    const safeStatus = VALID_EDIT_STATUS.includes(status as ContactRowStatus)
      ? status
      : "novo";
    setEditContact(contact);
    setEditForm({
      phone: contact.phone != null ? String(contact.phone) : "",
      name: contact.name != null ? String(contact.name) : "",
      email: contact.email != null ? String(contact.email) : "",
      notes: contact.notes != null ? String(contact.notes) : "",
      origin:
        typeof contact.origin === "string" && contact.origin.trim()
          ? contact.origin.trim()
          : "Indicação",
      status: safeStatus,
      address: contact.address != null ? String(contact.address) : "",
      postalCode: contact.postalCode != null ? String(contact.postalCode) : "",
    });
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editContact || typeof editContact.id !== "number") return;
    try {
      const rawStatus = editForm.status;
      const normalizedStatus: ContactPersistedStatus =
        rawStatus !== "todos" &&
        rawStatus !== "vodafone_client" &&
        (VALID_EDIT_STATUS as readonly string[]).includes(rawStatus)
          ? (rawStatus as ContactPersistedStatus)
          : "novo";

      await updateMutation.mutateAsync({
        id: Number(editContact.id),
        phone: editForm.phone.replace(/\s+/g, "").trim(),
        name: editForm.name.trim() || null,
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null,
        origin: editForm.origin,
        status: normalizedStatus,
        address: editForm.address.trim() || null,
        postalCode: editForm.postalCode.trim() || null,
      });
      toast.success("Contacto actualizado");
      setEditContact(null);
      await contactsQuery.refetch();
      await countsQuery.refetch();
    } catch (err) {
      toast.error(err instanceof TRPCClientError ? err.message : "Erro ao actualizar");
    }
  }, [contactsQuery, countsQuery, editContact, editForm, updateMutation]);

  if (!canAccess) {
    return <Redirect to="/painel" />;
  }

  const rows = contactsQuery.data ?? [];
  const listLoading = contactsQuery.isLoading && !contactsQuery.dataUpdatedAt;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
        <p className="text-muted-foreground">
          Inventário e rastreabilidade — último operador e feedback por contacto.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_SUMMARY_KEYS.map(([key, label]) => (
          <Card key={key} className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {countsQuery.isLoading ? "…" : statusCount(key)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="py-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Nome ou telefone…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 w-full sm:w-52">
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_STATUSES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => setExportOpen(true)}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {contactsQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar</AlertTitle>
          <AlertDescription>{contactsQuery.error.message}</AlertDescription>
        </Alert>
      )}

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {listLoading ? (
            <div className="flex justify-center py-14">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground text-sm">
              Nenhum contacto encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último operador</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const vf = !!(row as { isVodafoneClient?: boolean }).isVodafoneClient;
                    const stLabel = vf ? "vodafone_client" : row.status;
                    return (
                    <TableRow key={row.id} className="text-sm">
                      <TableCell className="font-mono whitespace-nowrap">{row.phone}</TableCell>
                      <TableCell className="max-w-[10rem] truncate">{row.name || "—"}</TableCell>
                      <TableCell className="max-w-[8rem] truncate text-muted-foreground">
                        {row.origin}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${statusColors[stLabel] || statusColors[row.status] || ""}`}
                          variant="secondary"
                        >
                          {displayContactStatus(row.status, vf)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate">
                        {row.lastOperatorName || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                        {row.lastFeedbackAt
                          ? new Date(row.lastFeedbackAt).toLocaleString("pt-PT")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Editar"
                          onClick={() => openEdit(row as Record<string, unknown>)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar exportação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Ficheiro UTF-8 com BOM e separador <strong>;</strong> (Excel PT).
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {CONTACT_EXPORT_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={exportCols.includes(col.key)}
                    onCheckedChange={(checked) => {
                      setExportCols((prev) =>
                        checked
                          ? [...prev, col.key]
                          : prev.filter((k) => k !== col.key),
                      );
                    }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setExportCols(CONTACT_EXPORT_COLUMNS.map((c) => c.key))}
              >
                Todas
              </Button>
              <Button type="button" className="flex-1 gap-2" onClick={() => void handleExport()}>
                <Download className="h-4 w-4" />
                Descarregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editContact} onOpenChange={(open) => !open && setEditContact(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          {editContact ? (
            <form
              className="space-y-4 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submitEdit();
              }}
            >
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input
                  inputMode="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_EDIT_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {displayContactStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                Guardar
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
