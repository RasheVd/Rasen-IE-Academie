-- IE.Academie · skema Supabase
-- Jalankan sekali di SQL Editor. Semua objek berawalan academie_ supaya aman
-- berbagi project dengan aplikasi lain.
--
-- Peran: admin, mentor, student. Baris academie_profiles dibuat admin lebih
-- dulu (berdasarkan email). Saat orang itu login pertama kali, fungsi
-- academie_ensure_profile() menautkan akunnya ke baris tersebut. Akun tanpa
-- baris profil tidak melihat data apa pun.

create extension if not exists pgcrypto;

-- Tabel versi lama (planner pribadi), sudah tidak dipakai.
drop table if exists public.academie_records cascade;
drop table if exists public.academie_settings cascade;
drop function if exists public.academie_replace_workspace(jsonb);
drop function if exists public.academie_cascade_records();
drop function if exists public.academie_touch_updated_at();

/* ── Tabel ─────────────────────────────────────────────────── */
create table if not exists public.academie_profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  email      text not null unique check (email = lower(email)),
  full_name  text not null default '',
  role       text not null check (role in ('admin', 'mentor', 'student')),
  note       text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.academie_courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  description text not null default '',
  color       text not null default 'cobalt' check (color in ('cobalt', 'orange', 'yellow', 'green', 'pink', 'ink')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.academie_enrollments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.academie_profiles (id) on delete cascade,
  course_id       uuid not null references public.academie_courses (id) on delete cascade,
  mentor_id       uuid references public.academie_profiles (id) on delete set null,
  target_sessions int not null default 8 check (target_sessions between 1 and 100),
  status          text not null default 'active' check (status in ('active', 'paused', 'finished')),
  created_at      timestamptz not null default now(),
  unique (student_id, course_id)
);

create table if not exists public.academie_sessions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  course_id     uuid not null references public.academie_courses (id) on delete restrict,
  mentor_id     uuid references public.academie_profiles (id) on delete set null,
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 15 and 240),
  mode          text not null default 'private' check (mode in ('private', 'group')),
  place         text not null default '',
  topic         text not null default '',
  status        text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  pretest_url   text not null default '',
  posttest_url  text not null default '',
  report        text not null default '',
  followup      text not null default '',
  reported_at   timestamptz,
  gcal_event_id text,
  created_at    timestamptz not null default now()
);
create index if not exists academie_sessions_starts_idx on public.academie_sessions (starts_at);

create table if not exists public.academie_session_students (
  session_id     uuid not null references public.academie_sessions (id) on delete cascade,
  student_id     uuid not null references public.academie_profiles (id) on delete cascade,
  attendance     text check (attendance in ('present', 'absent', 'excused')),
  pretest_score  numeric check (pretest_score between 0 and 100),
  posttest_score numeric check (posttest_score between 0 and 100),
  primary key (session_id, student_id)
);
create index if not exists academie_session_students_student_idx on public.academie_session_students (student_id);

create table if not exists public.academie_materials (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.academie_courses (id) on delete cascade,
  student_id  uuid references public.academie_profiles (id) on delete cascade, -- null = semua peserta mata kuliah ini
  session_id  uuid references public.academie_sessions (id) on delete set null,
  title       text not null,
  kind        text not null default 'ppt' check (kind in ('ppt', 'pdf', 'latihan', 'video', 'link')),
  url         text not null check (url ~* '^https?://'),
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- Token Google milik admin. Tanpa policy: hanya service role (edge function) yang bisa membaca.
create table if not exists public.academie_google (
  id              int primary key check (id = 1),
  refresh_token   text not null,
  connected_email text not null default '',
  updated_at      timestamptz not null default now()
);
create table if not exists public.academie_oauth_states (
  state      text primary key,
  user_id    uuid not null,
  return_to  text not null,
  created_at timestamptz not null default now()
);

/* ── Fungsi bantu (security definer supaya policy tidak saling memanggil) ── */
create or replace function public.academie_me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.academie_profiles where user_id = auth.uid() and active
$$;

create or replace function public.academie_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.academie_profiles where user_id = auth.uid() and active
$$;

create or replace function public.academie_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.academie_role() = 'admin', false)
$$;

-- Saya mentor sesi ini?
create or replace function public.academie_mentors_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_sessions s where s.id = sid and s.mentor_id = public.academie_me())
$$;

-- Saya peserta sesi ini?
create or replace function public.academie_in_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_session_students x where x.session_id = sid and x.student_id = public.academie_me())
$$;

-- Saya terhubung dengan profil ini (mentor dari peserta itu, atau peserta dari mentor itu)?
create or replace function public.academie_related(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.academie_enrollments e
    where (e.mentor_id = public.academie_me() and e.student_id = pid)
       or (e.student_id = public.academie_me() and e.mentor_id = pid)
  ) or exists (
    select 1 from public.academie_sessions s
    join public.academie_session_students x on x.session_id = s.id
    where (s.mentor_id = public.academie_me() and x.student_id = pid)
       or (x.student_id = public.academie_me() and s.mentor_id = pid)
  )
$$;

-- Saya terdaftar di mata kuliah ini (peserta), atau mengajar di dalamnya (mentor)?
create or replace function public.academie_in_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.academie_enrollments e
    where e.course_id = cid and (e.student_id = public.academie_me() or e.mentor_id = public.academie_me())
  ) or exists (
    select 1 from public.academie_sessions s where s.course_id = cid and s.mentor_id = public.academie_me()
  ) or exists (
    select 1 from public.academie_sessions s
    join public.academie_session_students x on x.session_id = s.id
    where s.course_id = cid and x.student_id = public.academie_me()
  )
