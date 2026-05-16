/**
 * @server-only
 *
 * HTTP route that receives Stripe webhook deliveries and forwards the raw
 * request body to {@link handleStripeWebhook} for verification + dispatch.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Subscription / Billing" (BillingService.handleWebhook)
 *
 * Behaviour:
 *   - Accepts `POST` only (other verbs are unhandled by the route definition).
 *   - Reads the raw request body via `request.text()` — **never** `request.json()`.
 *     Stripe's signature scheme is computed over the exact byte sequence the
 *     sender produced; any framework-level body re-serialisation (whitespace,
 *     numeric precision, key reordering) will invalidate the HMAC.
 *   - Reads the `stripe-signature` header.
 *   - Calls `handleStripeWebhook(rawBody, signature)`.
 *   - Returns:
 *       - 200 OK on success (success body intentionally empty so Stripe's
 *         retry logic only depends on the status code).
 *       - 400 Bad Request `{ error: 'invalid_signature' }` when the handler
 *         throws `WebhookSignatureError` — Stripe will mark the delivery as
 *         failed and retry per the dashboard's webhook policy.
 *       - 500 Internal Server Error `{ error: 'internal_error' }` for any
 *         other failure; the underlying error is logged via `console.error`
 *         so it shows up in Cloudflare Worker logs without leaking details
 *         to the caller.
 *
 * Requirements: 7.3
 */

import { createFileRoute } from "@tanstack/react-router";

import { handleStripeWebhook, WebhookSignatureError } from "@/lib/billing/webhooks";

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Read the raw body bytes. Stripe needs the exact byte sequence to
        // verify the signature — DO NOT call `request.json()` here.
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature") ?? "";

        try {
          await handleStripeWebhook(rawBody, signature);
          return new Response(null, { status: 200 });
        } catch (err) {
          if (err instanceof WebhookSignatureError) {
            return new Response(JSON.stringify({ error: "invalid_signature" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          console.error("[stripe webhook]", err);
          return new Response(JSON.stringify({ error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
