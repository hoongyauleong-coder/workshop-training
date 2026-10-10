-- CAR/PAR system schema. Paste the whole file into Supabase ▸ SQL Editor ▸ New query ▸ Run.
-- Safe to re-run: it only creates what is missing.

-- ---------- auditors allow-list ----------
create table if not exists public.auditors (
  email text primary key,
  name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_auditor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.auditors where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- ---------- settings (single row) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  closure_wd int not null default 14,
  pre_wd int not null default 5,
  r1_wd int not null default 1,
  r2_gap int not null default 3,
  repeat_gap int not null default 3,
  eff_wd int not null default 30,
  auditor_name text not null default 'HoongYau',
  auditor_title text not null default 'ISO 14001 Auditor | CePSWaM',
  dept text not null default 'Jabatan Pematuhan',
  auditor_email text not null default '',
  extra_cc text not null default '',
  car_prefix text not null default 'CAR',
  test_mode boolean not null default true,
  simulated_today date
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- holidays ----------
create table if not exists public.holidays (
  date date primary key,
  name text not null,
  note text not null default ''
);

-- ---------- CAR/PAR register ----------
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  car_no text unique,
  date_raised date,
  area text not null default '',
  finding text not null,
  requirement_ref text not null default '',
  severity text not null default '',
  owner_name text not null default '',
  owner_email text not null default '',
  hod_name text not null default '',
  hod_email text not null default '',
  status text not null default 'New'
    check (status in ('New', 'Sent', 'Acknowledged', 'Evidence Submitted', 'Disputed', 'Closed', 'Cancelled')),
  sent_date date,
  ack_date date,
  due_date date,
  extension_due date,
  last_stage text not null default '',
  last_sent date,
  ack_reminders int not null default 0,
  closed_date date,
  verified_by text not null default '',
  remarks text not null default '',
  token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cars_status_idx on public.cars (status);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists cars_touch on public.cars;
create trigger cars_touch before update on public.cars for each row execute function public.touch_updated_at();

-- ---------- evidence ----------
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  root_cause text not null,
  action_taken text not null,
  files jsonb not null default '[]'::jsonb,
  decision text not null default 'Pending' check (decision in ('Pending', 'Accepted', 'Rejected')),
  decision_reason text not null default '',
  submitted_at timestamptz not null default now()
);
create index if not exists evidence_car_idx on public.evidence (car_id);

-- ---------- email / activity log ----------
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  car_no text not null default '',
  event text not null,
  to_addr text not null default '',
  cc_addr text not null default '',
  detail text not null default '',
  mode text not null default 'LIVE'
);
create index if not exists email_log_car_idx on public.email_log (car_no);

-- ---------- row level security: only auditors, via their login ----------
-- Owner links and the daily cron go through the server with the service role key.
alter table public.auditors enable row level security;
alter table public.settings enable row level security;
alter table public.holidays enable row level security;
alter table public.cars enable row level security;
alter table public.evidence enable row level security;
alter table public.email_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['auditors', 'settings', 'holidays', 'cars', 'evidence', 'email_log'] loop
    execute format('drop policy if exists auditor_all on public.%I', t);
    execute format('create policy auditor_all on public.%I for all to authenticated using (public.is_auditor()) with check (public.is_auditor())', t);
  end loop;
end $$;

-- ---------- private storage bucket for evidence files ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------- holidays: Malaysia (federal) + Penang ----------
-- Lunar dates are ESTIMATES – verify against the official gazette and edit in the app (Settings page).
insert into public.holidays (date, name, note) values
  ('2026-11-08', 'Deepavali', 'Anggaran / estimate – SAHKAN'),
  ('2026-11-09', 'Cuti ganti Deepavali (replacement)', 'Anggaran / estimate – SAHKAN'),
  ('2026-12-25', 'Hari Krismas / Christmas', 'Tarikh tetap / fixed'),
  ('2027-01-01', 'Tahun Baru / New Year', 'Tarikh tetap / fixed'),
  ('2027-01-22', 'Thaipusam', 'Anggaran / estimate – SAHKAN'),
  ('2027-02-06', 'Tahun Baru Cina / Chinese New Year', 'Anggaran / estimate – SAHKAN'),
  ('2027-02-07', 'Tahun Baru Cina (Hari Kedua)', 'Anggaran / estimate – SAHKAN'),
  ('2027-02-08', 'Cuti ganti Tahun Baru Cina (replacement)', 'Anggaran / estimate – SAHKAN'),
  ('2027-02-24', 'Nuzul Al-Quran', 'Anggaran / estimate – SAHKAN'),
  ('2027-03-10', 'Hari Raya Aidilfitri', 'Anggaran / estimate – SAHKAN'),
  ('2027-03-11', 'Hari Raya Aidilfitri (Hari Kedua)', 'Anggaran / estimate – SAHKAN'),
  ('2027-05-01', 'Hari Pekerja / Labour Day', 'Tarikh tetap / fixed'),
  ('2027-05-17', 'Hari Raya Haji', 'Anggaran / estimate – SAHKAN'),
  ('2027-05-20', 'Hari Wesak', 'Anggaran / estimate – SAHKAN'),
  ('2027-06-06', 'Awal Muharram', 'Anggaran / estimate – SAHKAN'),
  ('2027-06-07', 'Hari Keputeraan YDP Agong', 'Isnin pertama Jun / first Monday of June'),
  ('2027-06-08', 'Cuti ganti Awal Muharram (replacement)', 'Anggaran / estimate – SAHKAN'),
  ('2027-07-07', 'Hari Bandaraya Warisan Dunia George Town', 'Tarikh tetap / fixed (Penang)'),
  ('2027-07-10', 'Hari Jadi Yang Dipertua Negeri Pulau Pinang', 'Sabtu kedua Julai / 2nd Saturday of July'),
  ('2027-08-15', 'Maulidur Rasul', 'Anggaran / estimate – SAHKAN'),
  ('2027-08-16', 'Cuti ganti Maulidur Rasul (replacement)', 'Anggaran / estimate – SAHKAN'),
  ('2027-08-31', 'Hari Kebangsaan / National Day', 'Tarikh tetap / fixed'),
  ('2027-09-16', 'Hari Malaysia / Malaysia Day', 'Tarikh tetap / fixed'),
  ('2027-10-29', 'Deepavali', 'Anggaran / estimate – SAHKAN'),
  ('2027-12-25', 'Hari Krismas / Christmas', 'Tarikh tetap / fixed')
on conflict (date) do nothing;

-- ---------- add yourself as an auditor (edit the email, then run this line) ----------
-- insert into public.auditors (email, name) values ('you@yourcompany.com', 'HoongYau') on conflict do nothing;
