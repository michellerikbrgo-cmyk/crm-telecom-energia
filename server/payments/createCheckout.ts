import Stripe from "stripe";

export type PaymentSecrets = {
  stripeSecretKey?: string | null;
  sumupApiKey?: string | null;
  paypalClientId?: string | null;
  paypalClientSecret?: string | null;
  paypalSandbox: boolean;
};

export async function createPaymentCheckoutUrl(
  provider: "stripe" | "sumup" | "paypal",
  opts: {
    amountEUR: number;
    description: string;
    appBaseUrl: string;
    secrets: PaymentSecrets;
  },
): Promise<string> {
  const { amountEUR, description, appBaseUrl, secrets } = opts;
  const safeAmount = Math.min(50000, Math.max(0.5, amountEUR));
  const label = description.trim() || "Pagamento CRM (teste)";

  if (provider === "stripe") {
    const sk = secrets.stripeSecretKey?.trim();
    if (!sk) throw new Error("Stripe: configure a chave secreta (sk_…) nas integrações.");
    const stripe = new Stripe(sk);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appBaseUrl}/super-admin?payment=ok&gw=stripe`,
      cancel_url: `${appBaseUrl}/super-admin?payment=cancel&gw=stripe`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: label },
            unit_amount: Math.round(safeAmount * 100),
          },
          quantity: 1,
        },
      ],
    });
    const url = session.url;
    if (!url) throw new Error("Stripe não devolveu URL de checkout.");
    return url;
  }

  if (provider === "sumup") {
    const key = secrets.sumupApiKey?.trim();
    if (!key) throw new Error("SumUp: configure a API Key nas integrações.");
    const ref = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const res = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkout_reference: ref,
        amount: safeAmount,
        currency: "EUR",
        description: label,
        redirect_url: `${appBaseUrl}/super-admin?payment=ok&gw=sumup`,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : typeof data.error_message === "string"
            ? data.error_message
            : JSON.stringify(data);
      throw new Error(`SumUp: ${msg}`);
    }
    const url =
      (typeof data.hosted_checkout_url === "string" && data.hosted_checkout_url) ||
      (typeof data.next_step === "object" &&
        data.next_step &&
        typeof (data.next_step as { url?: string }).url === "string" &&
        (data.next_step as { url: string }).url) ||
      (typeof data.redirect_url === "string" && data.redirect_url);
    if (!url || typeof url !== "string") {
      throw new Error(
        "SumUp: resposta sem URL de pagamento — confirme a conta API e os scopes na consola SumUp.",
      );
    }
    return url;
  }

  const cid = secrets.paypalClientId?.trim();
  const csec = secrets.paypalClientSecret?.trim();
  if (!cid || !csec) throw new Error("PayPal: configure Client ID e Secret nas integrações.");

  const apiBase = secrets.paypalSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cid}:${csec}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || "PayPal: falha ao obter token OAuth.");
  }

  const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "EUR",
            value: safeAmount.toFixed(2),
          },
          description: label,
        },
      ],
      application_context: {
        brand_name: "CRM",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${appBaseUrl}/super-admin?payment=ok&gw=paypal`,
        cancel_url: `${appBaseUrl}/super-admin?payment=cancel&gw=paypal`,
      },
    }),
  });
  const order = (await orderRes.json()) as {
    links?: { href: string; rel: string; method?: string }[];
    message?: string;
  };
  if (!orderRes.ok) {
    throw new Error(order.message || "PayPal: erro ao criar encomenda.");
  }
  const approve = order.links?.find((l) => l.rel === "approve");
  if (!approve?.href) throw new Error("PayPal: resposta sem link de aprovação.");
  return approve.href;
}
