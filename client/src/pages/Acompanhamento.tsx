import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  SALE_CONTRACT_DOSSIER_FIELDS,
  SALE_CONTRACT_DOSSIER_HIDDEN_KEYS,
  SALE_CONTRACT_DOSSIER_SECTION_LABELS,
  dossierActivationCode,
  dossierFieldDisplayLabel,
  formatDossierRegistoDate,
  parseSaleContractDossier,
  type SaleContractDossierFieldDef,
  type SaleContractDossierSection,
} from "@shared/saleContractDossier";
import {
  DOC_STATUS_OPTIONS,
  FIXED_TECH_KEYS,
  MOBILE_TECH_KEYS,
} from "@shared/saleServices";
import { Checkbox } from "@/components/ui/checkbox";
import { OperadoraAtualSelect } from "@/components/OperadoraAtualSelect";
import { ColumnHeaderFilter, type ColumnSort } from "@/components/ColumnHeaderFilter";
import { SaleAttachmentsPanel } from "@/components/SaleAttachmentsPanel";
import { ClipboardList, FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

const STATUS_OPTIONS = [
  { value: "__all", label: "Funil activo (aguarda / aberto / activo)" },
  { value: "aguarda_instalacao", label: "Aguardando instalação" },
  { value: "em_aberto", label: "Em aberto / problema técnico" },
  { value: "activo", label: "Activo" },
  { value: "cancelado", label: "Cancelado" },
] as const;

const DOC_STATUS_LABEL = Object.fromEntries(DOC_STATUS_OPTIONS.map((o) => [o.value, o.label]));

function salePipelineStatusLabel(status: string): string {
  const m: Record<string, string> = {
    aguarda_instalacao: "Aguardando instalação",
    em_aberto: "Em aberto / problema técnico",
    activo: "Activo",
    cancelado: "Cancelado",
    e_switch: "e-switch (legado)",
    pendente: "Pendente (legado)",
    nao_fechou: "Não fechou (legado)",
  };
  return m[status] || status;
}

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
  titularTroca?: boolean;
  portabilidadeMovel?: boolean;
  portabilidadeFixa?: boolean;
  desativacaoApoiada?: boolean;
  antigoTitularNome?: string | null;
  antigoTitularNif?: string | null;
  statusDocumentacao?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  vendedorName?: string | null;
  closedAt?: Date | string | null;
  createdAt?: Date | string | null;
  saleDetailJson?: string | null;
};

function parseSaleDetailJson(raw: string | null | undefined): { operadoraAtual?: string } {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as { operadoraAtual?: string };
  } catch {
    return {};
  }
}

function formatRegistoDate(row: PipelineRow): string {
  if (row.closedAt) {
    const dt = new Date(row.closedAt as unknown as string);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("pt-PT", { dateStyle: "short" });
    }
  }
  if (row.createdAt) {
    const dt = new Date(row.createdAt as unknown as string);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("pt-PT", { dateStyle: "short" });
    }
  }
  const d = parseSaleContractDossier(row.saleContractDossier);
  return formatDossierRegistoDate(d) || "—";
}

function isDossierFieldVisible(
  key: string,
  services: {
    portabilidadeMovel: boolean;
    portabilidadeFixa: boolean;
    titularTroca: boolean;
    desativacaoApoiada: boolean;
  },
): boolean {
  if ((MOBILE_TECH_KEYS as readonly string[]).includes(key)) return services.portabilidadeMovel;
  if ((FIXED_TECH_KEYS as readonly string[]).includes(key)) return services.portabilidadeFixa;
  return true;
}

function groupFieldsBySection(): Map<SaleContractDossierSection, SaleContractDossierFieldDef[]> {
  const map = new Map<SaleContractDossierSection, SaleContractDossierFieldDef[]>();
  for (const f of SALE_CONTRACT_DOSSIER_FIELDS) {
    if (SALE_CONTRACT_DOSSIER_HIDDEN_KEYS.has(f.key)) continue;
    const arr = map.get(f.section) ?? [];
    arr.push(f);
    map.set(f.section, arr);
  }
  return map;
}

