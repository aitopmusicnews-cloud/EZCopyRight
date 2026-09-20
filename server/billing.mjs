import { randomBytes, randomUUID } from 'node:crypto';
import Stripe from 'stripe';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function period(subscription) {
  const item = subscription.items?.data?.[0];
  return {
    start: item?.current_period_start ?? subscription.current_period_start ?? null,
    end: item?.current_period_end ?? subscription.current_period_end ?? null,
  };
}

export function createStripeBilling(config, { accounts } = {}) {
  const stripe = config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey, { apiVersion: '2026-06-24.dahlia' })
    : null;

  function requireStripe() {
    if (!stripe || !config.stripePriceId) throw new Error('Stripe Billing is not configured.');
    return stripe;
  }

  let resolvedPriceId = 'price_1UHO2UIgHJywqbkk3hepc7hg';
  async function getPriceId() {
    return resolvedPriceId;
  }    

    async function saveSubscription(database, subscription, fallbackUserId = null, fallbackEmail = '', checkoutSession = null) {
    const stripeApi = requireStripe();
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const customer = customerId ? await stripeApi.customers.retrieve(customerId) : null;
    const email = (!customer?.deleted && customer?.email) || fallbackEmail || '';
    const fullName = checkoutSession?.customer_details?.individual_name
      || checkoutSession?.customer_details?.name
      || null;
    const businessName = checkoutSession?.customer_details?.business_name || null;
    const acceptedTerms = checkoutSession?.consent?.terms_of_service === 'accepted';
    const acceptedAt = acceptedTerms ? new Date() : null;

    let userId = subscription.metadata?.cognito_user_id
      || (!customer?.deleted && customer?.metadata?.cognito_user_id)
      || fallbackUserId;

    if (!userId && email && accounts?.ensureUserByEmail) {
      const account = await accounts.ensureUserByEmail(email);
      userId = account.userId;

      if (!customer?.deleted) {
        await stripeApi.customers.update(customerId, {
          metadata: {
            ...(customer?.metadata || {}),
            cognito_user_id: userId,
            application: 'ez_copyright',
          },
        });
      }
      await stripeApi.subscriptions.update(subscription.id, {
        metadata: {
          ...(subscription.metadata || {}),
          cognito_user_id: userId,
          application: 'ez_copyright',
        },
      });
    }

    if (!userId || !customerId) {
      throw new Error('Stripe subscription could not be linked to an EZ Copyright account.');
    }

    const { start, end } = period(subscription);
    await database.query(
      `INSERT INTO billing_customers (
        user_id, email, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        subscription_status, current_period_start, current_period_end, cancel_at_period_end,
        full_name, business_name, terms_accepted_at, policy_version, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        email=EXCLUDED.email, stripe_customer_id=EXCLUDED.stripe_customer_id,
        stripe_subscription_id=EXCLUDED.stripe_subscription_id, stripe_price_id=EXCLUDED.stripe_price_id,
        subscription_status=EXCLUDED.subscription_status, current_period_start=EXCLUDED.current_period_start,
        current_period_end=EXCLUDED.current_period_end, cancel_at_period_end=EXCLUDED.cancel_at_period_end,
        full_name=COALESCE(EXCLUDED.full_name, billing_customers.full_name),
        business_name=COALESCE(EXCLUDED.business_name, billing_customers.business_name),
        terms_accepted_at=COALESCE(EXCLUDED.terms_accepted_at, billing_customers.terms_accepted_at),
        policy_version=COALESCE(EXCLUDED.policy_version, billing_customers.policy_version),
        updated_at=NOW()`,
      [userId, email, customerId, subscription.id,
        subscription.items?.data?.[0]?.price?.id || null, subscription.status,
        start ? new Date(start * 1000) : null, end ? new Date(end * 1000) : null,
        Boolean(subscription.cancel_at_period_end), fullName, businessName, acceptedAt,
        acceptedTerms ? config.policyVersion : null],
    );

    if (checkoutSession && !customer?.deleted) {
      const metadata = {
        ...(customer?.metadata || {}),
        application: 'ez_copyright',
        cognito_user_id: userId,
      };
      if (businessName) metadata.business_name = businessName;
      if (acceptedTerms) metadata.policy_version = config.policyVersion;

      await stripeApi.customers.update(customerId, {
        ...(fullName ? { name: fullName } : {}),
        metadata,
      });
    }

    if (acceptedTerms) {
      for (const policyType of ['terms', 'privacy']) {
        await database.query(
          `INSERT INTO policy_consents (
            id, user_id, policy_type, policy_version, request_id, source_flow
          ) VALUES ($1,$2,$3,$4,$5,'checkout')
          ON CONFLICT (user_id, policy_type, policy_version, source_flow)
          DO UPDATE SET accepted_at = NOW(), request_id = EXCLUDED.request_id`,
          [randomUUID(), userId, policyType, config.policyVersion, randomUUID()],
        );
      }
    }

    return { userId, customerId, email, fullName, businessName, acceptedTerms };

  }

  return {
    configured: Boolean(stripe && config.stripePriceId),
    async createCheckout({ database, userId = null, email = null }) {
      const priceId = await getPriceId();
      const existing = userId
        ? await database.query('SELECT * FROM billing_customers WHERE user_id=$1', [userId])
        : { rows: [] };
      const metadata = { application: 'ez_copyright' };
      if (userId) metadata.cognito_user_id = userId;

      const params = {
        mode: 'subscription',
        managed_payments: { enabled: false },
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        name_collection: {
          individual: { enabled: true, optional: false },
          business: { enabled: true, optional: true },
        },
        consent_collection: { terms_of_service: 'required' },
        custom_text: {
          terms_of_service_acceptance: {
            message: 'I agree to the EZ Copyright Terms of Service and acknowledge the Privacy Policy.',
          },
        },
        success_url: `${config.appBaseUrl}/?billing=success`,
        cancel_url: `${config.appBaseUrl}/?billing=cancelled`,
        integration_identifier: `ezcopyright_web_${randomBytes(6).toString('base64url').slice(0, 8).toLowerCase()}`,
        subscription_data: { metadata: { ...metadata } },
        metadata: { ...metadata },
      };
      if (userId) params.client_reference_id = userId;
      if (existing.rows[0]?.stripe_customer_id) params.customer = existing.rows[0].stripe_customer_id;
      else if (email) params.customer_email = email;

      const idempotencyIdentity = userId || randomBytes(12).toString('hex');
      return requireStripe().checkout.sessions.create(
        params,
        { idempotencyKey: `checkout-${idempotencyIdentity}-${Date.now()}` },
      );
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

      try {
        const object = event.data.object;
        if (event.type === 'checkout.session.completed' && object.subscription) {
          const subscription = await requireStripe().subscriptions.retrieve(object.subscription);
          await saveSubscription(
            database,
            subscription,
            object.client_reference_id,
            object.customer_details?.email || '',
            object,
          );
        } else if (event.type.startsWith('customer.subscription.')) {
          await saveSubscription(database, object);
        } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
          const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
          if (subscriptionId) await saveSubscription(database, await requireStripe().subscriptions.retrieve(subscriptionId));
        }
      } catch (error) {
        await database.query('DELETE FROM stripe_events WHERE id=$1', [event.id]);
        throw error;
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
