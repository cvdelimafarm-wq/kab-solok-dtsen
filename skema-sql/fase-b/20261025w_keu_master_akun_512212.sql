-- 20261025w_keu_master_akun_512212.sql
-- (25 Okt 2026) Menambah akun 512212 ke master akun atas persetujuan PPK. Nama mengikuti POK unggahan (id 1 dan 2): "Belanja Uang Lembur PPPK".
-- kelompok_kode kolom turunan (hasil: 51). Idempoten. Sudah dijalankan di produksi.
insert into keu_master_akun (kode, nama, pola_kode, aktif)
values ('512212', 'Belanja Uang Lembur PPPK', 'PEG', true)
on conflict (kode) do nothing;
