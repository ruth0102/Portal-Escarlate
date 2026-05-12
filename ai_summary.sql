-- Schema do microservico de sintese por IA
-- Responsabilidade: chaves de API e modelos usados para gerar sinteses.

create table if not exists ai_summary_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openrouter',
  label text,
  api_key text not null,
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists ai_summary_models (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references ai_summary_api_keys (id) on delete cascade,
  model text not null,
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists ai_summary_api_keys_active_priority_idx
  on ai_summary_api_keys (active, priority, created_at);

create index if not exists ai_summary_models_key_active_priority_idx
  on ai_summary_models (api_key_id, active, priority, created_at);
