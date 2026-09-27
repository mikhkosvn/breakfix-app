create table if not exists scout_run (
  issue_id        text primary key,
  short_id        text not null,
  project_slug    text not null,
  run_id          uuid not null,
  kind            text not null,
  state           text not null,
  attempt         integer not null default 1,
  issue_last_seen timestamptz not null,
  substatus       text,
  batch_job_id    text,
  failure         text,
  report          jsonb,
  usage           jsonb,
  tool_calls      integer,
  heartbeat_phase text,
  heartbeat_at    timestamptz,
  first_queued_at timestamptz not null default now(),
  submitted_at    timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default now(),
  constraint scout_run_state_check check (state in ('queued', 'running', 'done', 'failed')),
  constraint scout_run_kind_check check (kind in ('new', 'regression'))
);

create index if not exists scout_run_state_last_seen_idx on scout_run (state, issue_last_seen);
create unique index if not exists scout_run_run_id_idx on scout_run (run_id);
