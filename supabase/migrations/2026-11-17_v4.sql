-- IE.Academie v4
-- 1. Slot diatur mentor/admin: jenis kelas, kelas bersama terbuka/tertutup, tempat (online, offline, dibahas lewat WhatsApp),
--    dan masa berlaku (mulai, sampai). Peserta tidak lagi memilih terbuka/tertutup.
-- 2. Tempat per sesi bisa diubah mentor sesi itu atau admin.
-- 3. Pemberitahuan saat kelas bersama tinggal 1 kursi dan saat penuh.
-- 4. Pusat data admin: riwayat perubahan (audit) yang bisa dikembalikan, log galat dari browser, cek kesehatan data.

/* ── 1. Pola ketersediaan ────────────────────────────────── */
alter table public.academie_availability_rules
  add column if not exists group_open boolean not null default true,
  add column if not exists place_kind text not null default 'online',
  add column if not exists place      text not null default '',
  add column if not exists valid_from date not null default ((now() at time zone 'Asia/Jakarta')::date),
  add column if not exists valid_until date;
update public.academie_availability_rules set valid_from = (created_at at time zone 'Asia/Jakarta')::date
 where valid_from = (now() at time zone 'Asia/Jakarta')::date and created_at < now() - interval '1 minute';
do $$ begin
  alter table public.academie_availability_rules add constraint academie_rules_place_kind check (place_kind in ('online', 'offline', 'diskusi'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.academie_availability_rules add constraint academie_rules_valid_range check (valid_until is null or valid_until >= valid_from);
exception when duplicate_object then null; end $$;
-- Dua pola di jam yang sama boleh asal masa berlakunya tidak bertumpuk.
alter table public.academie_availability_rules drop constraint if exists academie_rules_no_overlap;
alter table public.academie_availability_rules add constraint academie_rules_no_overlap exclude using gist (
  mentor_id with =, weekday with =, int4range(start_min, end_min) with &&, daterange(valid_from, valid_until, '[]') with &&
) where (active);

/* ── 2. Tempat sesi ──────────────────────────────────────── */
alter table public.academie_sessions add column if not exists place_kind text not null default 'online';
do $$ begin
  alter table public.academie_sessions add constraint academie_sessions_place_kind check (place_kind in ('online', 'offline', 'diskusi'));
exception when duplicate_object then null; end $$;
update public.academie_sessions set place_kind = 'offline' where place <> '' and place !~* '^https?://' and place_kind = 'online';

create or replace function public.academie_session_before() returns trigger
language plpgsql set search_path = public as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);
  if tg_op = 'UPDATE' and (
       new.status is distinct from old.status or new.starts_at is distinct from old.starts_at
    or new.mentor_id is distinct from old.mentor_id or new.topic_id is distinct from old.topic_id
    or new.place is distinct from old.place or new.place_kind is distinct from old.place_kind or new.mode is distinct from old.mode
    or new.pretest_url is distinct from old.pretest_url or new.posttest_url is distinct from old.posttest_url) then
    new.gcal_dirty := true;
  end if;
  return new;
end $$;

-- Mentor sesi itu atau admin mengubah tempat. Peserta sesi diberi tahu.
create or replace function public.academie_set_session_place(p_session uuid, p_kind text, p_place text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions; v text := btrim(coalesce(p_place, ''));
begin
  select * into s from public.academie_sessions where id = p_session;
  if s.id is null then raise exception 'Sesi tidak ditemukan'; end if;
  if not (public.academie_is_admin() or s.mentor_id = public.academie_me()) then raise exception 'Hanya mentor sesi ini atau admin'; end if;
  if s.status = 'cancelled' then raise exception 'Sesi sudah dibatalkan'; end if;
  if p_kind not in ('online', 'offline', 'diskusi') then raise exception 'Jenis tempat tidak dikenal'; end if;
  if p_kind = 'online' and v <> '' and v !~* '^https?://' then raise exception 'Tautan kelas online harus diawali https://'; end if;
  if length(v) > 300 then raise exception 'Tempat terlalu panjang (maks 300 karakter)'; end if;
  if s.place_kind = p_kind and s.place = v then return; end if;
  update public.academie_sessions set place_kind = p_kind, place = v where id = p_session;
  insert into public.academie_notifications (profile_id, title, body, link)
  select x.student_id, 'Tempat sesi ' || s.code || ' diperbarui',
         case p_kind when 'diskusi' then 'Tempat dibahas bersama mentor lewat WhatsApp.' when 'offline' then 'Tempat: ' || v else 'Kelas online' || case when v <> '' then ': ' || v else '' end end,
         '/sesi/' || s.id
    from public.academie_session_students x where x.session_id = p_session;
end $$;

/* ── Pilihan booking dan booking ─────────────────────────── */
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
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('mentor_id', r.mentor_id, 'weekday', r.weekday, 'start_min', r.start_min, 'end_min', r.end_min,
                  'modes', r.modes, 'group_open', r.group_open, 'place_kind', r.place_kind, 'valid_from', r.valid_from, 'valid_until', r.valid_until)), '[]')
                from public.academie_availability_rules r
               where r.active and r.mentor_id = any (mentor_ids) and (r.valid_until is null or r.valid_until >= current_date - 1)),
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

