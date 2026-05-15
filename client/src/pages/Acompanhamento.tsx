import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import {
  SALE_CONTRACT_DOSSIER_FIELDS,
  SALE_CONTRACT_DOSSIER_SECTION_LABELS,
  dossierFilledCount,
  parseSaleContractDossier,
  type SaleContractDossierFieldDef,
  type SaleContractDossierSection,
} from "@shared/saleContractDossier";
import { ClipboardList, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

const STATUS_OPTIONS = [
  { value: "__all", label: "Todas (excepto canceladas)" },
  { value: "aguarda_instalacao", label: "Aguarda instalação" },
  { value: "em_aberto", label: "Em aberto / problema técnico" },
  { value: "activo", label: "Activo" },
  { value: "e_switch", label: "e-switch (energia)" },
  { value: "pendente", label: "Pendente" },
  { value: "nao_fechou", label: "Não fechou" },
  { value: "cancelado", label: "Cancelado" },
] as const;

type PipelineRow = {
  id: number;
  contactId: number;
  vendedorId: number;
  product: string;
  status: string;
  installationDate: Date | string | null;
  dataAtivacao?: Date | string | null;
  publicSaleId?: string | null;
  saleContractDossier?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  vendedorName?: string | null;
};

function groupFieldsBySection(): Map<SaleContractDossierSection, SaleContractDossierFieldDef[]> {
  const map = new Map<SaleContractDossierSection, SaleContractDossierFieldDef[]>();
  for (const f of SALE_CONTRACT_DOSSIER_FIELDS) {
    const arr = map.get(f.section) ?? [];
    arr.push(f);
    map.set(f.section, arr);
  }
  return map;
}

const FIELDS_BY_SECTION = groupFieldsBySection();
const SECTION_ORDER: SaleContractDossierSection[] = [
  "cliente",
  "morada",
  "pacote",
  "linhas_moveis",
  "linha_fixa",
  "contrato",
  "pagamento",
  "registo",
];

export default function Acompanhamento() {
  const { user } = useAuth();
  const crmRole = (user as { crmRole?: string } | null)?.crmRole ?? "vendedor";
  const canActivateService = ["vendedor", "cej", "ce", "coordenador"].includes(crmRole);

  const search = useSearch();
  const highlightContactId = useMemo(() => {
    const idStr = new URLSearchParams(search).get("contactId");
    if (!idStr) return undefined;
    const id = parseInt(idStr, 10);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }, [search]);

  const [filter, setFilter] = useState<string>("__all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [activatedFrom, setActivatedFrom] = useState("");
  const [activatedTo, setActivatedTo] = useState("");
  const [sheetSale, setSheetSale] = useState<PipelineRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const queryInput = useMemo(() => {
    const out: {
      status?:
        | "aguarda_instalacao"
        | "em_aberto"
        | "activo"
        | "e_switch"
        | "cancelado"
        | "pendente"
        | "nao_fechou";
      contactId?: number;
      createdFrom?: string;
      createdTo?: string;
      activatedFrom?: string;
      activatedTo?: string;
    } = {};
    if (filter !== "__all") {
      out.status = filter as (typeof out)["status"];
    }
    if (highlightContactId != null) {
      out.contactId = highlightContactId;
    }
    if (createdFrom.trim()) out.createdFrom = createdFrom.trim();
    if (createdTo.trim()) out.createdTo = createdTo.trim();
    if (activatedFrom.trim()) out.activatedFrom = activatedFrom.trim();
    if (activatedTo.trim()) out.activatedTo = activatedTo.trim();
    return Object.keys(out).length > 0 ? out : undefined;
  }, [filter, highlightContactId, createdFrom, createdTo, activatedFrom, activatedTo]);

  const utils = trpc.useUtils();
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allRows, setAllRows] = useState<PipelineRow[]>([]);

  const pipelineQuery = trpc.sales.pipeline.useQuery(
    { ...queryInput, limit: 50, cursor },
  );

  useEffect(() => {
    setCursor(undefined);
    setAllRows([]);
  }, [filter, highlightContactId, createdFrom, createdTo, activatedFrom, activatedTo]);

  useEffect(() => {
    const page = pipelineQuery.data;
    if (!page) return;
    if (cursor == null) {
      setAllRows(page.items as PipelineRow[]);
    } else {
      setAllRows((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const row of page.items as PipelineRow[]) {
          if (!ids.has(row.id)) merged.push(row);
        }
        return merged;
      });
    }
  }, [pipelineQuery.data, cursor]);
  const exportCsvMutation = trpc.sales.exportContractDossierCsv.useMutation({
    onError: (e: any) => toast.error(e?.message || "Erro ao exportar"),
  });

  const saveDossier = trpc.sales.saveContractDossier.useMutation({
    onSuccess: async () => {
      toast.success("Ficha de contrato guardada");
      setSheetSale(null);
      await utils.sales.pipeline.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro ao guardar"),
  });

  const activateMutation = trpc.sales.activateService.useMutation({
    onSuccess: async () => {
      toast.success("Serviço activado");
      await utils.sales.pipeline.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const rows = allRows;
  const nextCursor = pipelineQuery.data?.nextCursor ?? null;

  useEffect(() => {
    if (!sheetSale) return;
    const d = parseSaleContractDossier(sheetSale.saleContractDossier);
    const init: Record<string, string> = {};
    for (const f of SALE_CONTRACT_DOSSIER_FIELDS) {
      init[f.key] = d[f.key] ?? "";
    }
    setForm(init);
  }, [sheetSale]);

  const handleSaveDossier = () => {
    if (!sheetSale) return;
    saveDossier.mutate({ saleId: sheetSale.id, patch: form });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-primary" />
          Acompanhamento de vendas
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-relaxed">
          Visão por perfil: o <strong className="text-foreground/90 font-medium">vendedor</strong> vê só as suas
          vendas; o <strong className="text-foreground/90 font-medium">chefe de equipa júnior</strong> vê as suas e as
          dos vendedores da mesma equipa; o <strong className="text-foreground/90 font-medium">chefe de equipa</strong>{" "}
          idem; o <strong className="text-foreground/90 font-medium">coordenador</strong> vê todas as vendas da
          empresa.
          Equipas diferentes <strong className="text-foreground/90 font-medium">não partilham</strong> dados entre si,
          mesmo no mesmo coordenador.
        </p>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">
          Use a <strong className="text-foreground/90 font-medium">ficha de contrato</strong> para guardar o máximo de
          dados possível para exportação / contrato —{" "}
          <strong className="text-foreground/90 font-medium">nenhum campo é obrigatório</strong>.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-medium">Filtrar por estado</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={exportCsvMutation.isPending}
              onClick={async () => {
                try {
                  const status = filter === "__all" ? "__all" : filter;
                  const data = await exportCsvMutation.mutateAsync({ status: status as any });
                  if (!data?.csv) throw new Error("Exportação vazia");
                  const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = data.filename || "acompanhamento.csv";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success("CSV exportado");
                } catch (e: any) {
                  toast.error(e?.message || "Erro ao exportar");
                }
              }}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-4 border-t">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Criação desde</Label>
            <Input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Criação até</Label>
            <Input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Activação desde</Label>
            <Input type="date" value={activatedFrom} onChange={(e) => setActivatedFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Activação até</Label>
            <Input type="date" value={activatedTo} onChange={(e) => setActivatedTo(e.target.value)} />
          </div>
        </div>
        {highlightContactId != null ? (
          <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
            A filtrar vendas do contacto <span className="font-mono text-foreground">#{highlightContactId}</span>.
          </p>
        ) : null}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {pipelineQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sem vendas neste filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="p-3 font-medium">SALE_ID</th>
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Vendedor</th>
                    <th className="p-3 font-medium">Contacto</th>
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium">Instalação</th>
                    <th className="p-3 font-medium">Activação</th>
                    <th className="p-3 font-medium">Ficha</th>
                    <th className="p-3 font-medium w-[140px]">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const parsed = parseSaleContractDossier(r.saleContractDossier);
                    const filled = dossierFilledCount(parsed);
                    const total = SALE_CONTRACT_DOSSIER_FIELDS.length;
                    const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/30",
                          highlightContactId != null &&
                            r.contactId === highlightContactId &&
                            "bg-primary/10 ring-1 ring-inset ring-primary/20",
                        )}
                      >
                        <td className="p-3 font-mono text-xs">{r.publicSaleId || "—"}</td>
                        <td className="p-3 font-mono">{r.id}</td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{r.vendedorName || "—"}</div>
                          <div className="text-xs text-muted-foreground">#{r.vendedorId}</div>
                        </td>
                        <td className="p-3">
                          <div>{r.contactName || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.contactPhone || ""}</div>
                        </td>
                        <td className="p-3 capitalize">{r.product}</td>
                        <td className="p-3">{r.status}</td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {r.installationDate
                            ? new Date(r.installationDate as unknown as string).toLocaleString("pt-PT", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {r.dataAtivacao
                            ? new Date(r.dataAtivacao as unknown as string).toLocaleString("pt-PT", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1 min-w-[100px]">
                            <Badge variant={filled === 0 ? "secondary" : "default"} className="w-fit text-xs">
                              {filled}/{total}
                            </Badge>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </td>
                        <td className="p-3 space-y-2">
                          {canActivateService && r.status !== "activo" && r.status !== "cancelado" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="w-full"
                              disabled={activateMutation.isPending}
                              onClick={() => activateMutation.mutate({ saleId: r.id })}
                            >
                              Activar serviço
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 w-full"
                            onClick={() => setSheetSale(r)}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Ficha contrato
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor != null && rows.length > 0 && (
            <div className="p-4 border-t flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={pipelineQuery.isFetching}
                onClick={() => setCursor(nextCursor)}
              >
                {pipelineQuery.isFetching ? "A carregar…" : "Carregar mais"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!sheetSale} onOpenChange={(o) => !o && setSheetSale(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
          <SheetHeader className="p-6 pb-2 border-b shrink-0 text-left">
            <SheetTitle>Ficha de contrato</SheetTitle>
            <SheetDescription className="text-left">
              Venda #{sheetSale?.id} · {sheetSale?.contactName || "Contacto"} — todos os campos opcionais; deixe em
              branco o que ainda não tiver.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="space-y-8 py-4 pr-3">
              {SECTION_ORDER.map((section) => {
                const fields = FIELDS_BY_SECTION.get(section);
                if (!fields?.length) return null;
                return (
                  <div key={section} className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground border-b pb-1">
                      {SALE_CONTRACT_DOSSIER_SECTION_LABELS[section]}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {fields.map((f) => (
                        <div key={f.key} className="space-y-1.5">
                          <Label htmlFor={f.key} className="text-xs text-muted-foreground font-normal">
                            {f.label}
                          </Label>
                          <Input
                            id={f.key}
                            value={form[f.key] ?? ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder="—"
                            className="h-9"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <SheetFooter className="p-4 border-t gap-2 shrink-0 flex-row sm:justify-end bg-muted/20">
            <Button type="button" variant="outline" onClick={() => setSheetSale(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveDossier} disabled={saveDossier.isPending}>
              {saveDossier.isPending ? "A guardar…" : "Guardar ficha"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
