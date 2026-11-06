-- 20261107a_view_pok_struktur.sql
-- (7 Nov 2026) Tampilan HANYA BACA untuk tab Anggaran bergaya POK: nama komponen dan sub komponen per butir POK berlaku, plus harga satuan.
-- Tidak mengubah tabel atau data. Aman dijalankan ulang (create or replace). Tanpa berkas ini, tab Anggaran tetap jalan dengan nama komponen baku
-- dan satu sub komponen "A / TANPA SUB KOMPONEN" per komponen.
create or replace view public.keu_v_pok_struktur as
select
  d.id            as detail_id,
  r.ro_kode       as ro_kode,
  k.kode          as komponen_kode,
  k.nama          as komponen_nama,
  s.kode          as sub_kode,
  s.nama          as sub_nama,
  a.kode          as akun_kode,
  d.harga_satuan  as harga_satuan
from public.keu_pok_detail d
join public.keu_pok_versi pv on pv.id = d.versi_id and pv.status = 'berlaku'
join public.keu_pok_node a on a.id = d.akun_node_id
join public.keu_pok_node s on s.id = a.induk_id and s.tingkat = 'subkomp'
join public.keu_pok_node k on k.id = s.induk_id and k.tingkat = 'komponen'
join public.keu_pok_node r on r.id = k.induk_id and r.tingkat = 'ro';

revoke all on public.keu_v_pok_struktur from public, anon, authenticated;
grant select on public.keu_v_pok_struktur to service_role;

-- Cek (hasil harus sama dengan jumlah baris keu_v_adm_lembar): select count(*) from keu_v_pok_struktur; select count(*) from keu_v_adm_lembar;
