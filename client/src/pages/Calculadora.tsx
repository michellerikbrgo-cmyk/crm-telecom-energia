import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, TrendingDown, Zap, Settings } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Calculadora() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const canConfig = ["ce", "coordenador"].includes(crmRole);

  const [currentBill, setCurrentBill] = useState("");
  const [consumption, setConsumption] = useState("");
  const [provider, setProvider] = useState("");
  const [tariffType, setTariffType] = useState("simples");
  const [isVdfClient, setIsVdfClient] = useState("nao");
  const [hasGas, setHasGas] = useState("nao");
  const [result, setResult] = useState<any>(null);

  const configQuery = trpc.energy.getConfig.useQuery();
  const updateConfigMutation = trpc.energy.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração atualizada!");
      configQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [editConfig, setEditConfig] = useState<any>(null);

  const calculate = () => {
    const bill = parseFloat(currentBill);
    if (isNaN(bill)) {
      toast.error("Insira o valor da fatura atual");
      return;
    }

    const config = configQuery.data;
    if (!config) {
      toast.error("Configuração de energia não disponível");
      return;
    }

    // Base discount
    let discountPercent = parseFloat(config.baseDiscountPercent);

    // Extra discount for VDF clients
    if (isVdfClient === "sim") {
      if (hasGas === "sim") {
        discountPercent += parseFloat(config.vdfGasClientExtraPercent);
      } else {
        discountPercent += parseFloat(config.vdfClientExtraPercent);
      }
    }

    const savings = bill * (discountPercent / 100);
    const newBill = bill - savings;
    const annualSavings = savings * 12;

    setResult({
      discountPercent,
      savings: Math.round(savings * 100) / 100,
      newBill: Math.round(newBill * 100) / 100,
      annualSavings: Math.round(annualSavings * 100) / 100,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulador de Energia</h1>
          <p className="text-muted-foreground">
            Plano Vodafone Repsol - Calcule a poupança do cliente
          </p>
        </div>

        <Tabs defaultValue="simulador" className="space-y-4">
          <TabsList>
            <TabsTrigger value="simulador" className="gap-2">
              <Calculator className="h-4 w-4" />
              Simulador
            </TabsTrigger>
            {canConfig && (
              <TabsTrigger value="config" className="gap-2">
                <Settings className="h-4 w-4" />
                Configuração
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="simulador">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-chart-3" />
                    Dados do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fornecedor Atual</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="edp">EDP</SelectItem>
                        <SelectItem value="galp">Galp</SelectItem>
                        <SelectItem value="endesa">Endesa</SelectItem>
                        <SelectItem value="iberdrola">Iberdrola</SelectItem>
                        <SelectItem value="goldenergy">Gold Energy</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Mensal Atual (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 85.50"
                      value={currentBill}
                      onChange={(e) => setCurrentBill(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Consumo Mensal (kWh) - opcional</Label>
                    <Input
                      type="number"
                      placeholder="Ex: 350"
                      value={consumption}
                      onChange={(e) => setConsumption(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Tarifa</Label>
                    <Select value={tariffType} onValueChange={setTariffType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simples">Tarifa Simples</SelectItem>
                        <SelectItem value="bi_horaria">Bi-Horária</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>É cliente Vodafone?</Label>
                    <Select value={isVdfClient} onValueChange={setIsVdfClient}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao">Não</SelectItem>
                        <SelectItem value="sim">Sim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isVdfClient === "sim" && (
                    <div className="space-y-2">
                      <Label>Quer aderir a Eletricidade + Gás?</Label>
                      <Select value={hasGas} onValueChange={setHasGas}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao">Só Eletricidade</SelectItem>
                          <SelectItem value="sim">Eletricidade + Gás</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button onClick={calculate} className="w-full gap-2">
                    <Calculator className="h-4 w-4" />
                    Calcular Poupança
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    Resultado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result ? (
                    <div className="space-y-6">
                      <div className="text-center p-6 rounded-xl bg-green-50 border border-green-200">
                        <p className="text-sm text-green-700 font-medium">Desconto Aplicado: {result.discountPercent}%</p>
                        <p className="text-4xl font-bold text-green-700 mt-2">
                          €{result.savings.toFixed(2)}/mês
                        </p>
                        <p className="text-sm text-green-600 mt-2">
                          €{result.annualSavings.toFixed(2)} por ano
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 rounded-lg bg-red-50 border border-red-100">
                          <p className="text-xs text-red-600">Fatura Atual</p>
                          <p className="text-xl font-bold text-red-700">€{currentBill}</p>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-green-50 border border-green-100">
                          <p className="text-xs text-green-600">Com Repsol</p>
                          <p className="text-xl font-bold text-green-700">€{result.newBill.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Calculator className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm font-medium">Preencha os dados do cliente</p>
                      <p className="text-xs mt-1">O resultado aparecerá aqui</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {canConfig && (
            <TabsContent value="config">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Configuração de Preços e Descontos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {configQuery.data && (
                    <>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Preço kWh Simples (€)</Label>
                          <Input
                            defaultValue={configQuery.data.priceKwhSimples}
                            onChange={(e) => setEditConfig({ ...editConfig, priceKwhSimples: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Preço kWh Bi-Horária Ponta (€)</Label>
                          <Input
                            defaultValue={configQuery.data.priceKwhBiHorariaPonta}
                            onChange={(e) => setEditConfig({ ...editConfig, priceKwhBiHorariaPonta: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Preço kWh Bi-Horária Vazio (€)</Label>
                          <Input
                            defaultValue={configQuery.data.priceKwhBiHorariaVazio}
                            onChange={(e) => setEditConfig({ ...editConfig, priceKwhBiHorariaVazio: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Desconto Base (%)</Label>
                          <Input
                            defaultValue={configQuery.data.baseDiscountPercent}
                            onChange={(e) => setEditConfig({ ...editConfig, baseDiscountPercent: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Extra Cliente VDF (%)</Label>
                          <Input
                            defaultValue={configQuery.data.vdfClientExtraPercent}
                            onChange={(e) => setEditConfig({ ...editConfig, vdfClientExtraPercent: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Extra VDF + Gás (%)</Label>
                          <Input
                            defaultValue={configQuery.data.vdfGasClientExtraPercent}
                            onChange={(e) => setEditConfig({ ...editConfig, vdfGasClientExtraPercent: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Reembolso Total Fatura (%)</Label>
                          <Input
                            defaultValue={configQuery.data.reembolsoPercent}
                            onChange={(e) => setEditConfig({ ...editConfig, reembolsoPercent: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          const merged = { ...configQuery.data, ...editConfig };
                          updateConfigMutation.mutate(merged);
                        }}
                        disabled={updateConfigMutation.isPending}
                        className="w-full"
                      >
                        {updateConfigMutation.isPending ? "A guardar..." : "Guardar Configuração"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
