-- 20261101y_vanguard_kasus_k.sql
--
-- (1 Nov 2026) VANGUARD V6: menyiapkan rekaman percobaan kasus K (Mode Kuesioner Penuh). AMAN DIULANG. Dijalankan Iqbal sendiri di Supabase SQL Editor.
-- Tidak mengubah data. Satu-satunya perubahan: daftar jenis kesalahan yang diizinkan di sigap_vanguard_kesalahan.jenis diperluas dengan 6 jenis kasus K:
--   salah_rincian, salah_sumber, banyaknya_meleset, nama_lainnya, salah_art, kode_sumber
-- (belum_diisi, harus_kosong, dan angka_meleset sudah ada). Kolom kasus sudah menerima K01, K02, dst. (check '^[A-Z][0-9]{2}$'); isian (jsonb) menampung daftar entri.

do $$
declare
  nama text;
begin
  -- buang check lama pada kolom jenis, apa pun namanya (nama otomatis bisa berbeda antar proyek)
  for nama in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.sigap_vanguard_kesalahan'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%konversi_seminggu%'
  loop
    execute format('alter table public.sigap_vanguard_kesalahan drop constraint %I', nama);
  end loop;

  alter table public.sigap_vanguard_kesalahan
    add constraint sigap_vanguard_kesalahan_jenis_cek check (jenis in (
      'konversi_seminggu','konversi_sebulan','salah_letak','harus_kosong','belum_diisi','jebakan','alternatif','angka_meleset','kontrol_vii','diskrepansi',
      'salah_rincian','salah_sumber','banyaknya_meleset','nama_lainnya','salah_art','kode_sumber'
    ));
exception when duplicate_object then
  null; -- sudah pernah dijalankan
end $$;

-- Cek cepat (harus mengembalikan 1 baris yang memuat 'kode_sumber'):
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.sigap_vanguard_kesalahan'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kode_sumber%';
