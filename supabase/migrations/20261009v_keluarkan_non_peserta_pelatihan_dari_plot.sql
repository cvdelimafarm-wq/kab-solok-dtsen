-- (9 Okt 2026) Keluarkan dari plot semua petugas yang BUKAN peserta pelatihan (94 penugasan kegiatan 3) -- permintaan user:
-- "cek semua nama selain 94 yg ikut pelatihan, jangan sampai dia ikut di plot".
-- Jalankan SENDIRI di Supabase SQL Editor (ada DELETE; lewat MCP sering menggantung).
-- Tidak ada data petugas dihapus: alokasi dicadangkan dulu, atasan_id dikosongkan (cadangan disimpan).
-- Dahlia Afriyanti (471) sudah dinonaktifkan sebelumnya; Sherli (60) tidak punya porsi.
--
-- ID yang dikeluarkan dari plot:
--   413 Annisa Suryani, 390 FENNY ANDA LISTI, 365 Hafni Syamfitria, 99 Julia Lara Zamzamy,
--   470 Mega Okra susanti, 394 Mira apridayanti, 473 NURLATHIFA HARMI, 400 Salsa Billa Duwita Putri,
--   471 Dahlia Afriyanti

begin;

create table if not exists public.bencana_alokasi_subsls_cad_nonpeserta_20261009 as
  select * from public.bencana_alokasi_subsls
  where ppl_id in (413,390,365,99,470,394,473,400,471);

create table if not exists public.bencana_petugas_atasan_cad_nonpeserta_20261009 as
  select id, atasan_id from public.bencana_petugas
  where id in (413,390,365,99,470,394,473,400,471);

delete from public.bencana_alokasi_subsls
 where ppl_id in (413,390,365,99,470,394,473,400,471);

update public.bencana_petugas set atasan_id = null
 where id in (413,390,365,99,470,394,473,400,471);

-- Verifikasi (harus: sisa_alokasi_nonpeserta = 0, sisa_atasan_nonpeserta = 0; alokasi_total = 161)
select
  (select count(*) from public.bencana_alokasi_subsls where ppl_id in (413,390,365,99,470,394,473,400,471)) as sisa_alokasi_nonpeserta,
  (select count(*) from public.bencana_petugas where id in (413,390,365,99,470,394,473,400,471) and atasan_id is not null) as sisa_atasan_nonpeserta,
  (select count(*) from public.bencana_alokasi_subsls) as alokasi_total;

commit;

-- ROLLBACK (bila perlu, jalankan terpisah):
-- insert into public.bencana_alokasi_subsls select * from public.bencana_alokasi_subsls_cad_nonpeserta_20261009;
-- update public.bencana_petugas p set atasan_id = c.atasan_id from public.bencana_petugas_atasan_cad_nonpeserta_20261009 c where c.id = p.id;
