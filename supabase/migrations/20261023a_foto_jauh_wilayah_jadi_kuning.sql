-- 23 Okt 2026 — Foto "jauh dari wilayah" (> 10 km dari KK wilayah tugas dan rumah petugas) diturunkan dari MERAH ke KUNING.
-- Kode (lib/sigapFoto.ts) sudah berubah untuk foto BARU. Berkas ini menyesuaikan foto LAMA yang terlanjur merah/ditahan.
-- Aman dijalankan ulang (idempoten). Jalankan di SQL Editor Supabase.
--
-- 1) Foto merah yang satu-satunya alasan merahnya "jauh_dari_wilayah" -> kepercayaan 'kuning'
--    (foto yang juga merah karena waktu_tidak_wajar / jam_hp_beda_besar / kecepatan_tak_wajar TIDAK disentuh).
-- 2) Tag yang masih 'ditahan' dilepas ke nomor fotonya HANYA bila nomor itu masih kosong.
--    Bila nomor sudah terisi foto lain, tag dibiarkan ditahan (supaya foto yang sudah terpasang tidak tertimpa);
--    PML/admin memutuskannya lewat tab Periksa -> "Diperiksa".

-- PRATINJAU (opsional, jalankan dulu bila ingin melihat dampaknya)
-- select count(distinct f.id) as foto, count(t.id) as tag_ditahan
--   from sigap_foto f left join sigap_foto_tag t on t.foto_id = f.id and t.status = 'ditahan'
--  where f.kepercayaan = 'merah' and f.alasan @> array['jauh_dari_wilayah']::text[]
--    and not (f.alasan && array['waktu_tidak_wajar','jam_hp_beda_besar','kecepatan_tak_wajar']::text[]);

do $$
declare
  r record;
  n_foto int := 0;
  n_lepas int := 0;
  n_tertahan int := 0;
begin
  with sasaran as (
    update sigap_foto f
       set kepercayaan = 'kuning'
     where f.kepercayaan = 'merah'
       and f.alasan @> array['jauh_dari_wilayah']::text[]
       and not (f.alasan && array['waktu_tidak_wajar','jam_hp_beda_besar','kecepatan_tak_wajar']::text[])
    returning f.id
  )
  select count(*) into n_foto from sasaran;

  -- per foto: dilepas hanya bila SEMUA tag ditahannya menunjuk nomor yang masih kosong
  for r in
    select t.foto_id,
           bool_or(exists (select 1 from sigap_dokumentasi d
                            where d.penugasan_id = t.penugasan_id and d.tanggal = f.tanggal and d.slot = t.slot)) as terisi,
           count(*) as jml_tag
      from sigap_foto_tag t
      join sigap_foto f on f.id = t.foto_id
     where t.status = 'ditahan' and t.penugasan_id is not null and t.slot is not null
       and f.kepercayaan = 'kuning' and f.alasan @> array['jauh_dari_wilayah']::text[]
     group by t.foto_id
  loop
    if r.terisi then
      n_tertahan := n_tertahan + r.jml_tag;
    else
      perform sigap_foto_lepas_tahan(r.foto_id, null);
      n_lepas := n_lepas + r.jml_tag;
    end if;
  end loop;

  insert into sigap_audit (akun_id, aksi, detail)
  values (null, 'foto.jarak_jadi_kuning',
          jsonb_build_object('foto_diturunkan', n_foto, 'tag_dilepas', n_lepas, 'tag_tetap_ditahan_nomor_terisi', n_tertahan));
  raise notice 'foto diturunkan ke kuning: %, tag dilepas: %, tag tetap ditahan (nomor terisi): %', n_foto, n_lepas, n_tertahan;
end $$;
