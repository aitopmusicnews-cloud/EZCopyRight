/*
# Create billing and Stripe event tracking tables

## Purpose
Supports Stripe subscription billing for the EZ Copyright app. The `billing_customers`
table tracks each user's Stripe subscription state so the frontend can gate features.
The `stripe_events` table provides idempotent webhook processing — each Stripe event
is claimed atomically so a duplicate delivery never double-processes.

## New Tables

### billing_customers
- `user_id` (uuid, primary key — references auth.users)
- `email` (text)
- `stripe_customer_id` (text, indexed)
- `stripe_subscription_id` (text)
- `stripe_price_id` (text)
- `subscription_status` (text)
- `current_period_start` (timestamptz)
- `current_period_end` (timestamptz)
- `cancel_at_period_end` (boolean, default false)
- `created_at` (timestamptz, default now)
- `updated_at` (timestamptz, default now)

### stripe_events
- `id` (text, primary key — Stripe event ID)
- `event_type` (text)
- `created_at` (timestamptz, default now)

## Security
- RLS enabled on billing_customers; only the owner can read their own billing row.
- RLS enabled on stripe_events; only authenticated users can read event IDs (for debugging).
- No INSERT/UPDATE/DELETE policies for authenticated users — all writes go through
  the service-role key used by the edge function, which bypasses RLS.
*/

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_customers_stripe_customer_id_idx
  ON public.billing_customers(stripe_customer_id);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own billing" ON public.billing_customers;
CREATE POLICY "Users can read own billing"
  ON public.billing_customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read stripe events" ON public.stripe_events;
CREATE POLICY "Users can read stripe events"
  ON public.stripe_events FOR SELECT
  TO authenticated
  USING (true);