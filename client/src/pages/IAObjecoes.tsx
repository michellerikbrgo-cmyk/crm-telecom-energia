import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Send, Sparkles, GraduationCap, RotateCcw, User, Globe2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { useSearch } from "wouter";

type Topic = "telecom" | "energia" | "ambos";

type ChatTurn = { role: "customer" | "seller"; content: string };

type MercadoScope = "vodafone" | "competitors" | "geral";

export default function IAObjecoes() {
  const search = useSearch();
  const [activeTab, setActiveTab] = useState("assistente");

  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (t === "mercado") setActiveTab("mercado");
  }, [search]);
  const [objection, setObjection] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [topic, setTopic] = useState<Topic>("ambos");
  const [roleplayMessages, setRoleplayMessages] = useState<ChatTurn[]>([]);
  const [sellerInput, setSellerInput] = useState("");
  const [simStarted, setSimStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const askAIMutation = trpc.ai.askObjection.useMutation({
    onSuccess: (data: { response: string }) => {
      setResponse(data.response);
      setIsLoading(false);
    },
    onError: () => {
      setResponse("Erro ao obter resposta. Tente novamente.");
      setIsLoading(false);
    },
  });

  const roleplayMutation = trpc.ai.roleplayTurn.useMutation({
    onError: (e: { message?: string }) => {
      toast.error(e.message || "Erro no simulador");
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [roleplayMessages]);

  const handleAsk = () => {
    if (!objection.trim()) return;
    setIsLoading(true);
    setResponse("");
    askAIMutation.mutate({ objection });
  };

  const handleStartSimulation = () => {
    roleplayMutation.mutate(
      { stage: "start", topic },
      {
        onSuccess: (data) => {
          setRoleplayMessages([{ role: "customer", content: data.customerMessage }]);
          setSimStarted(true);
          setSellerInput("");
        },
      },
    );
  };

  const handleSendSeller = () => {
    const text = sellerInput.trim();
    if (!text || roleplayMessages.length === 0) return;
    const transcript = [...roleplayMessages, { role: "seller" as const, content: text }];
    roleplayMutation.mutate(
      { stage: "continue", transcript },
      {
        onSuccess: (data) => {
          setRoleplayMessages([
            ...transcript,
            { role: "customer", content: data.customerMessage },
          ]);
          setSellerInput("");
        },
      },
    );
  };

  const handleResetSimulation = () => {
    setRoleplayMessages([]);
    setSimStarted(false);
    setSellerInput("");
  };

  const [mercadoScope, setMercadoScope] = useState<MercadoScope>("geral");
  const [mercadoExtra, setMercadoExtra] = useState("");
  const [mercadoResult, setMercadoResult] = useState("");
  const [mercadoSources, setMercadoSources] = useState<{ title: string; url: string }[]>([]);

  const marketMutation = trpc.ai.marketResearch.useMutation({
    onSuccess: (d) => {
      setMercadoResult(d.response);
      setMercadoSources(d.sources ?? []);
      toast.success("Síntese pronta");
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro na pesquisa"),
  });

  const rpLoading = roleplayMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">IA de Objeções</h1>
        <p className="text-muted-foreground">
          Assistente inteligente para ultrapassar objeções de clientes
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="assistente" className="gap-2">
            <Bot className="h-4 w-4" />
            Assistente
          </TabsTrigger>
          <TabsTrigger value="simulador" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Simulador
          </TabsTrigger>
          <TabsTrigger value="mercado" className="gap-2">
            <Globe2 className="h-4 w-4" />
            Mercado (web)
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
              <Button onClick={handleAsk} disabled={!objection.trim() || isLoading} className="gap-2">
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
              <p className="text-sm text-muted-foreground font-normal">
                A IA faz de <strong>cliente</strong>; você é o <strong>vendedor</strong>. Responda como numa chamada
                real.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!simStarted ? (
                <div className="space-y-4">
                  <div className="space-y-2 max-w-xs">
                    <span className="text-sm font-medium">Cenário</span>
                    <Select value={topic} onValueChange={(v) => setTopic(v as Topic)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telecom">Telecom (fibra, móvel, TV)</SelectItem>
                        <SelectItem value="energia">Energia (luz, gás, combustível)</SelectItem>
                        <SelectItem value="ambos">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="gap-2"
                    onClick={handleStartSimulation}
                    disabled={rpLoading}
                  >
                    <Sparkles className="h-4 w-4" />
                    {rpLoading ? "A iniciar…" : "Iniciar simulação"}
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    ref={scrollRef}
                    className="max-h-[min(420px,55vh)] overflow-y-auto rounded-lg border bg-muted/20 p-4 space-y-3"
                  >
                    {roleplayMessages.map((m, i) => (
                      <div
                        key={`rp-${i}`}
                        className={`flex ${m.role === "seller" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                            m.role === "seller"
                              ? "bg-primary text-primary-foreground"
                              : "bg-background border shadow-sm"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 opacity-90">
                            {m.role === "customer" ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Cliente (IA)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-primary-foreground/40">
                                Você
                              </Badge>
                            )}
                          </div>
                          <div className={m.role === "seller" ? "" : "prose prose-sm dark:prose-invert max-w-none"}>
                            {m.role === "customer" ? (
                              <Streamdown>{m.content}</Streamdown>
                            ) : (
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      placeholder="Escreva a sua resposta como vendedor…"
                      value={sellerInput}
                      onChange={(e) => setSellerInput(e.target.value)}
                      className="min-h-[88px] resize-none"
                      disabled={rpLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendSeller();
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="gap-2"
                        onClick={handleSendSeller}
                        disabled={!sellerInput.trim() || rpLoading}
                      >
                        {rpLoading ? (
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Enviar (Enter)
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={handleResetSimulation}>
                        <RotateCcw className="h-4 w-4" />
                        Reiniciar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Dica: Shift+Enter para nova linha.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mercado" className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe2 className="h-5 w-5 text-primary" />
                Pesquisa de mercado
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                Combina pesquisa na internet (ofertas{" "}
                <strong className="text-foreground/90 font-medium">Vodafone.pt</strong> e{" "}
                <strong className="text-foreground/90 font-medium">concorrentes</strong> em Portugal) com síntese por
                IA. O administrador deve configurar <code className="text-xs bg-muted px-1 rounded">TAVILY_API_KEY</code>{" "}
                no servidor. Os preços mudam — confirme sempre no site oficial.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <span className="text-sm font-medium">Âmbito</span>
                <Select value={mercadoScope} onValueChange={(v) => setMercadoScope(v as MercadoScope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Vodafone + concorrentes</SelectItem>
                    <SelectItem value="vodafone">Só Vodafone (site)</SelectItem>
                    <SelectItem value="competitors">Só concorrentes (MEO, NOS, etc.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Palavras-chave extra</span>
                <Textarea
                  placeholder="Ex.: pacote família, 1 Gbps, TV 4K…"
                  value={mercadoExtra}
                  onChange={(e) => setMercadoExtra(e.target.value)}
                  className="min-h-[72px] resize-none max-w-xl"
                />
              </div>
              <Button
                type="button"
                className="gap-2"
                disabled={marketMutation.isPending}
                onClick={() =>
                  marketMutation.mutate({ scope: mercadoScope, extra: mercadoExtra.trim() || undefined })
                }
              >
                {marketMutation.isPending ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {marketMutation.isPending ? "A pesquisar…" : "Pesquisar e sintetizar"}
              </Button>
            </CardContent>
          </Card>

          {mercadoResult ? (
            <Card className="border-0 shadow-sm border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="text-lg">Resumo para o pitch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Streamdown>{mercadoResult}</Streamdown>
                </div>
                {mercadoSources.length > 0 ? (
                  <div className="text-sm border-t pt-3">
                    <div className="font-medium text-foreground mb-2">Fontes</div>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {mercadoSources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
