-- =====================================================================
-- 20261029a_keu_honor_instruktur.sql
-- SIGAP - Parameter OPSIONAL "honor_innas" dan "honor_inda" pada lembar kebijakan: tarif honor instruktur per JP (jam pelajaran), angka awal Rp 111.000 (cek aturan).
-- Dipakai rincian biaya identifikasi lanjutan (baris "honor instruktur" per kelas, level, dan asal). Lembar tanpa parameter ini tetap sah (lembar lama,
-- lembar yang sudah berlaku dan terkunci); pemakai hilir memakai bawaan Rp 111.000.
-- Bergantung pada 20261025zd, 20261026a, dan 20261028d. Aman diulang. Tanpa DELETE/DROP. Tidak mengubah data: hanya menambah kode pada putaran pemeriksa.
-- Aturan pemeriksaan sama dengan parameter angka lain (kebijakan sama atau lebih ketat dari aturan; nilai harus angka).
-- Kembaran TypeScript: lib/keu/kebijakan.ts (KODE_PARAM_OPSIONAL, periksaIsi), lib/keu/lanjutan.ts (tarifHonor). Uji: 76_uji_honor_instruktur.sql.
-- =====================================================================
do $$
declare d text; d0 text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_kebijakan_periksa' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_kebijakan_periksa tidak ditemukan (jalankan 20261025zd dahulu)'; end if;
  if position('hari_bayar_maks' in d) = 0 then raise exception 'keu_kebijakan_periksa belum ditambal 20261028d'; end if;
  if position('honor_innas' in d) = 0 then
    d0 := d;
    d := replace(d, 'array[''hari_cair_maks'',''hari_bayar_maks'']', 'array[''hari_cair_maks'',''hari_bayar_maks'',''honor_innas'',''honor_inda'']');
    if d = d0 then raise exception 'Penambalan gagal: daftar parameter opsional tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
