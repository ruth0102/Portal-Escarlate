-- Schema do microservico de noticias
-- Responsabilidade: historico de pesquisas feitas por usuarios autenticados
-- e chaves usadas para consulta na NewsAPI.

create table if not exists news_search_history (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  query text not null,
  total_results integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists news_search_history_user_email_idx
  on news_search_history (user_email);

create index if not exists news_search_history_created_at_idx
  on news_search_history (created_at);

create table if not exists news_search_theme_cache (
  query_normalized text primary key,
  theme text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_search_theme_cache_theme_idx
  on news_search_theme_cache (theme);

create table if not exists news_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'newsapi',
  api_key text not null,
  active boolean not null default true,
  priority integer not null default 100,
  last_failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_api_keys_active_priority_idx
  on news_api_keys (active, priority, created_at);
