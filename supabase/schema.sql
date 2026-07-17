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
