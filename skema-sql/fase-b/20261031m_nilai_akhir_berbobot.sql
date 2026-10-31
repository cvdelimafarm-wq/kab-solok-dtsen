-- 20261031m_nilai_akhir_berbobot.sql
-- (31 Okt 2026) Nilai akhir pelatihan berbobot: + komponen Kedisiplinan (otomatis dari presensi) dan Sikap (diisi panitia),
-- + "wajib lulus pada nilai akhir" (ambang dipilih PJ; berdampingan dengan wajib lulus per tes dari 20261031k).
-- Dijalankan Iqbal sendiri (Supabase SQL editor). Aman diulang. Sebelum dijalankan, aplikasi tetap jalan memakai skema lama (Pretest/Posttest/Kuis).

alter table public.sigap_pelatihan_nilai_skema
  add column if not exists pakai_disiplin    boolean  not null default false,
  add column if not exists bobot_disiplin    integer  not null default 0,
  add column if not exists pakai_sikap       boolean  not null default false,
  add column if not exists bobot_sikap       integer  not null default 0,
  add column if not exists wajib_lulus_akhir boolean  not null default false,
  add column if not exists nilai_lulus_akhir numeric(5,2) not null default 70;

do $$ begin
  alter table public.sigap_pelatihan_nilai_skema add constraint sigap_pelatihan_nilai_skema_bobot_disiplin_check check (bobot_disiplin between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sigap_pelatihan_nilai_skema add constraint sigap_pelatihan_nilai_skema_bobot_sikap_check check (bobot_sikap between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sigap_pelatihan_nilai_skema add constraint sigap_pelatihan_nilai_skema_nilai_lulus_akhir_check check (nilai_lulus_akhir between 0 and 100);
exception when duplicate_object then null; end $$;

-- Nilai sikap per peserta per kegiatan (0-100), diisi panitia.
create table if not exists public.sigap_pelatihan_sikap (
  kegiatan_id bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  akun_id     bigint      not null references public.sigap_akun(id) on delete cascade,
  nilai       smallint    not null check (nilai between 0 and 100),
  catatan     text        check (catatan is null or char_length(catatan) <= 300),
  diubah_oleh bigint      references public.sigap_akun(id) on delete set null,
  diubah_at   timestamptz not null default now(),
  primary key (kegiatan_id, akun_id)
);

-- Hanya diakses lewat API server (service role); tanpa kebijakan = klien anon/auth tidak bisa membaca.
alter table public.sigap_pelatihan_sikap enable row level security;
