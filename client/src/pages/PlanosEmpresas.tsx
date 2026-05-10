import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_PRICING_PLANS_EXAMPLE,
  estimateMonthlyTotalEUR,
  formatEUR,
  type CompanyPricingPlanExample,
} from "@shared/pricingPlans.example";
import { PageLoadFallback } from "@/components/PageLoadFallback";
import { trpc } from "@/lib/trpc";
import { Check, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Redirect } from "wouter";

function PlanCard({
  plan,
  selectedId,
  onSelect,
}: {
  plan: CompanyPricingPlanExample;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = selectedId === plan.id;
  return (
    <Card
      className={`relative border-0 shadow-sm transition-colors cursor-pointer ${
        plan.recommended ? "ring-2 ring-primary/50 bg-primary/[0.03]" : ""
      } ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => onSelect(plan.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(plan.id);
        }
      }}
    >
      {plan.recommended ? (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 shadow-sm">Recomendado</Badge>
      ) : null}
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription className="leading-relaxed">{plan.shortDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold tracking-tight text-foreground">{formatEUR(plan.monthlyBaseEUR)}</p>
          <p className="text-sm text-muted-foreground">assinatura mensal (empresa)</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
          {plan.leadershipIncludedSummary}
        </p>
        <div className="text-sm space-y-1 rounded-lg bg-muted/50 px-3 py-2 border border-border/80">
          <p>
            <span className="font-medium text-foreground">{plan.includedSellers}</span> lugares de vendedor incluídos
            na base
          </p>
          <p className="text-muted-foreground">
            + {formatEUR(plan.pricePerSellerEUR)} / vendedor extra / mês
          </p>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2 items-start">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function PlanosEmpresas() {
  const pricingFeature = trpc.system.getPricingPlansFeature.useQuery();

  const defaultPlan = COMPANY_PRICING_PLANS_EXAMPLE.find((p) => p.recommended) ?? COMPANY_PRICING_PLANS_EXAMPLE[0];
  const [planId, setPlanId] = useState(defaultPlan?.id ?? "profissional");
  const [sellersInput, setSellersInput] = useState(String(defaultPlan?.includedSellers ?? 5));

  const plan = useMemo(
    () => COMPANY_PRICING_PLANS_EXAMPLE.find((p) => p.id === planId) ?? COMPANY_PRICING_PLANS_EXAMPLE[0],
    [planId],
  );

  if (pricingFeature.isLoading) {
    return <PageLoadFallback />;
  }
  if (!pricingFeature.data?.enabled) {
    return <Redirect to="/painel" />;
  }

  const sellerCount = (() => {
    const n = parseInt(sellersInput.replace(/\D/g, ""), 10);
    if (Number.isNaN(n) || n < 0) return 0;
    return n;
  })();

  const total = estimateMonthlyTotalEUR(plan, sellerCount);
  const extraSellers = Math.max(0, sellerCount - plan.includedSellers);
  const sellersExtraCost = extraSellers * plan.pricePerSellerEUR;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Planos para empresas (exemplo)</h1>
        <p className="text-muted-foreground max-w-3xl leading-relaxed">
          Modelo por <strong className="text-foreground font-medium">cliente / empresa</strong>: a empresa paga a{" "}
          <strong className="text-foreground font-medium">mensalidade (assinatura)</strong>, que inclui na base os cargos
          de <strong className="text-foreground font-medium">Coordenador</strong>,{" "}
          <strong className="text-foreground font-medium">Chefe de equipa</strong> e{" "}
          <strong className="text-foreground font-medium">Chefe de equipa jr.</strong> Cada{" "}
          <strong className="text-foreground font-medium">vendedor</strong> tem o seu acesso comercial; cobra-se por
          lugares de vendedor além dos incluídos no pacote. Valores ilustrativos.
        </p>
      </div>

      <div
        className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-sm text-muted-foreground"
        role="note"
      >
        <Info className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <p className="leading-relaxed">
          Este ecrã não activa pagamentos. Exemplo para negociar: assinatura empresarial + gestão (coord / CE / CEJ) no
          pacote + custo por vendedor em função do plano.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {COMPANY_PRICING_PLANS_EXAMPLE.map((p) => (
          <PlanCard key={p.id} plan={p} selectedId={planId} onSelect={setPlanId} />
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Simulador de mensalidade</CardTitle>
          <CardDescription>
            Indique quantos <strong className="font-medium text-foreground">vendedores</strong> (lugares comerciais) a
            empresa prevê. Coordenador e chefes de equipa não entram neste número — estão cobertos pela assinatura neste
            modelo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="plan-select">Plano</Label>
            <Select
              value={planId}
              onValueChange={(id) => {
                setPlanId(id);
                const p = COMPANY_PRICING_PLANS_EXAMPLE.find((x) => x.id === id);
                if (p) setSellersInput(String(p.includedSellers));
              }}
            >
              <SelectTrigger id="plan-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_PRICING_PLANS_EXAMPLE.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatEUR(p.monthlyBaseEUR)}/mês
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellers-count">Número de vendedores</Label>
            <Input
              id="sellers-count"
              inputMode="numeric"
              min={0}
              value={sellersInput}
              onChange={(e) => setSellersInput(e.target.value)}
            />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 sm:col-span-2 lg:col-span-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total estimado / mês</p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">{formatEUR(total)}</p>
            <ul className="mt-2 text-sm text-muted-foreground space-y-0.5 tabular-nums">
              <li>Assinatura (empresa): {formatEUR(plan.monthlyBaseEUR)}</li>
              <li>
                Vendedores extra ({extraSellers}): {formatEUR(sellersExtraCost)}
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
