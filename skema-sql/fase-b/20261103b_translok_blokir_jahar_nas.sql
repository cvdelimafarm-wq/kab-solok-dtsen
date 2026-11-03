-- =====================================================================
-- 20261103b_translok_blokir_jahar_nas.sql
-- Blokir sementara translok Jahar Nas (akun 311) di Pendataan Pascabencana 2026 (kegiatan 1).  (3 Nov 2026)
-- Jalankan SETELAH 20261103a_translok_blokir.sql dan SETELAH kode baru dideploy. Bila sudah ada barisnya, tidak diubah.
-- Untuk membuka lagi tanpa persetujuan:  update public.sigap_translok_blokir set status = 'dibuka', keputusan_oleh = 'admin', keputusan_at = now() where kegiatan_id = 1 and akun_id = 311;
-- =====================================================================
insert into public.sigap_translok_blokir (kegiatan_id, akun_id, status, alasan_blokir, diblokir_oleh)
select 1, a.id, 'blokir', 'Diblokir sementara oleh admin. Ajukan unblock untuk membuka kembali.', 'admin (M. Iqbal Hadi)'
from public.sigap_akun a
where a.id = 311 and a.nama = 'Jahar Nas'
on conflict (kegiatan_id, akun_id) do nothing;
