-- Schema do microservico de e-mail
-- Responsabilidade: conexoes de e-mail usadas para envios automaticos.

create table if not exists email_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  email text not null unique,
  refresh_token text not null,
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_connections_active_priority_idx
  on email_connections (active, priority, created_at);

create index if not exists email_connections_email_idx
  on email_connections (email);

-- Exemplo para cadastrar uma conexao:
-- insert into email_connections (email, refresh_token)
-- values ('seu-email@gmail.com', 'seu-refresh-token');
