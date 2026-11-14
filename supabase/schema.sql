-- IE.Academie v2 · skema Supabase
-- Project khusus IE.Academie. Jalankan sekali di SQL Editor project baru,
-- lalu jalankan supabase/seed.sql untuk katalog mata kuliah Teknik Industri.
--
-- Aturan bisnis yang dikunci di sini (bukan hanya di tampilan):
--   * booking paling lambat 24 jam sebelum sesi (academie_settings.booking_cutoff_hours)
--   * slot ditahan sampai bukti bayar dikirim dan dikonfirmasi admin
--   * satu mentor tidak bisa punya dua sesi yang bertumpuk (exclusion constraint)
--   * private 1 peserta, kelas bersama maksimal 5
--   * pindah jadwal oleh peserta sampai H-1 menjadi kredit, bukan uang kembali
--   * nama mata kuliah dan topik unik tanpa peduli huruf besar kecil dan spasi

create schema if not exists extensions;
create extension if not exists pgcrypto;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

/* ── Pengaturan usaha (satu baris) ───────────────────────── */
create table if not exists public.academie_settings (
  id                     int primary key default 1 check (id = 1),
  admin_whatsapp         text not null default '+6285967072383',
  admin_whatsapp_label   text not null default 'Rasen/Sandy',
  price_private          int  not null default 70000,
  price_group            int  not null default 40000,
  mentor_share_private   int  not null default 49000,
  mentor_share_group     int  not null default 28000,
  booking_cutoff_hours   int  not null default 24 check (booking_cutoff_hours between 0 and 336),
  reschedule_cutoff_hours int not null default 24 check (reschedule_cutoff_hours between 0 and 336),
  hold_hours             int  not null default 12 check (hold_hours between 1 and 168),
  booking_horizon_days   int  not null default 60 check (booking_horizon_days between 7 and 365),
  threshold_need_help    int  not null default 60 check (threshold_need_help between 1 and 99),
  threshold_mastered     int  not null default 80 check (threshold_mastered between 1 and 100),
  bank_name              text not null default '',
  bank_account           text not null default '',
  bank_holder            text not null default '',
  payment_note           text not null default '',
  updated_at             timestamptz not null default now()
);
insert into public.academie_settings (id) values (1) on conflict do nothing;

/* ── Orang ───────────────────────────────────────────────── */
create table if not exists public.academie_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users (id) on delete set null,
  email          text not null unique check (email = lower(btrim(email))),
  full_name      text not null default '',
  role           text not null check (role in ('admin', 'mentor', 'student')),
  phone          text not null default '',
  bio            text not null default '',
  meeting_link   text not null default '',
  learning_needs text not null default '',
  note           text not null default '',
  active         boolean not null default true,
  invited_at     timestamptz,
  created_at     timestamptz not null default now()
);

/* ── Katalog: mata kuliah dan topik (anti typo) ──────────── */
create table if not exists public.academie_courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  title       text not null check (length(btrim(title)) > 1),
  category    text not null default 'Lainnya',
  description text not null default '',
  color       text not null default 'teal' check (color in ('teal', 'violet', 'amber', 'coral', 'sky', 'green', 'slate')),
  active      boolean not null default true,
  name_key    text generated always as (lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))) stored,
  code_key    text generated always as (upper(regexp_replace(code, '\s+', '', 'g'))) stored,
  created_at  timestamptz not null default now()
);
create unique index if not exists academie_courses_name_key on public.academie_courses (name_key);
create unique index if not exists academie_courses_code_key on public.academie_courses (code_key);

create table if not exists public.academie_topics (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.academie_courses (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 1),
  position     int  not null default 0,
  pretest_url  text not null default '' check (pretest_url = '' or pretest_url ~* '^https?://'),
  posttest_url text not null default '' check (posttest_url = '' or posttest_url ~* '^https?://'),
  name_key     text generated always as (lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))) stored,
  created_at   timestamptz not null default now()
);
create unique index if not exists academie_topics_name_key on public.academie_topics (course_id, name_key);

/* ── Mata kuliah per peserta, kompetensi per mentor ──────── */
create table if not exists public.academie_enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.academie_profiles (id) on delete cascade,
  course_id   uuid not null references public.academie_courses (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'paused', 'finished')),
  goal_text   text not null default '',
  goal_date   date,
  created_at  timestamptz not null default now(),
  unique (student_id, course_id)
);

create table if not exists public.academie_mentor_courses (
  mentor_id   uuid not null references public.academie_profiles (id) on delete cascade,
  course_id   uuid not null references public.academie_courses (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  created_at  timestamptz not null default now(),
  primary key (mentor_id, course_id)
);

/* ── Ketersediaan mentor (pola mingguan tanpa batas akhir) ─ */
-- Jam lokal Asia/Jakarta. Slot 60 menit dimulai dari start_time.
create table if not exists public.academie_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.academie_profiles (id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),          -- 0 = Minggu
  start_time  time not null,
  end_time    time not null,
  modes       text not null default 'both' check (modes in ('private', 'group', 'both')),
  active      boolean not null default true,
  start_min   int generated always as ((extract(epoch from start_time) / 60)::int) stored,
  end_min     int generated always as ((extract(epoch from end_time) / 60)::int) stored,
  gcal_events jsonb not null default '[]'::jsonb,                      -- [{ "start": "19:00", "id": "..." }]
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (((extract(epoch from end_time) - extract(epoch from start_time)) / 60)::int % 60 = 0),
  constraint academie_rules_no_overlap exclude using gist (
    mentor_id with =, weekday with =, int4range(start_min, end_min) with &&
  ) where (active)
);

