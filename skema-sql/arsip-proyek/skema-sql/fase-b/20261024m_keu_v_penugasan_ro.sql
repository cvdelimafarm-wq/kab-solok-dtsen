-- =====================================================================
-- 20261024m_keu_v_penugasan_ro.sql  (berkas m: tampilan penugasan per RO untuk halaman RO)
-- Menggabungkan penugasan peran (keu_penugasan) dan akses tab Administrasi (keu_akses_adm) dengan nama akun, supaya halaman
-- /sigap/ro/<KODE> dapat menampilkan "Ketua tim", "Admin RO", dan "Akses Administrasi" tanpa membuka tabel sigap_akun.
-- Hanya nama akun (bukan NIK/NIP). Hanya baris yang belum dibatalkan. Aman diulang. Tidak menambah tabel.
-- =====================================================================
create or replace view keu_v_penugasan_ro with (security_invoker = true) as
select 'penugasan'::text as sumber, p.id, p.ro_kode, p.peran_kode, p.akun_id, a.nama as akun_nama,
       p.berlaku_mulai, p.berlaku_sampai,
       (p.masa @> current_date) as aktif_hari_ini
from keu_penugasan p
join sigap_akun a on a.id = p.akun_id
where p.dibatalkan_at is null
union all
select 'akses_adm'::text, x.id, x.ro_kode, 'AKSES_ADM'::text, x.akun_id, a.nama,
       x.berlaku_mulai, x.berlaku_sampai,
       (x.masa @> current_date)
from keu_akses_adm x
join sigap_akun a on a.id = x.akun_id
where x.dibatalkan_at is null;
comment on view keu_v_penugasan_ro is 'Penugasan peran per RO dan akses tab Administrasi dengan nama akun. ro_kode kosong = berlaku untuk semua RO. aktif_hari_ini menurut tanggal basis data.';

revoke all on keu_v_penugasan_ro from anon, authenticated;
grant select on keu_v_penugasan_ro to service_role;
