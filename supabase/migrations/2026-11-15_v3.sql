-- IE.Academie v3: katalog S1 DTSI ITS, tema & teks situs, preferensi per orang,
-- to-do pribadi, link tes oleh mentor. Aman dijalankan ulang.

/* ── Katalog: semester dan wajib/pilihan ─────────────────── */
alter table public.academie_courses add column if not exists semester smallint check (semester between 1 and 8);
alter table public.academie_courses add column if not exists kind text not null default 'wajib' check (kind in ('wajib', 'pilihan'));

-- Nama resmi kurikulum S1 Departemen Teknik Sistem dan Industri ITS (jadwal Gasal 2026/2027).
update public.academie_courses set title = 'Aljabar Linier', semester = 3 where code = 'ALIN';
update public.academie_courses set semester = 1 where code in ('MGT', 'KAL1', 'FIS');
update public.academie_courses set semester = 2 where code = 'KAL2';
update public.academie_courses set code = 'PTSI', title = 'Pengantar Teknik Sistem dan Industri', semester = 1 where code = 'PTI';
update public.academie_courses set code = 'STAT1', title = 'Statistika 1', semester = 1 where code = 'STI1';
update public.academie_courses set code = 'STAT2', title = 'Statistika 2', semester = 2 where code = 'STI2';
update public.academie_courses set semester = 3 where code in ('PO1', 'K3');
update public.academie_courses set semester = 4 where code = 'PO2';
update public.academie_courses set semester = 5 where code = 'MPR';
update public.academie_courses set code = 'SSI', title = 'Simulasi Sistem Industri', semester = 5 where code = 'SIM';
update public.academie_courses set code = 'TTCPK', title = 'Teknik Tata Cara dan Pengukuran Kerja', semester = 3 where code = 'APK';
update public.academie_courses set code = 'PF', title = 'Perencanaan Fasilitas', semester = 5 where code = 'TLF';
update public.academie_courses set code = 'SLOG', title = 'Sistem Logistik', semester = 5 where code = 'SCM';
update public.academie_courses set title = 'Analisa Keputusan', kind = 'pilihan' where code = 'AK';
update public.academie_courses set kind = 'pilihan' where code = 'MK';

insert into public.academie_courses (code, title, category, color, semester, kind) values
  ('STAT3', 'Statistika 3', 'Statistika', 'sky', 3, 'wajib'),
  ('APROG', 'Algoritma dan Pemrograman Komputer', 'Dasar', 'slate', 3, 'wajib'),
  ('SMAN', 'Sistem Manufaktur', 'Produksi', 'amber', 3, 'wajib'),
  ('AEB', 'Analisis dan Estimasi Biaya', 'Ekonomi dan Manajemen', 'green', 3, 'wajib'),
  ('OTIN', 'Otomasi Industri', 'Produksi', 'amber', 5, 'wajib'),
  ('PIND', 'Perencanaan Industri', 'Riset', 'violet', 7, 'wajib'),
  ('MOSDM', 'Manajemen Organisasi dan Sumber Daya Manusia', 'Manusia dan Kerja', 'coral', 7, 'wajib'),
  ('SIB', 'Sistem Industri Berkelanjutan', 'Produksi', 'green', 7, 'wajib'),
  ('AEI', 'Aplikasi Ergonomi Industri', 'Manusia dan Kerja', 'coral', null, 'pilihan'),
  ('MJS', 'Manajemen Jasa', 'Ekonomi dan Manajemen', 'green', null, 'pilihan'),
  ('OMH', 'Optimasi Metaheuristik', 'Optimasi', 'violet', null, 'pilihan'),
  ('MRK', 'Manajemen Risiko Korporat', 'Ekonomi dan Manajemen', 'green', null, 'pilihan'),
  ('TP', 'Teori Permainan', 'Optimasi', 'violet', null, 'pilihan'),
  ('MSD', 'Metodologi Sistem Dinamik', 'Optimasi', 'violet', null, 'pilihan'),
  ('ERGK', 'Ergonomi Kognitif', 'Manusia dan Kerja', 'coral', null, 'pilihan'),
  ('MPG', 'Manajemen Pengetahuan', 'Ekonomi dan Manajemen', 'green', null, 'pilihan'),
  ('FMPP', 'Faktor Manusia dalam Perancangan Produk', 'Manusia dan Kerja', 'coral', null, 'pilihan'),
  ('CE', 'Concurrent Engineering', 'Produksi', 'amber', null, 'pilihan'),
  ('PKMK', 'Pengambilan Keputusan Multi Kriteria', 'Optimasi', 'violet', null, 'pilihan'),
  ('MMP', 'Manajemen Material dan Pengadaan', 'Produksi', 'amber', null, 'pilihan'),
  ('RSCM', 'Retail Supply Chain Management', 'Ekonomi dan Manajemen', 'green', null, 'pilihan'),
  ('RPM', 'Revenue and Pricing Management', 'Ekonomi dan Manajemen', 'green', null, 'pilihan')
