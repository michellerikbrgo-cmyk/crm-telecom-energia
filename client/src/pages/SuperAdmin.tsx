import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ScrollText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

function formatReleaseAt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function SuperAdmin() {
  const settingsQuery = trpc.admin.getSettings.useQuery();
  const releaseLogQuery = trpc.admin.getReleaseLog.useQuery();
  const updateMutation = trpc.admin.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success("Configurações guardadas");
      await settingsQuery.refetch();
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

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm(settingsQuery.data as any);
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
              Em cada <code className="text-xs">pnpm run deploy:pm2</code> regista-se automaticamente uma linha
              (versão, ref. de deploy, sumário do último commit). O ficheiro{" "}
              <code className="text-xs">release-log-bootstrap.json</code> na raiz do projecto fornece o histórico
              inicial até ao primeiro deploy no servidor.
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

