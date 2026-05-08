import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Archive, Download, Megaphone, Paperclip, Plus, Swords, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

function campaignValidityLabel(c: { isActive: boolean; endDate: Date | string | null | undefined }) {
  if (!c.isActive) return { text: "Arquivada", variant: "secondary" as const };
  if (c.endDate) {
    const end = new Date(c.endDate as any);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
      return { text: "Expirado", variant: "destructive" as const };
    }
  }
  return { text: "Vigente", variant: "outline" as const };
}

export default function Campanhas() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  const canManageCampaigns = isSuperAdmin || ["ce", "coordenador"].includes(crmRole);
  const canManageScripts = canManageCampaigns || crmRole === "cej";

  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ title: "", description: "", product: "ambos", endDate: "" });
  const [newScript, setNewScript] = useState({ competitor: "", weakness: "", ourStrength: "", product: "ambos" });

  const campaignsQuery = trpc.campaigns.list.useQuery();
  const scriptsQuery = trpc.scripts.list.useQuery();

  const createCampaignMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada!");
      setShowCampaignDialog(false);
      setNewCampaign({ title: "", description: "", product: "ambos", endDate: "" });
      campaignsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadPdfMutation = trpc.campaigns.uploadPdf.useMutation({
    onSuccess: () => {
      toast.success("PDF carregado!");
      campaignsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const archiveCampaignMutation = trpc.campaigns.archive.useMutation({
    onSuccess: () => {
      toast.success("Campanha arquivada.");
      campaignsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeCampaignMutation = trpc.campaigns.remove.useMutation({
    onSuccess: () => {
      toast.success("Campanha removida.");
      campaignsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleUploadPdf = async (campaignId: number, file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione um ficheiro PDF");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const base64 = btoa(binary);
    uploadPdfMutation.mutate({ campaignId, filename: file.name, base64 } as any);
  };

  const createScriptMutation = trpc.scripts.create.useMutation({
    onSuccess: () => {
      toast.success("Argumentário adicionado!");
      setShowScriptDialog(false);
      setNewScript({ competitor: "", weakness: "", ourStrength: "", product: "ambos" });
      scriptsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campanhas e Argumentários</h1>
          <p className="text-muted-foreground">Promoções vigentes e scripts de comparação</p>
        </div>

        <Tabs defaultValue="campanhas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="campanhas" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="argumentarios" className="gap-2">
              <Swords className="h-4 w-4" />
              Argumentários
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campanhas" className="space-y-4">
            {canManageCampaigns && (
              <div className="flex justify-end">
                <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Nova Campanha
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Campanha</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Título *</Label>
                        <Input
                          placeholder="Ex: Promoção Fibra 500Mbps"
                          value={newCampaign.title}
                          onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Textarea
                          placeholder="Detalhes da campanha..."
                          value={newCampaign.description}
                          onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Produto</Label>
                        <Select value={newCampaign.product} onValueChange={(v) => setNewCampaign({ ...newCampaign, product: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="telecom">Telecom</SelectItem>
                            <SelectItem value="energia">Energia</SelectItem>
                            <SelectItem value="ambos">Ambos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Data de fim (opcional)</Label>
                        <Input
                          type="date"
                          value={newCampaign.endDate}
                          onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createCampaignMutation.mutate(newCampaign as any)}
                        disabled={!newCampaign.title || createCampaignMutation.isPending}
                      >
                        {createCampaignMutation.isPending ? "A criar..." : "Criar Campanha"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {!campaignsQuery.data?.length ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Megaphone className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma campanha registada</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {campaignsQuery.data.map((c: any) => {
                      const v = campaignValidityLabel(c);
                      return (
                      <div key={c.id} className="p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <h3 className="font-semibold">{c.title}</h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={v.variant}>{v.text}</Badge>
                            <Badge variant={c.product === "telecom" ? "default" : c.product === "energia" ? "secondary" : "outline"}>
                              {c.product === "ambos" ? "Telecom + Energia" : c.product}
                            </Badge>
                          </div>
                        </div>
                        {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                        {c.endDate && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Válida até: {new Date(c.endDate).toLocaleDateString("pt-PT")}
                          </p>
                        )}

                        <div className="mt-3 flex flex-col gap-2">
                          {canManageCampaigns && c.isActive && (
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                <Upload className="h-4 w-4" />
                                <span>Adicionar PDF</span>
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    handleUploadPdf(c.id, f);
                                    e.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  if (confirm("Arquivar esta campanha? Continua visível como arquivada.")) {
                                    archiveCampaignMutation.mutate({ campaignId: c.id });
                                  }
                                }}
                              >
                                <Archive className="h-3.5 w-3.5" /> Arquivar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 text-destructive border-destructive/40"
                                onClick={() => {
                                  if (confirm("Eliminar definitivamente esta campanha e PDFs?")) {
                                    removeCampaignMutation.mutate({ campaignId: c.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Eliminar
                              </Button>
                            </div>
                          )}

                          <CampaignFiles campaignId={c.id} canManage={canManageCampaigns} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="argumentarios" className="space-y-4">
            {canManageScripts && (
              <div className="flex justify-end">
                <Dialog open={showScriptDialog} onOpenChange={setShowScriptDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Novo Argumentário
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Argumentário</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Concorrente *</Label>
                        <Input
                          placeholder="Ex: MEO, NOS, Vodafone..."
                          value={newScript.competitor}
                          onChange={(e) => setNewScript({ ...newScript, competitor: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ponto Fraco do Concorrente *</Label>
                        <Textarea
                          placeholder="Ex: Fidelização de 24 meses obrigatória..."
                          value={newScript.weakness}
                          onChange={(e) => setNewScript({ ...newScript, weakness: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Nosso Ponto Forte *</Label>
                        <Textarea
                          placeholder="Ex: Sem fidelização, preço fixo garantido..."
                          value={newScript.ourStrength}
                          onChange={(e) => setNewScript({ ...newScript, ourStrength: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Produto</Label>
                        <Select value={newScript.product} onValueChange={(v) => setNewScript({ ...newScript, product: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="telecom">Telecom</SelectItem>
                            <SelectItem value="energia">Energia</SelectItem>
                            <SelectItem value="ambos">Ambos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createScriptMutation.mutate(newScript as any)}
                        disabled={!newScript.competitor || !newScript.weakness || !newScript.ourStrength || createScriptMutation.isPending}
                      >
                        {createScriptMutation.isPending ? "A adicionar..." : "Adicionar Argumentário"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {!scriptsQuery.data?.length ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Swords className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhum argumentário disponível</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {scriptsQuery.data.map((s: any) => (
                      <div key={s.id} className="p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-destructive">{s.competitor}</h3>
                          <Badge variant="outline">{s.product}</Badge>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 mt-2">
                          <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                            <p className="text-xs font-medium text-red-600 mb-1">Ponto Fraco</p>
                            <p className="text-sm">{s.weakness}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                            <p className="text-xs font-medium text-green-600 mb-1">Nosso Ponto Forte</p>
                            <p className="text-sm">{s.ourStrength}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}

function CampaignFiles({
  campaignId,
  canManage,
}: {
  campaignId: number;
  canManage: boolean;
}) {
  const filesQuery = trpc.campaigns.files.useQuery({ campaignId } as any);
  const removePdfMutation = trpc.campaigns.removePdf.useMutation({
    onSuccess: () => {
      toast.success("PDF removido.");
      filesQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!filesQuery.data?.length) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 opacity-60" />
        Sem PDFs
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filesQuery.data.map((f: any) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
        >
          <a
            href={`/manus-storage/${f.storageKey}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 min-w-0 items-center justify-between gap-2"
          >
            <span className="truncate">{f.originalName}</span>
            <Download className="h-4 w-4 shrink-0 opacity-70" />
          </a>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive"
              aria-label="Remover PDF"
              onClick={() => {
                if (confirm("Remover este PDF?")) removePdfMutation.mutate({ fileId: f.id });
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
