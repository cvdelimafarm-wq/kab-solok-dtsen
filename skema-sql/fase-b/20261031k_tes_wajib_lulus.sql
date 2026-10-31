-- 20261031k_tes_wajib_lulus.sql
-- (31 Okt 2026) Setelan "wajib lulus" per tes pelatihan: nilai lulus (KKM) dan centang wajib lulus.
-- Bila wajib lulus aktif, peserta yang belum mencapai nilai lulus boleh mengulang (maksimal 3 percobaan) selama jadwal tes masih terbuka;
-- nilai resmi tetap skor tertinggi dari semua percobaan (mesin ulang yang ada: sigap_tes_sesi.percobaan / skor_terbaik / sigap_tes_sesi_arsip).
-- Kelulusan TIDAK otomatis memblokir penempatan ke pendataan (keputusan 31 Okt): hanya penanda di Monitoring dan bahan analisis.
--
-- Aman dijalankan berulang. Tidak mengubah data peserta.
-- Tes yang SUDAH ADA dibiarkan wajib_lulus = false (pretest/posttest PSP sudah ditutup; agar riwayat tidak ditandai "belum lulus" surut).
-- Tes baru / kolom baru berikutnya: bawaan wajib_lulus = true, nilai_lulus = 70.

alter table public.sigap_tes add column if not exists nilai_lulus numeric(5,2) not null default 70;
alter table public.sigap_tes add column if not exists wajib_lulus boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_tes_nilai_lulus_check') then
    alter table public.sigap_tes add constraint sigap_tes_nilai_lulus_check check (nilai_lulus >= 0 and nilai_lulus <= 100);
  end if;
end $$;

-- baris yang sudah ada tetap false (default saat penambahan kolom = false); baris yang dibuat sesudah ini bawaannya true
alter table public.sigap_tes alter column wajib_lulus set default true;

comment on column public.sigap_tes.nilai_lulus is 'Nilai lulus (KKM) 0-100; dipakai bila wajib_lulus = true. Bawaan 70.';
comment on column public.sigap_tes.wajib_lulus is 'Bila true: peserta yang skor resminya di bawah nilai_lulus boleh mengulang sampai lulus (maks 3 percobaan, selama jadwal terbuka). Tidak memblokir penempatan.';
