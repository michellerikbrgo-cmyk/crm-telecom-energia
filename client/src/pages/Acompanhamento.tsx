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

const STATUS_OPTIONS = [
  { value: "__all", label: "Todas (excepto canceladas)" },
  { value: "aguarda_instalacao", label: "Aguarda instalação" },
  { value: "em_aberto", label: "Em aberto / problema técnico" },
  { value: "activo", label: "Activo" },
  { value: "e_switch", label: "e-switch (energia)" },
  { value: "cancelado", label: "Cancelado" },
] as const;

type PipelineRow = {
  id: number;
  contactId: number;
  vendedorId: number;
  product: string;
  status: string;
  installationDate: Date | string | null;
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
  const [filter, setFilter] = useState<string>("__all");
  const [sheetSale, setSheetSale] = useState<PipelineRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const queryInput = useMemo(() => {
    if (filter === "__all") return undefined;
    return { status: filter as "aguarda_instalacao" | "em_aberto" | "activo" | "e_switch" | "cancelado" };
  }, [filter]);

  const utils = trpc.useUtils();
  const pipelineQuery = trpc.sales.pipeline.useQuery(queryInput);
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

  const rows = (pipelineQuery.data ?? []) as PipelineRow[];

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
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Vendedor</th>
                    <th className="p-3 font-medium">Contacto</th>
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium">Instalação</th>
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
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
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
                        <td className="p-3">
                          <div className="flex flex-col gap-1 min-w-[100px]">
                            <Badge variant={filled === 0 ? "secondary" : "default"} className="w-fit text-xs">
                              {filled}/{total}
                            </Badge>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </td>
                        <td className="p-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
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