$$;

-- Dipanggil klien setelah login: menautkan akun ke baris profil yang disiapkan admin.
create or replace function public.academie_ensure_profile() returns public.academie_profiles
language plpgsql security definer set search_path = public as $$
declare p public.academie_profiles; mail text; confirmed timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.academie_profiles where user_id = auth.uid();
  if found then return p; end if;
  select lower(u.email), u.email_confirmed_at into mail, confirmed from auth.users u where u.id = auth.uid();
  if mail is null or confirmed is null then return null; end if;
  update public.academie_profiles set user_id = auth.uid()
    where email = mail and user_id is null returning * into p;
  return p;
end $$;

-- Laporan sesi oleh mentor sesi itu atau admin: status, catatan, kehadiran, nilai kedua tes.
-- rows: [{ "student_id": "...", "attendance": "present", "pretest_score": 40, "posttest_score": 80 }]
create or replace function public.academie_submit_report(
  p_session uuid, p_status text, p_report text, p_followup text, p_rows jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not (public.academie_is_admin() or public.academie_mentors_session(p_session)) then
    raise exception 'Hanya mentor sesi ini atau admin yang boleh mengisi laporan';
  end if;
  if p_status not in ('scheduled', 'done', 'cancelled') then raise exception 'Status tidak dikenal'; end if;
  update public.academie_sessions
     set status = p_status, report = coalesce(p_report, ''), followup = coalesce(p_followup, ''),
         reported_at = case when p_status = 'done' then now() else reported_at end
   where id = p_session;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.academie_session_students
       set attendance = nullif(r->>'attendance', ''),
           pretest_score = nullif(r->>'pretest_score', '')::numeric,
           posttest_score = nullif(r->>'posttest_score', '')::numeric
     where session_id = p_session and student_id = (r->>'student_id')::uuid;
  end loop;
end $$;

-- Private: tepat satu peserta. Kelas bersama: maksimal lima.
create or replace function public.academie_check_capacity() returns trigger
language plpgsql set search_path = public as $$
declare n int; m text;
begin
  select mode into m from public.academie_sessions where id = new.session_id;
  select count(*) into n from public.academie_session_students where session_id = new.session_id;
  if m = 'private' and n >= 1 then raise exception 'Sesi private hanya untuk satu peserta'; end if;
  if m = 'group' and n >= 5 then raise exception 'Kelas bersama maksimal lima peserta'; end if;
  return new;
end $$;
drop trigger if exists academie_capacity on public.academie_session_students;
create trigger academie_capacity before insert on public.academie_session_students
  for each row execute function public.academie_check_capacity();

/* ── Row Level Security ────────────────────────────────────── */
alter table public.academie_profiles         enable row level security;
alter table public.academie_courses          enable row level security;
alter table public.academie_enrollments      enable row level security;
alter table public.academie_sessions         enable row level security;
alter table public.academie_session_students enable row level security;
alter table public.academie_materials        enable row level security;
alter table public.academie_google           enable row level security;
alter table public.academie_oauth_states     enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','courses','enrollments','sessions','session_students','materials'] loop
    execute format('drop policy if exists "academie admin all" on public.academie_%s', t);
    execute format('create policy "academie admin all" on public.academie_%s for all to authenticated using (public.academie_is_admin()) with check (public.academie_is_admin())', t);
    execute format('drop policy if exists "academie read" on public.academie_%s', t);
  end loop;
end $$;

create policy "academie read" on public.academie_profiles for select to authenticated
  using (user_id = auth.uid() or public.academie_related(id));

create policy "academie read" on public.academie_courses for select to authenticated
  using (public.academie_in_course(id));

create policy "academie read" on public.academie_enrollments for select to authenticated
  using (student_id = public.academie_me() or mentor_id = public.academie_me());

create policy "academie read" on public.academie_sessions for select to authenticated
  using (mentor_id = public.academie_me() or public.academie_in_session(id));

create policy "academie read" on public.academie_session_students for select to authenticated
  using (student_id = public.academie_me() or public.academie_mentors_session(session_id));

create policy "academie read" on public.academie_materials for select to authenticated
  using (
    student_id = public.academie_me()
    or (student_id is null and public.academie_in_course(course_id))
    or (student_id is not null and public.academie_role() = 'mentor' and public.academie_related(student_id))
  );

/* ── Hak eksekusi ──────────────────────────────────────────── */
do $$ declare f text; begin
  foreach f in array array[
    'academie_me()', 'academie_role()', 'academie_is_admin()', 'academie_mentors_session(uuid)',
    'academie_in_session(uuid)', 'academie_related(uuid)', 'academie_in_course(uuid)',
    'academie_ensure_profile()', 'academie_submit_report(uuid, text, text, text, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.academie_check_capacity() from public, anon, authenticated;

/* ── Admin pertama ─────────────────────────────────────────── */
-- Ganti email ini dengan email admin kamu sebelum menjalankan di project baru.
insert into public.academie_profiles (email, full_name, role)
values ('rasendriya465@gmail.com', 'Admin IE.Academie', 'admin')
on conflict (email) do nothing;