create or replace function public.academie__book(
  p_student uuid, p_mentor uuid, p_course uuid, p_topic uuid, p_starts_at timestamptz, p_mode text, p_open boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.academie_settings; loc timestamp; tm int; wd int; s public.academie_sessions; r public.academie_availability_rules;
  sid uuid; credit uuid; paid boolean := false; new_code text; link text;
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
    elsif s.mode = 'group' and s.starts_at = p_starts_at and (select count(*) from public.academie_session_students x where x.session_id = s.id) >= 5 then
      raise exception 'Kelas bersama ini sudah penuh (5 peserta). Pilih jam lain.';
    elsif s.mode = 'group' and s.starts_at = p_starts_at and not s.is_open then
      raise exception 'Kelas bersama ini tertutup. Minta admin bila ingin bergabung.';
    else
      raise exception 'Slot ini sudah terisi. Pilih jam lain.';
    end if;
  else
    loc := p_starts_at at time zone 'Asia/Jakarta';
    tm := (extract(hour from loc) * 60 + extract(minute from loc))::int;
    wd := extract(dow from loc)::int;
    if extract(second from loc) <> 0 then raise exception 'Jam mulai tidak sah'; end if;
    select * into r from public.academie_availability_rules x
     where x.mentor_id = p_mentor and x.active and x.weekday = wd
       and x.start_min <= tm and tm + 60 <= x.end_min and (tm - x.start_min) % 60 = 0
       and loc::date >= x.valid_from and (x.valid_until is null or loc::date <= x.valid_until)
       and x.modes in (p_mode, 'both')
     limit 1;
    if r.id is null then
      raise exception 'Mentor tidak membuka slot % di jam itu', case when p_mode = 'group' then 'kelas bersama' else 'private' end;
    end if;
    if exists (select 1 from public.academie_availability_exceptions e where e.mentor_id = p_mentor and loc::date between e.starts_on and e.ends_on) then
      raise exception 'Mentor sedang libur di tanggal itu';
    end if;
    if exists (select 1 from public.academie_mentor_busy b where b.mentor_id = p_mentor and tstzrange(b.starts_at, b.ends_at) && rng) then
      raise exception 'Mentor punya keperluan lain di jam itu';
    end if;
    select meeting_link into link from public.academie_profiles where id = p_mentor;
    select c.code_key || '-' || lpad(nextval('public.academie_session_seq')::text, 4, '0') into new_code
      from public.academie_courses c where c.id = p_course;
    begin
      insert into public.academie_sessions (code, course_id, topic_id, mentor_id, starts_at, ends_at, duration_min, mode, is_open, place_kind, place, created_by)
      values (new_code, p_course, p_topic, p_mentor, p_starts_at, p_starts_at + interval '60 minutes', 60, p_mode,
              case when p_mode = 'group' then r.group_open else false end,
              r.place_kind,
              case when r.place <> '' then r.place when r.place_kind = 'online' then coalesce(link, '') else '' end,
              p_student)
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

/* ── 3. Kursi kelas bersama hampir penuh / penuh ────────── */
create or replace function public.academie_seat_count_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions; n int; t text;
begin
  select * into s from public.academie_sessions where id = new.session_id;
  if s.mode <> 'group' then return null; end if;
  select count(*) into n from public.academie_session_students where session_id = new.session_id;
  if n = 4 then t := 'Kelas bersama ' || s.code || ' tinggal 1 kursi (4/5)';
  elsif n = 5 then t := 'Kelas bersama ' || s.code || ' penuh (5/5)';
  else return null; end if;
  perform public.academie_notify(s.mentor_id, t, 'Lihat daftar peserta di halaman sesi.', '/sesi/' || s.id);
  perform public.academie_notify_admins(t, 'Lihat daftar peserta di halaman sesi.', '/sesi/' || s.id);
  return null;
end $$;
drop trigger if exists academie_seat_count_notice on public.academie_session_students;
create trigger academie_seat_count_notice after insert on public.academie_session_students
  for each row execute function public.academie_seat_count_notice();

/* ── 4a. Riwayat perubahan (audit) ───────────────────────── */
create table if not exists public.academie_audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       uuid,                 -- profil yang mengubah (kosong = sistem / jadwal otomatis)
  actor_uid   uuid,
  tbl         text not null,
  op          text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_id      text not null,
  old         jsonb,
  new         jsonb,
  restored_at timestamptz,
  restored_by uuid
);
create index if not exists academie_audit_at_idx on public.academie_audit (at desc);
create index if not exists academie_audit_row_idx on public.academie_audit (tbl, row_id);
alter table public.academie_audit enable row level security;
drop policy if exists "admin read" on public.academie_audit;
create policy "admin read" on public.academie_audit for select to authenticated using (public.academie_is_admin());

