-- RPC utk tab "Monitoring Pengisian Identifikasi PPL" -- rekap progres
-- pengisian tab "Identifikasi PPL" (app/penyisiran/identifikasi-ppl.tsx)
-- PER PPL, dipakai oleh app/api/penyisiran/monitoring-ppl/route.ts.
--
-- Ini VIEW AGREGAT internal staf (dikunci role "penyisiran", PIN yang
-- sama dgn tab Penyisiran Usaha) supaya staf bisa memantau siapa yang
-- belum/masih banyak sisa TANPA harus login satu-satu sbg tiap PPL.
--
-- Cara hitung: gabungkan ppl_akun -> ppl_alokasi_idsls (wilayah yang
-- dialokasikan ke PPL itu) -> penyisiran_usaha (kartu keluarga di
-- wilayah itu), lalu hitung berapa yang identifikasi_ppl <> 'belum'.
--
-- Catatan penting (sama seperti catatan di migrasi
-- ppl_akun_alokasi_idsls.sql & komentar app/api/penyisiran/ppl-info):
-- beberapa idsubsls BISA dialokasikan ke LEBIH DARI SATU ppl_id (konflik
-- alokasi yang sudah diketahui) -- kalau terjadi, keluarga yang sama ikut
-- terhitung di baris PPL manapun yang dialokasikan wilayah itu (dobel
-- hitung di rekap per-PPL, TAPI overall tetap dihitung sekali per kartu
-- langsung dari penyisiran_usaha, jadi overall tidak kena dampak
-- duplikasi ini).
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini
-- cuma catatan riwayat migrasi di repo.

create or replace function penyisiran_monitoring_ppl()
returns jsonb
language sql
stable
as $$
  with per_ppl as (
    select
      pa.id as ppl_id,
      pa.nama,
      pa.no_hp,
      pa.korwil,
      pa.pml,
      count(pu.kode_identitas) as jumlah_total,
      count(pu.kode_identitas) filter (where pu.identifikasi_ppl <> 'belum') as jumlah_diisi,
      count(pu.kode_identitas) filter (where pu.identifikasi_ppl = 'ada') as jumlah_ada,
      count(pu.kode_identitas) filter (where pu.identifikasi_ppl = 'tidak_ada') as jumlah_tidak_ada,
      count(pu.kode_identitas) filter (where pu.identifikasi_ppl = 'ragu') as jumlah_ragu,
      count(pu.kode_identitas) filter (where pu.identifikasi_ppl = 'belum') as jumlah_belum,
      max(pu.identifikasi_ppl_at) as terakhir_diisi
    from ppl_akun pa
    left join ppl_alokasi_idsls al on al.ppl_id = pa.id
    left join penyisiran_usaha pu on pu.idsubsls = al.idsubsls
    group by pa.id, pa.nama, pa.no_hp, pa.korwil, pa.pml
  ),
  overall as (
    select
      count(*) as jumlah_total,
      count(*) filter (where identifikasi_ppl <> 'belum') as jumlah_diisi,
      count(*) filter (where identifikasi_ppl = 'ada') as jumlah_ada,
      count(*) filter (where identifikasi_ppl = 'tidak_ada') as jumlah_tidak_ada,
      count(*) filter (where identifikasi_ppl = 'ragu') as jumlah_ragu,
      count(*) filter (where identifikasi_ppl = 'belum') as jumlah_belum
    from penyisiran_usaha
  )
  select jsonb_build_object(
    'overall', (select to_jsonb(overall) from overall),
    'per_ppl', coalesce(
      (select jsonb_agg(to_jsonb(per_ppl) order by per_ppl.jumlah_belum desc, per_ppl.nama)
       from per_ppl),
      '[]'::jsonb
    )
  );
$$;
