import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

export type SuperAdminFormPayments = {
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

type Props = {
  payment: SuperAdminFormPayments;
  onPaymentChange: (patch: Partial<SuperAdminFormPayments>) => void;
  updateMutation: ReturnType<typeof trpc.admin.updateSettings.useMutation>;
};

export function SuperAdminPaymentsPanel({ payment, onPaymentChange, updateMutation }: Props) {
  const checkoutMutation = trpc.admin.createPaymentCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro ao criar checkout"),
  });

  const webhookStripeHint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/stripe`
      : "/api/webhooks/stripe";
  const webhookPaypalHint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/paypal`
      : "/api/webhooks/paypal";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Pagamentos</CardTitle>
        <CardDescription>
          Stripe (Checkout), SumUp e PayPal. Guarde cada secção antes de testar. Configure os URLs de webhook nas
          respectivas consolas para apontarem para este servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground font-mono break-all space-y-1">
          <p>
            <span className="font-sans font-medium text-foreground">Stripe webhook:</span> {webhookStripeHint}
          </p>
          <p>
            <span className="font-sans font-medium text-foreground">PayPal webhook:</span> {webhookPaypalHint}
          </p>
        </div>

        <Accordion type="multiple" defaultValue={["stripe"]} className="w-full border rounded-lg px-3">
          <AccordionItem value="stripe">
            <AccordionTrigger className="text-base font-medium">Stripe</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <div className="font-medium">Activar Stripe</div>
                  <div className="text-sm text-muted-foreground">Checkout hospedado por Stripe</div>
                </div>
                <Switch
                  checked={payment.stripeEnabled}
                  onCheckedChange={(v) => onPaymentChange({ stripeEnabled: !!v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Chave pública (pk_…)</Label>
                <Input
                  placeholder="pk_live_… ou pk_test_…"
                  autoComplete="off"
                  value={payment.stripePublishableKey}
                  onChange={(e) => onPaymentChange({ stripePublishableKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Chave secreta (sk_…)</Label>
                <Input
                  placeholder="Deixa vazio para manter"
                  autoComplete="off"
                  value={payment.stripeSecretKey}
                  onChange={(e) => onPaymentChange({ stripeSecretKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Webhook signing secret (whsec_…)</Label>
                <Input
                  placeholder="Deixa vazio para manter"
                  autoComplete="off"
                  value={payment.stripeWebhookSecret}
                  onChange={(e) => onPaymentChange({ stripeWebhookSecret: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      stripeEnabled: payment.stripeEnabled,
                      stripePublishableKey: payment.stripePublishableKey,
                      stripeSecretKey: payment.stripeSecretKey,
                      stripeWebhookSecret: payment.stripeWebhookSecret,
                    })
                  }
                >
                  Guardar Stripe
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={!payment.stripeEnabled || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate({ provider: "stripe", amountEUR: 1 })}
                >
                  Testar 1 € <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sumup">
            <AccordionTrigger className="text-base font-medium">SumUp</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <div className="font-medium">Activar SumUp</div>
                  <div className="text-sm text-muted-foreground">API Key da consola SumUp</div>
                </div>
                <Switch
                  checked={payment.sumupEnabled}
                  onCheckedChange={(v) => onPaymentChange({ sumupEnabled: !!v })}
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  placeholder="Deixa vazio para manter"
                  autoComplete="off"
                  value={payment.sumupApiKey}
                  onChange={(e) => onPaymentChange({ sumupApiKey: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      sumupEnabled: payment.sumupEnabled,
                      sumupApiKey: payment.sumupApiKey,
                    })
                  }
                >
                  Guardar SumUp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={!payment.sumupEnabled || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate({ provider: "sumup", amountEUR: 1 })}
                >
                  Testar 1 € <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="paypal">
            <AccordionTrigger className="text-base font-medium">PayPal</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <div className="font-medium">Activar PayPal</div>
                  <div className="text-sm text-muted-foreground">REST API (OAuth + Orders)</div>
                </div>
                <Switch
                  checked={payment.paypalEnabled}
                  onCheckedChange={(v) => onPaymentChange({ paypalEnabled: !!v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select
                  value={payment.paypalMode}
                  onValueChange={(v) => onPaymentChange({ paypalMode: v as "sandbox" | "live" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="live">Live (produção)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Client ID</Label>
                  <Input
                    autoComplete="off"
                    value={payment.paypalClientId}
                    onChange={(e) => onPaymentChange({ paypalClientId: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Secret</Label>
                  <Input
                    placeholder="Deixa vazio para manter"
                    autoComplete="off"
                    value={payment.paypalClientSecret}
                    onChange={(e) => onPaymentChange({ paypalClientSecret: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      paypalEnabled: payment.paypalEnabled,
                      paypalClientId: payment.paypalClientId,
                      paypalClientSecret: payment.paypalClientSecret,
                      paypalMode: payment.paypalMode,
                    })
                  }
                >
                  Guardar PayPal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1"
                  disabled={!payment.paypalEnabled || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate({ provider: "paypal", amountEUR: 1 })}
                >
                  Testar 1 € <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Defina <code className="text-[11px]">APP_PUBLIC_URL</code> no servidor para URLs de retorno correctos em
          produção (ex.: <code className="text-[11px]">https://crm.exemplo.pt</code>).
        </p>
      </CardContent>
    </Card>
  );
}
