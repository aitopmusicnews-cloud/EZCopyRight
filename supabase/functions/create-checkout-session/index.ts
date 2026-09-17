import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const priceId = Deno.env.get("STRIPE_PRICE_ID");

function formEncode(payload: Record<string, string>) {
  return new URLSearchParams(payload).toString();
}

async function stripeRequest<T>(path: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message || `Stripe request to ${path} failed`;
    throw new Error(message);
  }
  return json as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!stripeSecret || !priceId) {
      return new Response(JSON.stringify({ error: "Stripe is not fully configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Please sign in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Please sign in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = userData.user;

    const { data: existing } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id || "";

    if (!customerId) {
      const created = await stripeRequest<{ id: string }>("/customers", {
        email: user.email || "",
        "metadata[user_id]": user.id,
      });
      customerId = created.id;

      await supabase
        .from("billing_customers")
        .upsert(
          {
            user_id: user.id,
            email: user.email || "",
            stripe_customer_id: customerId,
            subscription_status: "inactive",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    }

    const body = await req.json().catch(() => ({}));
    const origin = body?.origin || req.headers.get("origin") || "";
    if (!origin) {
      return new Response(JSON.stringify({ error: "Missing origin." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripeRequest<{ id: string; url: string }>("/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      "metadata[user_id]": user.id,
      "subscription_data[metadata][user_id]": user.id,
      allow_promotion_codes: "true",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-checkout-session error:", error);
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
