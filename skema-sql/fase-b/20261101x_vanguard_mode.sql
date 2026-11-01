-- 20261101x_vanguard_mode.sql
--
-- (1 Nov 2026) VANGUARD V5b: Mode Uji. Menambah kolom `mode` pada pengaturan per kegiatan: 'latihan' (bawaan; kunci, petunjuk, pembahasan tampil) atau
-- 'uji' (server yang menilai; kunci tidak dikirim ke perangkat petugas). AMAN DIULANG. Dijalankan Iqbal sendiri. Kode tahan SQL ini belum dijalankan
-- (pengaturan tetap terbaca; menyimpan mode 'uji' ditolak dengan pesan jelas).

alter table sigap_vanguard_pengaturan add column if not exists mode text not null default 'latihan';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_vanguard_pengaturan_mode_cek') then
    alter table sigap_vanguard_pengaturan add constraint sigap_vanguard_pengaturan_mode_cek check (mode in ('latihan','uji'));
  end if;
end $$;
