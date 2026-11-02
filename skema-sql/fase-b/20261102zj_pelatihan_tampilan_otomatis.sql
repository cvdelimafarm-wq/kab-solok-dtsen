-- 20261102zj_pelatihan_tampilan_otomatis.sql
--
-- (2 Nov 2026) Pelatihan 5 tab: tampilan baru menjadi OTOMATIS (bawaan). AMAN DIULANG. Dijalankan Iqbal sendiri. Menyusul 20261102zi.
-- tab_baru kini boleh NULL: NULL = otomatis (tampilan lima tab selama pelatihan belum selesai; pelatihan yang sudah selesai seperti PSP tetap tampilan lama),
-- true / false = ditetapkan manual oleh PJ di Kelola Pelatihan. Nilai yang sudah tersimpan sampai sekarang berasal dari percobaan awal, bukan keputusan PJ,
-- sehingga dikembalikan ke otomatis (hasilnya untuk Seruti TW IV tetap tampilan baru karena belum selesai).

alter table sigap_pelatihan_ketentuan alter column tab_baru drop not null;
alter table sigap_pelatihan_ketentuan alter column tab_baru drop default;
update sigap_pelatihan_ketentuan set tab_baru = null where tab_baru is not null;

-- Cek cepat (harus: is_nullable = YES, kolom_default kosong):
-- select is_nullable, column_default from information_schema.columns where table_name = 'sigap_pelatihan_ketentuan' and column_name = 'tab_baru';
