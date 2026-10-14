-- 14 Okt 2026 -- Batas pengajuan PML berubah dari "2 Sub SLS per hari" menjadi batas TOTAL per PML (default 5): jumlah permintaan yang masih berlaku
-- (menunggu + sudah keluar; yang dibatalkan tidak dihitung) tanpa memandang tanggal. p_tanggal tetap dicatat sebagai tanggal pengajuan.
-- FUNGSI BARU (nama berbeda) agar kode lama yang masih memakai bencana_pendataan_minta (per hari) tetap jalan sampai deploy selesai; fungsi lama tidak diubah.
-- Batas sebenarnya dikirim aplikasi lewat p_maks (lib/permintaanDaftar.ts MAKS_SUB_PENGAJUAN); default fungsi 5 hanya cadangan.
create or replace function public.bencana_pendataan_minta_total(p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb, p_maks int default 5)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  terpakai int;
  baru int;
  r jsonb;
  ids bigint[] := '{}';
  nid bigint;
begin
  baru := jsonb_array_length(p_pilihan);
  if baru < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('pendataan_minta_' || p_pml::text, 0));
  select count(*) into terpakai from bencana_pendataan_permintaan where pml_id = p_pml and status <> 'dibatalkan';
  if terpakai + baru > p_maks then
    return jsonb_build_object('status','ditolak','alasan','melebihi_batas','sisa', greatest(p_maks - terpakai, 0));
  end if;
  for r in select * from jsonb_array_elements(p_pilihan) loop
    begin
      insert into bencana_pendataan_permintaan (idsubsls, pml_id, ppl_akun_id, tanggal, diminta_oleh)
      values (r->>'idsubsls', p_pml, (r->>'ppl_akun_id')::bigint, p_tanggal, p_akun) returning id into nid;
      ids := ids || nid;
    exception when unique_violation then
      raise exception 'SUDAH_DIMINTA';
    end;
  end loop;
  return jsonb_build_object('status','ok','ids', to_jsonb(ids));
exception when raise_exception then
  if sqlerrm = 'SUDAH_DIMINTA' then return jsonb_build_object('status','ditolak','alasan','sudah_diminta'); end if;
  raise;
end;
$function$;
revoke all on function public.bencana_pendataan_minta_total(bigint, bigint, date, jsonb, int) from public, anon, authenticated;
grant execute on function public.bencana_pendataan_minta_total(bigint, bigint, date, jsonb, int) to service_role;