function fieldsForSection(section: SaleContractDossierSection): SaleContractDossierFieldDef[] {
  const fields = FIELDS_BY_SECTION.get(section) ?? [];
  if (section === "contrato") {
    return fields.filter((f) => f.key === "id_contrato");
  }
  return fields;
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
  const authUser = user as { id?: number; name?: string; crmRole?: string } | null;
  const authUserLabel = useMemo(() => {
    if (!authUser?.id) return "—";
    return authUser.name ? `${authUser.name} (#${authUser.id})` : `#${authUser.id}`;
  }, [authUser?.id, authUser?.name]);
  const crmRole = authUser?.crmRole ?? "vendedor";
  const canActivateService = ["vendedor", "cej", "ce", "coordenador"].includes(crmRole);

  const search = useSearch();
  const highlightContactId = useMemo(() => {
    const idStr = new URLSearchParams(search).get("contactId");
    if (!idStr) return undefined;
    const id = parseInt(idStr, 10);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }, [search]);

  const [filter, setFilter] = useState<string>("__all");
  const [colCliente, setColCliente] = useState("");
  const [colContacto, setColContacto] = useState("");
  const [colNif, setColNif] = useState("");
  const [colSaleId, setColSaleId] = useState("");
  const [colContrato, setColContrato] = useState("");
  const [sortCliente, setSortCliente] = useState<ColumnSort>(null);
  const [debitoDireto, setDebitoDireto] = useState(false);
  const [cartoesMoveis, setCartoesMoveis] = useState(0);
  const [sheetSale, setSheetSale] = useState<PipelineRow | null>(null);
  const [sheetContactName, setSheetContactName] = useState("");
  const [sheetOperadora, setSheetOperadora] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [services, setServices] = useState({
    titularTroca: false,
    portabilidadeMovel: false,
    portabilidadeFixa: false,
    desativacaoApoiada: false,
    antigoTitularNome: "",
    antigoTitularNif: "",
    statusDocumentacao: "pendente",
  });

  const queryInput = useMemo(() => {
    const out: {
      status?: "aguarda_instalacao" | "em_aberto" | "activo" | "cancelado";
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
    return Object.keys(out).length > 0 ? out : undefined;
  }, [filter, highlightContactId]);

  const utils = trpc.useUtils();
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allRows, setAllRows] = useState<PipelineRow[]>([]);

  const pipelineQuery = trpc.sales.pipeline.useQuery(
    { ...queryInput, limit: 50, cursor },
  );

  useEffect(() => {
    setCursor(undefined);
    setAllRows([]);
  }, [filter, highlightContactId]);

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

  const updateServicesMutation = trpc.sales.updateServices.useMutation({
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const updateDocMutation = trpc.sales.updateDocumentacao.useMutation({
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const pdfMutation = trpc.sales.generateContractPdfs.useMutation({
    onError: (e: { message?: string }) => toast.error(e.message || "Erro ao gerar PDFs"),
  });

  const activateMutation = trpc.sales.activateService.useMutation({
    onSuccess: async () => {
      toast.success("Serviço activado");
      await utils.sales.pipeline.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const rows = useMemo(() => {
    let list = [...allRows];
    const match = (hay: string, needle: string) =>
      !needle.trim() || hay.toLowerCase().includes(needle.trim().toLowerCase());

    list = list.filter((r) => {
      const dossier = parseSaleContractDossier(r.saleContractDossier);
      const nif = String(dossier.contribuinte ?? "").trim();
      const contrato = String(dossier.id_contrato ?? "").trim();
      const saleId = String(r.publicSaleId ?? "").trim();
      return (
        match(r.contactName || "", colCliente) &&
        match(`${r.contactPhone || ""}`, colContacto) &&
        match(nif, colNif) &&
        match(saleId, colSaleId) &&
        match(contrato, colContrato)
      );
    });

    if (sortCliente) {
      list.sort((a, b) => {
        const cmp = (a.contactName || "").localeCompare(b.contactName || "", "pt");
        return sortCliente === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [allRows, colCliente, colContacto, colNif, colSaleId, colContrato, sortCliente]);

  const nextCursor = pipelineQuery.data?.nextCursor ?? null;

  useEffect(() => {
    if (!sheetSale) return;
    setSheetContactName(sheetSale.contactName?.trim() || "");
    const detail = parseSaleDetailJson(sheetSale.saleDetailJson) as {
      operadoraAtual?: string;
      debitoDireto?: boolean;
      cartoesMoveis?: number;
    };
    setSheetOperadora(detail.operadoraAtual ?? "");
    setDebitoDireto(!!detail.debitoDireto);
    setCartoesMoveis(
      typeof detail.cartoesMoveis === "number" && detail.cartoesMoveis >= 0 && detail.cartoesMoveis <= 4
        ? detail.cartoesMoveis
        : 0,
    );
    const d = parseSaleContractDossier(sheetSale.saleContractDossier);
    const init: Record<string, string> = {};
    for (const f of SALE_CONTRACT_DOSSIER_FIELDS) {
      if (SALE_CONTRACT_DOSSIER_HIDDEN_KEYS.has(f.key)) continue;
      init[f.key] = d[f.key] ?? "";
    }
    setForm(init);
    setServices({
      titularTroca: !!sheetSale.titularTroca,
      portabilidadeMovel: !!sheetSale.portabilidadeMovel,
      portabilidadeFixa: !!sheetSale.portabilidadeFixa,
      desativacaoApoiada: !!sheetSale.desativacaoApoiada,
      antigoTitularNome: sheetSale.antigoTitularNome || "",
      antigoTitularNif: sheetSale.antigoTitularNif || "",
      statusDocumentacao: sheetSale.statusDocumentacao || "pendente",
    });
  }, [sheetSale]);

  const handleSaveDossier = async () => {
    if (!sheetSale) return;
    await updateServicesMutation.mutateAsync({
      saleId: sheetSale.id,
      titularTroca: services.titularTroca,
      portabilidadeMovel: services.portabilidadeMovel,
      portabilidadeFixa: services.portabilidadeFixa,
      desativacaoApoiada: services.desativacaoApoiada,
      antigoTitularNome: services.antigoTitularNome.trim() || null,
      antigoTitularNif: services.antigoTitularNif.trim() || null,
      debitoDireto,
      cartoesMoveis,
    });
    await updateDocMutation.mutateAsync({
      saleId: sheetSale.id,
      statusDocumentacao: services.statusDocumentacao as "pendente" | "enviado" | "assinado" | "back_office",
    });
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (!SALE_CONTRACT_DOSSIER_HIDDEN_KEYS.has(k)) patch[k] = v;
    }
    saveDossier.mutate({
      saleId: sheetSale.id,
      patch,
      contactName: sheetContactName.trim() || undefined,
      operadoraAtual: sheetOperadora || undefined,
    });
  };

  const handleDownloadPdfs = async () => {
    if (!sheetSale) return;
    const res = await pdfMutation.mutateAsync({ saleId: sheetSale.id });
    const bin = atob(res.zipBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.downloadName || "contratos.zip";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${res.filenames.length} PDF(s) no ZIP`);
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

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="flex items-center justify-end gap-2 border-b bg-muted/20 px-4 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={exportCsvMutation.isPending}
            onClick={async () => {
              try {
                const status = filter === "__all" ? "__all" : filter;
                const data = await exportCsvMutation.mutateAsync({
                  status: status as "aguarda_instalacao" | "em_aberto" | "activo" | "cancelado" | "__all",
                });
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
        {highlightContactId != null ? (
          <p className="border-b px-4 py-2 text-xs text-muted-foreground bg-muted/10">
            A filtrar vendas do contacto <span className="font-mono text-foreground">#{highlightContactId}</span>.
          </p>
        ) : null}
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
                    <th className="p-3"><ColumnHeaderFilter label="Cliente" textFilter={colCliente} onTextFilter={setColCliente} sort={sortCliente} onSort={setSortCliente} active={!!colCliente.trim() || !!sortCliente} /></th>
                    <th className="p-3"><ColumnHeaderFilter label="Contacto" textFilter={colContacto} onTextFilter={setColContacto} active={!!colContacto.trim()} /></th>
                    <th className="p-3">Data de Registo</th>
                    <th className="p-3"><ColumnHeaderFilter label="NIF" textFilter={colNif} onTextFilter={setColNif} active={!!colNif.trim()} /></th>
                    <th className="p-3"><ColumnHeaderFilter label="ID da Venda" textFilter={colSaleId} onTextFilter={setColSaleId} active={!!colSaleId.trim()} /></th>
                    <th className="p-3"><ColumnHeaderFilter label="ID de Contrato" textFilter={colContrato} onTextFilter={setColContrato} active={!!colContrato.trim()} /></th>
                    <th className="p-3"><ColumnHeaderFilter label="Estado (Instalação)" selectFilter={filter} onSelectFilter={setFilter} selectOptions={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} active={filter !== "__all"} /></th>
                    <th className="p-3">Estado do Contrato</th>
                    <th className="p-3">Data de Activação</th>
                    <th className="p-3 font-medium w-[150px]">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const inst = r.installationDate ? new Date(r.installationDate as unknown as string) : null;
                    const instValid = inst && !Number.isNaN(inst.getTime());
                    const dossier = parseSaleContractDossier(r.saleContractDossier);
                    const nif = String(dossier.contribuinte ?? "").trim();
                    const idContrato = String(dossier.id_contrato ?? "").trim() || "—";
                    const saleIdLabel = String(r.publicSaleId ?? "").trim() || "—";
                    const registoLabel = formatRegistoDate(r);
                    const docLabel =
                      DOC_STATUS_LABEL[String(r.statusDocumentacao || "pendente")] ||
                      r.statusDocumentacao ||
                      "—";
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
                        <td className="p-3 font-medium">{r.contactName || "—"}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{r.contactPhone || "—"}</td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{registoLabel}</td>
                        <td className="p-3 font-mono text-xs">{nif || "—"}</td>
                        <td className="p-3 font-mono text-xs">{saleIdLabel}</td>
                        <td className="p-3 font-mono text-xs">{idContrato}</td>
                        <td className="p-3">{salePipelineStatusLabel(r.status)}</td>
                        <td className="p-3">{docLabel}</td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {(() => {
                            const ativ = r.dataAtivacao != null ? new Date(r.dataAtivacao as unknown as string) : null;
                            const ok = ativ && !Number.isNaN(ativ.getTime());
                            return ok ? ativ!.toLocaleDateString("pt-PT", { dateStyle: "short" }) : "—";
                          })()}
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

      <Dialog open={!!sheetSale} onOpenChange={(o) => !o && setSheetSale(null)}>
        <DialogContent
          showCloseButton
          className="top-[50%] flex max-h-[min(92vh,900px)] w-[min(96vw,1040px)] max-w-[min(96vw,1040px)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1040px)]"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 pt-6 pb-4 pr-14 text-left">
            <DialogTitle>Ficha de contrato</DialogTitle>
            <DialogDescription className="text-left">
              {sheetSale?.publicSaleId ? (
                <span className="font-mono">{sheetSale.publicSaleId}</span>
              ) : (
                <>Venda #{sheetSale?.id}</>
              )}{" "}
              · {sheetSale?.contactName || "Contacto"} — campos opcionais; CVP/KMAT e fixo só aparecem com
              portabilidade activa.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="gerais" className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="shrink-0 border-b px-6 py-3">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="gerais" className="data-[state=active]:bg-muted">
                  Gerais
                </TabsTrigger>
                <TabsTrigger value="telecom" className="data-[state=active]:bg-muted">
                  Formulários
                </TabsTrigger>
                <TabsTrigger value="dados_clientes" className="data-[state=active]:bg-muted">
                  Dados de Clientes
                </TabsTrigger>
                <TabsTrigger value="anexos" className="data-[state=active]:bg-muted">
                  Documentos (Anexos)
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="gerais" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <ScrollArea className="h-[min(52vh,520px)] px-6">
                <div className="space-y-4 py-4 pr-3" id="sale-sheet-print-area">
                  {sheetSale ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-0.5 text-sm">
                          <div className="text-xs text-muted-foreground">ID venda</div>
                          <div className="font-mono">{sheetSale.publicSaleId || "—"}</div>
                        </div>
                        <div className="space-y-0.5 text-sm">
                          <div className="text-xs text-muted-foreground">Venda</div>
                          <div className="font-mono">#{sheetSale.id}</div>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Nome do cliente</Label>
                          <Input
                            className="h-9"
                            value={sheetContactName}
                            onChange={(e) => setSheetContactName(e.target.value)}
                            placeholder="Nome do cliente"
                          />
                          {sheetSale.contactPhone ? (
                            <p className="font-mono text-xs text-muted-foreground pt-0.5">{sheetSale.contactPhone}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Operadora actual</Label>
                          <OperadoraAtualSelect value={sheetOperadora} onValueChange={setSheetOperadora} />
                        </div>
                        <div className="space-y-0.5 text-sm sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Vendedor</Label>
                          <Input disabled className="h-9 bg-muted/50" value={authUserLabel} />
                        </div>
                        <div className="space-y-0.5 text-sm sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Data de registo / venda</Label>
                          <Input
                            disabled
                            className="h-9 bg-muted/50"
                            value={(() => {
                              const d = parseSaleContractDossier(sheetSale.saleContractDossier);
                              const fromDossier = formatDossierRegistoDate(d);
                              if (fromDossier) return fromDossier;
                              if (sheetSale.closedAt) {
                                const dt = new Date(sheetSale.closedAt as unknown as string);
                                if (!Number.isNaN(dt.getTime())) {
                                  return dt.toLocaleDateString("pt-PT", { dateStyle: "short" });
                                }
                              }
                              return new Date().toLocaleDateString("pt-PT", { dateStyle: "short" });
                            })()}
                          />
                        </div>
                        <div className="space-y-0.5 text-sm">
                          <div className="text-xs text-muted-foreground">Estado (instalação)</div>
                          <div>{salePipelineStatusLabel(sheetSale.status)}</div>
                        </div>
                        <div className="space-y-0.5 text-sm sm:col-span-2">
                          <div className="text-xs text-muted-foreground">Estado do contrato</div>
                          <div>
                            {DOC_STATUS_LABEL[String(sheetSale.statusDocumentacao || "pendente")] ||
                              sheetSale.statusDocumentacao ||
                              "—"}
                          </div>
                        </div>
                        <div className="space-y-0.5 text-sm">
                          <div className="text-xs text-muted-foreground">Instalação</div>
                          <div className="text-muted-foreground">
                            {sheetSale.installationDate
                              ? new Date(sheetSale.installationDate as unknown as string).toLocaleString("pt-PT", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </div>
                        </div>
                        <div className="space-y-0.5 text-sm">
                          <div className="text-xs text-muted-foreground">Activação</div>
                          <div className="text-muted-foreground">
                            {sheetSale.dataAtivacao
                              ? new Date(sheetSale.dataAtivacao as unknown as string).toLocaleString("pt-PT", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="telecom" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <ScrollArea className="h-[min(52vh,520px)] px-6">
                <div className="space-y-3 py-4 pr-3">
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold">Serviços e burocracia</h3>
                    <div className="space-y-2">
                      {(
                        [
                          ["titularTroca", "Troca de titularidade"],
                          ["portabilidadeMovel", "Portabilidade móvel"],
                          ["portabilidadeFixa", "Portabilidade fixa"],
                          ["desativacaoApoiada", "Desativação apoiada"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={services[key]}
                            onCheckedChange={(v) =>
                              setServices((s) => ({ ...s, [key]: v === true }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {(services.titularTroca || services.desativacaoApoiada) && (
                      <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Antigo titular — nome</Label>
                          <Input
                            value={services.antigoTitularNome}
                            onChange={(e) =>
                              setServices((s) => ({ ...s, antigoTitularNome: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Antigo titular — NIF</Label>
                          <Input
                            value={services.antigoTitularNif}
                            onChange={(e) =>
                              setServices((s) => ({ ...s, antigoTitularNif: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 border-t pt-2">
                      <Label className="text-xs">Estado documentação</Label>
                      <Select
                        value={services.statusDocumentacao}
                        onValueChange={(v) => setServices((s) => ({ ...s, statusDocumentacao: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="dados_clientes" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <ScrollArea className="h-[min(52vh,520px)] px-6">
                <div className="space-y-8 py-4 pr-3">
                  {SECTION_ORDER.map((section) => {
                    const fields = fieldsForSection(section).filter((f) =>
                      isDossierFieldVisible(f.key, services),
                    );
                    if (!fields?.length) return null;
                    return (
                      <div key={section} className="space-y-3">
                        <h3 className="border-b pb-1 text-sm font-semibold text-foreground">
                          {SALE_CONTRACT_DOSSIER_SECTION_LABELS[section]}
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {fields.map((f) => (
                            <div key={f.key} className="space-y-1.5">
                              <Label htmlFor={f.key} className="text-xs font-normal text-foreground">
                                {dossierFieldDisplayLabel(f)}
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
            </TabsContent>

            <TabsContent value="anexos" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <ScrollArea className="h-[min(52vh,520px)] px-6">
                {sheetSale ? (
                  <SaleAttachmentsPanel saleId={sheetSale.id} publicSaleId={sheetSale.publicSaleId} />
                ) : null}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-muted/20 p-4 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={pdfMutation.isPending}
                onClick={() => void handleDownloadPdfs()}
              >
                <FileDown className="h-3.5 w-3.5" />
                Baixar PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </Button>
            </div>
            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => setSheetSale(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveDossier()}
                disabled={saveDossier.isPending || updateServicesMutation.isPending}
              >
                {saveDossier.isPending ? "A guardar…" : "Guardar ficha"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
