import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function period(subscription) {
  const item = subscription.items?.data?.[0];
  return {
    start: item?.current_period_start ?? subscription.current_period_start ?? null,
    end: item?.current_period_end ?? subscription.current_period_end ?? null,
  };
}

export function createStripeBilling(config) {
  const stripe = config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey, { apiVersion: '2026-06-24.dahlia' })
    : null;

  function requireStripe() {
    if (!stripe || !config.stripePriceId) throw new Error('Stripe Billing is not configured.');
    return stripe;
  }

  let resolvedPriceId = null;
  async function getPriceId() {
    if (resolvedPriceId) return resolvedPriceId;
    if (config.stripePriceId.startsWith('price_')) {
      resolvedPriceId = config.stripePriceId;
      return resolvedPriceId;
    }
    if (config.stripePriceId.startsWith('prod_')) {
      let product;
      try {
        product = await requireStripe().products.retrieve(config.stripePriceId);
      } catch (error) {
        if (error?.code !== 'resource_missing') throw error;
        const products = await requireStripe().products.list({ active: true, limit: 100 });
        product = products.data.find((candidate) => candidate.name === 'EZ Copyright Membership');
      }
      resolvedPriceId = typeof product?.default_price === 'string'
        ? product.default_price
        : product?.default_price?.id;
      if (resolvedPriceId) return resolvedPriceId;
    }
    throw new Error('The configured Stripe product does not have a default recurring price.');
  }

  async function saveSubscription(database, subscription, fallbackUserId = null, fallbackEmail = '') {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const customer = customerId ? await requireStripe().customers.retrieve(customerId) : null;
    const userId = subscription.metadata?.cognito_user_id || customer?.metadata?.cognito_user_id || fallbackUserId;
    if (!userId || !customerId) return;
    const { start, end } = period(subscription);
    await database.query(
      `INSERT INTO billing_customers (
        user_id, email, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        subscription_status, current_period_start, current_period_end, cancel_at_period_end, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        email=EXCLUDED.email, stripe_customer_id=EXCLUDED.stripe_customer_id,
        stripe_subscription_id=EXCLUDED.stripe_subscription_id, stripe_price_id=EXCLUDED.stripe_price_id,
        subscription_status=EXCLUDED.subscription_status, current_period_start=EXCLUDED.current_period_start,
        current_period_end=EXCLUDED.current_period_end, cancel_at_period_end=EXCLUDED.cancel_at_period_end,
        updated_at=NOW()`,
      [userId, customer?.email || fallbackEmail || '', customerId, subscription.id,
        subscription.items?.data?.[0]?.price?.id || null, subscription.status,
        start ? new Date(start * 1000) : null, end ? new Date(end * 1000) : null,
        Boolean(subscription.cancel_at_period_end)],
    );
  }

  return {
    configured: Boolean(stripe && config.stripePriceId),
    async createCheckout({ database, userId, email }) {
      const priceId = await getPriceId();
      const existing = await database.query('SELECT * FROM billing_customers WHERE user_id=$1', [userId]);
      const params = {
        mode: 'subscription',
        managed_payments: { enabled: false },
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: userId,
        success_url: `${config.appBaseUrl}/?billing=success`,
        cancel_url: `${config.appBaseUrl}/?billing=cancelled`,
        integration_identifier: `ezcopyright_web_${randomBytes(6).toString('base64url').slice(0, 8).toLowerCase()}`,
        subscription_data: { metadata: { cognito_user_id: userId, application: 'ez_copyright' } },
        metadata: { cognito_user_id: userId, application: 'ez_copyright' },
      };
      if (existing.rows[0]?.stripe_customer_id) params.customer = existing.rows[0].stripe_customer_id;
      else if (email) {
        params.customer_email = email;
      }
      return requireStripe().checkout.sessions.create(params, { idempotencyKey: `checkout-${userId}-${Date.now()}` });
    },
    async createPortal({ database, userId }) {
      const result = await database.query('SELECT stripe_customer_id FROM billing_customers WHERE user_id=$1', [userId]);
      if (!result.rows[0]) return null;
      return requireStripe().billingPortal.sessions.create({
        customer: result.rows[0].stripe_customer_id,
        return_url: `${config.appBaseUrl}/`,
      });
    },
    constructEvent(rawBody, signature) {
      if (!stripe || !config.stripeWebhookSecret) throw new Error('Stripe webhook is not configured.');
      return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    },
    async processEvent(database, event) {
      const claimed = await database.query(
        `INSERT INTO stripe_events (id,event_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`,
        [event.id, event.type],
      );
      if (!claimed.rows[0]) return;
      const object = event.data.object;
      if (event.type === 'checkout.session.completed' && object.subscription) {
        const subscription = await requireStripe().subscriptions.retrieve(object.subscription);
        await saveSubscription(database, subscription, object.client_reference_id, object.customer_details?.email || '');
      } else if (event.type.startsWith('customer.subscription.')) {
        await saveSubscription(database, object);
      } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
        if (subscriptionId) await saveSubscription(database, await requireStripe().subscriptions.retrieve(subscriptionId));
      }
    },
    async status(database, userId) {
      const result = await database.query('SELECT * FROM billing_customers WHERE user_id=$1', [userId]);
      const row = result.rows[0];
      const active = Boolean(row && ACTIVE_STATUSES.has(row.subscription_status));
      const periodStart = row?.current_period_start || new Date(0);
      const usage = active
        ? await database.query('SELECT COUNT(*)::int AS count FROM works WHERE user_id=$1 AND date_registered >= $2', [userId, periodStart])
        : { rows: [{ count: 0 }] };
      const used = Number(usage.rows[0].count);
      return {
        configured: Boolean(stripe && config.stripePriceId), active,
        status: row?.subscription_status || 'inactive', used,
        limit: config.monthlyRegistrationLimit, remaining: Math.max(0, config.monthlyRegistrationLimit - used),
        currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
        cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
      };
    },
  };
}
