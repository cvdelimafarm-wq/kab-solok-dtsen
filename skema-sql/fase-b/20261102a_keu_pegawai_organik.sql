-- 20261102a: daftar pegawai organik aktif (dropdown nama instruktur dan nama petugas organik) dan mitra aktif (dropdown nama petugas mitra) pada Identifikasi lanjutan.
-- Aman dijalankan ulang (create or replace).
-- Hanya BACA; tidak mengubah tabel. Dibaca lewat gerbang GET /api/sigap/keu/baca (service_role) seperti view keu_v_* lain.
-- Bila belum dijalankan: dropdown tidak tampil dan nama instruktur diketik bebas seperti sebelumnya (tidak ada yang rusak).
begin;

create or replace view public.keu_v_pegawai_organik with (security_invoker = true) as
select a.id as akun_id, a.nama
from public.sigap_akun a
where a.jenis = 'organik' and a.aktif;

revoke all on public.keu_v_pegawai_organik from anon, authenticated;
grant select on public.keu_v_pegawai_organik to service_role;

create or replace view public.keu_v_mitra_aktif with (security_invoker = true) as
select a.id as akun_id, a.nama, a.alamat_kecamatan as kecamatan
from public.sigap_akun a
where a.jenis = 'mitra' and a.aktif;

revoke all on public.keu_v_mitra_aktif from anon, authenticated;
grant select on public.keu_v_mitra_aktif to service_role;

commit;

-- Verifikasi (jalankan sesudah commit): organik aktif ±29, mitra aktif ±759.
select (select count(*) from public.keu_v_pegawai_organik) organik, (select count(*) from public.keu_v_mitra_aktif) mitra;
