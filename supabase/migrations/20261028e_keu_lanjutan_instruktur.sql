-- =====================================================================
-- 20261028e_keu_lanjutan_instruktur.sql
-- SIGAP - Instruktur (pengajar atau narasumber) pada kelas identifikasi lanjutan: tiap kelas boleh memuat "instruktur" (daftar maksimal 20; nama, level Innas atau
-- Inda, asal Internal BPS atau Eksternal, jam mengajar per instruktur). Menambah aturan pada pemeriksa keu_lanjutan_periksa; isi lama tanpa kunci "instruktur" tetap sah.
-- Pesan galat SAMA PERSIS dengan lib/keu/lanjutan.ts (periksaLanjutan). Status Draf/Final (keu_lanjutan_status) TIDAK berubah.
-- Bergantung pada 20261025zf. Aman diulang. Tanpa DELETE/DROP. Tidak mengubah data. Uji: 72_uji_lanjutan_instruktur.sql.
-- =====================================================================
do $mig$
declare d text; d0 text; n int; blok text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_lanjutan_periksa' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_lanjutan_periksa tidak ditemukan (jalankan 20261025zf dahulu)'; end if;
  if position('instruktur' in d) = 0 then
    n := (length(d) - length(replace(d, '-- peran', ''))) / length('-- peran');
    if n <> 1 then raise exception 'Penambalan gagal: penanda bagian peran tidak dikenali (% kecocokan)', n; end if;
    blok := $blok$
      if e ? 'instruktur' then
        declare ins jsonb := e -> 'instruktur'; y jsonb; m int := 0; lengkap boolean := true; nm2 text; lv text; asl text; lv_sah boolean; asl_sah boolean;
        begin
          if coalesce(jsonb_typeof(ins), '') <> 'array' or jsonb_array_length(ins) > 20 then
            g := g || format('Kelas %s: daftar instruktur harus berupa daftar maksimal 20 instruktur', n);
          else
            for y in select * from jsonb_array_elements(ins) loop
              m := m + 1;
              if coalesce(jsonb_typeof(y), '') <> 'object' then g := g || format('Kelas %s: instruktur %s tidak valid', n, m); lengkap := false; continue; end if;
              nm2 := keu_lanjutan_teks(y -> 'nama');
              if nm2 is null or char_length(nm2) > 120 then g := g || format('Kelas %s: instruktur %s: nama harus berupa teks maksimal 120 huruf', n, m); nm2 := ''; end if;
              lv := keu_lanjutan_teks(y -> 'level'); asl := keu_lanjutan_teks(y -> 'asal');
              lv_sah := lv is not null and lv = any (array['', 'Innas', 'Inda']);
              asl_sah := asl is not null and asl = any (array['', 'Internal BPS', 'Eksternal']);
              if not lv_sah then g := g || format('Kelas %s: instruktur %s: level tidak dikenal', n, m); end if;
              if not asl_sah then g := g || format('Kelas %s: instruktur %s: asal tidak dikenal', n, m); end if;
              if not keu_kebijakan_bulat(y -> 'jam', 0, 500) then g := g || format('Kelas %s: instruktur %s: jam harus bilangan bulat 0 sampai 500', n, m); end if;
              if btrim(nm2) = '' or not lv_sah or coalesce(lv, '') = '' or not asl_sah or coalesce(asl, '') = '' or not keu_kebijakan_bulat(y -> 'jam', 1, 500) then lengkap := false; end if;
            end loop;
            if (e -> 'fix') = 'true'::jsonb and jsonb_array_length(ins) > 0 and not lengkap then
              g := g || format('Kelas %s: ditandai Fix tetapi instruktur belum lengkap', n);
            end if;
          end if;
        end;
      end if;
    end loop;
  end if;

  -- peran$blok$;
    d0 := d;
    d := regexp_replace(d, '\s*end loop;\s*end if;\s*-- peran', replace(blok, '\', '\\'));
    if d = d0 then raise exception 'Penambalan gagal: akhir putaran kelas tidak ditemukan'; end if;
    execute d;
  end if;
end $mig$;