-- Kolom yang berubah sendiri oleh sinkron Google tidak dicatat.
create or replace function public.academie__audit_strip(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(j) as e(k, v)
   where k not like 'gcal\_%' and k not in ('prefs', 'start_min', 'end_min')
$$;

create or replace function public.academie__row_id(tbl text, j jsonb) returns text
language sql immutable set search_path = public as $$
  select case tbl
    when 'academie_session_students' then (j->>'session_id') || ':' || (j->>'student_id')
    when 'academie_mentor_courses' then (j->>'mentor_id') || ':' || (j->>'course_id')
    else j->>'id' end
$$;

create or replace function public.academie_audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and public.academie__audit_strip(o) = public.academie__audit_strip(n) then return null; end if;
  insert into public.academie_audit (actor, actor_uid, tbl, op, row_id, old, new)
  values (public.academie_me(), auth.uid(), tg_table_name, tg_op, public.academie__row_id(tg_table_name, coalesce(n, o)), o, n);
  return null;
exception when others then
  return null; -- jangan pernah menggagalkan perubahan karena catatan audit
end $$;

do $$ declare t text; begin
  foreach t in array array['settings','profiles','courses','topics','enrollments','mentor_courses','availability_rules',
    'availability_exceptions','sessions','session_students','credits','materials','payouts'] loop
    execute format('drop trigger if exists academie_audit on public.academie_%s', t);
    execute format('create trigger academie_audit after insert or update or delete on public.academie_%s for each row execute function public.academie_audit_row()', t);
  end loop;
end $$;

-- Kembalikan satu perubahan: UPDATE -> nilai lama, DELETE -> baris dikembalikan, INSERT -> baris dihapus.
create or replace function public.academie_audit_restore(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare a public.academie_audit; cols text; sets text; keys text[]; keyexpr text; n int;
begin
  if not public.academie_is_admin() then raise exception 'Hanya admin'; end if;
  select * into a from public.academie_audit where id = p_id;
  if a.id is null then raise exception 'Catatan tidak ditemukan'; end if;
  if a.restored_at is not null then raise exception 'Perubahan ini sudah dikembalikan'; end if;
  if a.tbl not in ('academie_settings','academie_profiles','academie_courses','academie_topics','academie_enrollments','academie_mentor_courses',
    'academie_availability_rules','academie_availability_exceptions','academie_sessions','academie_session_students','academie_credits',
    'academie_materials','academie_payouts') then raise exception 'Tabel ini tidak bisa dikembalikan'; end if;
  keys := case a.tbl when 'academie_session_students' then array['session_id', 'student_id']
                     when 'academie_mentor_courses' then array['mentor_id', 'course_id'] else array['id'] end;
  keyexpr := (select string_agg(format('t.%I::text', k), ' || '':'' || ') from unnest(keys) k);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = a.tbl and is_generated = 'NEVER';
  if a.op = 'INSERT' then
    execute format('delete from public.%I t where %s = $1', a.tbl, keyexpr) using a.row_id;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Baris sudah tidak ada'; end if;
  elsif a.op = 'DELETE' then
    begin
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', a.tbl, cols, cols, a.tbl) using a.old;
    exception when unique_violation then raise exception 'Baris dengan kunci yang sama sudah ada';
    end;
  else
    select string_agg(format('%I = r.%I', column_name, column_name), ', ' order by ordinal_position) into sets
      from information_schema.columns where table_schema = 'public' and table_name = a.tbl and is_generated = 'NEVER'
       and column_name <> all (keys);
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where %s = $2', a.tbl, sets, a.tbl, keyexpr)
      using a.old, a.row_id;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Baris sudah tidak ada. Kembalikan catatan hapusnya dulu.'; end if;
  end if;
  update public.academie_audit set restored_at = now(), restored_by = public.academie_me() where id = p_id;
  return 'ok';
end $$;

/* ── 4b. Log galat dari browser ──────────────────────────── */
create table if not exists public.academie_error_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  profile_id  uuid references public.academie_profiles (id) on delete set null,
  path        text not null default '',
  message     text not null,
  detail      text not null default '',
  user_agent  text not null default '',
  resolved_at timestamptz
);
create index if not exists academie_error_log_at_idx on public.academie_error_log (created_at desc);
alter table public.academie_error_log enable row level security;
drop policy if exists "admin all" on public.academie_error_log;
create policy "admin all" on public.academie_error_log for all to authenticated using (public.academie_is_admin()) with check (public.academie_is_admin());

-- Siapa pun yang login boleh mengirim galat, maksimal 30 per 10 menit.
create or replace function public.academie_log_error(p_path text, p_message text, p_detail text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.academie_me();
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.academie_error_log where profile_id is not distinct from me and created_at > now() - interval '10 minutes') >= 30 then return; end if;
  insert into public.academie_error_log (profile_id, path, message, detail, user_agent)
  values (me, left(coalesce(p_path, ''), 200), left(coalesce(nullif(p_message, ''), '(tanpa pesan)'), 500), left(coalesce(p_detail, ''), 4000), left(coalesce(p_ua, ''), 300));
end $$;

/* ── 4c. Cek kesehatan data ──────────────────────────────── */
create or replace function public.academie_health() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; today date := (now() at time zone 'Asia/Jakarta')::date;
  procedure_items jsonb; c int;
begin
  if not public.academie_is_admin() then raise exception 'Hanya admin'; end if;

  -- Kursi melebihi kapasitas
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code || ' · ' || n || ' peserta', 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from (select s.id, s.code, s.mode, (select count(*) from academie_session_students x where x.session_id = s.id) n
            from academie_sessions s where s.status <> 'cancelled') s
   where (s.mode = 'group' and s.n > 5) or (s.mode = 'private' and s.n > 1);
  if c > 0 then out := out || jsonb_build_object('key', 'over', 'level', 'bad', 'title', 'Kursi melebihi kapasitas', 'detail', 'Private maksimal 1, kelas bersama maksimal 5. Pindahkan atau hapus kursi yang berlebih.', 'count', c, 'items', procedure_items); end if;

  -- Sesi terjadwal tanpa peserta
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code, 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from academie_sessions s where s.status = 'scheduled' and s.ends_at > now()
     and not exists (select 1 from academie_session_students x where x.session_id = s.id);
  if c > 0 then out := out || jsonb_build_object('key', 'empty', 'level', 'warn', 'title', 'Sesi tanpa peserta', 'detail', 'Biasanya batal otomatis. Batalkan dari halaman sesi bila masih ada.', 'count', c, 'items', procedure_items); end if;

  -- Laporan belum diisi lebih dari 24 jam setelah sesi
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code || ' · ' || p.full_name, 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from academie_sessions s join academie_profiles p on p.id = s.mentor_id
   where s.status = 'scheduled' and s.ends_at < now() - interval '24 hours';
  if c > 0 then out := out || jsonb_build_object('key', 'report', 'level', 'warn', 'title', 'Laporan sesi belum diisi', 'detail', 'Sesi sudah lewat lebih dari 24 jam. Ingatkan mentornya atau isi sendiri.', 'count', c, 'items', procedure_items); end if;

  -- Bukti bayar menunggu lebih dari 24 jam
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code || ' · ' || p.full_name, 'link', '/pembayaran')), '[]') into c, procedure_items
    from academie_session_students x join academie_sessions s on s.id = x.session_id join academie_profiles p on p.id = x.student_id
   where x.payment_status = 'pending' and x.proof_path is not null and x.joined_at < now() - interval '24 hours' and s.status <> 'cancelled';
  if c > 0 then out := out || jsonb_build_object('key', 'proof', 'level', 'warn', 'title', 'Bukti bayar belum dicek', 'detail', 'Lebih dari 24 jam menunggu konfirmasi admin.', 'count', c, 'items', procedure_items); end if;

  -- Slot ditahan yang sudah lewat batas (jadwal otomatis tidak berjalan?)
  select count(*) into c from academie_session_students where payment_status = 'pending' and hold_expires_at < now() - interval '30 minutes';
  if c > 0 then out := out || jsonb_build_object('key', 'holds', 'level', 'bad', 'title', 'Slot ditahan melewati batas', 'detail', 'Jadwal otomatis pelepas slot mungkin berhenti. Cek pg_cron "academie-expire-holds".', 'count', c, 'items', '[]'::jsonb); end if;

  -- Peserta punya dua sesi bertumpuk
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', p.full_name || ' · ' || a.code || ' & ' || b.code, 'link', '/orang/' || p.id)), '[]') into c, procedure_items
    from academie_session_students xa join academie_sessions a on a.id = xa.session_id
    join academie_session_students xb on xb.student_id = xa.student_id and xb.session_id > xa.session_id
    join academie_sessions b on b.id = xb.session_id
    join academie_profiles p on p.id = xa.student_id
   where a.status <> 'cancelled' and b.status <> 'cancelled' and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at);
  if c > 0 then out := out || jsonb_build_object('key', 'overlap', 'level', 'bad', 'title', 'Jadwal peserta bertumpuk', 'detail', 'Satu peserta ada di dua sesi pada jam yang sama.', 'count', c, 'items', procedure_items); end if;

  -- Sudah bayar di sesi batal tanpa kredit
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code || ' · ' || p.full_name, 'link', '/orang/' || p.id)), '[]') into c, procedure_items
    from academie_session_students x join academie_sessions s on s.id = x.session_id join academie_profiles p on p.id = x.student_id
   where s.status = 'cancelled' and x.payment_status = 'paid'
     and not exists (select 1 from academie_credits k where k.student_id = x.student_id and k.source_session = s.id);
  if c > 0 then out := out || jsonb_build_object('key', 'credit', 'level', 'bad', 'title', 'Sudah bayar, sesi batal, belum dapat kredit', 'detail', 'Beri kredit dari halaman peserta.', 'count', c, 'items', procedure_items); end if;

  -- Sesi 48 jam ke depan tanpa link pretest/posttest
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code, 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from academie_sessions s left join academie_topics t on t.id = s.topic_id
   where s.status = 'scheduled' and s.starts_at between now() and now() + interval '48 hours'
     and (coalesce(nullif(s.pretest_url, ''), t.pretest_url, '') = '' or coalesce(nullif(s.posttest_url, ''), t.posttest_url, '') = '');
  if c > 0 then out := out || jsonb_build_object('key', 'tests', 'level', 'warn', 'title', 'Link pretest/posttest belum ada', 'detail', 'Sesi dalam 48 jam ke depan. Mentor mengisi di halaman sesi, atau admin di katalog topik.', 'count', c, 'items', procedure_items); end if;

  -- Sesi 48 jam ke depan tanpa tempat
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code, 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from academie_sessions s
   where s.status = 'scheduled' and s.starts_at between now() and now() + interval '48 hours' and s.place_kind <> 'diskusi' and s.place = '';
  if c > 0 then out := out || jsonb_build_object('key', 'place', 'level', 'warn', 'title', 'Tempat atau tautan kelas belum diisi', 'detail', 'Sesi dalam 48 jam ke depan.', 'count', c, 'items', procedure_items); end if;

  -- Galat Google Calendar
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', s.code || ': ' || left(s.gcal_error, 80), 'link', '/sesi/' || s.id)), '[]') into c, procedure_items
    from academie_sessions s where s.gcal_error is not null and s.status = 'scheduled' and s.ends_at > now();
  if c > 0 then out := out || jsonb_build_object('key', 'gcal', 'level', 'warn', 'title', 'Sesi gagal ditulis ke Google Calendar', 'detail', 'Jadwal otomatis mengulang tiap 15 menit. Bila tetap gagal, minta mentor menyambungkan ulang Google.', 'count', c, 'items', procedure_items); end if;
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', p.full_name || ': ' || left(g.last_error, 80), 'link', '/orang/' || p.id)), '[]') into c, procedure_items
    from academie_google_accounts g join academie_profiles p on p.id = g.profile_id where g.last_error is not null;
  if c > 0 then out := out || jsonb_build_object('key', 'gacc', 'level', 'warn', 'title', 'Sambungan Google bermasalah', 'detail', 'Pemilik akun perlu menyambungkan ulang di halaman Akun.', 'count', c, 'items', procedure_items); end if;

  -- Peserta di mata kuliah tanpa mentor
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', c2.code_key || ' · ' || c2.title, 'link', '/mentor')), '[]') into c, procedure_items
    from (select distinct e.course_id from academie_enrollments e where e.status = 'active') e join academie_courses c2 on c2.id = e.course_id
   where not exists (select 1 from academie_mentor_courses mc join academie_profiles p on p.id = mc.mentor_id
                      where mc.course_id = e.course_id and mc.status = 'approved' and p.active);
  if c > 0 then out := out || jsonb_build_object('key', 'nomentor', 'level', 'warn', 'title', 'Mata kuliah peserta belum punya mentor', 'detail', 'Peserta tidak bisa booking sampai ada mentor yang disetujui.', 'count', c, 'items', procedure_items); end if;

  -- Mentor tanpa jam tersedia ke depan
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', p.full_name, 'link', '/orang/' || p.id)), '[]') into c, procedure_items
    from academie_profiles p where p.role = 'mentor' and p.active
     and exists (select 1 from academie_mentor_courses mc where mc.mentor_id = p.id and mc.status = 'approved')
     and not exists (select 1 from academie_availability_rules r where r.mentor_id = p.id and r.active and (r.valid_until is null or r.valid_until >= today));
  if c > 0 then out := out || jsonb_build_object('key', 'norules', 'level', 'info', 'title', 'Mentor belum membuka jam', 'detail', 'Mentor yang disetujui tetapi tidak punya jam tersedia ke depan.', 'count', c, 'items', procedure_items); end if;

  -- Jam mentor berakhir dalam 7 hari
  select count(*), coalesce(jsonb_agg(jsonb_build_object('label', p.full_name || ' · berakhir ' || to_char(r.valid_until, 'DD-MM-YYYY'), 'link', '/orang/' || p.id)), '[]') into c, procedure_items
    from academie_availability_rules r join academie_profiles p on p.id = r.mentor_id
   where r.active and r.valid_until between today and today + 7;
  if c > 0 then out := out || jsonb_build_object('key', 'ending', 'level', 'info', 'title', 'Jam mentor segera berakhir', 'detail', 'Perpanjang di Ketersediaan bila mentor masih mengajar.', 'count', c, 'items', procedure_items); end if;

  -- Galat browser 7 hari terakhir
  select count(*) into c from academie_error_log where resolved_at is null and created_at > now() - interval '7 days';
  if c > 0 then out := out || jsonb_build_object('key', 'client', 'level', 'warn', 'title', 'Galat di browser pengguna', 'detail', 'Lihat tab Log galat.', 'count', c, 'items', '[]'::jsonb); end if;

  -- Panggilan jadwal otomatis yang gagal (24 jam)
  begin
    execute 'select count(*) from net._http_response where created > now() - interval ''24 hours'' and (status_code >= 400 or error_msg is not null)' into c;
    if c > 0 then out := out || jsonb_build_object('key', 'cron', 'level', 'warn', 'title', 'Sinkron Google otomatis gagal', 'detail', 'Panggilan ke fungsi academie-gcal gagal dalam 24 jam terakhir. Cek log Edge Functions di Supabase.', 'count', c, 'items', '[]'::jsonb); end if;
  exception when others then null;
  end;

  return out;
