import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, Sparkles, GraduationCap } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";

export default function IAObjecoes() {
  const [objection, setObjection] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const askAIMutation = trpc.ai.askObjection.useMutation({
    onSuccess: (data: any) => {
      setResponse(data.response);
      setIsLoading(false);
    },
    onError: () => {
      setResponse("Erro ao obter resposta. Tente novamente.");
      setIsLoading(false);
    },
  });

  const handleAsk = () => {
    if (!objection.trim()) return;
    setIsLoading(true);
    setResponse("");
    askAIMutation.mutate({ objection });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IA de Objeções</h1>
          <p className="text-muted-foreground">
            Assistente inteligente para ultrapassar objeções de clientes
          </p>
        </div>

        <Tabs defaultValue="assistente" className="space-y-4">
          <TabsList>
            <TabsTrigger value="assistente" className="gap-2">
              <Bot className="h-4 w-4" />
              Assistente
            </TabsTrigger>
            <TabsTrigger value="simulador" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              Simulador
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistente" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  O que o cliente disse?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder='Ex: "Está muito caro, já tenho contrato com a MEO e pago menos..."'
                  value={objection}
                  onChange={(e) => setObjection(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
                <Button
                  onClick={handleAsk}
                  disabled={!objection.trim() || isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isLoading ? "A pensar..." : "Obter Resposta"}
                </Button>
              </CardContent>
            </Card>

            {response && (
              <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Sugestão de Resposta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <Streamdown>{response}</Streamdown>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="simulador" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  Modo Treino (Roleplay)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Simulador de Vendas</p>
                  <p className="text-xs mt-1 text-center max-w-sm">
                    Pratique as suas técnicas de venda com a IA. Ela simulará um cliente com diferentes objeções.
                  </p>
                  <Button className="mt-4 gap-2" variant="outline">
                    <Sparkles className="h-4 w-4" />
                    Iniciar Simulação
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
