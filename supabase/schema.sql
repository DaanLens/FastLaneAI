/*
  AI in the Fast Lane: database in Supabase
  -----------------------------------------
  Plak dit hele bestand in Supabase > SQL Editor en klik op Run.
  Opnieuw draaien kan geen kwaad: bestaande tabellen en gegevens blijven staan.

  Daarna stel je de codes in (zie onderaan, stap "Codes instellen").

  Beveiliging:
  - Elk toestel logt anoniem in bij Supabase (een eigen sessie, zonder e-mail).
  - Alleen wie zich heeft ingeschreven met de juiste eventcode kan lezen en schrijven.
  - Eigen acties verwijderen kan alleen vanaf het toestel dat ze heeft gemaakt.
  - "Alles wissen" vraagt de beheercode. Beide codes staan in het schema "private",
    dat niet via de API bereikbaar is.
*/

/* ---------- codes (niet via de API bereikbaar) ---------- */
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.instellingen (
  sleutel text primary key,
  waarde  text not null
);

/* ---------- tabellen ---------- */
create table if not exists public.deelnemers (
  id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email      text not null default '' check (char_length(email) <= 255),
  naam       text not null check (char_length(naam) between 1 and 255),
  team       int  not null check (team between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.kansen (
  id            bigint generated always as identity primary key,
  team          int  not null check (team between 1 and 5),
  rij           int  not null check (rij between 1 and 3),
  klant         text not null default '' check (char_length(klant) <= 255),
  kans          text not null default '' check (char_length(kans) <= 4000),
  agent_doet    text not null default '' check (char_length(agent_doet) <= 4000),
  human_beslist text not null default '' check (char_length(human_beslist) <= 4000),
  updated_at    timestamptz not null default now(),
  unique (team, rij)
);

create table if not exists public.toewijzingen (
  id               bigint generated always as identity primary key,
  team             int  not null check (team between 1 and 5),
  taak_nr          int  not null check (taak_nr between 1 and 15),
  niveau           text check (niveau in ('Agent', 'Human + Agent', 'Human')),
  eigen_taak_tekst text not null default '' check (char_length(eigen_taak_tekst) <= 255),
  eigen_taak_fase  text not null default '' check (char_length(eigen_taak_fase) <= 20),
  updated_at       timestamptz not null default now(),
  unique (team, taak_nr)
);

create table if not exists public.van_naar (
  id         bigint generated always as identity primary key,
  team       int  not null check (team between 1 and 5),
  doelgroep  text not null check (doelgroep in ('Consultants', 'Developers')),
  van        text not null default '' check (char_length(van) <= 255),
  naar       text not null default '' check (char_length(naar) <= 255),
  updated_at timestamptz not null default now(),
  unique (team, doelgroep)
);

create table if not exists public.acties (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  naam       text not null check (char_length(naam) between 1 and 255),
  email      text not null default '' check (char_length(email) <= 255),
  team       int  not null check (team between 1 and 5),
  kolom      text not null check (kolom in ('30 dagen', '90 dagen', 'Dit jaar')),
  actie      text not null check (char_length(actie) between 1 and 4000),
  klant      text not null default '' check (char_length(klant) <= 255),
  datum      text not null default '' check (char_length(datum) <= 255),
  created_at timestamptz not null default now()
);

/* ---------- hulpfunctie: is dit toestel ingeschreven? ---------- */
create or replace function public.is_deelnemer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.deelnemers where id = auth.uid());
$$;

/* ---------- Row Level Security ---------- */
alter table public.deelnemers   enable row level security;
alter table public.kansen       enable row level security;
alter table public.toewijzingen enable row level security;
alter table public.van_naar     enable row level security;
alter table public.acties       enable row level security;

-- Alleen ingelogde (ook anonieme) sessies; de rol anon krijgt niets
revoke all on public.deelnemers, public.kansen, public.toewijzingen, public.van_naar, public.acties from anon, public;
grant select on public.deelnemers to authenticated;
grant select, insert, update on public.kansen, public.toewijzingen, public.van_naar to authenticated;
grant select, insert, delete on public.acties to authenticated;

drop policy if exists "eigen inschrijving lezen" on public.deelnemers;
create policy "eigen inschrijving lezen" on public.deelnemers
  for select to authenticated using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['kansen', 'toewijzingen', 'van_naar'] loop
    execute format('drop policy if exists "deelnemers lezen" on public.%I', t);
    execute format('drop policy if exists "deelnemers toevoegen" on public.%I', t);
    execute format('drop policy if exists "deelnemers wijzigen" on public.%I', t);
    execute format('create policy "deelnemers lezen" on public.%I for select to authenticated using ((select public.is_deelnemer()))', t);
    execute format('create policy "deelnemers toevoegen" on public.%I for insert to authenticated with check ((select public.is_deelnemer()))', t);
    execute format('create policy "deelnemers wijzigen" on public.%I for update to authenticated using ((select public.is_deelnemer())) with check ((select public.is_deelnemer()))', t);
  end loop;
end $$;

drop policy if exists "deelnemers lezen" on public.acties;
drop policy if exists "eigen actie toevoegen" on public.acties;
drop policy if exists "eigen actie verwijderen" on public.acties;
create policy "deelnemers lezen" on public.acties
  for select to authenticated using ((select public.is_deelnemer()));
create policy "eigen actie toevoegen" on public.acties
  for insert to authenticated with check ((select public.is_deelnemer()) and user_id = (select auth.uid()));
create policy "eigen actie verwijderen" on public.acties
  for delete to authenticated using (user_id = (select auth.uid()));

/* ---------- inschrijven met eventcode ---------- */
create or replace function public.inschrijven(p_code text, p_naam text, p_email text, p_team int)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Niet ingelogd'; end if;
  -- Nieuwe deelnemers hebben de eventcode nodig; wie al is ingeschreven mag naam en team wijzigen
  if not exists (select 1 from public.deelnemers where id = v_uid) then
    if not exists (select 1 from private.instellingen where sleutel = 'eventcode' and waarde = trim(p_code)) then
      raise exception 'Onjuiste eventcode' using errcode = '28000';
    end if;
  end if;
  insert into public.deelnemers (id, email, naam, team)
  values (v_uid, lower(trim(coalesce(p_email, ''))), trim(p_naam), p_team)
  on conflict (id) do update set email = excluded.email, naam = excluded.naam, team = excluded.team;
  return v_uid;
end $$;

/* ---------- beheer: alles wissen met beheercode ---------- */
create or replace function public.alles_wissen(p_code text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  n int := 0;
  c int;
begin
  if not public.is_deelnemer()
     or not exists (select 1 from private.instellingen where sleutel = 'beheercode' and waarde = p_code) then
    raise exception 'Onjuiste beheercode' using errcode = '28000';
  end if;
  delete from public.acties       where true; get diagnostics c = row_count; n := n + c;
  delete from public.kansen       where true; get diagnostics c = row_count; n := n + c;
  delete from public.toewijzingen where true; get diagnostics c = row_count; n := n + c;
  delete from public.van_naar     where true; get diagnostics c = row_count; n := n + c;
  delete from public.deelnemers   where true; get diagnostics c = row_count; n := n + c;
  return n;
end $$;

revoke all on function public.is_deelnemer(), public.inschrijven(text, text, text, int), public.alles_wissen(text) from public, anon;
grant execute on function public.is_deelnemer(), public.inschrijven(text, text, text, int), public.alles_wissen(text) to authenticated;

/*
  ---------- Codes instellen ----------
  Draai dit apart (vul je eigen codes in) en bewaar de codes NIET in de repo.
  Kies een beheercode van minstens 16 willekeurige tekens.

  insert into private.instellingen (sleutel, waarde) values
    ('eventcode',  'VUL-IN'),
    ('beheercode', 'VUL-IN-LANG-EN-GEHEIM')
  on conflict (sleutel) do update set waarde = excluded.waarde;
*/
