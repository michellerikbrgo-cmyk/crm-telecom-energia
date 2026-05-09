import { RELEASE_LOG_RETENTION_DAYS } from "@shared/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, Hourglass, ScrollText } from "lucide-react";
import atualizacoesMd from "@shared/ATUALIZACOES.md?raw";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function SuperAdmin() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.getSettings.useQuery();
  const releaseLogQuery = trpc.admin.getReleaseLog.useQuery();
  const updateMutation = trpc.admin.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success("Configurações guardadas");
      await settingsQuery.refetch();
      await utils.system.getUserBroadcastAlert.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purgeMutation = trpc.admin.purgeData.useMutation({
    onSuccess: () => toast.success("Dados apagados (Auditoria mantida)"),
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    aiEnabled: true,
    preferredAiProvider: "openai",
    openaiApiKey: "",
    geminiApiKey: "",
    deepseekApiKey: "",
    claudeApiKey: "",
    whatsappEnabled: false,
    whatsappAccessToken: "",
    whatsappPhoneNumberId: "",
    whatsappBusinessAccountId: "",
    whatsappVerifyToken: "",
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
      preferredAiProvider: d.preferredAiProvider as typeof form.preferredAiProvider,
      openaiApiKey: d.openaiApiKey ?? "",
      geminiApiKey: d.geminiApiKey ?? "",
      deepseekApiKey: d.deepseekApiKey ?? "",
      claudeApiKey: d.claudeApiKey ?? "",
      whatsappEnabled: d.whatsappEnabled,
      whatsappAccessToken: d.whatsappAccessToken ?? "",
      whatsappPhoneNumberId: d.whatsappPhoneNumberId ?? "",
      whatsappBusinessAccountId: d.whatsappBusinessAccountId ?? "",
      whatsappVerifyToken: d.whatsappVerifyToken ?? "",
    });
  }, [settingsQuery.data]);

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
          <p className="text-muted-foreground">
            IA, armazenamento local, WhatsApp e zona de perigo
          </p>
        </div>

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
            <CardTitle className="text-lg">IA</CardTitle>
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
                onValueChange={(v) => setForm((s) => ({ ...s, preferredAiProvider: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>OpenAI API Key</Label>
                <Input
                  placeholder="sk-... (deixa vazio para manter)"
                  value={form.openaiApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, openaiApiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Gemini API Key</Label>
                <Input
                  placeholder="(deixa vazio para manter)"
                  value={form.geminiApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, geminiApiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>DeepSeek API Key</Label>
                <Input
                  placeholder="(deixa vazio para manter)"
                  value={form.deepseekApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, deepseekApiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Claude API Key</Label>
                <Input
                  placeholder="(deixa vazio para manter)"
                  value={form.claudeApiKey}
                  onChange={(e) => setForm((s) => ({ ...s, claudeApiKey: e.target.value }))}
                />
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
      </div>
  );
}

