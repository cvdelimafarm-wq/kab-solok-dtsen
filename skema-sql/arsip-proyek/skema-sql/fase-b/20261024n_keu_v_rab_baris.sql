-- =====================================================================
-- 20261024n_keu_v_rab_baris.sql  (berkas n: tampilan rincian RAB dan jejak aksi RAB untuk editor RAB di halaman RO)
-- keu_v_rab_baris: rincian RAB lengkap dengan rab_id dan kunci POK (tabel keu_rab_baris sendiri tidak memuat rab_id sehingga
--   sulit dibaca per RAB). keu_v_rab_jejak: jejak aksi RAB dengan nama pelaku (tanpa NIK/NIP).
-- Hanya membuat dua tampilan; tidak menambah tabel. Aman diulang.
-- =====================================================================
create or replace view keu_v_rab_baris with (security_invoker = true) as
select b.id as baris_id, b.item_id, i.rab_id, i.pok_kunci, b.urut, b.ket, b.volume, b.satuan, b.harga_satuan, b.jumlah,
       (b.jumlah_tetap is not null) as jumlah_dikunci, b.sama_dengan_item, b.catatan, b.tautan,
       b.periode, b.bulan_mulai, b.bulan_sampai, b.minggu, b.manual
from keu_rab_baris b
join keu_rab_item i on i.id = b.item_id;
comment on view keu_v_rab_baris is 'Rincian RAB per RAB (rab_id) dan item (pok_kunci). jumlah_dikunci = jumlah mengikuti POK (bukan volume x harga).';

create or replace view keu_v_rab_jejak with (security_invoker = true) as
select r.id, r.rab_id, r.aksi, r.dari, r.ke, a.nama as oleh_nama, r.catatan, r.waktu
from keu_rab_riwayat r
left join sigap_akun a on a.id = r.oleh;
comment on view keu_v_rab_jejak is 'Jejak aksi pada RAB (buat, ajukan, setuju_ketua, sahkan, kembalikan, batalkan) dengan nama pelaku.';

revoke all on keu_v_rab_baris, keu_v_rab_jejak from anon, authenticated;
grant select on keu_v_rab_baris, keu_v_rab_jejak to service_role;
