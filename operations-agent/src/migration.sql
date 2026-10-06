CREATE SCHEMA IF NOT EXISTS ez_agent;
CREATE TABLE IF NOT EXISTS ez_agent.jobs (
 id uuid PRIMARY KEY, requested_by text NOT NULL, prompt text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 result text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS ez_agent.actions (
 id uuid PRIMARY KEY, job_id uuid REFERENCES ez_agent.jobs(id), kind text NOT NULL,
 payload jsonb NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','executing','completed','rejected','needs_reconciliation','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 decided_by text, decided_at timestamptz, result jsonb
);
CREATE TABLE IF NOT EXISTS ez_agent.audit (
 id bigserial PRIMARY KEY, actor text NOT NULL, event text NOT NULL, resource_id text,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ez_agent.state (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_queue_idx ON ez_agent.jobs(status, created_at);
CREATE INDEX IF NOT EXISTS actions_pending_idx ON ez_agent.actions(status, created_at);
