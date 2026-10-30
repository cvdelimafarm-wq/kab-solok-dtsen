-- =====================================================================
-- 20261026a_keu_kebijakan_hari_cair.sql
-- SIGAP - Parameter OPSIONAL "hari_cair_maks" pada lembar kebijakan (tahap 33, jendela pencairan). Isinya batas hari pencairan setelah hari terakhir
-- pelaksanaan kegiatan (H+N; angka awal 5, cek aturan). Dipakai kartu "Usulan dari identifikasi" dan "Rencana realisasi" di tab RAB.
-- Bergantung pada 20261025zd. Aman diulang. Tanpa DELETE/DROP. Tidak mengubah data: hanya menambah aturan pemeriksa.
--
-- Opsional = lembar tanpa parameter ini tetap sah (lembar lama, draf lama, uji 50). Bila ada, parameter diperiksa seperti parameter lain
-- (kebijakan sama atau lebih ketat dari aturan; kosong pada keduanya = tanpa batas) ditambah: bilangan bulat 0 sampai 60.
-- Lembar yang dibuat dari angka predefined sesudah migrasi ini (aplikasi versi baru) sudah memuatnya. Lembar yang sudah berlaku tidak diubah
-- (terkunci); pemakai hilir memakai bawaan H+5 bila parameter tidak ada.
-- Kembaran TypeScript: lib/keu/kebijakan.ts (KODE_PARAM_OPSIONAL, periksaIsi). Uji: 55_uji_hari_cair.sql.
-- =====================================================================
do $$
declare d text; d0 text; n int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_kebijakan_periksa' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_kebijakan_periksa tidak ditemukan (jalankan 20261025zd dahulu)'; end if;
  if position('hari_cair_maks' in d) = 0 then
    -- 1. putaran pemeriksaan jenis mencakup parameter opsional (yang tidak ada dilewati, tidak dilaporkan "belum ada")
    d0 := d;
    d := regexp_replace(d, 'foreach k in array kpar loop(\s+)if not \(k = any\(lihat\)\) then continue; end if;',
                           'foreach k in array (kpar || array[''hari_cair_maks'']) loop\1if not (k = any(lihat)) then continue; end if;');
    if d = d0 then raise exception 'Penambalan gagal: putaran pemeriksa parameter tidak ditemukan'; end if;
    -- 2. aturan tambahan: bilangan bulat 0 sampai 60
    n := (length(d) - length(replace(d, 'return g;', ''))) / length('return g;');
    if n <> 1 then raise exception 'Penambalan gagal: akhir fungsi tidak dikenali (% kecocokan)', n; end if;
    d := replace(d, 'return g;',
      'x := peta -> ''hari_cair_maks'';' || chr(10) ||
      '  if x is not null and x ->> ''jenis'' = ''angka'' then' || chr(10) ||
      '    if (keu_kebijakan_angka(x -> ''aturan'') is not null and not keu_kebijakan_bulat(x -> ''aturan'', 0, 60))' || chr(10) ||
      '       or (keu_kebijakan_angka(x -> ''kebijakan'') is not null and not keu_kebijakan_bulat(x -> ''kebijakan'', 0, 60)) then' || chr(10) ||
      '      g := g || ''Parameter hari_cair_maks: harus bilangan bulat 0 sampai 60''::text;' || chr(10) ||
      '    end if;' || chr(10) ||
      '  end if;' || chr(10) ||
      '  return g;');
    execute d;
  end if;
end $$;
