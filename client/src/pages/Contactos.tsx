import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Search, Filter, UserPlus, PhoneCall, Pencil, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";

const KNOWN_ORIGINS = ["Indicação", "Telemarketing", "Website", "Redes Sociais", "Outro"] as const;

const CONTACT_STATUSES = [
  ["todos", "Todos"],
  ["novo", "Novo"],
  ["em_contacto", "Em Contacto"],
  ["pendente", "Pendente"],
  ["venda", "Venda"],
  ["nao_atende", "Não Atende"],
  ["sem_interesse", "Sem Interesse"],
  ["blacklist", "Blacklist"],
] as const;

const VALID_EDIT_STATUS = CONTACT_STATUSES.filter(([v]) => v !== "todos").map(([v]) => v);

/** Estados válidos para contacts.update (sem filtro "todos"). */
type ContactRowStatus = Exclude<(typeof CONTACT_STATUSES)[number][0], "todos">;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Payload só com strings simples para o tRPC serializar bem (superjson). */
function buildContactsAddPayload(form: {
  phone: string;
  name: string;
  email: string;
  origin: string;
  notes: string;
}) {
  const phone = form.phone.replace(/\s+/g, "").trim();
  const origin = KNOWN_ORIGINS.includes(form.origin as (typeof KNOWN_ORIGINS)[number])
    ? form.origin
    : "Indicação";

  const payload: {
    phone: string;
    origin: string;
    name?: string;
    email?: string;
    notes?: string;
  } = {
    phone,
    origin,
  };

  const name = form.name.trim();
  if (name) payload.name = name;

  const email = form.email.trim();
  if (email) payload.email = email;

  const notes = form.notes.trim();
  if (notes) payload.notes = notes;

  return payload;
}

