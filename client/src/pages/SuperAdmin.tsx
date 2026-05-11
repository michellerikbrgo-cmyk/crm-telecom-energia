import { useAuth } from "@/_core/hooks/useAuth";
import { RELEASE_LOG_RETENTION_DAYS } from "@shared/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { SuperAdminPaymentsPanel } from "@/pages/super-admin/SuperAdminPaymentsPanel";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CreditCard,
  FileSpreadsheet,
  Hourglass,
  Info,
  LayoutGrid,
  MessageSquare,
  PhoneCall,
  Plug,
  Rocket,
  ScrollText,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import atualizacoesMd from "@shared/ATUALIZACOES.md?raw";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function formatReleaseAt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Lisbon",
    });
  } catch {
    return iso;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatCountdownPt(ms: number) {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}min`;
  if (h > 0) return `${h}h ${m}min ${s}s`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

/** Renderização simples do guia em Markdown (títulos ## e texto). */
function AtualizacoesDocBody({ source }: { source: string }) {
  let s = source.replace(/^\uFEFF/, "").trim();
  let pageTitle: string | undefined;
  if (s.startsWith("# ")) {
    const nl = s.indexOf("\n");
    pageTitle = nl === -1 ? s.slice(2).trim() : s.slice(2, nl).trim();
    s = nl === -1 ? "" : s.slice(nl + 1).trim();
  }
  const parts = s.split(/\n## /);
  const intro = parts[0]?.trim().replace(/^---\s*$/gm, "").trim() || "";
  const sections = parts.slice(1).map((block) => {
    const nl = block.indexOf("\n");
    const title = nl === -1 ? block.trim() : block.slice(0, nl).trim();
    const body = nl === -1 ? "" : block.slice(nl + 1).trim();
    return { title, body };
  });

  return (
    <div className="space-y-6">
      {pageTitle ? <h2 className="text-lg font-semibold tracking-tight text-foreground">{pageTitle}</h2> : null}
      {intro ? (
        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-sm">{intro}</p>
      ) : null}
      {sections.map((sec, i) => (
        <div key={i} className="space-y-2">
          <h3 className="text-base font-semibold text-foreground border-b border-border/70 pb-1.5">{sec.title}</h3>
          <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-sm">{sec.body}</div>
        </div>
      ))}
    </div>
  );
}

function ReleaseLogRetentionCountdown({ atIso }: { atIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const start = new Date(atIso).getTime();
  if (Number.isNaN(start)) return null;
  const expires = start + RELEASE_LOG_RETENTION_DAYS * MS_PER_DAY;
  const left = expires - now;
  const expiresLabel = new Date(expires).toLocaleString("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  });

  if (left <= 0) {
    return (
      <span className="text-xs text-muted-foreground tabular-nums">
        Fora dos {RELEASE_LOG_RETENTION_DAYS} dias
      </span>
    );
  }

  return (
    <span className="block text-xs text-muted-foreground tabular-nums mt-1 space-y-0.5">
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400/90 font-medium">
        <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Expira dentro de {formatCountdownPt(left)}
      </span>
      <span className="block">
        Remoção automática do histórico: <span className="text-foreground/80">{expiresLabel}</span>{" "}
        (Lisboa)
      </span>
    </span>
  );
}

type AiProvider = "openai" | "gemini" | "deepseek" | "claude";

type SuperAdminFormState = {
  aiEnabled: boolean;
  preferredAiProvider: AiProvider;
  openaiApiKey: string;
  geminiApiKey: string;
  deepseekApiKey: string;
  claudeApiKey: string;
  whatsappEnabled: boolean;
  whatsappAccessToken: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappVerifyToken: string;
  pricingPlansEnabled: boolean;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  sumupEnabled: boolean;
  sumupApiKey: string;
  paypalEnabled: boolean;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalMode: "sandbox" | "live";
};

export default function SuperAdmin() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isSuperOnly = !!(user as { isSuperAdmin?: boolean } | null)?.isSuperAdmin;
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.getSettings.useQuery();
  const releaseLogQuery = trpc.admin.getReleaseLog.useQuery();
  const betaAcceptedQuery = trpc.beta.listAccepted.useQuery(undefined, {
    enabled: isSuperOnly,
  });
  const updateMutation = trpc.admin.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success("Configurações guardadas");
      await settingsQuery.refetch();
      await utils.system.getUserBroadcastAlert.invalidate();
      await utils.system.getPricingPlansFeature.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purgeMutation = trpc.admin.purgeData.useMutation({
    onSuccess: () => toast.success("Dados apagados (Auditoria mantida)"),
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState<SuperAdminFormState>({
    aiEnabled: true,
    preferredAiProvider: "openai" as AiProvider,
    openaiApiKey: "",
    geminiApiKey: "",
    deepseekApiKey: "",
    claudeApiKey: "",
    whatsappEnabled: false,
    whatsappAccessToken: "",
    whatsappPhoneNumberId: "",
    whatsappBusinessAccountId: "",
    whatsappVerifyToken: "",
    pricingPlansEnabled: false,
    stripeEnabled: false,
    stripePublishableKey: "",
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    sumupEnabled: false,
    sumupApiKey: "",
    paypalEnabled: false,
    paypalClientId: "",
    paypalClientSecret: "",
    paypalMode: "sandbox",
  });

  const [purgeScope, setPurgeScope] = useState<"crm_only" | "all_except_audit">("crm_only");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [broadcastDraft, setBroadcastDraft] = useState("");

  useEffect(() => {
    const d = settingsQuery.data;
    if (!d) return;
    setBroadcastDraft(d.userBroadcastAlert ?? "");
    setForm({
      aiEnabled: d.aiEnabled,
      preferredAiProvider: d.preferredAiProvider as AiProvider,
      openaiApiKey: d.openaiApiKey ?? "",
      geminiApiKey: d.geminiApiKey ?? "",
      deepseekApiKey: d.deepseekApiKey ?? "",
      claudeApiKey: d.claudeApiKey ?? "",
      whatsappEnabled: d.whatsappEnabled,
      whatsappAccessToken: d.whatsappAccessToken ?? "",
      whatsappPhoneNumberId: d.whatsappPhoneNumberId ?? "",
      whatsappBusinessAccountId: d.whatsappBusinessAccountId ?? "",
      whatsappVerifyToken: d.whatsappVerifyToken ?? "",
      pricingPlansEnabled: d.pricingPlansEnabled ?? false,
      stripeEnabled: d.stripeEnabled ?? false,
      stripePublishableKey: d.stripePublishableKey ?? "",
      stripeSecretKey: d.stripeSecretKey ?? "",
      stripeWebhookSecret: d.stripeWebhookSecret ?? "",
      sumupEnabled: d.sumupEnabled ?? false,
      sumupApiKey: d.sumupApiKey ?? "",
      paypalEnabled: d.paypalEnabled ?? false,
      paypalClientId: d.paypalClientId ?? "",
      paypalClientSecret: d.paypalClientSecret ?? "",
      paypalMode: d.paypalMode === "live" ? "live" : "sandbox",
    });
  }, [settingsQuery.data]);

  const paymentSlice = useMemo(
    () => ({
      stripeEnabled: form.stripeEnabled,
      stripePublishableKey: form.stripePublishableKey,
      stripeSecretKey: form.stripeSecretKey,
      stripeWebhookSecret: form.stripeWebhookSecret,
      sumupEnabled: form.sumupEnabled,
      sumupApiKey: form.sumupApiKey,
      paypalEnabled: form.paypalEnabled,
      paypalClientId: form.paypalClientId,
      paypalClientSecret: form.paypalClientSecret,
      paypalMode: form.paypalMode as "sandbox" | "live",
    }),
    [
      form.stripeEnabled,
      form.stripePublishableKey,
      form.stripeSecretKey,
      form.stripeWebhookSecret,
      form.sumupEnabled,
      form.sumupApiKey,
      form.paypalEnabled,
      form.paypalClientId,
      form.paypalClientSecret,
      form.paypalMode,
    ],
  );

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
          <p className="text-muted-foreground">
            Configuração global, integrações e zona de perigo — organizado por separadores.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex h-auto min-h-11 w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/70 p-1.5 text-muted-foreground">
            <TabsTrigger value="overview" className="gap-1.5 px-3 py-2">
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="comms" className="gap-1.5 px-3 py-2">
              <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
              Comunicação
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-1.5 px-3 py-2">
              <Plug className="h-4 w-4 shrink-0" aria-hidden />
              Integrações
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 px-3 py-2">
              <Archive className="h-4 w-4 shrink-0" aria-hidden />
              Registos
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="gap-1.5 px-3 py-2 text-destructive data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              Perigo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-600/70 bg-amber-500/[0.07] dark:bg-amber-950/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-amber-800 dark:text-amber-400 shrink-0" aria-hidden />
              O que mudou (visão Super Admin)
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground leading-relaxed pt-1">
              Resumo das alterações recentes que afectam o teu perfil e o sistema — útil para suporte e formação.
            </p>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc space-y-2.5 pl-5 leading-relaxed">
              <li>
                <span className="font-medium text-foreground">Actualização recente — Super Admin</span> — O painel
                passou a usar <strong className="text-foreground/90 font-medium">separadores no topo</strong>:{" "}
                <strong className="text-foreground/90 font-medium">Visão geral</strong> (este resumo e atalhos),{" "}
                <strong className="text-foreground/90 font-medium">Comunicação</strong> (alerta global + activação da
                página Planos), <strong className="text-foreground/90 font-medium">Integrações</strong> (IA, WhatsApp,
                Stripe / SumUp / PayPal), <strong className="text-foreground/90 font-medium">Registos</strong> (log de
                deploy, beta, documentação) e <strong className="text-foreground/90 font-medium">Perigo</strong> (purge).
              </li>
              <li>
                <span className="font-medium text-foreground">Empresa e hierarquia</span> — No perfil da barra lateral
                aparece <strong className="text-foreground/90 font-medium">Empresa:</strong> com o nome do tenant
                (coordenador dono). A <strong className="text-foreground/90 font-medium">lista de utilizadores</strong>{" "}
                segue hierarquia (coordenador vê o tenant; CE/CEJ só níveis abaixo na mesma equipa; vendedor não acede à
                gestão nem ao menu Utilizadores).
              </li>
              <li>
                <span className="font-medium text-foreground">Planos para empresas (exemplo)</span> — Por defeito{" "}
                <strong className="text-foreground/90 font-medium">desactivado</strong>. No separador Comunicação podes
                activar o menu «Planos» e a rota <code className="text-xs">/planos</code>: modelo ilustrativo de
                mensalidade por empresa (coord., CE e CEJ incluídos na assinatura) + lugares de vendedor.
              </li>
              <li>
                <span className="font-medium text-foreground">Permissões no CRM</span> — O Super Admin utiliza o CRM
                sem restrições de papel: contactos, campanhas, discador (conforme menu), supervisão, relatórios, equipas,
                etc. Na <strong className="text-foreground/90 font-medium">Supervisão</strong>, vês estado de todos os
                utilizadores e os alertas de pendentes, mesmo que o teu utilizador não tenha{" "}
                <code className="text-xs">crmRole = coordenador</code> na base de dados.
              </li>
              <li>
                <span className="font-medium text-foreground">Tarifário energia (Calculadora)</span> — Ao guardar
                valores aqui como Super Admin, actualiza-se o <strong className="text-foreground/90 font-medium">
                  modelo global
                </strong>{" "}
                de tarifas (predefinição para coordenadores que ainda não têm cópia própria).
              </li>
              <li>
                <span className="font-medium text-foreground">Auditoria</span> — A lista de auditoria só pode ser
                consultada por Chefe de Equipa, Coordenador ou Super Admin. Os registos{" "}
                <strong className="text-foreground/90 font-medium">não podem ser editados nem apagados</strong> pela
                aplicação; o purge de dados na zona de perigo{" "}
                <strong className="text-foreground/90 font-medium">nunca remove</strong> a tabela de auditoria.
              </li>
              <li>
                <span className="font-medium text-foreground">IA</span> — Nesta página defines chaves OpenAI, Gemini,
                DeepSeek e Claude, o fornecedor preferido e fallback no servidor; também podes usar variáveis de ambiente
                (<code className="text-xs">OPENAI_API_KEY</code>, <code className="text-xs">GEMINI_API_KEY</code>,{" "}
                <code className="text-xs">DEEPSEEK_API_KEY</code>, <code className="text-xs">ANTHROPIC_API_KEY</code>
                ).
              </li>
              <li>
                <span className="font-medium text-foreground">Meta diária de ligações</span> — Na página{" "}
                <strong className="text-foreground/90 font-medium">Equipa</strong>, a meta por equipa para o cartão
                «Chamadas hoje» pode ser definida por CE, CE Jr., Coordenador ou Super Admin; vendedores não alteram esse
                valor.
              </li>
              <li>
                <span className="font-medium text-foreground">Presença / IP na Supervisão</span> — O servidor tenta
                ler o IP real atrás de proxy (<code className="text-xs">X-Forwarded-For</code>,{" "}
                <code className="text-xs">X-Real-IP</code>, Cloudflare). IPs locais mostram etiqueta de rede local; em
                produção configure o proxy e, se necessário, <code className="text-xs">TRUST_PROXY</code> no ambiente.
              </li>
              <li>
                <span className="font-medium text-foreground">Contactos → Discador</span> — Ao{" "}
                <strong className="text-foreground/90 font-medium">adicionar um contacto manualmente</strong> na página
                Contactos ou ao <strong className="text-foreground/90 font-medium">importar uma lista</strong> na Base de
                dados, a aplicação <strong className="text-foreground/90 font-medium">abre o Discador</strong> de seguida
                para começar a trabalhar a lead. Contactos adicionados manualmente ficam{" "}
                <strong className="text-foreground/90 font-medium">48 horas exclusivos</strong> para outros vendedores
                (lista, fila e detalhe); coordenadores, CE, CE Jr. e Super Admin podem supervisionar sem essa restrição.
              </li>
              <li>
                <span className="font-medium text-foreground">Pagamentos</span> — No separador{" "}
                <strong className="text-foreground/90 font-medium">Integrações</strong>, em Pagamentos, configuram-se
                Stripe (Checkout), SumUp e PayPal (credenciais encriptadas). Há botão de{" "}
                <strong className="text-foreground/90 font-medium">teste 1 €</strong> por gateway após guardar. Webhooks:{" "}
                <code className="text-xs">/api/webhooks/stripe</code> e{" "}
                <code className="text-xs">/api/webhooks/paypal</code>. Em produção use{" "}
                <code className="text-xs">APP_PUBLIC_URL</code> para URLs de retorno correctos.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-primary shrink-0" aria-hidden />
              Atalhos CRM
            </CardTitle>
            <p className="text-sm font-normal text-muted-foreground leading-relaxed pt-1">
              Contactos e importação; após guardar com sucesso és enviado para o Discador.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={() => setLocation("/contactos")}>
              <UserCircle className="h-4 w-4" aria-hidden />
              Contactos
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setLocation("/base-dados")}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Base de dados
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setLocation("/discador")}>
              <PhoneCall className="h-4 w-4" aria-hidden />
              Discador
            </Button>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-6 space-y-6 outline-none">
        <Card className="shadow-sm border border-border border-l-[4px] border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" aria-hidden />
              Log de actualização do sistema
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Em cada <code className="text-xs">pnpm run deploy:pm2</code> regista-se uma linha (versão, ref. do
              deploy, sumário). No servidor, entradas automáticas com mais de{" "}
              <strong>{RELEASE_LOG_RETENTION_DAYS} dias</strong> são removidas do ficheiro ao gravar um novo deploy. A
              lista abaixo <strong>soma</strong> esse ficheiro (<code className="text-xs">data/release-log.json</code>)
              com os blocos de <code className="text-xs">release-log-bootstrap.json</code> no projecto — assim o
              histórico curado (ex. dias anteriores) mantém-se visível mesmo depois de já existir log de deploy.
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[min(420px,55vh)] pr-4">
              {releaseLogQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar log…</p>
              ) : releaseLogQuery.isError ? (
                <p className="text-sm text-destructive">Não foi possível carregar o log.</p>
              ) : (
                <div className="space-y-6 text-sm">
                  {(releaseLogQuery.data?.entries ?? []).map((entry, idx) => (
                    <div
                      key={`${entry.at}-${idx}`}
                      className="border-b border-border/60 pb-5 last:border-0 last:pb-0"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <time className="text-xs tabular-nums text-muted-foreground">
                          {formatReleaseAt(entry.at)}
                        </time>
                        {entry.automated ? (
                          <Badge variant="secondary" className="text-[10px] font-normal uppercase">
                            Deploy automático
                          </Badge>
                        ) : null}
                        {entry.version ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            v{entry.version}
                          </Badge>
                        ) : null}
                        {entry.deployRef ? (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {entry.deployRef}
                          </span>
                        ) : null}
                      </div>
                      {entry.automated ? (
                        <ReleaseLogRetentionCountdown atIso={entry.at} />
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Bloco do histórico versionado — não é removido pelo prazo de retenção dos deploys.
                        </p>
                      )}

                      {entry.title ? (
                        <h3 className="font-semibold text-foreground mb-2">{entry.title}</h3>
                      ) : null}

                      {entry.bullets?.length ? (
                        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground leading-relaxed">
                          {entry.bullets.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : null}

                      {entry.summary ? (
                        <p className="text-muted-foreground leading-relaxed">{entry.summary}</p>
                      ) : null}
                    </div>
                  ))}
                  {(releaseLogQuery.data?.entries ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sem entradas. Faça um deploy com <code className="text-xs">pnpm run deploy:pm2</code> ou
                      confirme que <code className="text-xs">release-log-bootstrap.json</code> existe na raiz.
                    </p>
                  ) : null}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {isSuperOnly ? (
          <Card className="shadow-sm border border-border border-l-[4px] border-l-emerald-600/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Rocket className="h-5 w-5 text-emerald-600" aria-hidden />
                Próxima versão — sugestões aceites (Beta)
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Lista consolidada de ideias já <strong>aceites</strong> (coordenadores por empresa). As mesmas entradas
                aparecem filtradas por empresa na página <code className="text-xs">/beta</code>.
              </p>
            </CardHeader>
            <CardContent>
              {betaAcceptedQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : !betaAcceptedQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">Ainda não há sugestões aceites.</p>
              ) : (
                <ScrollArea className="h-[min(360px,50vh)] pr-4">
                  <ul className="space-y-4 text-sm">
                    {betaAcceptedQuery.data.map((s) => (
                      <li key={s.id} className="border-b border-border/60 pb-4 last:border-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">{s.title}</span>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {s.tenantLabel}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs leading-relaxed">{s.body}</p>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          {s.authorName ?? "—"}
                          {s.acceptedAt
                            ? ` · Aceite em ${new Date(s.acceptedAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card className="shadow-sm border border-border border-l-[4px] border-l-muted-foreground/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" aria-hidden />
              Guia de actualizações (documentação)
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Texto versionado em <code className="text-xs">shared/ATUALIZACOES.md</code>. Edite esse ficheiro no
              repositório para actualizar este painel após o próximo deploy.
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[min(480px,60vh)] pr-4">
              <AtualizacoesDocBody source={atualizacoesMd} />
            </ScrollArea>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="comms" className="mt-6 space-y-6 outline-none">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Alerta aos utilizadores</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Mensagem temporária no topo do painel para vendedores, CEJ, CE e coordenadores. O Super Admin não vê este
              aviso durante a navegação (apenas outros perfis). Cada novo texto incrementa uma revisão: quem já tiver fechado
              o anterior volta a ver o novo alerta.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="broadcast-draft">Texto do aviso</Label>
              <Textarea
                id="broadcast-draft"
                placeholder="Ex.: Manutenção hoje das 22h às 23h."
                rows={4}
                value={broadcastDraft}
                onChange={(e) => setBroadcastDraft(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Revisão actual dos alertas (interno):{" "}
                <span className="font-mono text-foreground">{settingsQuery.data?.userBroadcastAlertRevision ?? 0}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ userBroadcastAlert: broadcastDraft })}
              >
                {updateMutation.isPending ? "A publicar..." : "Publicar aviso"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ userBroadcastAlert: "" })}
              >
                Limpar aviso
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary shrink-0" aria-hidden />
              Planos para empresas
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal leading-relaxed">
              Por defeito <strong className="font-medium text-foreground">desactivado</strong>. Quando activo, aparece o
              item «Planos (exemplo)» no menu e a página <code className="text-xs">/planos</code> com o modelo de exemplo:
              assinatura por empresa (coord., CE e CEJ incluídos) + custo por lugar de vendedor (valores ilustrativos).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="font-medium">Mostrar página de planos no CRM</div>
                <div className="text-sm text-muted-foreground">
                  Menu lateral e rota visíveis para utilizadores com acesso
                </div>
              </div>
              <Switch
                checked={form.pricingPlansEnabled}
                onCheckedChange={(v) => setForm((s) => ({ ...s, pricingPlansEnabled: !!v }))}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ pricingPlansEnabled: form.pricingPlansEnabled })}
            >
              {updateMutation.isPending ? "A guardar..." : "Guardar planos"}
            </Button>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6 space-y-6 outline-none">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">IA</CardTitle>
            <p className="text-sm text-muted-foreground font-normal leading-relaxed">
              Escolhe o <strong className="font-medium text-foreground">fornecedor preferido</strong> e preenche as chaves
              necessárias. Se o preferido falhar ou não tiver chave, o servidor tenta automaticamente os outros na ordem:
              OpenAI → Gemini → DeepSeek → Claude (só os que têm chave configurada). Também podes usar variáveis de
              ambiente no servidor: <code className="text-xs">OPENAI_API_KEY</code>,{" "}
              <code className="text-xs">GEMINI_API_KEY</code>, <code className="text-xs">DEEPSEEK_API_KEY</code>,{" "}
              <code className="text-xs">ANTHROPIC_API_KEY</code>.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="font-medium">Ativar IA</div>
                <div className="text-sm text-muted-foreground">Liga/desliga as respostas de IA no CRM</div>
              </div>
              <Switch
                checked={form.aiEnabled}
                onCheckedChange={(v) => setForm((s) => ({ ...s, aiEnabled: !!v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Fornecedor preferido</Label>
              <Select
                value={form.preferredAiProvider}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, preferredAiProvider: v as AiProvider }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Gemini (Google AI Studio)</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Para fluxos com ferramentas ou resposta JSON estruturada, o sistema usa primeiro{" "}
                <strong>OpenAI</strong> ou <strong>DeepSeek</strong> (compatível com a API OpenAI).
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>OpenAI API Key</Label>
                <Input
                  placeholder="sk-… (deixa vazio para manter a atual)"
                  autoComplete="off"
                  value={form.openaiApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, openaiApiKey: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Formato típico <code className="text-[11px]">sk-…</code></p>
              </div>
              <div className="space-y-2">
                <Label>Gemini API Key</Label>
                <Input
                  placeholder="AIza… (deixa vazio para manter)"
                  autoComplete="off"
                  value={form.geminiApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, geminiApiKey: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Google AI Studio — começa por <code className="text-[11px]">AIza</code></p>
              </div>
              <div className="space-y-2">
                <Label>DeepSeek API Key</Label>
                <Input
                  placeholder="Chave da consola DeepSeek (vazio = manter)"
                  autoComplete="off"
                  value={form.deepseekApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, deepseekApiKey: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  API compatível com OpenAI (<code className="text-[11px]">deepseek-chat</code> por defeito). Opcional no
                  servidor: <code className="text-[11px]">DEEPSEEK_CHAT_MODEL</code>, <code className="text-[11px]">DEEPSEEK_BASE_URL</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Claude API Key (Anthropic)</Label>
                <Input
                  placeholder="sk-ant-api… (vazio = manter)"
                  autoComplete="off"
                  value={form.claudeApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, claudeApiKey: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Consola Anthropic — formato <code className="text-[11px]">sk-ant-api03-…</code>. Opcional:{" "}
                  <code className="text-[11px]">ANTHROPIC_MODEL</code> no servidor.
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate(form as any)}
            >
              {updateMutation.isPending ? "A guardar..." : "Guardar IA"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">WhatsApp (Cloud API)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="font-medium">Ativar WhatsApp</div>
                <div className="text-sm text-muted-foreground">Apenas configuração por agora (integração vem a seguir)</div>
              </div>
              <Switch
                checked={form.whatsappEnabled}
                onCheckedChange={(v) => setForm((s) => ({ ...s, whatsappEnabled: !!v }))}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  value={form.whatsappPhoneNumberId}
                  onChange={(e) => setForm((s) => ({ ...s, whatsappPhoneNumberId: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Business Account ID</Label>
                <Input
                  value={form.whatsappBusinessAccountId}
                  onChange={(e) => setForm((s) => ({ ...s, whatsappBusinessAccountId: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Access Token</Label>
                <Input
                  placeholder="(deixa vazio para manter)"
                  value={form.whatsappAccessToken}
                  onChange={(e) => setForm((s) => ({ ...s, whatsappAccessToken: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Verify Token (Webhook)</Label>
                <Input
                  placeholder="(deixa vazio para manter)"
                  value={form.whatsappVerifyToken}
                  onChange={(e) => setForm((s) => ({ ...s, whatsappVerifyToken: e.target.value }))}
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate(form as any)}
            >
              {updateMutation.isPending ? "A guardar..." : "Guardar WhatsApp"}
            </Button>
          </CardContent>
        </Card>

        <SuperAdminPaymentsPanel
          payment={paymentSlice}
          onPaymentChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
          updateMutation={updateMutation}
        />
          </TabsContent>

          <TabsContent value="danger" className="mt-6 space-y-6 outline-none">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Zona de Perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              O Super Admin pode apagar dados do sistema. <strong>Auditoria nunca é apagada.</strong>
            </div>

            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={purgeScope} onValueChange={(v) => setPurgeScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="crm_only">Apagar só dados do CRM (contactos, pendentes, chamadas, campanhas, etc.)</SelectItem>
                  <SelectItem value="all_except_audit">Apagar tudo exceto Auditoria (inclui utilizadores e settings)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Confirmação</Label>
              <Input
                placeholder='Escreva APAGAR para confirmar'
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
              />
            </div>

            <Button
              variant="destructive"
              className="w-full"
              disabled={purgeMutation.isPending || purgeConfirm !== "APAGAR"}
              onClick={() => purgeMutation.mutate({ scope: purgeScope, confirm: purgeConfirm } as any)}
            >
              {purgeMutation.isPending ? "A apagar..." : "Apagar dados"}
            </Button>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}

