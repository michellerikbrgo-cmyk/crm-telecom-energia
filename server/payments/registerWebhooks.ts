import type { Express, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { decryptText } from "../_core/cryptoSecrets";

/**
 * Registar rotas de webhook **antes** de `express.json()` global para o Stripe receber body raw.
 */
export function registerPaymentWebhooks(app: Express): void {
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (typeof sig !== "string") {
        res.status(400).send("Missing stripe-signature");
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).send("Database unavailable");
        return;
      }

      const rows = await db.select({ enc: appSettings.stripeWebhookSecretEnc }).from(appSettings).limit(1);
      const whSecret = decryptText(rows[0]?.enc)?.trim();
      if (!whSecret) {
        console.warn("[stripe webhook] Stripe webhook secret not configured");
        res.status(400).send("Webhook secret not configured");
        return;
      }

      let event: Stripe.Event;
      try {
        event = Stripe.webhooks.constructEvent(req.body as Buffer, sig, whSecret);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[stripe webhook] Signature verification failed:", msg);
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      console.log("[stripe webhook]", event.type, event.id);
      res.json({ received: true });
    },
  );

  app.post("/api/webhooks/paypal", express.json(), async (req: Request, res: Response) => {
    const body = req.body as { event_type?: string; resource?: { id?: string } };
    console.log("[paypal webhook]", body?.event_type, body?.resource?.id);
    res.status(200).send("OK");
  });
}