export default function Contactos() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  const canEditContact =
    isSuperAdmin || ["cej", "ce", "coordenador"].includes(crmRole);

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const listInput = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter === "todos" ? undefined : statusFilter,
    }),
    [debouncedSearch, statusFilter],
  );

  const contactsQuery = trpc.contacts.list.useQuery(listInput, {
    staleTime: 15_000,
  });

  const contactRows = contactsQuery.data ?? [];

  const utils = trpc.useUtils();

  const handleGetNext = useCallback(async () => {
    try {
      const result = await utils.distribution.getNext.fetch();
      if (result) {
        toast.success(`Contacto atribuído: ${result.phone}`);
        await contactsQuery.refetch();
      } else toast.info("Não há contactos disponíveis de momento.");
    } catch (err) {
      const msg =
        err instanceof TRPCClientError ? err.message : "Erro ao obter próximo contacto.";
      toast.error(msg);
    }
  }, [contactsQuery.refetch, utils.distribution.getNext]);

  /** Formulário adicionar (estado próprio ao abrir o diálogo) */
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    phone: "",
    name: "",
    email: "",
    origin: "Indicação" as string,
    notes: "",
  });

  useEffect(() => {
    if (!addDialogOpen) {
      setAddForm({
        phone: "",
        name: "",
        email: "",
        origin: "Indicação",
        notes: "",
      });
    }
  }, [addDialogOpen]);

  const addMutation = trpc.contacts.add.useMutation();

  const submitAddContact = useCallback(async () => {
    const payload = buildContactsAddPayload(addForm);
    if (!payload.phone) {
      toast.error("Introduza um telefone válido.");
      return;
    }

    try {
      await addMutation.mutateAsync(payload);
      toast.success("Contacto adicionado com sucesso!");
      setAddDialogOpen(false);
      await contactsQuery.refetch();
    } catch (err) {
      const msg =
        err instanceof TRPCClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Erro ao guardar.";
      toast.error(msg);
      console.error("[contacts.add]", err);
    }
  }, [addForm, addMutation, contactsQuery.refetch]);

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
    const safeStatus = VALID_EDIT_STATUS.includes(status as any) ? status : "novo";
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
    const id = Number(editContact.id);

    try {
      const rawStatus = editForm.status;
      const normalizedStatus: ContactRowStatus =
        rawStatus !== "todos" && (VALID_EDIT_STATUS as readonly string[]).includes(rawStatus)
          ? (rawStatus as ContactRowStatus)
          : "novo";

      await updateMutation.mutateAsync({
        id,
        phone: editForm.phone.replace(/\s+/g, "").trim(),
        name: editForm.name.trim() || null,
        email: editForm.email.trim() || null,
        notes: editForm.notes.trim() || null,
        origin: editForm.origin,
        status: normalizedStatus,
        address: editForm.address.trim() || null,
        postalCode: editForm.postalCode.trim() || null,
      });
      toast.success("Contacto actualizado!");
      setEditContact(null);
      await contactsQuery.refetch();
    } catch (err) {
      const msg =
        err instanceof TRPCClientError ? err.message : "Erro ao actualizar.";
      toast.error(msg);
    }
  }, [contactsQuery.refetch, editContact, editForm, updateMutation]);

  const statusColors: Record<string, string> = {
    novo: "bg-blue-100 text-blue-700",
    em_contacto: "bg-yellow-100 text-yellow-700",
    pendente: "bg-orange-100 text-orange-700",
    venda: "bg-green-100 text-green-700",
    nao_atende: "bg-gray-100 text-gray-700",
    sem_interesse: "bg-red-100 text-red-700",
    blacklist: "bg-black text-white",
  };

  const statusLabels = Object.fromEntries(
    CONTACT_STATUSES.filter(([k]) => k !== "todos").map(([k, l]) => [k, l]),
  );

  const listLoading = contactsQuery.isLoading && !contactsQuery.dataUpdatedAt;

  return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
            <p className="text-muted-foreground">Lista, pesquisa e registo manual</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={handleGetNext}>
              <PhoneCall className="h-4 w-4" />
              Próximo contacto
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Adicionar contacto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Novo contacto</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitAddContact();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">Telefone *</Label>
                    <Input
                      id="contact-phone"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+351 900 000 000"
                      value={addForm.phone}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">Nome</Label>
                    <Input
                      id="contact-name"
                      value={addForm.name}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">E-mail</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      autoComplete="email"
                      value={addForm.email}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select
                      value={addForm.origin}
                      onValueChange={(v) =>
                        setAddForm((f) => ({ ...f, origin: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWN_ORIGINS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-notes">Notas</Label>
                    <Textarea
                      id="contact-notes"
                      rows={3}
                      value={addForm.notes}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      !addForm.phone.trim() ||
                      addMutation.isPending ||
                      !user
                    }
                  >
                    {addMutation.isPending ? "A guardar…" : "Guardar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Nome ou telefone…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-busy={contactsQuery.isFetching}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filtrar estado">
                  <Filter className="mr-2 h-4 w-4 shrink-0" />
                  <SelectValue placeholder="Estado" />
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
          </CardContent>
        </Card>

        {contactsQuery.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Falha ao carregar lista</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="break-words">{contactsQuery.error.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => contactsQuery.refetch()}
              >
                Voltar a tentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {listLoading ? (
              <div className="flex justify-center py-14">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : contactsQuery.isError ? null : contactRows.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-muted-foreground">
                <Phone className="mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm font-medium">Nenhum contacto encontrado</p>
                <p className="mt-1 max-w-xs text-center text-xs">
                  Ajuste o filtro ou adicione um contacto novo.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {contactRows.map((row: { id?: unknown }) => (
                  <div
                    key={String(row.id)}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {(row as { name?: string | null }).name || "Sem nome"}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {String((row as { phone?: unknown }).phone ?? "")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="max-w-[8rem] truncate text-xs">
                        {String((row as { origin?: unknown }).origin ?? "—")}
                      </Badge>
                      <Badge
                        className={`text-xs ${statusColors[String((row as { status?: string }).status)] || ""}`}
                      >
                        {statusLabels[String((row as { status?: string }).status)] ||
                          String((row as { status?: unknown }).status ?? "")}
                      </Badge>
                      {canEditContact && (
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {canEditContact && (
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
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select
                      value={
                        KNOWN_ORIGINS.includes(editForm.origin as (typeof KNOWN_ORIGINS)[number])
                          ? editForm.origin
                          : editForm.origin
                      }
                      onValueChange={(v) => setEditForm((f) => ({ ...f, origin: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {editForm.origin &&
                          !KNOWN_ORIGINS.includes(
                            editForm.origin as (typeof KNOWN_ORIGINS)[number],
                          ) && (
                            <SelectItem value={editForm.origin}>
                              {editForm.origin}
                            </SelectItem>
                          )}
                        {KNOWN_ORIGINS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                            {statusLabels[s] ?? s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Morada</Label>
                    <Input
                      value={editForm.address}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, address: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código postal</Label>
                    <Input
                      value={editForm.postalCode}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, postalCode: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notas</Label>
                    <Textarea
                      rows={3}
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!editForm.phone.trim() || updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "A guardar…" : "Guardar alterações"}
                  </Button>
                </form>
              ) : null}
            </DialogContent>
          </Dialog>
        )}
      </div>
  );
}
