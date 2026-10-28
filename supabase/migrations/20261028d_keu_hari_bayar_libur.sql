-- =====================================================================
-- 20261028d_keu_hari_bayar_libur.sql
-- SIGAP - (1) Parameter OPSIONAL "hari_bayar_maks" pada lembar kebijakan: batas pembayaran dalam HARI KERJA sesudah hari terakhir pelaksanaan kegiatan
--   (angka awal 10; cek aturan). Menggantikan "hari_cair_maks" (hari kalender, 20261026a). SPJ memakai parameter wajib yang sudah ada, "batas_spj" (5 hari kerja).
--   (2) Tampilan baca keu_v_libur: kalender libur Delego (keu_dlg_libur) untuk menghitung hari kerja di identifikasi dan RAB.
-- Bergantung pada 20261026a dan 20261026g. Aman diulang. Tanpa DELETE/DROP. Tidak mengubah data.
--
-- Parameter lama hari_cair_maks tetap DITERIMA pada lembar yang sudah ada (tetap diperiksa 0 sampai 60) tetapi tidak lagi dibaca pemakai hilir.
-- Lembar tanpa hari_bayar_maks tetap sah; pemakai hilir memakai bawaan 10 hari kerja.
-- Kembaran TypeScript: lib/keu/kebijakan.ts (KODE_PARAM_OPSIONAL, KODE_PARAM_LAMA, periksaIsi), lib/keu/hariKerja.ts. Uji: 71_uji_hari_bayar.sql.
-- =====================================================================
do $$
declare d text; d0 text; n int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_kebijakan_periksa' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_kebijakan_periksa tidak ditemukan (jalankan 20261025zd dan 20261026a dahulu)'; end if;
  if position('hari_cair_maks' in d) = 0 then raise exception 'keu_kebijakan_periksa belum ditambal 20261026a'; end if;
  if position('hari_bayar_maks' in d) = 0 then
    -- 1. putaran pemeriksaan jenis mencakup parameter opsional baru
    d0 := d;
    d := replace(d, 'array[''hari_cair_maks'']', 'array[''hari_cair_maks'',''hari_bayar_maks'']');
    if d = d0 then raise exception 'Penambalan gagal: daftar parameter opsional tidak ditemukan'; end if;
    -- 2. aturan tambahan: bilangan bulat 0 sampai 60
    n := (length(d) - length(replace(d, 'return g;', ''))) / length('return g;');
    if n <> 1 then raise exception 'Penambalan gagal: akhir fungsi tidak dikenali (% kecocokan)', n; end if;
    d := replace(d, 'return g;',
      'x := peta -> ''hari_bayar_maks'';' || chr(10) ||
      '  if x is not null and x ->> ''jenis'' = ''angka'' then' || chr(10) ||
      '    if (keu_kebijakan_angka(x -> ''aturan'') is not null and not keu_kebijakan_bulat(x -> ''aturan'', 0, 60))' || chr(10) ||
      '       or (keu_kebijakan_angka(x -> ''kebijakan'') is not null and not keu_kebijakan_bulat(x -> ''kebijakan'', 0, 60)) then' || chr(10) ||
      '      g := g || ''Parameter hari_bayar_maks: harus bilangan bulat 0 sampai 60''::text;' || chr(10) ||
      '    end if;' || chr(10) ||
      '  end if;' || chr(10) ||
      '  return g;');
    execute d;
  end if;
end $$;

create or replace view keu_v_libur with (security_invoker = true) as
select l.tanggal, l.nama, l.jenis, l.aktif from keu_dlg_libur l;
comment on view keu_v_libur is 'Kalender libur (nasional, cuti bersama, lainnya) milik Delego; dipakai menghitung hari kerja pada identifikasi dan RAB.';
revoke all on keu_v_libur from anon, authenticated, public;
grant select on keu_v_libur to service_role;
