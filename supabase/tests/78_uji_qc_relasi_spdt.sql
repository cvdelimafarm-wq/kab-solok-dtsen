-- =====================================================================
-- 78_uji_qc_relasi_spdt.sql - uji relasi PML-PPL dari KK (SPDT NTP) dan pengecualian Supervisor dari peserta QC.
-- Jalankan SETELAH 20261029e, satu transaksi; diakhiri galat sengaja sehingga semua dibatalkan (hasil ada di pesan "HASIL_UJI: {...}").
-- Hanya MEMBACA data produksi (kegiatan 2 = SPDT NTP, kegiatan Pascabencana sebagai pembanding). Tidak ada data tersimpan.
-- =====================================================================
do $uji$
declare
  k1 bigint; k2 bigint := 2; h jsonb := '{}'::jsonb; r jsonb; n_beda integer;
begin
  select id into k1 from sigap_kegiatan where kode = 'pascabencana_2026';

  -- 1. Relasi dari KK
  h := h || jsonb_build_object(
    'relasi_pasangan', (select count(*) from sigap_qc_relasi(k2)),
    'relasi_ppl_unik', (select count(distinct ppl_akun_id) from sigap_qc_relasi(k2)),
    'relasi_pml_unik', (select count(distinct pml_akun_id) from sigap_qc_relasi(k2)),
    'dana_pml', (select jsonb_agg(pml_akun_id order by pml_akun_id) from sigap_qc_relasi(k2) where ppl_akun_id = 121),
    'relasi_cocok_kk', (select count(*) = (select count(distinct (ppl_akun_id, pml_akun_id)) from sigap_spdt_kk where kegiatan_id = k2) from sigap_qc_relasi(k2)));

  -- 2. Peserta: Supervisor (Faisal 200, Mailani 357, Arini 73) tidak ikut; PPL bertahan satu baris
  h := h || jsonb_build_object(
    'supervisor_di_peserta', (select jsonb_agg(akun_id) from sigap_qc_peserta(k2) where akun_id in (73, 200, 357)),
    'faisal_mailani_masih_ppl_aktif', (select count(*) from sigap_penugasan where kegiatan_id = k2 and akun_id in (200, 357) and peran = 'ppl' and aktif),
    'peserta_pml', (select count(*) from sigap_qc_peserta(k2) where peran = 'pml'),
    'peserta_ppl', (select count(*) from sigap_qc_peserta(k2) where peran = 'ppl'),
    'peserta_ppl_tanpa_pml', (select jsonb_agg(nama order by nama) from sigap_qc_peserta(k2) where peran = 'ppl' and pml_akun_id is null),
    'peserta_baris_ganda', (select count(*) from (select akun_id from sigap_qc_peserta(k2) group by akun_id having count(*) > 1) z),
    'dana_peserta', (select jsonb_agg(jsonb_build_object('pml', pml_akun_id, 'nama', pml_nama)) from sigap_qc_peserta(k2) where akun_id = 121));

  -- 3. Rekap: Dana ada di dua PML; p_pml menyaring satu tim; "Tanpa PML" untuk PPL tanpa KK
  r := sigap_qc_rekap(k2, current_date, null);
  h := h || jsonb_build_object(
    'rekap_tim', jsonb_array_length(r),
    'rekap_dana_di_tim', (select jsonb_agg(t ->> 'pml_nama' order by t ->> 'pml_nama') from jsonb_array_elements(r) t where t -> 'ppl' @> '[{"akun_id":121}]'::jsonb),
    'rekap_tanpa_pml', (select t -> 'ppl' from jsonb_array_elements(r) t where (t ->> 'pml_akun_id')::bigint = 0),
    'rekap_megawati', (select jsonb_build_object('jumlah_ppl', t -> 'jumlah_ppl', 'ppl', (select jsonb_agg(p ->> 'nama' order by p ->> 'nama') from jsonb_array_elements(t -> 'ppl') p))
                         from jsonb_array_elements(sigap_qc_rekap(k2, current_date, 370)) t),
    'rekap_p_pml_jumlah_tim', jsonb_array_length(sigap_qc_rekap(k2, current_date, 370)));

  -- 4. Pascabencana tidak berubah: peserta baru = peserta menurut definisi LAMA (atasan_id), baris demi baris
  with lama as (
    select p.akun_id, a.nama, p.peran, pp.akun_id as pml_akun_id, pa.nama as pml_nama
      from sigap_penugasan p
      join sigap_akun a on a.id = p.akun_id and a.aktif
      left join bencana_petugas bp on bp.id = a.petugas_bencana_id
      left join sigap_akun pa on p.peran = 'ppl' and pa.petugas_bencana_id = bp.atasan_id and pa.aktif
      left join sigap_penugasan pp on pp.akun_id = pa.id and pp.kegiatan_id = k1 and pp.peran = 'pml' and pp.aktif
     where p.kegiatan_id = k1 and p.aktif and p.peran in ('pml', 'ppl')
       and p.peran = any (coalesce((select g.peran_peserta from sigap_qc_pengaturan g where g.kegiatan_id = k1), array['pml','ppl']::text[]))),
  baru as (select * from sigap_qc_peserta(k1))
  select (select count(*) from (select * from lama except select * from baru) x) + (select count(*) from (select * from baru except select * from lama) y) into n_beda;
  h := h || jsonb_build_object('pascabencana_baris', (select count(*) from sigap_qc_peserta(k1)), 'pascabencana_beda_dari_lama', n_beda);

  -- 5. Hak akses
  h := h || jsonb_build_object('hak_relasi', (select jsonb_agg(distinct grantee) from information_schema.routine_privileges where routine_name = 'sigap_qc_relasi' and routine_schema = 'public' and privilege_type = 'EXECUTE'));

  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
