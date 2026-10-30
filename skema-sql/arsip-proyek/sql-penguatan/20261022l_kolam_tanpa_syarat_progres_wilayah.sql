-- 22 Okt 2026 — Kolam Wilayah: HAPUS syarat progres wilayah awal (>70%).
-- Aturan baru (keputusan pemilik):
--   * Semua tim boleh memilih dari kolam tanpa ambang progres wilayah.
--   * Sekali Kirim maksimal p_maks Sub SLS (app mengirim 2).
--   * Menambah pilihan lagi HANYA bila seluruh pilihan kolam sebelumnya sudah selesai >= p_syarat_tambahan persen (app mengirim 50).
-- Tanda tangan fungsi TIDAK berubah (p_syarat_awal tetap ada tetapi diabaikan) sehingga kode lama tidak rusak.
-- Hanya mengubah satu fungsi; ACL fungsi dipertahankan oleh CREATE OR REPLACE. Aman dijalankan ulang.
begin;

create or replace function public.bencana_kolam_pilih(
  p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb,
  p_maks integer, p_syarat_awal numeric, p_syarat_tambahan numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  baru int; pr jsonb; tm_n int; tm_t int; tm_d int;
  r jsonb; ids bigint[] := '{}'; nid bigint; aid bigint; ppl_pet bigint; sub text;
begin
  baru := jsonb_array_length(p_pilihan);
  if baru < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kolam_wilayah', 0));

  pr := public.bencana_kolam_progres(p_pml);
  tm_n := (pr->>'tambahan_sub')::int; tm_t := (pr->>'tambahan_total')::int; tm_d := (pr->>'tambahan_didata')::int;

  -- (syarat progres wilayah awal DIHAPUS 22 Okt 2026)

  -- syarat tambah: seluruh pilihan kolam sebelumnya selesai SEKURANGNYA p_syarat_tambahan persen
  if tm_n > 0 and (tm_t = 0 or tm_d * 100 < p_syarat_tambahan * tm_t) then
    return jsonb_build_object('status','ditolak','alasan','tambahan','d',tm_d,'t',tm_t,'n',tm_n);
  end if;
  -- paling banyak p_maks Sub SLS sekali pilih
  if baru > p_maks then
    return jsonb_build_object('status','ditolak','alasan','maks','maks',p_maks);
  end if;

  for r in select * from jsonb_array_elements(p_pilihan) loop
    sub := r->>'idsubsls';
    if not exists (select 1 from public.bencana_kolam_subsls k where k.idsubsls = sub and k.aktif) then
      return jsonb_build_object('status','ditolak','alasan','bukan_kolam','idsubsls',sub);
    end if;
    if exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = sub and a.pml_id is not null) then
      return jsonb_build_object('status','ditolak','alasan','diambil','idsubsls',sub);
    end if;
    select petugas_bencana_id into ppl_pet from public.sigap_akun where id = (r->>'ppl_akun_id')::bigint;
    if ppl_pet is null then
      return jsonb_build_object('status','ditolak','alasan','ppl_tanpa_petugas','idsubsls',sub);
    end if;
    begin
      insert into public.bencana_pendataan_permintaan (idsubsls, pml_id, ppl_akun_id, tanggal, diminta_oleh, dari_kolam)
      values (sub, p_pml, (r->>'ppl_akun_id')::bigint, p_tanggal, p_akun, true) returning id into nid;
      insert into public.bencana_alokasi_subsls (idsubsls, ppl_id, pml_id, mode_kerja, terkunci)
      values (sub, ppl_pet, p_pml, 'keroyok', true) returning id into aid;
      update public.bencana_pendataan_permintaan set alokasi_id = aid where id = nid;
      ids := ids || nid;
    exception when unique_violation then
      raise exception 'DIAMBIL';
    end;
  end loop;
  return jsonb_build_object('status','ok','ids', to_jsonb(ids));
exception when raise_exception then
  if sqlerrm = 'DIAMBIL' then return jsonb_build_object('status','ditolak','alasan','diambil'); end if;
  raise;
end;
$function$;

commit;

-- Verifikasi: baris harus 'f' (tidak lagi memuat kata syarat wilayah)
-- select position('aw_t' in pg_get_functiondef('public.bencana_kolam_pilih(bigint,bigint,date,jsonb,integer,numeric,numeric)'::regprocedure)) = 0 as bersih;
