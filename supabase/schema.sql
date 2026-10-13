-- =====================================================================
-- Zero Bugs Club — Event Registration Database Schema (secured)
--
-- Safe to run on a fresh project AND to re-run on the existing project:
-- every statement is idempotent. Run the whole file in
-- Supabase Dashboard -> SQL Editor.
--
-- Access model
--   * anon (public website)  : can ONLY call get_event_status(). No table access.
--   * service_role (Vercel)  : calls register() and sends pass emails.
--   * authenticated + staff  : scanner app. 'volunteer' can read + check in,
--                              'admin' can also delete entries and edit config.
-- =====================================================================

-- ---------- 1. Tables ----------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reg_no text not null unique,
  email text not null unique,
  checked_in boolean not null default false,
  checked_in_at timestamptz default null,
  email_sent_at timestamptz default null,
  created_at timestamptz default now()
);

create table if not exists public.event_config (
  id int primary key default 1,
  max_seats int default 80,
  registration_open boolean default true,
  event_title text not null default 'Curtain Raiser',
  event_date date not null default '2026-07-29',
  venue text not null default 'Room 301, AB3',
  updated_at timestamptz default now()
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  name text not null,
  reg_no text not null,
  details text,
  created_at timestamptz default now()
);

create table if not exists public.staff (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null default 'volunteer' check (role in ('volunteer', 'admin'))
);

-- Approve volunteers by email (works for Google sign-in and email/password,
-- and can be set BEFORE the person ever signs in).
create table if not exists public.staff_emails (
  email text primary key check (email = lower(email)),
  role text not null default 'volunteer' check (role in ('volunteer', 'admin'))
);

-- Columns added after the first version (no-ops on a fresh install)
alter table public.registrations add column if not exists email_sent_at timestamptz default null;
update public.registrations set checked_in = false where checked_in is null;
alter table public.registrations alter column checked_in set not null;
alter table public.event_config add column if not exists event_title text not null default 'Curtain Raiser';
alter table public.event_config add column if not exists event_date date not null default '2026-07-29';
alter table public.event_config add column if not exists venue text not null default 'Room 301, AB3';

insert into public.event_config (id, max_seats, registration_open)
values (1, 80, true)
on conflict (id) do nothing;

