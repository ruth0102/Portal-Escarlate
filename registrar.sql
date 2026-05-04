-- Schema do microservico de registro
-- Responsabilidade: tokens temporarios de verificacao de e-mail.

create table if not exists email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_email_idx
  on email_verification_tokens (email);

create index if not exists email_verification_tokens_expires_at_idx
  on email_verification_tokens (expires_at);

create index if not exists email_verification_tokens_consumed_at_idx
  on email_verification_tokens (consumed_at);
