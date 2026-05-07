import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingDown, Zap } from "lucide-react";
import { useState } from "react";

export default function Calculadora() {
  const [currentBill, setCurrentBill] = useState("");
  const [consumption, setConsumption] = useState("");
  const [provider, setProvider] = useState("");
  const [result, setResult] = useState<{ savings: number; newBill: number } | null>(null);

  const calculate = () => {
    const bill = parseFloat(currentBill);
    const kwh = parseFloat(consumption);
    if (isNaN(bill) || isNaN(kwh)) return;

    // Simplified calculation - in production this would use real tariff data
    const savingsPercent = 0.15; // 15% average savings
    const savings = bill * savingsPercent;
    const newBill = bill - savings;

    setResult({ savings: Math.round(savings * 100) / 100, newBill: Math.round(newBill * 100) / 100 });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Energia</h1>
          <p className="text-muted-foreground">
            Compare a fatura atual do cliente com a nossa oferta
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-chart-3" />
                Dados Atuais do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Fornecedor Atual</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
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
                  placeholder="Ex: 85.50"
                  value={currentBill}
                  onChange={(e) => setCurrentBill(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Consumo Mensal (kWh)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 350"
                  value={consumption}
                  onChange={(e) => setConsumption(e.target.value)}
                />
              </div>
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
                Resultado da Comparação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-6">
                  <div className="text-center p-6 rounded-xl bg-green-50 border border-green-200">
                    <p className="text-sm text-green-700 font-medium">Poupança Estimada</p>
                    <p className="text-4xl font-bold text-green-700 mt-2">
                      €{result.savings.toFixed(2)}/mês
                    </p>
                    <p className="text-sm text-green-600 mt-2">
                      €{(result.savings * 12).toFixed(2)} por ano
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600">Fatura Atual</p>
                      <p className="text-xl font-bold text-red-700">€{currentBill}</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-green-50 border border-green-100">
                      <p className="text-xs text-green-600">Nossa Oferta</p>
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
      </div>
    </DashboardLayout>
  );
}
