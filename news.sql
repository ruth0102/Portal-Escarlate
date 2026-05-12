-- Schema do microservico de noticias
-- Responsabilidade: historico de pesquisas feitas por usuarios autenticados.

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