end $$;

/* ── Izin fungsi ─────────────────────────────────────────── */
do $$ declare f text; begin
  foreach f in array array['academie_set_session_place(uuid, text, text)', 'academie_audit_restore(bigint)',
    'academie_log_error(text, text, text, text)', 'academie_health()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.academie_audit_row() from public, anon, authenticated;
revoke execute on function public.academie_seat_count_notice() from public, anon, authenticated;

/* ── Pembersihan berkala ─────────────────────────────────── */
do $$ begin
  perform cron.unschedule('academie-retention');
exception when others then null; end $$;
select cron.schedule('academie-retention', '17 3 * * 0', $c$
  delete from public.academie_audit where at < now() - interval '180 days';
  delete from public.academie_error_log where created_at < now() - interval '90 days';
$c$);

/* ── 5. Jam mentor: hak mentor, admin hanya membaca ──────── */
-- Admin melihat semua jam dan libur mentor tetapi tidak mengubahnya. Pemulihan data rusak tetap lewat academie_audit_restore.
do $$ declare t text; begin
  foreach t in array array['availability_rules', 'availability_exceptions'] loop
    execute format('drop policy if exists "admin all" on public.academie_%s', t);
    execute format('drop policy if exists "admin read" on public.academie_%s', t);
    execute format('create policy "admin read" on public.academie_%s for select to authenticated using (public.academie_is_admin())', t);
  end loop;
end $$;

/* ── 6. Ringkasan integrasi untuk admin ──────────────────── */
create or replace function public.academie_integrations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare jobs jsonb := '[]'::jsonb;
begin
  if not public.academie_is_admin() then raise exception 'Hanya admin'; end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
             'last_status', d.status, 'last_run', d.end_time, 'last_message', left(coalesce(d.return_message, ''), 160),
             'failed_24h', (select count(*) from cron.job_run_details x where x.jobid = j.jobid and x.status = 'failed' and x.start_time > now() - interval '24 hours'))
           order by j.jobname), '[]')
      into jobs
      from cron.job j
      left join lateral (select * from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 1) d on true
     where j.jobname like 'academie%';
  exception when others then jobs := '[]'::jsonb;
  end;
  return jsonb_build_object(
    'google', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'email', g.google_email,
                 'connected_at', g.connected_at, 'calendar', g.calendar_id is not null, 'last_error', g.last_error) order by p.role, p.full_name), '[]')
               from public.academie_google_accounts g join public.academie_profiles p on p.id = g.profile_id),
    'mentors_without_google', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]') from public.academie_profiles p
               where p.role = 'mentor' and p.active and not exists (select 1 from public.academie_google_accounts g where g.profile_id = p.id)),
    'jobs', jobs,
    'sync_pending', (select count(*) from public.academie_sessions where gcal_dirty and status <> 'cancelled' and ends_at > now()),
    'sync_errors', (select count(*) from public.academie_sessions where gcal_error is not null and status = 'scheduled' and ends_at > now()),
    'last_sync', (select max(gcal_synced_at) from public.academie_sessions),
    'audit_rows', (select count(*) from public.academie_audit),
    'errors_open', (select count(*) from public.academie_error_log where resolved_at is null)
  );
end $$;
revoke execute on function public.academie_integrations() from public, anon;
grant execute on function public.academie_integrations() to authenticated;
