-- skema-sql/20261114d_keu_ident_komponen.sql
--
-- (14 Nov 2026, Fase 2d) Lembar komponen tahap 5 (pelatihan) dan 6 (pendataan). "Satu pengaturan, dua pintu": lembar ini TIDAK menyimpan salinan;
-- status tiap komponen dibaca dari pengaturan dan data yang sama dengan Kelola Pelatihan / Kelola Pendataan (saklar fitur kegiatan, aturan Belajar dan mutu,
-- tes, kelas, presensi, kuis, alokasi, QC, anomali, laporan). Mengubah = tautan ke layar Kelola yang memegangnya. Katalog komponen: lib/keu/komponen.ts.
-- Hanya view: tidak mengubah data.

begin;

create or replace view keu_v_ident_komponen_data as
select t.ident_id, t.fungsi, g.id as kegiatan_id, g.nama as kegiatan_nama, g.strategi,
       coalesce((select jsonb_object_agg(f.fitur, f.aktif) from sigap_kegiatan_fitur f where f.kegiatan_id = g.id), '{}'::jsonb) as fitur,
       (select count(*) from sigap_tes x where x.kegiatan_id = g.id and x.jenis = 'pretest') as n_pretest,
       (select count(*) from sigap_tes x where x.kegiatan_id = g.id and x.jenis = 'posttest') as n_posttest,
       (select count(*) from sigap_pelatihan_materi x where x.kegiatan_id = g.id) as n_materi,
       (select count(*) from sigap_pelatihan_berkas x where x.kegiatan_id = g.id) as n_berkas,
       (select count(*) from sigap_kuis_pra_pengaturan x where x.kegiatan_id = g.id) as n_kuis_pra,
       (select count(*) from sigap_kuis x where x.kegiatan_id = g.id) as n_kuis_live,
       (select count(*) from sigap_pelatihan_kelas x where x.kegiatan_id = g.id) as n_kelas,
       (select count(*) from sigap_pelatihan_titik x where x.kegiatan_id = g.id) as n_titik_presensi,
       (select count(*) from sigap_pelatihan_presensi x where x.kegiatan_id = g.id) as n_presensi,
       (select count(*) from sigap_pelatihan_nilai_skema x where x.kegiatan_id = g.id) as n_nilai_skema,
       (select count(*) from sigap_pelatihan_laporan_foto x where x.kegiatan_id = g.id) as n_foto_pelatihan,
       (select count(*) from sigap_pelatihan_surat_undangan x where x.kegiatan_id = g.id) as n_surat_undangan,
       (select count(*) from sigap_pelatihan_laporan x where x.kegiatan_id = g.id) as n_laporan_pelatihan,
       (select count(*) from sigap_alokasi_wilayah x where x.kegiatan_id = g.id and x.nonaktif_at is null) as n_alokasi,
       (select count(*) from sigap_penugasan x where x.kegiatan_id = g.id and x.aktif) as n_penugasan,
       (select count(*) from sigap_penugasan x where x.kegiatan_id = g.id and x.aktif and x.surat_tugas_id is not null) as n_st,
       (select count(*) from sigap_qc_pengaturan x where x.kegiatan_id = g.id) as n_qc_atur,
       (select count(*) from sigap_qc_soal x where x.kegiatan_id = g.id) as n_qc_soal,
       (select count(*) from sigap_anomali_batch x where x.kegiatan_id = g.id) as n_anomali,
       (select count(*) from sigap_realisasi x where x.kegiatan_id = g.id and x.nonaktif_at is null) as n_realisasi,
       (select count(*) from sigap_penilaian360 x where x.kegiatan_id = g.id) as n_360
  from keu_ident_kegiatan t
  join sigap_kegiatan g on g.id = t.kegiatan_id
 where t.dilepas_at is null;

revoke all on keu_v_ident_komponen_data from anon, authenticated;

commit;
