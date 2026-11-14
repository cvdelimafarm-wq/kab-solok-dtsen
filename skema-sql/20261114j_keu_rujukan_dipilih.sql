-- skema-sql/20261114j_keu_rujukan_dipilih.sql
--
-- (14 Nov 2026, Fase 3 perbaikan) keu_v_rujukan_penugasan ditambah kolom `dipilih`: jumlah hari kerja yang SUDAH dipilih tiap petugas (urut menurun, tanpa id),
-- supaya modal pembaruan dan kartu Angka rujukan menunjukkan berapa orang sudah melewati batas baru sebelum Terapkan ditekan. Hanya menambah kolom di akhir view.
-- Data 14 Nov: Seruti TW IV kegiatan 6 batas disamakan 4 hari (8 PML, 15 PPL, lewat keu_rujukan_terapkan_hari); 4 PML sudah 5 hari dan 1 PPL 10 hari (tidak dihapus).

begin;

create or replace view keu_v_rujukan_penugasan as
select t.ident_id, t.kegiatan_id, g.nama as kegiatan_nama, t.fungsi, t.periode, p.peran,
       count(*)::int as n,
       min(p.maks_hari)::int as maks_min,
       max(p.maks_hari)::int as maks_max,
       count(*) filter (where p.maks_hari is null or p.maks_hari = 0)::int as n_kosong,
       coalesce(jsonb_agg(hk.n order by hk.n desc) filter (where hk.n > 0), '[]'::jsonb) as dipilih
  from keu_ident_kegiatan t
  join sigap_kegiatan g on g.id = t.kegiatan_id
  join sigap_penugasan p on p.kegiatan_id = t.kegiatan_id and p.aktif
  left join lateral (select count(*)::int as n from sigap_hari_kerja h where h.penugasan_id = p.id) hk on true
 where t.dilepas_at is null
   and (p.sumber is null or p.sumber <> 'administrasi')
 group by t.ident_id, t.kegiatan_id, g.nama, t.fungsi, t.periode, p.peran;
revoke all on keu_v_rujukan_penugasan from anon, authenticated;

commit;
