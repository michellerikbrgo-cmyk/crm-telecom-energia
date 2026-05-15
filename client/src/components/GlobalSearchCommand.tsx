import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, CornerDownLeft, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { filterNavCatalog, NAV_CATALOG } from "@/crmNavCatalog";
import { cn } from "@/lib/utils";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

type GlobalSearchCommandProps = {
  crmRole: string;
  isSuperAdmin: boolean;
  planosEnabled: boolean;
  className?: string;
};

export function GlobalSearchCommand({ crmRole, isSuperAdmin, planosEnabled, className }: GlobalSearchCommandProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [, setLocation] = useLocation();
  const debouncedQ = useDebouncedValue(q.trim(), 320);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const visibleNav = useMemo(
    () => filterNavCatalog(NAV_CATALOG, { crmRole, isSuperAdmin, planosEnabled }),
    [crmRole, isSuperAdmin, planosEnabled],
  );

  const navMatches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return visibleNav.slice(0, 10);
    return visibleNav.filter(
      (item) => item.label.toLowerCase().includes(t) || item.path.toLowerCase().includes(t),
    );
  }, [visibleNav, q]);

  const contactsEnabled = open && debouncedQ.length >= 1;
  const contactsQuery = trpc.search.global.useQuery(
    { q: debouncedQ },
    { enabled: contactsEnabled, staleTime: 15_000 },
  );

  const go = useCallback(
    (path: string) => {
      setLocation(path);
      setOpen(false);
    },
    [setLocation],
  );

  const goContact = useCallback(
    (row: { id: number; name: string | null; phone: string | null }) => {
      const term = String(row.phone || "").trim() || String(row.name || "").trim() || String(row.id);
      setLocation(`/contactos?q=${encodeURIComponent(term)}`);
      setOpen(false);
    },
    [setLocation],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "justify-start text-muted-foreground font-normal gap-2 min-w-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate hidden sm:inline">Buscar no sistema…</span>
        <span className="truncate sm:hidden">Buscar…</span>
        <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton>
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar no sistema</DialogTitle>
            <DialogDescription>Páginas do CRM e contactos a que tens acesso.</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="max-h-[min(70vh,520px)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs">
            <CommandInput
              placeholder="Nome, telefone ou página…"
              value={q}
              onValueChange={setQ}
              autoFocus
            />
            <CommandList className="max-h-[min(60vh,440px)]">
              <CommandEmpty className="py-8 text-sm text-muted-foreground">
                {debouncedQ.length < 1
                  ? "Escreve para pesquisar contactos."
                  : contactsQuery.isFetching
                    ? "A pesquisar…"
                    : "Sem resultados."}
              </CommandEmpty>

              {navMatches.length > 0 ? (
                <CommandGroup heading="Páginas">
                  {navMatches.map((item) => (
                    <CommandItem key={item.path} value={`nav-${item.path}`} onSelect={() => go(item.path)}>
                      <CornerDownLeft className="h-4 w-4 opacity-60" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      <CommandShortcut className="font-mono text-[10px]">{item.path}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {(contactsQuery.data?.contacts?.length ?? 0) > 0 ? (
                <CommandGroup heading="Contactos">
                  {contactsQuery.data!.contacts.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`contact-${c.id}`}
                      onSelect={() => goContact(c)}
                    >
                      <UserCircle className="h-4 w-4 opacity-60" aria-hidden />
                      <span className="truncate">{c.name || c.phone || `#${c.id}`}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[40%]">{c.phone}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
