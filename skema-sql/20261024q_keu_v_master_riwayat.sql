-- 20261024q_keu_v_master_riwayat.sql
-- (24 Okt 2026, tahap 14) Tampilan riwayat perubahan master untuk papan Master data. Hanya memuat jejak perubahan tabel master
-- (keu_master_*) dan keu_struktur_level yang dicatat pemicu keu_jejak ke sigap_audit; tidak memuat jejak lain. Idempoten.
-- SUDAH dijalankan di produksi (24 Okt 2026); berkas ini hanya arsip supaya repo sama dengan basis data.

create or replace view public.keu_v_master_riwayat with (security_invoker = true) as
select a.id, a.waktu, a.aksi, a.detail, ak.nama as oleh_nama
from public.sigap_audit a
left join public.sigap_akun ak on ak.id = a.akun_id
where a.aksi like 'keu.keu\_master\_%' or a.aksi like 'keu.keu\_struktur\_level.%';

-- Tampilan hanya dibaca server lewat service_role (gerbang /api/sigap/keu/baca).
revoke all on public.keu_v_master_riwayat from anon, authenticated, public;
grant select on public.keu_v_master_riwayat to service_role;