on conflict do nothing;

/* ── Tema dan teks situs (diatur admin) ──────────────────── */
alter table public.academie_settings add column if not exists theme jsonb not null default '{}'::jsonb;
alter table public.academie_settings add column if not exists content jsonb not null default '{}'::jsonb;

create or replace function public.academie_public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin_whatsapp', s.admin_whatsapp, 'admin_whatsapp_label', s.admin_whatsapp_label,
    'price_private', s.price_private, 'price_group', s.price_group,
    'theme', s.theme, 'content', s.content,
    'mentors', (select count(*) from public.academie_profiles where role = 'mentor' and active),
    'courses', (select count(*) from public.academie_courses where active)
  ) from public.academie_settings s where s.id = 1
$$;

/* ── Preferensi per orang (tampilan, ruang kerja, kalender) ─ */
alter table public.academie_profiles add column if not exists prefs jsonb not null default '{}'::jsonb;

create or replace function public.academie_update_my_prefs(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if public.academie_me() is null then raise exception 'Harus login'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 8000 then raise exception 'Preferensi tidak valid'; end if;
  update public.academie_profiles set prefs = prefs || p where id = public.academie_me() returning prefs into out;
  return out;
end $$;

/* ── To-do pribadi (ruang kerja) ─────────────────────────── */
create table if not exists public.academie_todos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.academie_profiles (id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 200),
  done        boolean not null default false,
  due_on      date,
  created_at  timestamptz not null default now()
);
create index if not exists academie_todos_profile_idx on public.academie_todos (profile_id, done, created_at);
alter table public.academie_todos enable row level security;
drop policy if exists "own" on public.academie_todos;
create policy "own" on public.academie_todos for all to authenticated
  using (profile_id = public.academie_me()) with check (profile_id = public.academie_me());

/* ── Mentor mengisi link pretest/posttest sesinya ────────── */
create or replace function public.academie_set_session_tests(p_session uuid, p_pretest text, p_posttest text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.academie_sessions;
begin
  select * into s from public.academie_sessions where id = p_session;
  if s.id is null then raise exception 'Sesi tidak ditemukan'; end if;
  if not (public.academie_is_admin() or s.mentor_id = public.academie_me()) then raise exception 'Hanya mentor sesi ini atau admin'; end if;
  if s.status = 'cancelled' then raise exception 'Sesi sudah dibatalkan'; end if;
  if coalesce(p_pretest, '') <> '' and p_pretest !~* '^https?://' then raise exception 'Link pretest harus diawali https://'; end if;
  if coalesce(p_posttest, '') <> '' and p_posttest !~* '^https?://' then raise exception 'Link posttest harus diawali https://'; end if;
  update public.academie_sessions set pretest_url = btrim(coalesce(p_pretest, '')), posttest_url = btrim(coalesce(p_posttest, '')) where id = p_session;
end $$;

do $$ declare f text; begin
  foreach f in array array['academie_update_my_prefs(jsonb)', 'academie_set_session_tests(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
