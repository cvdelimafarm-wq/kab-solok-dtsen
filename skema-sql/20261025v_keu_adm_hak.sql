-- =====================================================================
-- 20261025v_keu_adm_hak.sql
-- Kertas Kerja Revisi POK (SIGAP) - papan 13 "Administrasi": agar layar tahu dokumen mana yang menjadi bagian akun yang masuk
-- ("Hanya bagian saya", tombol yang pantas tampil), dua fungsi pemeriksa hak yang sudah ada didaftarkan ke gerbang keu_jalankan.
-- Keduanya hanya membaca (mengembalikan benar atau salah); p_akun diisi server. Aman diulang. Tanpa DELETE/DROP.
--   keu_adm_boleh_unggah(p_akun, p_ro, p_pihak text[], p_tgl)  : boleh membuat draf dan mengunggah dokumen berpihak p_pihak
--   keu_adm_boleh_verif (p_akun, p_ro, p_pihak text[], p_tgl)  : boleh memverifikasi atau mengembalikan
-- Hak yang sebenarnya tetap ditegakkan keu_adm_aksi; ini hanya agar tombol tidak ditawarkan sia-sia.
-- =====================================================================
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if not exists (select 1 from pg_proc where proname = 'keu_adm_boleh_unggah' and pronamespace = 'public'::regnamespace)
     or not exists (select 1 from pg_proc where proname = 'keu_adm_boleh_verif' and pronamespace = 'public'::regnamespace) then
    raise exception 'keu_adm_boleh_unggah atau keu_adm_boleh_verif tidak ditemukan';
  end if;
  if position('''keu_adm_boleh_unggah''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_adm_boleh_unggah'',''keu_adm_boleh_verif'',');
    if position('''keu_adm_boleh_unggah''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
