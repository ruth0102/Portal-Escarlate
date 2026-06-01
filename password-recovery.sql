-- Schema do microservico de recuperacao de senha
-- Responsabilidade: tokens temporarios para reset de senha.

create table if not exists password_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_recovery_tokens_email_idx
  on password_recovery_tokens (email);

create index if not exists password_recovery_tokens_expires_at_idx
  on password_recovery_tokens (expires_at);

create index if not exists password_recovery_tokens_consumed_at_idx
  on password_recovery_tokens (consumed_at);
