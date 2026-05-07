import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Plus, Swords } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Campanhas() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const canManage = ["ce", "cej", "coordenador"].includes(crmRole);

  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ title: "", description: "", product: "ambos" });
  const [newScript, setNewScript] = useState({ competitor: "", weakness: "", ourStrength: "", product: "ambos" });

  const campaignsQuery = trpc.campaigns.list.useQuery();
  const scriptsQuery = trpc.scripts.list.useQuery();

  const createCampaignMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada!");
      setShowCampaignDialog(false);
      setNewCampaign({ title: "", description: "", product: "ambos" });
      campaignsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

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
    <DashboardLayout>
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
            {canManage && (
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
                    <p className="text-sm font-medium">Nenhuma campanha ativa</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {campaignsQuery.data.map((c: any) => (
                      <div key={c.id} className="p-4 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{c.title}</h3>
                          <Badge variant={c.product === "telecom" ? "default" : c.product === "energia" ? "secondary" : "outline"}>
                            {c.product === "ambos" ? "Telecom + Energia" : c.product}
                          </Badge>
                        </div>
                        {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="argumentarios" className="space-y-4">
            {canManage && (
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
    </DashboardLayout>
  );
}
