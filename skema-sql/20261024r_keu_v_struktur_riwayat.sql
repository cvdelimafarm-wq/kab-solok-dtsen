-- 20261024r_keu_v_struktur_riwayat.sql
-- (24 Okt 2026, tahap 16) Tampilan riwayat usulan struktur (level baru) untuk papan "Tambah level mata anggaran". Hanya membaca
-- keu_struktur_usulan_riwayat yang ditulis fungsi alur keu_struktur_*; tidak mengubah data. Idempoten.
-- SUDAH dijalankan di produksi (24 Okt 2026); berkas ini arsip supaya repo sama dengan basis data.

create or replace view public.keu_v_struktur_riwayat with (security_invoker = true) as
select r.id, r.usulan_id, u.kode_sementara, u.level, l.nama as level_nama, r.aksi, r.dari, r.ke, ak.nama as oleh_nama, r.catatan, r."at" as waktu
from public.keu_struktur_usulan_riwayat r
join public.keu_struktur_usulan u on u.id = r.usulan_id
join public.keu_struktur_level l on l.kode = u.level
left join public.sigap_akun ak on ak.id = r.oleh;

-- Tampilan hanya dibaca server lewat service_role (gerbang /api/sigap/keu/baca).
revoke all on public.keu_v_struktur_riwayat from anon, authenticated, public;
grant select on public.keu_v_struktur_riwayat to service_role;
