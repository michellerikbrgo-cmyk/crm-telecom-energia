/**
 * Exemplo ilustrativo B2B por empresa:
 * - A **empresa** paga a mensalidade base (assinatura).
 * - Na base incluem-se os cargos de **gestão**: Coordenador, Chefe de equipa (CE) e Chefe de equipa jr. (CEJ)
 *   — não são facturados como «utilizador extra» neste modelo de exemplo.
 * - Cada **vendedor** representa um lugar comercial (acesso próprio); cobra-se por vendedor além dos lugares incluídos no pacote.
 *
 * Não está ligado a facturação real — apenas referência comercial / UI.
 */

export type CompanyPricingPlanExample = {
  id: string;
  name: string;
  shortDescription: string;
  /** Mensalidade cobrada à empresa (assinatura). */
  monthlyBaseEUR: number;
  /**
   * Texto fixo para UI: o que entra no pacote sem custo por lugar de gestão.
   * (Coordenador + hierarquia CE / CEJ conforme o teu contrato comercial.)
   */
  leadershipIncludedSummary: string;
  /** Quantos lugares de **vendedor** estão incluídos na mensalidade base (antes de cobrar por vendedor extra). */
  includedSellers: number;
  /** € por cada vendedor acima dos incluídos, por mês (acesso à empresa / pacote comercial). */
  pricePerSellerEUR: number;
  features: string[];
  recommended?: boolean;
};

export const COMPANY_PRICING_PLANS_EXAMPLE: CompanyPricingPlanExample[] = [
  {
    id: "essencial",
    name: "Essencial",
    shortDescription: "Empresa em arranque com equipa de vendas reduzida.",
    monthlyBaseEUR: 49,
    leadershipIncludedSummary:
      "Assinatura da empresa inclui Coordenador, Chefes de equipa e Chefes Jr. — cargos de gestão sem custo por lugar.",
    includedSellers: 0,
    pricePerSellerEUR: 14,
    features: [
      "Cada vendedor com o seu acesso (discador, contactos da empresa)",
      "Lista negra, pendentes e campanhas",
      "Supervisão para CE / CEJ incluída na assinatura",
      "Suporte por e-mail (horário útil)",
    ],
  },
  {
    id: "profissional",
    name: "Profissional",
    shortDescription: "Operação em crescimento: mais vendedores no mesmo pacote-base.",
    monthlyBaseEUR: 99,
    leadershipIncludedSummary:
      "Coordenador + Chefes de equipa e Chefes Jr. incluídos na mensalidade — estrutura de gestão sem cobrança por lugar.",
    includedSellers: 5,
    pricePerSellerEUR: 10,
    recommended: true,
    features: [
      "Tudo do Essencial",
      "5 lugares de vendedor incluídos na base",
      "Relatórios, auditoria e importação em massa",
      "Suporte prioritário",
    ],
  },
  {
    id: "empresa",
    name: "Empresa",
    shortDescription: "Grandes equipas comerciais e coordenação central.",
    monthlyBaseEUR: 189,
    leadershipIncludedSummary:
      "Toda a hierarquia operacional (Coordenador, CE, CEJ) coberta pela assinatura empresarial.",
    includedSellers: 15,
    pricePerSellerEUR: 8,
    features: [
      "Tudo do Profissional",
      "15 vendedores incluídos na base — melhor preço por lugar extra",
      "Contacto dedicado e revisão trimestral",
      "SLA alargado (mediante contrato)",
    ],
  },
];

/** Total mensal estimado (€): mensalidade empresa + vendedores que excedem os lugares incluídos. */
export function estimateMonthlyTotalEUR(plan: CompanyPricingPlanExample, sellerCount: number): number {
  const n = Math.max(0, Math.floor(sellerCount));
  const extraSellers = Math.max(0, n - plan.includedSellers);
  return plan.monthlyBaseEUR + extraSellers * plan.pricePerSellerEUR;
}

export function formatEUR(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
