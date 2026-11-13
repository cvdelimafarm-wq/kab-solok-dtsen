-- supabase/tests/88_uji_draf_kursi.sql
-- Uji Fase 2b (hanya membaca): draf delegasi per kursi identifikasi 7 (Seruti TW IV).
do $$
declare d jsonb := keu_dlg_draf_kursi(7, 354); b jsonb;
begin
  if not (d ->> 'siap')::boolean then raise exception 'Draf belum siap: %', d ->> 'alasan'; end if;
  -- hanya organik: tidak ada mitra
  if exists (select 1 from jsonb_array_elements(d -> 'butir') x join sigap_akun a on a.id = (x ->> 'akun_id')::bigint where a.jenis <> 'organik') then
    raise exception 'Ada mitra di draf Delego';
  end if;
  -- PML organik pendataan: jenis Memeriksa dokumen, jumlah = sampel alokasi
  for b in select x from jsonb_array_elements(d -> 'butir') x where x ->> 'peran' = 'pml' and x ->> 'fungsi' = 'pendataan' loop
    if (b ->> 'jumlah')::numeric <> (select coalesce(sum(target_sampel), 0) from sigap_alokasi_wilayah w where w.kegiatan_id = (b ->> 'kegiatan_id')::bigint and w.pml_akun_id = (b ->> 'akun_id')::bigint and w.nonaktif_at is null) then
      raise exception 'Jumlah dokumen % tidak sama dengan alokasi', b ->> 'nama';
    end if;
  end loop;
  raise notice 'Uji 88 lulus: % butir', jsonb_array_length(d -> 'butir');
end $$;
