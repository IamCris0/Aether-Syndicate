-- ============================================================
-- AETHER SYNDICATE — esquema de Supabase
-- Ejecuta este script UNA VEZ en: Dashboard → SQL Editor → Run
-- ============================================================

-- Perfil del jugador: un documento JSON por usuario.
-- (misma estructura que PlayerProfile del cliente; el JSON evita
--  migraciones por cada campo nuevo del metajuego)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: cada usuario SOLO puede leer/escribir su propia fila.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ============================================================
-- v2: nombre de usuario ÚNICO (sin distinguir mayúsculas)
-- ============================================================
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

-- Comprobar disponibilidad sin exponer los perfiles de otros usuarios:
-- función SECURITY DEFINER que solo responde sí/no.
create or replace function public.username_taken(candidate text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(username) = lower(candidate)
  );
$$;

grant execute on function public.username_taken(text) to anon, authenticated;
