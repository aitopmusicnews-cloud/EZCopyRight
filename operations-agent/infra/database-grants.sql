-- Run once using your DBA connection. Set passwords separately using your secret manager.
-- Use CREATE ROLE only if these dedicated roles do not already exist.
CREATE ROLE ez_agent_runtime LOGIN;
CREATE ROLE ez_agent_app_reader LOGIN;
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
