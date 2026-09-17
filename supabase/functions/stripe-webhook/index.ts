import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function period(subscription: any) {
  const item = subscription.items?.data?.[0];
  return {
    start: item?.current_period_start ?? subscription.current_period_start ?? null,
    end: item?.current_period_end ?? subscription.current_period_end ?? null,
  };
}

async function saveSubscription(subscription: any, fallbackUserId: string | null = null, fallbackEmail = "") {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) return;

  const userId = subscription.metadata?.cognito_user_id
    || subscription.metadata?.user_id
    || fallbackUserId;
  if (!userId) return;

  const { start, end } = period(subscription);
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

  const { error } = await supabase
    .from("billing_customers")
    .upsert({
      user_id: userId,
      email: fallbackEmail || "",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      subscription_status: subscription.status,
      current_period_start: start ? new Date(start * 1000).toISOString() : null,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) console.error("Failed to save subscription:", error.message);
}

async function verifyStripeSignature(rawBody: string, signature: string, secret: string): Promise<any> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const parts = signature.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const v1 = parts.find(([k]) => k === "v1")?.[1];
  if (!t || !v1) throw new Error("Invalid signature format");

  const signedPayload = `${t}.${rawBody}`;
  const sigBytes = Uint8Array.from(v1.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(signedPayload));
  if (!valid) throw new Error("Signature verification failed");

  const age = Date.now() / 1000 - parseInt(t, 10);
  if (age > 300) throw new Error("Timestamp too old");

  return JSON.parse(rawBody);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") || "";
    const event = await verifyStripeSignature(rawBody, signature, webhookSecret);

    // Idempotency: claim the event atomically
    const { data: claimed, error: claimError } = await supabase
      .from("stripe_events")
      .insert({ id: event.id, event_type: event.type })
      .select("id")
      .single();

    if (claimError || !claimed) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const object = event.data.object;

    if (event.type === "checkout.session.completed" && object.subscription) {
      // Fetch the subscription to get full details
      const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeSecret) {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${object.subscription}`, {
          headers: { Authorization: `Bearer ${stripeSecret}` },
        });
        if (subRes.ok) {
          const subscription = await subRes.json();
          await saveSubscription(
            subscription,
            object.client_reference_id,
            object.customer_details?.email || "",
          );
        }
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      await saveSubscription(object);
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const subscriptionId = typeof object.subscription === "string"
        ? object.subscription
        : object.subscription?.id;
      if (subscriptionId) {
        const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeSecret) {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { Authorization: `Bearer ${stripeSecret}` },
          });
          if (subRes.ok) {
            const subscription = await subRes.json();
            await saveSubscription(subscription);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe webhook error:", error.message);
    return new Response(JSON.stringify({ error: "invalid_stripe_webhook" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
