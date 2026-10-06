-- Run once using a DBA connection after IAM database authentication is enabled.
-- The two dedicated roles use short-lived RDS IAM tokens; no database passwords are stored.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ez_agent_runtime') THEN
    CREATE ROLE ez_agent_runtime LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ez_agent_app_reader') THEN
    CREATE ROLE ez_agent_app_reader LOGIN;
  END IF;
END $$;

GRANT rds_iam TO ez_agent_runtime, ez_agent_app_reader;
GRANT CONNECT ON DATABASE CURRENT_DATABASE_PLACEHOLDER TO ez_agent_runtime, ez_agent_app_reader;
GRANT USAGE ON SCHEMA ez_agent TO ez_agent_runtime;
GRANT SELECT, INSERT, UPDATE ON ez_agent.jobs, ez_agent.actions, ez_agent.state TO ez_agent_runtime;
GRANT SELECT, INSERT ON ez_agent.audit TO ez_agent_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ez_agent TO ez_agent_runtime;
GRANT USAGE ON SCHEMA public TO ez_agent_app_reader;
GRANT SELECT (status) ON public.works TO ez_agent_app_reader;
GRANT SELECT (status,created_at) ON public.file_uploads TO ez_agent_app_reader;
GRANT SELECT (user_id,stripe_customer_id,subscription_status) ON public.billing_customers TO ez_agent_app_reader;
GRANT SELECT (event_type,processed_at) ON public.stripe_events TO ez_agent_app_reader;
ALTER ROLE ez_agent_app_reader SET default_transaction_read_only = on;
-- Neither role receives UPDATE/DELETE on application tables, audio access,
-- or DELETE/UPDATE permissions on the audit table.
