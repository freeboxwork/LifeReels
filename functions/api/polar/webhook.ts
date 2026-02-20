import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applyCreditDelta, json } from "../../lib/authAndCredits";

type Env = {
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_PRODUCT_ID?: string;
  POLAR_CREDITS_PER_PURCHASE?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function extractString(value: unknown) {
  return String(value ?? "").trim();
}

function getProductIds(data: any): string[] {
  const out = new Set<string>();
  const direct = extractString(data?.product_id);
  if (direct) out.add(direct);
  const nested = extractString(data?.product?.id);
  if (nested) out.add(nested);
  const priceNested = extractString(data?.product_price?.product_id ?? data?.product_price?.productId);
  if (priceNested) out.add(priceNested);
  const items = Array.isArray(data?.items) ? data.items : [];
  for (const item of items) {
    const a = extractString(item?.product_id);
    const b = extractString(item?.product?.id);
    const c = extractString(item?.product_price?.product_id ?? item?.product_price?.productId);
    if (a) out.add(a);
    if (b) out.add(b);
    if (c) out.add(c);
  }
  return Array.from(out);
}

function extractExternalCustomerId(data: any) {
  return (
    extractString(data?.external_customer_id) ||
    extractString(data?.customer_external_id) ||
    extractString(data?.customer?.external_id) ||
    extractString(data?.customer?.externalId)
  );
}

function extractOrderId(data: any) {
  return extractString(data?.id) || extractString(data?.order_id) || extractString(data?.orderId);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const secret = extractString(context.env.POLAR_WEBHOOK_SECRET);
  if (!secret) return json({ error: "Missing POLAR_WEBHOOK_SECRET." }, 500);

  const bodyText = await context.request.text();
  let event: any;
  try {
    event = validateEvent(bodyText, context.request.headers, secret);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return json({ error: "Invalid webhook signature." }, 403);
    }
    return json({ error: e instanceof Error ? e.message : "Webhook parse failed." }, 400);
  }

  const eventType = extractString(event?.type);
  if (eventType !== "order.paid") {
    return json({ ok: true, ignored: true, eventType });
  }

  const data = event?.data ?? {};
  const targetProductId =
    extractString(context.env.POLAR_PRODUCT_ID) || "a8ab138c-eaf9-4a40-8e5c-d75a85f32577";
  const productIds = getProductIds(data);
  if (!productIds.includes(targetProductId)) {
    return json({ ok: true, ignored: true, reason: "Product mismatch", productIds });
  }

  const userId = extractExternalCustomerId(data);
  if (!userId) {
    return json({ ok: false, error: "Missing external_customer_id in webhook payload." }, 400);
  }

  const orderId = extractOrderId(data);
  if (!orderId) {
    return json({ ok: false, error: "Missing order id in webhook payload." }, 400);
  }

  const creditsPerPurchase = Math.max(
    1,
    Number.parseInt(extractString(context.env.POLAR_CREDITS_PER_PURCHASE) || "3", 10) || 3,
  );
  const idempotencyKey = `polar:order-paid:${orderId}`;
  const result = await applyCreditDelta(context.env, userId, creditsPerPurchase, "purchase_polar_order_paid", {
    externalRef: idempotencyKey,
  });

  return json({ ok: true, userId, credits: result.balance, applied: result.applied });
};
