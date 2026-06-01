-- Schema do microservico de autenticacao
-- Responsabilidade: usuarios, senha e papel de acesso.

create table if not exists users_2 (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists users_2_email_idx
  on users_2 (email);

create index if not exists users_2_role_idx
  on users_2 (role);
