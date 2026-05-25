create table if not exists app_state (
  key text primary key,
  value text not null,
  updated_at text not null default current_timestamp
);

create table if not exists messages (
  id text primary key,
  room_id text not null,
  conversation_id text not null,
  sender_type text not null,
  sender_name text not null,
  content text not null,
  status text,
  pending integer,
  run_id text,
  reply_to_json text,
  created_at text not null,
  updated_at text
);

create index if not exists idx_messages_room_created
  on messages(room_id, created_at, id);

create table if not exists agent_runs (
  id text primary key,
  room_id text not null,
  agent_id text not null,
  message_id text,
  status text not null,
  attempts integer not null default 0,
  turn integer not null default 1,
  max_turns integer not null default 6,
  error text,
  created_at text not null,
  updated_at text,
  started_at text,
  completed_at text,
  stopped_at text,
  recovered_at text,
  retried_at text,
  last_attempt_at text
);

create index if not exists idx_agent_runs_room_status
  on agent_runs(room_id, status, created_at);
