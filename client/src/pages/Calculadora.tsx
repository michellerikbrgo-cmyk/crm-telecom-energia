import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, TrendingDown, Zap, Settings, Fuel, Flame, Save } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Calculadora() {
  const { user } = useAuth();
  const crmRole = (user as any)?.crmRole || "vendedor";
  const canConfig = crmRole === "coordenador";

  const [configKwh, setConfigKwh] = useState("");
  const updateConfigMutation = trpc.energy.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Preço do kWh atualizado!");
      configQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Mode: luz or dual
  const [mode, setMode] = useState<"luz" | "dual">("luz");

  // Client data
  const [consKwh, setConsKwh] = useState("");
  const [potencia, setPotencia] = useState("4.60");
  const [atualKwh, setAtualKwh] = useState("");
  const [atualFixo, setAtualFixo] = useState("");
  const [litrosMes, setLitrosMes] = useState("");

  // Gas data
  const [consGas, setConsGas] = useState("");
  const [escalaoGas, setEscalaoGas] = useState("2");
  const [atualGasKwh, setAtualGasKwh] = useState("");
  const [atualGasFixo, setAtualGasFixo] = useState("");

  // Discounts
  const [descRepsol, setDescRepsol] = useState(true);
  const [descParceria, setDescParceria] = useState(true);
  const [descFatura, setDescFatura] = useState(true);
  const [descDebito, setDescDebito] = useState(true);
  const [descServicos, setDescServicos] = useState(false);

  // Config values (defaults from the simulator)
  const configQuery = trpc.energy.getConfig.useQuery();
  const baseKwh = configQuery.data ? parseFloat(configQuery.data.priceKwhSimples) : 0.1850;
  const fixos: Record<string, number> = {
    "3.45": 0.2918, "4.60": 0.4491, "5.75": 0.5200, "6.90": 0.5636,
    "10.35": 0.7800, "13.80": 1.0400, "17.25": 1.3000, "20.70": 1.5600,
  };
  const gasConfig = { fixo1: 0.1746, kwh1: 0.112825, fixo2: 0.2087, kwh2: 0.108733 };

  const result = useMemo(() => {
    const cons = parseFloat(consKwh) || 0;
    const atKwh = parseFloat(atualKwh) || 0;
    const atFixo = parseFloat(atualFixo) || 0;
    const litros = parseFloat(litrosMes) || 0;

    // Calculate discount percentage
    let desconto = 0;
    if (descRepsol) desconto += 5;
    if (descParceria) desconto += 3;
    if (descFatura) desconto += 2;
    if (descDebito) desconto += 8;
    if (descServicos) desconto += 5;
    const multiplicador = 1 - (desconto / 100);

    // Electricity calculation
    const atualFixoMes = atFixo * 30;
    const atualEnergiaMes = atKwh * cons;
    const novoFixoMes = (fixos[potencia] || 0.4491) * 30;
    const novoEnergiaMes = (baseKwh * multiplicador) * cons;

    let atualTotal = atualFixoMes + atualEnergiaMes;
    let novoTotal = novoFixoMes + novoEnergiaMes;

    // Gas calculation
    let gasResult = null;
    if (mode === "dual") {
      const cGas = parseFloat(consGas) || 0;
      const atGasKwh = parseFloat(atualGasKwh) || 0;
      const atGasFixo = parseFloat(atualGasFixo) || 0;
      const esc = escalaoGas === "1" ? { fixo: gasConfig.fixo1, kwh: gasConfig.kwh1 } : { fixo: gasConfig.fixo2, kwh: gasConfig.kwh2 };

      const atualGasFixoMes = atGasFixo * 30;
      const atualGasEnergiaMes = atGasKwh * cGas;
      const novoGasFixoMes = esc.fixo * 30;
      const novoGasEnergiaMes = (esc.kwh * multiplicador) * cGas;

      atualTotal += atualGasFixoMes + atualGasEnergiaMes;
      novoTotal += novoGasFixoMes + novoGasEnergiaMes;

      gasResult = {
        atualFixo: atualGasFixoMes,
        novoFixo: novoGasFixoMes,
        atualEnergia: atualGasEnergiaMes,
        novoEnergia: novoGasEnergiaMes,
      };
    }

    // Extras
    const cashbackPercent = mode === "dual" ? 0.03 : 0.02;
    const cashback = novoTotal * cashbackPercent;
    const combustivel = litros * 0.20;
    const poupancaFatura = atualTotal - novoTotal;
    const poupancaAnual = (poupancaFatura + cashback + combustivel) * 12;

    return {
      desconto,
      atualFixoMes, novoFixoMes,
      atualEnergiaMes, novoEnergiaMes,
      atualTotal, novoTotal,
      poupancaFatura,
      cashback, cashbackPercent,
      combustivel,
      poupancaAnual,
      gasResult,
    };
  }, [consKwh, potencia, atualKwh, atualFixo, litrosMes, mode, consGas, escalaoGas, atualGasKwh, atualGasFixo, descRepsol, descParceria, descFatura, descDebito, descServicos]);

  const fmt = (v: number) => v.toFixed(2) + " €";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulador Vodafone Repsol</h1>
          <p className="text-muted-foreground">Calcule a poupança do cliente em eletricidade, gás e combustível</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT PANEL - Inputs */}
          <div className="space-y-4">
            {/* Mode Toggle */}
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={mode === "luz" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setMode("luz")}
                  >
                    <Zap className="h-4 w-4" />
                    Só Eletricidade
                  </Button>
                  <Button
                    variant={mode === "dual" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setMode("dual")}
                  >
                    <Flame className="h-4 w-4" />
                    Eletricidade + Gás
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Electricity Data */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Dados da Fatura Atual (Luz)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Consumo (kWh)</Label>
                    <Input type="number" value={consKwh} onChange={(e) => setConsKwh(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Potência</Label>
                    <Select value={potencia} onValueChange={setPotencia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3.45">3,45 kVA</SelectItem>
                        <SelectItem value="4.60">4,60 kVA</SelectItem>
                        <SelectItem value="5.75">5,75 kVA</SelectItem>
                        <SelectItem value="6.90">6,90 kVA</SelectItem>
                        <SelectItem value="10.35">10,35 kVA</SelectItem>
                        <SelectItem value="13.80">13,80 kVA</SelectItem>
                        <SelectItem value="17.25">17,25 kVA</SelectItem>
                        <SelectItem value="20.70">20,70 kVA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço Atual (€/kWh)</Label>
                    <Input type="number" step="0.0001" value={atualKwh} onChange={(e) => setAtualKwh(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fixo Atual (€/dia)</Label>
                    <Input type="number" step="0.0001" value={atualFixo} onChange={(e) => setAtualFixo(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gas Data */}
            {mode === "dual" && (
              <Card className="border-0 shadow-sm border-l-4 border-l-orange-400">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    Dados do Gás
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Consumo Gás (kWh)</Label>
                      <Input type="number" value={consGas} onChange={(e) => setConsGas(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Escalão</Label>
                      <Select value={escalaoGas} onValueChange={setEscalaoGas}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Escalão 1</SelectItem>
                          <SelectItem value="2">Escalão 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Preço Atual Gás (€/kWh)</Label>
                      <Input type="number" step="0.0001" value={atualGasKwh} onChange={(e) => setAtualGasKwh(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fixo Atual Gás (€/dia)</Label>
                      <Input type="number" step="0.0001" value={atualGasFixo} onChange={(e) => setAtualGasFixo(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fuel */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-green-600" />
                  Combustível
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <Label className="text-xs">Litros abastecidos por mês</Label>
                  <Input type="number" value={litrosMes} onChange={(e) => setLitrosMes(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Discounts */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Descontos Aplicáveis ({result.desconto}%)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={descRepsol} onCheckedChange={(c) => setDescRepsol(!!c)} />
                  <Label className="text-sm">5% Desconto Repsol</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={descParceria} onCheckedChange={(c) => setDescParceria(!!c)} />
                  <Label className="text-sm">3% Parceria Vodafone</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={descFatura} onCheckedChange={(c) => setDescFatura(!!c)} />
                  <Label className="text-sm">2% Fatura Eletrónica</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={descDebito} onCheckedChange={(c) => setDescDebito(!!c)} />
                  <Label className="text-sm">8% Débito Direto</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={descServicos} onCheckedChange={(c) => setDescServicos(!!c)} />
                  <Label className="text-sm">5% Serviços de Apoio</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Para obter o desconto máximo de combustível (20 cênt/L), o cliente precisa de: Plano Vodafone Repsol Eletricidade + Gás ativo.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT PANEL - Results */}
          <div className="space-y-4">
            {/* Total Savings Box */}
            <Card className={`border-0 shadow-sm ${result.poupancaAnual >= 0 ? "bg-gradient-to-br from-red-600 to-orange-500" : "bg-gradient-to-br from-red-900 to-gray-800"} text-white`}>
              <CardContent className="py-6 text-center">
                <p className="text-sm opacity-90">
                  {result.poupancaAnual >= 0 ? "POUPANÇA TOTAL ESTIMADA (Ano)" : "CUSTO ADICIONAL ESTIMADO (Ano)"}
                </p>
                <p className="text-4xl font-bold mt-2">{fmt(result.poupancaAnual)}</p>
                <p className="text-xs opacity-75 mt-2">Fatura da Casa + Cashback + Combustível</p>
              </CardContent>
            </Card>

            {/* Breakdown Table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Detalhe Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Detalhe</th>
                        <th className="text-right py-2">Atual</th>
                        <th className="text-right py-2">Repsol</th>
                        <th className="text-right py-2">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">⚡ Fixo (Luz)</td>
                        <td className="text-right">{fmt(result.atualFixoMes)}</td>
                        <td className="text-right">{fmt(result.novoFixoMes)}</td>
                        <td className={`text-right font-medium ${result.atualFixoMes - result.novoFixoMes >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(result.atualFixoMes - result.novoFixoMes)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">⚡ Energia (Luz)</td>
                        <td className="text-right">{fmt(result.atualEnergiaMes)}</td>
                        <td className="text-right">{fmt(result.novoEnergiaMes)}</td>
                        <td className={`text-right font-medium ${result.atualEnergiaMes - result.novoEnergiaMes >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(result.atualEnergiaMes - result.novoEnergiaMes)}
                        </td>
                      </tr>
                      {result.gasResult && (
                        <>
                          <tr className="border-b">
                            <td className="py-2">🔥 Fixo (Gás)</td>
                            <td className="text-right">{fmt(result.gasResult.atualFixo)}</td>
                            <td className="text-right">{fmt(result.gasResult.novoFixo)}</td>
                            <td className={`text-right font-medium ${result.gasResult.atualFixo - result.gasResult.novoFixo >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {fmt(result.gasResult.atualFixo - result.gasResult.novoFixo)}
                            </td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">🔥 Energia (Gás)</td>
                            <td className="text-right">{fmt(result.gasResult.atualEnergia)}</td>
                            <td className="text-right">{fmt(result.gasResult.novoEnergia)}</td>
                            <td className={`text-right font-medium ${result.gasResult.atualEnergia - result.gasResult.novoEnergia >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {fmt(result.gasResult.atualEnergia - result.gasResult.novoEnergia)}
                            </td>
                          </tr>
                        </>
                      )}
                      <tr className="font-bold bg-muted/50">
                        <td className="py-2">TOTAL FATURA</td>
                        <td className="text-right">{fmt(result.atualTotal)}</td>
                        <td className="text-right">{fmt(result.novoTotal)}</td>
                        <td className={`text-right ${result.poupancaFatura >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(result.poupancaFatura)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Config for CO */}
            {canConfig && (
              <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Configuração (Coordenador)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Preço Base Energia (€/kWh)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.0001"
                        placeholder={String(baseKwh)}
                        value={configKwh}
                        onChange={(e) => setConfigKwh(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!configKwh) return;
                          updateConfigMutation.mutate({
                            priceKwhSimples: configKwh,
                            priceKwhBiHorariaPonta: configKwh,
                            priceKwhBiHorariaVazio: configKwh,
                            baseDiscountPercent: "23",
                            vdfClientExtraPercent: "2",
                            vdfGasClientExtraPercent: "3",
                            reembolsoPercent: "3",
                          });
                        }}
                        disabled={updateConfigMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Atual: {baseKwh} €/kWh</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Extra Benefits */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Benefícios Extra</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between items-center p-2 rounded bg-green-50">
                  <span>⛽ Combustível ({litrosMes}L × 0.20€)</span>
                  <span className="font-bold text-green-600">{fmt(result.combustivel)}/mês</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-blue-50">
                  <span>🔄 Cashback My Repsol ({(result.cashbackPercent * 100).toFixed(0)}%)</span>
                  <span className="font-bold text-blue-600">{fmt(result.cashback)}/mês</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-purple-50">
                  <span>🎁 Oferta Adesão (3 meses)</span>
                  <span className="font-bold text-purple-600">{mode === "dual" ? "-10€" : "-5€"}/mês</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