create table if not exists public.academie_availability_exceptions (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.academie_profiles (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- Jam sibuk dari kalender Google pribadi mentor (hanya rentang waktu, tanpa judul).
create table if not exists public.academie_mentor_busy (
  mentor_id   uuid not null references public.academie_profiles (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  primary key (mentor_id, starts_at, ends_at)
);

/* ── Sesi dan kursi peserta ──────────────────────────────── */
create sequence if not exists public.academie_session_seq;

create table if not exists public.academie_sessions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  course_id       uuid not null references public.academie_courses (id) on delete restrict,
  topic_id        uuid references public.academie_topics (id) on delete set null,
  mentor_id       uuid not null references public.academie_profiles (id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  duration_min    int  not null default 60 check (duration_min between 30 and 180),
  mode            text not null check (mode in ('private', 'group')),
  is_open         boolean not null default false,
  place           text not null default '',
  status          text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  pretest_url     text not null default '' check (pretest_url = '' or pretest_url ~* '^https?://'),
  posttest_url    text not null default '' check (posttest_url = '' or posttest_url ~* '^https?://'),
  report          text not null default '',
  followup        text not null default '',
  reported_at     timestamptz,
  mentor_ready_at timestamptz,
  cancelled_reason text not null default '',
  cancelled_by    uuid references public.academie_profiles (id) on delete set null,
  cancelled_at    timestamptz,
  created_by      uuid references public.academie_profiles (id) on delete set null,
  gcal_calendar_id text,
  gcal_event_id    text,
  gcal_kind        text check (gcal_kind in ('instance', 'single')),
  gcal_admin_event_id text,
  gcal_dirty       boolean not null default true,
  gcal_synced_at   timestamptz,
  gcal_error       text,
  created_at      timestamptz not null default now(),
  constraint academie_sessions_no_overlap exclude using gist (
    mentor_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index if not exists academie_sessions_starts_idx on public.academie_sessions (starts_at);

create table if not exists public.academie_session_students (
  session_id      uuid not null references public.academie_sessions (id) on delete cascade,
  student_id      uuid not null references public.academie_profiles (id) on delete cascade,
  payment_status  text not null default 'pending' check (payment_status in ('pending', 'paid')),
  paid_via        text check (paid_via in ('transfer', 'credit', 'admin')),
  proof_path      text,
  hold_expires_at timestamptz,
  confirmed_at    timestamptz,
  confirmed_by    uuid references public.academie_profiles (id) on delete set null,
  attendance      text check (attendance in ('present', 'absent', 'excused')),
  pretest_score   numeric check (pretest_score between 0 and 100),
  posttest_score  numeric check (posttest_score between 0 and 100),
  rating          int check (rating between 1 and 5),
  feedback        text not null default '',
  gcal_reminders_ok boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index if not exists academie_session_students_student_idx on public.academie_session_students (student_id);

-- Kredit sesi: hasil pindah jadwal atau pembatalan oleh mentor. Dipakai otomatis saat booking.
create table if not exists public.academie_credits (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.academie_profiles (id) on delete cascade,
  course_id      uuid references public.academie_courses (id) on delete set null,
  reason         text not null default '',
  source_session uuid references public.academie_sessions (id) on delete set null,
  used_session   uuid references public.academie_sessions (id) on delete set null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

/* ── Materi (admin langsung tayang, mentor perlu ditinjau) ─ */
create table if not exists public.academie_materials (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.academie_courses (id) on delete cascade,
  topic_id    uuid references public.academie_topics (id) on delete set null,
  student_id  uuid references public.academie_profiles (id) on delete cascade,
  session_id  uuid references public.academie_sessions (id) on delete set null,
  title       text not null check (length(btrim(title)) > 1),
  kind        text not null default 'ppt' check (kind in ('ppt', 'pdf', 'latihan', 'video', 'link')),
  url         text not null check (url ~* '^https?://'),
  description text not null default '',
  created_by  uuid references public.academie_profiles (id) on delete set null,
  status      text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  review_note text not null default '',
  created_at  timestamptz not null default now()
);

/* ── Pemberitahuan di dalam aplikasi ─────────────────────── */
create table if not exists public.academie_notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.academie_profiles (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  link        text not null default '',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists academie_notifications_profile_idx on public.academie_notifications (profile_id, created_at desc);

/* ── Hak mentor yang sudah ditransfer ────────────────────── */
create table if not exists public.academie_payouts (
  id              uuid primary key default gen_random_uuid(),
  mentor_id       uuid not null references public.academie_profiles (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  amount          int  not null check (amount >= 0),
  transferred_at  timestamptz not null default now(),
  note            text not null default '',
  unique (mentor_id, month)
);

/* ── Google: token per orang (tidak pernah terbaca browser) ─ */
create table if not exists public.academie_google_accounts (
  profile_id    uuid primary key references public.academie_profiles (id) on delete cascade,
  refresh_token text not null,
  google_email  text not null default '',
  calendar_id   text,
  connected_at  timestamptz not null default now(),
  last_error    text
);
create table if not exists public.academie_oauth_states (
  state      text primary key,
  profile_id uuid not null,
  return_to  text not null,
  created_at timestamptz not null default now()
);

/* ── Fungsi bantu ────────────────────────────────────────── */
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
create or replace function public.academie_in_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_session_students x where x.session_id = sid and x.student_id = public.academie_me())
$$;
create or replace function public.academie_mentors_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_sessions s where s.id = sid and s.mentor_id = public.academie_me())
$$;
-- Saya mentor dari peserta ini, atau peserta dari mentor ini (lewat sesi bersama)?
create or replace function public.academie_related(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.academie_sessions s
    join public.academie_session_students x on x.session_id = s.id
    where (s.mentor_id = public.academie_me() and x.student_id = pid)
       or (x.student_id = public.academie_me() and s.mentor_id = pid)
  )
$$;
create or replace function public.academie_enrolled(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_enrollments e where e.course_id = cid and e.student_id = public.academie_me())
$$;
create or replace function public.academie_teaches(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academie_mentor_courses m where m.course_id = cid and m.mentor_id = public.academie_me() and m.status = 'approved')
$$;

create or replace function public.academie_notify(p_profile uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.academie_notifications (profile_id, title, body, link) values (p_profile, p_title, coalesce(p_body, ''), coalesce(p_link, ''))
$$;
create or replace function public.academie_notify_admins(p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.academie_notifications (profile_id, title, body, link)
  select id, p_title, coalesce(p_body, ''), coalesce(p_link, '') from public.academie_profiles where role = 'admin' and active
$$;

/* ── Pemicu ──────────────────────────────────────────────── */
create or replace function public.academie_session_before() returns trigger
language plpgsql set search_path = public as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);
  if tg_op = 'UPDATE' and (
       new.status is distinct from old.status or new.starts_at is distinct from old.starts_at
    or new.mentor_id is distinct from old.mentor_id or new.topic_id is distinct from old.topic_id
    or new.place is distinct from old.place or new.mode is distinct from old.mode
    or new.pretest_url is distinct from old.pretest_url or new.posttest_url is distinct from old.posttest_url) then
    new.gcal_dirty := true;
  end if;
  return new;
end $$;
drop trigger if exists academie_session_before on public.academie_sessions;
create trigger academie_session_before before insert or update on public.academie_sessions
  for each row execute function public.academie_session_before();

create or replace function public.academie_check_capacity() returns trigger
language plpgsql set search_path = public as $$
declare m text; st text; n int;
begin
  select mode, status into m, st from public.academie_sessions where id = new.session_id for update;
  if st <> 'scheduled' then raise exception 'Sesi ini sudah tidak bisa diikuti'; end if;
  select count(*) into n from public.academie_session_students where session_id = new.session_id;
  if m = 'private' and n >= 1 then raise exception 'Sesi private hanya untuk satu peserta'; end if;
  if m = 'group' and n >= 5 then raise exception 'Kelas bersama sudah penuh (5 peserta)'; end if;
  return new;
end $$;
drop trigger if exists academie_capacity on public.academie_session_students;
create trigger academie_capacity before insert on public.academie_session_students
  for each row execute function public.academie_check_capacity();

create or replace function public.academie_seat_dirty() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.academie_sessions set gcal_dirty = true where id = coalesce(new.session_id, old.session_id);
  return null;
end $$;
drop trigger if exists academie_seat_dirty on public.academie_session_students;
create trigger academie_seat_dirty after insert or delete or update of payment_status on public.academie_session_students
  for each row execute function public.academie_seat_dirty();

/* ── Akun ────────────────────────────────────────────────── */
-- Dipanggil setelah login: menautkan akun ke profil yang disiapkan admin (berdasarkan email terkonfirmasi).
create or replace function public.academie_ensure_profile() returns public.academie_profiles
language plpgsql security definer set search_path = public as $$
declare p public.academie_profiles; mail text; confirmed timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.academie_profiles where user_id = auth.uid();
  if found then return p; end if;
  select lower(u.email), u.email_confirmed_at into mail, confirmed from auth.users u where u.id = auth.uid();
  if mail is null or confirmed is null then return null; end if;
  update public.academie_profiles set user_id = auth.uid() where email = mail and user_id is null returning * into p;
  return p;
end $$;

create or replace function public.academie_update_my_profile(
  p_full_name text, p_phone text, p_bio text, p_meeting_link text, p_learning_needs text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.academie_me() is null then raise exception 'Harus login'; end if;
  if p_meeting_link <> '' and p_meeting_link !~* '^https?://' then raise exception 'Tautan kelas online harus diawali https://'; end if;
  update public.academie_profiles set
    full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
    phone = regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'),
    bio = coalesce(p_bio, ''), meeting_link = coalesce(p_meeting_link, ''), learning_needs = coalesce(p_learning_needs, '')
  where id = public.academie_me();
end $$;

-- Info untuk halaman depan (tanpa login).
create or replace function public.academie_public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin_whatsapp', s.admin_whatsapp, 'admin_whatsapp_label', s.admin_whatsapp_label,
    'price_private', s.price_private, 'price_group', s.price_group,
    'mentors', (select count(*) from public.academie_profiles where role = 'mentor' and active),
    'courses', (select count(*) from public.academie_courses where active)
  ) from public.academie_settings s where s.id = 1
$$;

/* ── Booking ─────────────────────────────────────────────── */
create or replace function public.academie_expire_holds() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.academie_session_students
   where payment_status = 'pending' and hold_expires_at is not null and hold_expires_at < now();
  update public.academie_sessions s
     set status = 'cancelled', cancelled_reason = 'Tidak ada pembayaran sampai batas waktu', cancelled_at = now()
   where s.status = 'scheduled' and not exists (select 1 from public.academie_session_students x where x.session_id = s.id);
end $$;

-- Pilihan booking untuk satu mata kuliah: mentor yang kompeten, pola ketersediaan, libur, jam sibuk, sesi yang sudah ada.
create or replace function public.academie_booking_options(p_course uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mentor_ids uuid[];
begin
  if not (public.academie_is_admin() or public.academie_enrolled(p_course) or public.academie_teaches(p_course)) then
    raise exception 'Kamu belum terdaftar di mata kuliah ini. Hubungi admin.';
  end if;
  select coalesce(array_agg(p.id), '{}') into mentor_ids
    from public.academie_mentor_courses mc join public.academie_profiles p on p.id = mc.mentor_id
   where mc.course_id = p_course and mc.status = 'approved' and p.active and p.role = 'mentor';
  return jsonb_build_object(
    'mentors', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'bio', p.bio) order by p.full_name), '[]')
                  from public.academie_profiles p where p.id = any (mentor_ids)),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('mentor_id', r.mentor_id, 'weekday', r.weekday, 'start_min', r.start_min, 'end_min', r.end_min, 'modes', r.modes)), '[]')
                from public.academie_availability_rules r where r.active and r.mentor_id = any (mentor_ids)),
    'exceptions', (select coalesce(jsonb_agg(jsonb_build_object('mentor_id', e.mentor_id, 'starts_on', e.starts_on, 'ends_on', e.ends_on)), '[]')
                     from public.academie_availability_exceptions e where e.mentor_id = any (mentor_ids) and e.ends_on >= current_date - 1),
    'busy', (select coalesce(jsonb_agg(jsonb_build_object('mentor_id', b.mentor_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at)), '[]')
               from public.academie_mentor_busy b where b.mentor_id = any (mentor_ids) and b.ends_at > now()),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', s.id, 'mentor_id', s.mentor_id, 'course_id', s.course_id, 'topic_id', s.topic_id,
                    'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mode', s.mode, 'is_open', s.is_open,
                    'seats', (select count(*) from public.academie_session_students x where x.session_id = s.id))), '[]')
                 from public.academie_sessions s where s.mentor_id = any (mentor_ids) and s.status = 'scheduled' and s.ends_at > now())
  );