-- ---------- 2. Constraints (NOT VALID = enforced for new rows, old rows untouched) ----------
do $$ begin
  alter table public.registrations add constraint name_len
    check (char_length(name) between 2 and 100) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.registrations add constraint email_fmt
    check (email ~ '^[a-z]+(\.[a-z]+)+20[0-9]{2}@vitstudent\.ac\.in$') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.registrations add constraint regno_fmt
    check (reg_no ~ '^[0-9]{2}[A-Z]{3}[0-9]{4}$') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.event_config add constraint single_row check (id = 1);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.event_config add constraint seats_nonneg check (max_seats >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.scan_logs add constraint status_ok check (status in
    ('APPROVED', 'REJECTED_DUPLICATE', 'REJECTED_INVALID', 'REJECTED_ERROR', 'DELETED')) not valid;
exception when duplicate_object then null; end $$;

-- Case-insensitive uniqueness (blocks A.B2025@... vs a.b2025@... duplicates)
create unique index if not exists registrations_email_ci on public.registrations (lower(email));
create unique index if not exists registrations_regno_ci on public.registrations (upper(reg_no));

-- ---------- 3. Row Level Security ----------
alter table public.registrations enable row level security;
alter table public.event_config  enable row level security;
alter table public.scan_logs     enable row level security;
alter table public.staff         enable row level security;
alter table public.staff_emails  enable row level security;  -- no policies: managed only from the SQL Editor

-- Highest role of the signed-in user: 'admin', 'volunteer' or null.
-- Email approvals only count for CONFIRMED emails (Google accounts are always confirmed).
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
  with roles as (
    select s.role from public.staff s where s.user_id = auth.uid()
    union all
    select se.role
    from public.staff_emails se
    join auth.users u on lower(u.email) = se.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
  select case
    when exists (select 1 from roles where role = 'admin') then 'admin'
    when exists (select 1 from roles) then 'volunteer'
  end;
$$;

create or replace function public.is_staff(min_role text default 'volunteer')
returns boolean
language sql stable security definer set search_path = public
as $$
  select case public.my_role()
    when 'admin' then true
    when 'volunteer' then min_role = 'volunteer'
    else false
  end;
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;
revoke all on function public.is_staff(text) from public;
grant execute on function public.is_staff(text) to authenticated;

-- Remove the old open access
revoke all on public.registrations, public.event_config, public.scan_logs, public.staff, public.staff_emails from anon, authenticated;
grant select, update, delete on public.registrations to authenticated;
grant select, update         on public.event_config  to authenticated;
grant select, insert         on public.scan_logs     to authenticated;
grant select                 on public.staff         to authenticated;
grant all on public.registrations, public.event_config, public.scan_logs, public.staff, public.staff_emails to service_role;

drop policy if exists "Allow public select registrations" on public.registrations;
drop policy if exists "Allow public insert registrations" on public.registrations;
drop policy if exists "Allow public update registrations" on public.registrations;
drop policy if exists "Allow delete registrations"        on public.registrations;
drop policy if exists "Allow public select event_config"  on public.event_config;
drop policy if exists "Allow public update event_config"  on public.event_config;
drop policy if exists "Allow public select scan_logs"     on public.scan_logs;
drop policy if exists "Allow public insert scan_logs"     on public.scan_logs;
drop policy if exists "Allow public delete scan_logs"     on public.scan_logs;

drop policy if exists "staff read regs"   on public.registrations;
drop policy if exists "staff check in"    on public.registrations;
drop policy if exists "admin delete regs" on public.registrations;
drop policy if exists "staff read config" on public.event_config;
drop policy if exists "admin edit config" on public.event_config;
drop policy if exists "staff read logs"   on public.scan_logs;
drop policy if exists "staff write logs"  on public.scan_logs;
drop policy if exists "staff read self"   on public.staff;

create policy "staff read regs"   on public.registrations for select to authenticated using (public.is_staff());
create policy "staff check in"    on public.registrations for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete regs" on public.registrations for delete to authenticated using (public.is_staff('admin'));
create policy "staff read config" on public.event_config  for select to authenticated using (public.is_staff());
create policy "admin edit config" on public.event_config  for update to authenticated using (public.is_staff('admin')) with check (public.is_staff('admin'));
create policy "staff read logs"   on public.scan_logs     for select to authenticated using (public.is_staff());
create policy "staff write logs"  on public.scan_logs     for insert to authenticated with check (public.is_staff());
create policy "staff read self"   on public.staff         for select to authenticated using (user_id = auth.uid());
-- No delete policy on scan_logs: the door audit log is append-only.

-- ---------- 4. Public + server functions ----------
-- Public, read-only event status for the website (no personal data).
create or replace function public.get_event_status()
returns table (
  max_seats int,
  registration_open boolean,
  registered int,
  event_title text,
  event_date date,
  venue text
)
language sql stable security definer set search_path = public
as $$
  select c.max_seats, c.registration_open,
         (select count(*)::int from public.registrations),
         c.event_title, c.event_date, c.venue
  from public.event_config c
  where c.id = 1;
$$;

-- Atomic registration. Only the Vercel server (service_role) may call it.
create or replace function public.register(p_name text, p_email text, p_reg_no text)
returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare
  cfg public.event_config;
  n int;
  new_row public.registrations;
begin
  -- Row lock serialises concurrent signups so the seat cap cannot be exceeded.
  select * into cfg from public.event_config where id = 1 for update;
  if not cfg.registration_open then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if cfg.event_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'EVENT_ENDED';
  end if;
  select count(*) into n from public.registrations;
  if n >= cfg.max_seats then
    raise exception 'CAPACITY_REACHED';
  end if;

  insert into public.registrations (name, email, reg_no)
  values (trim(p_name), lower(trim(p_email)), upper(trim(p_reg_no)))
  returning * into new_row;
  return new_row;
end;
$$;

revoke all on function public.get_event_status() from public;
revoke all on function public.register(text, text, text) from public, anon, authenticated;
grant execute on function public.get_event_status() to anon, authenticated, service_role;
grant execute on function public.register(text, text, text) to service_role;

-- ---------- 5. Realtime (scanner app, staff only via RLS) ----------
do $$ begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.event_config;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.scan_logs;
exception when duplicate_object then null; end $$;

-- ---------- 6. Adding volunteers ----------
-- Easiest (works with "Sign in with Google" and with email/password):
--   insert into public.staff_emails (email, role) values ('someone@gmail.com', 'volunteer');  -- or 'admin'
-- For email/password: also create the user in Authentication -> Users (tick Auto Confirm User).
-- Remove someone:
--   delete from public.staff_emails where email = 'someone@gmail.com';
