-- 20261102a: daftar pegawai organik aktif untuk dropdown nama instruktur pada Identifikasi lanjutan.
-- Hanya BACA; tidak mengubah tabel. Dibaca lewat gerbang GET /api/sigap/keu/baca (service_role) seperti view keu_v_* lain.
-- Bila belum dijalankan: dropdown tidak tampil dan nama instruktur diketik bebas seperti sebelumnya (tidak ada yang rusak).
begin;

create or replace view public.keu_v_pegawai_organik with (security_invoker = true) as
select a.id as akun_id, a.nama
from public.sigap_akun a
where a.jenis = 'organik' and a.aktif;

revoke all on public.keu_v_pegawai_organik from anon, authenticated;
grant select on public.keu_v_pegawai_organik to service_role;

commit;

-- Verifikasi (jalankan sesudah commit): harus mengembalikan daftar nama pegawai organik aktif.
select akun_id, nama from public.keu_v_pegawai_organik order by nama;