end $$;

-- Inti booking, dipakai oleh academie_book dan academie_reschedule.
create or replace function public.academie__book(
  p_student uuid, p_mentor uuid, p_course uuid, p_topic uuid, p_starts_at timestamptz, p_mode text, p_open boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.academie_settings; loc timestamp; tm int; wd int; s public.academie_sessions;
  sid uuid; credit uuid; paid boolean := false; new_code text; place text;
  rng tstzrange := tstzrange(p_starts_at, p_starts_at + interval '60 minutes');
begin
  select * into cfg from public.academie_settings where id = 1;
  if p_mode not in ('private', 'group') then raise exception 'Jenis kelas tidak dikenal'; end if;
  if not exists (select 1 from public.academie_profiles where id = p_student and role = 'student' and active) then
    raise exception 'Hanya akun peserta yang bisa booking';
  end if;
  if not exists (select 1 from public.academie_enrollments where student_id = p_student and course_id = p_course and status = 'active') then
    raise exception 'Kamu belum terdaftar di mata kuliah ini. Hubungi admin.';
  end if;
  if not exists (select 1 from public.academie_mentor_courses mc join public.academie_profiles p on p.id = mc.mentor_id
                  where mc.mentor_id = p_mentor and mc.course_id = p_course and mc.status = 'approved' and p.active and p.role = 'mentor') then
    raise exception 'Mentor ini tidak mengajar mata kuliah tersebut';
  end if;
  if p_topic is not null and not exists (select 1 from public.academie_topics where id = p_topic and course_id = p_course) then
    raise exception 'Topik tidak sesuai mata kuliah';
  end if;
  if p_starts_at < now() + make_interval(hours => cfg.booking_cutoff_hours) then
    raise exception 'Booking paling lambat % jam sebelum sesi dimulai', cfg.booking_cutoff_hours;
  end if;
  if p_starts_at > now() + make_interval(days => cfg.booking_horizon_days) then
    raise exception 'Booking paling jauh % hari ke depan', cfg.booking_horizon_days;
  end if;

  perform public.academie_expire_holds();

  select * into s from public.academie_sessions
   where mentor_id = p_mentor and status <> 'cancelled' and tstzrange(starts_at, ends_at) && rng
   limit 1 for update;
  if found then
    if s.starts_at = p_starts_at and s.mode = 'group' and p_mode = 'group' and s.is_open and s.course_id = p_course and s.status = 'scheduled' then
      sid := s.id;
      if exists (select 1 from public.academie_session_students where session_id = sid and student_id = p_student) then
        raise exception 'Kamu sudah terdaftar di sesi ini';
      end if;
    else
      raise exception 'Slot ini sudah terisi. Pilih jam lain.';
    end if;
  else
    loc := p_starts_at at time zone 'Asia/Jakarta';
    tm := (extract(hour from loc) * 60 + extract(minute from loc))::int;
    wd := extract(dow from loc)::int;
    if extract(second from loc) <> 0 or not exists (
      select 1 from public.academie_availability_rules r
       where r.mentor_id = p_mentor and r.active and r.weekday = wd
         and r.start_min <= tm and tm + 60 <= r.end_min and (tm - r.start_min) % 60 = 0
         and r.modes in (p_mode, 'both')) then
      raise exception 'Mentor tidak membuka slot % di jam itu', case when p_mode = 'group' then 'kelas bersama' else 'private' end;
    end if;
    if exists (select 1 from public.academie_availability_exceptions e where e.mentor_id = p_mentor and loc::date between e.starts_on and e.ends_on) then
      raise exception 'Mentor sedang libur di tanggal itu';
    end if;
    if exists (select 1 from public.academie_mentor_busy b where b.mentor_id = p_mentor and tstzrange(b.starts_at, b.ends_at) && rng) then
      raise exception 'Mentor punya keperluan lain di jam itu';
    end if;
    select meeting_link into place from public.academie_profiles where id = p_mentor;
    select c.code_key || '-' || lpad(nextval('public.academie_session_seq')::text, 4, '0') into new_code
      from public.academie_courses c where c.id = p_course;
    begin
      insert into public.academie_sessions (code, course_id, topic_id, mentor_id, starts_at, ends_at, duration_min, mode, is_open, place, created_by)
      values (new_code, p_course, p_topic, p_mentor, p_starts_at, p_starts_at + interval '60 minutes', 60, p_mode,
              case when p_mode = 'group' then coalesce(p_open, true) else false end, coalesce(place, ''), p_student)
      returning id into sid;
    exception when exclusion_violation then
      raise exception 'Slot ini baru saja diambil peserta lain. Pilih jam lain.';
    end;
  end if;

  if exists (select 1 from public.academie_session_students x join public.academie_sessions ss on ss.id = x.session_id
              where x.student_id = p_student and ss.status <> 'cancelled' and ss.id <> sid and tstzrange(ss.starts_at, ss.ends_at) && rng) then
    raise exception 'Kamu sudah punya sesi lain di jam itu';
  end if;

  select id into credit from public.academie_credits
   where student_id = p_student and used_session is null and (course_id is null or course_id = p_course)
   order by created_at limit 1 for update skip locked;
  if credit is not null then
    update public.academie_credits set used_session = sid, used_at = now() where id = credit;
    insert into public.academie_session_students (session_id, student_id, payment_status, paid_via, confirmed_at)
    values (sid, p_student, 'paid', 'credit', now());
    paid := true;
  else
    insert into public.academie_session_students (session_id, student_id, payment_status, hold_expires_at)
    values (sid, p_student, 'pending', now() + make_interval(hours => cfg.hold_hours));
  end if;
  return jsonb_build_object('session_id', sid, 'paid', paid);
end $$;

create or replace function public.academie_book(
  p_mentor uuid, p_course uuid, p_topic uuid, p_starts_at timestamptz, p_mode text, p_open boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.academie_me();
begin
  if me is null then raise exception 'Harus login'; end if;
  return public.academie__book(me, p_mentor, p_course, p_topic, p_starts_at, p_mode, p_open);
end $$;

-- Peserta mengirim bukti transfer: slot tidak lagi kedaluwarsa, menunggu admin.
create or replace function public.academie_submit_payment(p_session uuid, p_proof_path text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.academie_me(); s public.academie_sessions;
begin
  if p_proof_path is null or p_proof_path not like me::text || '/%' then raise exception 'Bukti bayar tidak sah'; end if;
  update public.academie_session_students set proof_path = p_proof_path, hold_expires_at = null
   where session_id = p_session and student_id = me and payment_status = 'pending';
  if not found then raise exception 'Booking tidak ditemukan atau sudah dibayar'; end if;
  select * into s from public.academie_sessions where id = p_session;
  perform public.academie_notify_admins('Bukti bayar masuk', s.code || ' menunggu konfirmasi pembayaran.', '/pembayaran');
end $$;

create or replace function public.academie_confirm_payment(p_session uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions;
begin
  if not public.academie_is_admin() then raise exception 'Hanya admin'; end if;
  update public.academie_session_students
     set payment_status = 'paid', paid_via = coalesce(paid_via, 'transfer'), confirmed_at = now(), confirmed_by = public.academie_me(), hold_expires_at = null
   where session_id = p_session and student_id = p_student and payment_status = 'pending';
  if not found then raise exception 'Tidak ada pembayaran yang menunggu untuk peserta ini'; end if;
  select * into s from public.academie_sessions where id = p_session;
  perform public.academie_notify(p_student, 'Pembayaran dikonfirmasi', 'Sesi ' || s.code || ' sudah pasti. Undangan Google Calendar menyusul.', '/sesi/' || p_session);
end $$;

-- Hapus kursi (tolak bayar oleh admin, atau batal oleh peserta sebelum bayar). Sesi kosong ikut batal.
create or replace function public.academie__drop_seat(p_session uuid, p_student uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.academie_session_students where session_id = p_session and student_id = p_student;
  update public.academie_sessions set status = 'cancelled', cancelled_reason = p_reason, cancelled_at = now()
   where id = p_session and status = 'scheduled'
     and not exists (select 1 from public.academie_session_students x where x.session_id = p_session);
end $$;

create or replace function public.academie_reject_payment(p_session uuid, p_student uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions;
begin
  if not public.academie_is_admin() then raise exception 'Hanya admin'; end if;
  if not exists (select 1 from public.academie_session_students where session_id = p_session and student_id = p_student and payment_status = 'pending') then
    raise exception 'Tidak ada pembayaran yang menunggu untuk peserta ini';
  end if;
  select * into s from public.academie_sessions where id = p_session;
  perform public.academie__drop_seat(p_session, p_student, 'Pembayaran ditolak');
  perform public.academie_notify(p_student, 'Pembayaran ditolak', 'Booking ' || s.code || ' dibatalkan. ' || coalesce(p_reason, ''), '/booking');
end $$;

create or replace function public.academie_cancel_pending(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.academie_me();
begin
  if not exists (select 1 from public.academie_session_students where session_id = p_session and student_id = me and payment_status = 'pending') then
    raise exception 'Hanya booking yang belum dibayar yang bisa dibatalkan. Untuk sesi yang sudah dibayar, pakai Pindah jadwal.';
  end if;
  perform public.academie__drop_seat(p_session, me, 'Dibatalkan peserta sebelum bayar');
end $$;

-- Pindah jadwal oleh peserta sampai batas waktu. Kursi lama jadi kredit, lalu langsung dipakai untuk slot baru.
create or replace function public.academie_reschedule(p_session uuid, p_mentor uuid, p_starts_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.academie_me(); cfg public.academie_settings; s public.academie_sessions; seat public.academie_session_students;
begin
  select * into cfg from public.academie_settings where id = 1;
  select * into s from public.academie_sessions where id = p_session for update;
  select * into seat from public.academie_session_students where session_id = p_session and student_id = me;
  if seat.session_id is null then raise exception 'Ini bukan sesi kamu'; end if;
  if s.status <> 'scheduled' then raise exception 'Sesi ini sudah tidak bisa dipindah'; end if;
  if s.starts_at < now() + make_interval(hours => cfg.reschedule_cutoff_hours) then
    raise exception 'Pindah jadwal paling lambat % jam sebelum sesi. Hubungi admin lewat WhatsApp.', cfg.reschedule_cutoff_hours;
  end if;
  if seat.payment_status = 'paid' then
    insert into public.academie_credits (student_id, course_id, reason, source_session) values (me, s.course_id, 'Pindah jadwal dari ' || s.code, s.id);
  end if;
  perform public.academie__drop_seat(p_session, me, 'Dipindah peserta');
  return public.academie__book(me, p_mentor, s.course_id, s.topic_id, p_starts_at, s.mode, s.is_open);
end $$;

-- Mentor (atau admin) membatalkan sesi kapan pun. Peserta yang sudah bayar mendapat kredit.
-- Mengembalikan daftar peserta untuk tombol "Kabari lewat WhatsApp".
create or replace function public.academie_cancel_session(p_session uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions; r record; out jsonb := '[]'::jsonb; who text;
begin
  select * into s from public.academie_sessions where id = p_session for update;
  if s.id is null then raise exception 'Sesi tidak ditemukan'; end if;
  if not (public.academie_is_admin() or s.mentor_id = public.academie_me()) then raise exception 'Hanya mentor sesi ini atau admin'; end if;
  if s.status <> 'scheduled' then raise exception 'Sesi ini sudah tidak aktif'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan pembatalan untuk peserta'; end if;
  update public.academie_sessions set status = 'cancelled', cancelled_reason = btrim(p_reason), cancelled_by = public.academie_me(), cancelled_at = now() where id = p_session;
  for r in select x.student_id, x.payment_status, p.full_name, p.phone from public.academie_session_students x join public.academie_profiles p on p.id = x.student_id where x.session_id = p_session loop
    if r.payment_status = 'paid' then
      insert into public.academie_credits (student_id, course_id, reason, source_session) values (r.student_id, s.course_id, 'Sesi ' || s.code || ' dibatalkan mentor', s.id);
    end if;
    perform public.academie_notify(r.student_id, 'Sesi dibatalkan', s.code || ': ' || btrim(p_reason) || case when r.payment_status = 'paid' then ' Kamu mendapat 1 kredit sesi untuk booking ulang.' else '' end, '/booking');
    out := out || jsonb_build_object('student_id', r.student_id, 'full_name', r.full_name, 'phone', r.phone, 'credit', r.payment_status = 'paid');
  end loop;
  if not public.academie_is_admin() then
    select full_name into who from public.academie_profiles where id = s.mentor_id;
    perform public.academie_notify_admins('Mentor membatalkan sesi', coalesce(who, 'Mentor') || ' membatalkan ' || s.code || ': ' || btrim(p_reason), '/sesi/' || p_session);
  end if;
  return out;
end $$;

-- Laporan sesi: status, catatan, kehadiran, nilai. Peserta tidak hadir tetap dihitung terlaksana.
create or replace function public.academie_submit_report(
  p_session uuid, p_status text, p_report text, p_followup text, p_rows jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not (public.academie_is_admin() or public.academie_mentors_session(p_session)) then
    raise exception 'Hanya mentor sesi ini atau admin yang boleh mengisi laporan';
  end if;
  if p_status not in ('scheduled', 'done') then raise exception 'Untuk membatalkan sesi, pakai tombol Batalkan sesi'; end if;
  update public.academie_sessions
     set status = p_status, report = coalesce(p_report, ''), followup = coalesce(p_followup, ''),
         reported_at = case when p_status = 'done' then now() else reported_at end
   where id = p_session and status <> 'cancelled';
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.academie_session_students
       set attendance = nullif(r->>'attendance', ''),
           pretest_score = nullif(r->>'pretest_score', '')::numeric,
           posttest_score = nullif(r->>'posttest_score', '')::numeric
     where session_id = p_session and student_id = (r->>'student_id')::uuid;
  end loop;
end $$;

create or replace function public.academie_mark_ready(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.academie_sessions set mentor_ready_at = now()
   where id = p_session and mentor_id = public.academie_me() and status = 'scheduled';
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
end $$;

create or replace function public.academie_rate_session(p_session uuid, p_rating int, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_rating not between 1 and 5 then raise exception 'Nilai 1 sampai 5'; end if;
  update public.academie_session_students x set rating = p_rating, feedback = coalesce(p_feedback, '')
    from public.academie_sessions s
   where x.session_id = p_session and x.student_id = public.academie_me() and s.id = x.session_id and s.status = 'done';
  if not found then raise exception 'Ulasan hanya bisa diberikan setelah sesi selesai'; end if;
end $$;

-- Dipakai fungsi server Google untuk memastikan panggilan terjadwal berasal dari pg_cron.
create or replace function public.academie_cron_secret_ok(p text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'academie_cron_secret' and decrypted_secret = p)
$$;

/* ── Row Level Security ──────────────────────────────────── */
alter table public.academie_settings              enable row level security;
alter table public.academie_profiles              enable row level security;
alter table public.academie_courses               enable row level security;
alter table public.academie_topics                enable row level security;
alter table public.academie_enrollments           enable row level security;
alter table public.academie_mentor_courses        enable row level security;
alter table public.academie_availability_rules    enable row level security;
alter table public.academie_availability_exceptions enable row level security;
alter table public.academie_mentor_busy           enable row level security;
alter table public.academie_sessions              enable row level security;
alter table public.academie_session_students      enable row level security;
alter table public.academie_credits               enable row level security;
alter table public.academie_materials             enable row level security;
alter table public.academie_notifications         enable row level security;
alter table public.academie_payouts               enable row level security;
alter table public.academie_google_accounts       enable row level security;
alter table public.academie_oauth_states          enable row level security;

do $$ declare t text; begin
  foreach t in array array['settings','profiles','courses','topics','enrollments','mentor_courses','availability_rules',
    'availability_exceptions','mentor_busy','sessions','session_students','credits','materials','notifications','payouts'] loop
    execute format('drop policy if exists "admin all" on public.academie_%s', t);
    execute format('create policy "admin all" on public.academie_%s for all to authenticated using (public.academie_is_admin()) with check (public.academie_is_admin())', t);
  end loop;
end $$;

drop policy if exists "read" on public.academie_settings;
create policy "read" on public.academie_settings for select to authenticated using (public.academie_me() is not null);

drop policy if exists "read" on public.academie_profiles;
create policy "read" on public.academie_profiles for select to authenticated using (user_id = auth.uid() or public.academie_related(id));

drop policy if exists "read" on public.academie_courses;
create policy "read" on public.academie_courses for select to anon, authenticated using (active);
drop policy if exists "read" on public.academie_topics;
create policy "read" on public.academie_topics for select to anon, authenticated
  using (exists (select 1 from public.academie_courses c where c.id = course_id and c.active));

drop policy if exists "read" on public.academie_enrollments;
create policy "read" on public.academie_enrollments for select to authenticated
  using (student_id = public.academie_me() or (public.academie_role() = 'mentor' and public.academie_related(student_id)));

drop policy if exists "read" on public.academie_mentor_courses;
create policy "read" on public.academie_mentor_courses for select to authenticated using (mentor_id = public.academie_me());
drop policy if exists "request" on public.academie_mentor_courses;
create policy "request" on public.academie_mentor_courses for insert to authenticated
  with check (mentor_id = public.academie_me() and status = 'pending' and public.academie_role() = 'mentor');
drop policy if exists "withdraw" on public.academie_mentor_courses;
create policy "withdraw" on public.academie_mentor_courses for delete to authenticated using (mentor_id = public.academie_me());

drop policy if exists "own" on public.academie_availability_rules;
create policy "own" on public.academie_availability_rules for all to authenticated
  using (mentor_id = public.academie_me() and public.academie_role() = 'mentor')
  with check (mentor_id = public.academie_me() and public.academie_role() = 'mentor');
drop policy if exists "own" on public.academie_availability_exceptions;
create policy "own" on public.academie_availability_exceptions for all to authenticated
  using (mentor_id = public.academie_me() and public.academie_role() = 'mentor')
  with check (mentor_id = public.academie_me() and public.academie_role() = 'mentor');
drop policy if exists "own" on public.academie_mentor_busy;
create policy "own" on public.academie_mentor_busy for select to authenticated using (mentor_id = public.academie_me());

drop policy if exists "read" on public.academie_sessions;
create policy "read" on public.academie_sessions for select to authenticated
  using (mentor_id = public.academie_me() or public.academie_in_session(id));
drop policy if exists "read" on public.academie_session_students;
create policy "read" on public.academie_session_students for select to authenticated
  using (student_id = public.academie_me() or public.academie_mentors_session(session_id));

drop policy if exists "read" on public.academie_credits;
create policy "read" on public.academie_credits for select to authenticated using (student_id = public.academie_me());

drop policy if exists "read" on public.academie_materials;
create policy "read" on public.academie_materials for select to authenticated using (
  created_by = public.academie_me()
  or (status = 'approved' and (
        student_id = public.academie_me()
     or (student_id is null and session_id is null and public.academie_enrolled(course_id))
     or (session_id is not null and (public.academie_in_session(session_id) or public.academie_mentors_session(session_id)))
     or (public.academie_role() = 'mentor' and public.academie_teaches(course_id))))
);
drop policy if exists "mentor upload" on public.academie_materials;
create policy "mentor upload" on public.academie_materials for insert to authenticated
  with check (public.academie_role() = 'mentor' and created_by = public.academie_me() and status = 'pending' and public.academie_teaches(course_id));
drop policy if exists "mentor withdraw" on public.academie_materials;
create policy "mentor withdraw" on public.academie_materials for delete to authenticated
  using (created_by = public.academie_me() and status <> 'approved');

drop policy if exists "own" on public.academie_notifications;
create policy "own" on public.academie_notifications for select to authenticated using (profile_id = public.academie_me());
drop policy if exists "mark read" on public.academie_notifications;
create policy "mark read" on public.academie_notifications for update to authenticated
  using (profile_id = public.academie_me()) with check (profile_id = public.academie_me());

drop policy if exists "own" on public.academie_payouts;
create policy "own" on public.academie_payouts for select to authenticated using (mentor_id = public.academie_me());
-- academie_google_accounts, academie_oauth_states: tanpa policy, hanya service role (fungsi server).

/* ── Bukti transfer (Storage, privat) ────────────────────── */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academie-proofs', 'academie-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists "academie proofs upload" on storage.objects;
create policy "academie proofs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'academie-proofs' and (storage.foldername(name))[1] = public.academie_me()::text);
drop policy if exists "academie proofs read" on storage.objects;
create policy "academie proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'academie-proofs' and ((storage.foldername(name))[1] = public.academie_me()::text or public.academie_is_admin()));
drop policy if exists "academie proofs admin delete" on storage.objects;
create policy "academie proofs admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'academie-proofs' and public.academie_is_admin());

/* ── Hak eksekusi ────────────────────────────────────────── */
do $$ declare f text; begin
  -- Untuk pengguna yang login.
  foreach f in array array[
    'academie_me()', 'academie_role()', 'academie_is_admin()', 'academie_in_session(uuid)', 'academie_mentors_session(uuid)',
    'academie_related(uuid)', 'academie_enrolled(uuid)', 'academie_teaches(uuid)', 'academie_ensure_profile()',
    'academie_update_my_profile(text, text, text, text, text)', 'academie_booking_options(uuid)',
    'academie_book(uuid, uuid, uuid, timestamptz, text, boolean)', 'academie_submit_payment(uuid, text)',
    'academie_confirm_payment(uuid, uuid)', 'academie_reject_payment(uuid, uuid, text)', 'academie_cancel_pending(uuid)',
    'academie_reschedule(uuid, uuid, timestamptz)', 'academie_cancel_session(uuid, text)',
    'academie_submit_report(uuid, text, text, text, jsonb)', 'academie_mark_ready(uuid)', 'academie_rate_session(uuid, int, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Internal: tidak bisa dipanggil lewat API.
  foreach f in array array[
    'academie__book(uuid, uuid, uuid, uuid, timestamptz, text, boolean)', 'academie__drop_seat(uuid, uuid, text)',
    'academie_expire_holds()', 'academie_notify(uuid, text, text, text)', 'academie_notify_admins(text, text, text)',
    'academie_session_before()', 'academie_check_capacity()', 'academie_seat_dirty()', 'academie_cron_secret_ok(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public.academie_cron_secret_ok(text) to service_role;
grant execute on function public.academie_expire_holds() to service_role;
-- Halaman depan tanpa login.
revoke execute on function public.academie_public_info() from public;
grant execute on function public.academie_public_info() to anon, authenticated;

/* ── Admin pertama ───────────────────────────────────────── */
-- Ganti email ini dengan email admin bila memasang di project lain.
insert into public.academie_profiles (email, full_name, role, phone)
values ('rasendriya465@gmail.com', 'Admin IE.Academie', 'admin', '+6285967072383')
on conflict (email) do nothing;

/* ── Tugas terjadwal ─────────────────────────────────────── */
-- Rahasia acak supaya fungsi Google hanya menerima panggilan dari pg_cron.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'academie_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'academie_cron_secret', 'IE.Academie cron to edge function');
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname in ('academie-expire-holds', 'academie-gcal');
-- Lepas slot yang tidak dibayar sampai batas waktu.
select cron.schedule('academie-expire-holds', '*/10 * * * *', $c$ select public.academie_expire_holds() $c$);
-- Sinkron Google Calendar. Ganti <PROJECT_REF> dengan ref project Supabase.
select cron.schedule('academie-gcal', '*/15 * * * *', $c$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/academie-gcal/cron',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academie_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 55000)
$c$);
