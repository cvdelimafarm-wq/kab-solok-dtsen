-- 20261021c_batalkan_keluarga_baru.sql
--
-- (21 Okt 2026) Tombol "Batalkan + keluarga baru" di kartu KK hasil tambahan (Lembar Pendataan).
-- Latar: PPL menambah "GUSNIMAR" (Jorong Lubuak Aguang 01) lewat tombol "+ Keluarga baru", padahal KK itu sudah ada di prelist
-- (hasil tambah salah / dobel). Fungsi pembatalan sudah ada sejak 20261011013034 tetapi hanya boleh dipakai PML dan belum punya tombol.
--
-- Perubahan aturan bencana_pendataan_nonaktifkan(p_akun, p_kk, p_alasan):
--   * tetap hanya untuk KK hasil tambah (ditambah_oleh_akun terisi); KK dari unggahan FASIH tidak bisa dibatalkan di sini;
--   * boleh dipakai (a) PML tim pemilik Sub SLS (seperti sebelumnya), atau (b) akun yang menambahkannya (PPL penambah), asalkan
--     Sub SLS-nya masih wilayah tim akun itu DAN belum ditimpa hasil rekan (ppl_akun_id kosong atau milik akun itu sendiri);
--   * pembatalan lunak: aktif=false + nonaktif_oleh/at/alasan; baris dan log tidak dihapus; KK hilang dari daftar, hitungan, dan peta
--     karena semua kueri menyaring aktif.
-- Penolakan baru: 'bukan_penambah_atau_pml' (menggantikan 'bukan_pml_tim'), 'sudah_ditimpa_rekan'.
-- Tetap SECURITY DEFINER dan hanya untuk service_role.

create or replace function public.bencana_pendataan_nonaktifkan(p_akun bigint, p_kk bigint, p_alasan text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kk public.bencana_pendataan_kk%rowtype;
  v_pml boolean;
  v_penambah boolean;
begin
  select * into v_kk from public.bencana_pendataan_kk where id = p_kk for update;
  if not found then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'kk_tidak_ada');
  end if;
  if v_kk.ditambah_oleh_akun is null then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_hasil_tambah');
  end if;
  -- wilayah tim akun ini harus memuat Sub SLS KK (berlaku untuk PML maupun PPL)
  if not exists (select 1 from public.bencana_pendataan_subsls_akun(p_akun) x where x = v_kk.idsubsls) then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_pml_tim');
  end if;
  v_pml := exists (
    select 1 from public.sigap_akun s
      join public.bencana_petugas p on p.id = s.petugas_bencana_id and p.aktif and p.peran = 'pml'
     where s.id = p_akun and s.aktif
  );
  v_penambah := v_kk.ditambah_oleh_akun = p_akun;
  if not v_pml and not v_penambah then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_penambah_atau_pml');
  end if;
  if not v_kk.aktif then
    return jsonb_build_object('status', 'sudah');
  end if;
  -- PPL penambah tidak boleh membatalkan bila rekan sudah menimpa hasilnya (PML tetap boleh)
  if not v_pml and v_kk.ppl_akun_id is not null and v_kk.ppl_akun_id <> p_akun then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'sudah_ditimpa_rekan');
  end if;
  update public.bencana_pendataan_kk
     set aktif = false,
         nonaktif_oleh_akun = p_akun,
         nonaktif_at = now(),
         nonaktif_alasan = nullif(left(btrim(coalesce(p_alasan, '')), 200), ''),
         diperbarui_at = now()
   where id = p_kk;
  return jsonb_build_object('status', 'tercatat');
end $function$;

revoke all on function public.bencana_pendataan_nonaktifkan(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.bencana_pendataan_nonaktifkan(bigint, bigint, text) to service_role;
