-- Schema do microservico de resumo de noticias reais
-- Responsabilidade: armazenar resumos persistentes de noticias por URL.

create table if not exists news_article_summaries (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  normalized_url text not null unique,
  title text not null,
  author text,
  source text,
  published_at timestamptz,
  url_to_image text,
  summary text not null,
  ai_provider text,
  ai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_article_summaries_created_at_idx
  on news_article_summaries (created_at desc);
