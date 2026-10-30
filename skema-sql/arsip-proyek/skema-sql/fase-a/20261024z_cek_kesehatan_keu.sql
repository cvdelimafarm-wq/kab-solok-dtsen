-- =====================================================================
-- 20261024z_cek_kesehatan_keu.sql  (HANYA MEMBACA; jalankan sesudah migrasi a, b, c, dan ulangi sesudah d, e, f)
-- Semua baris hasil harus berstatus OK. Baris P0 / GAGAL = hentikan dan laporkan.
-- =====================================================================
with t as (
  select c.oid, c.relname nama, c.relrowsecurity rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%'
), cek(urut, nama, hasil) as (
  select 1, 'P0 tabel keu_ tanpa RLS (harus 0)', (select count(*) from t where not rls)::text
  union all select 2, 'P0 fungsi definer keu_ terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname like 'keu\_%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 3, 'P0 tabel keu_ terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from t where has_table_privilege('anon', t.oid, 'select') or has_table_privilege('authenticated', t.oid, 'select'))::text
  union all select 4, 'jumlah tabel keu_ (sesuai fase terpasang: a+b+c = 25, +5 d, +5 e, +4 f, +6 h, +3 i, +3 j, +2 k)',
    (select count(*) from t) || ' dari ' || (25 + case when to_regclass('public.keu_rab') is not null then 5 else 0 end
                                                  + case when to_regclass('public.keu_revisi_jadwal') is not null then 5 else 0 end
                                                  + case when to_regclass('public.keu_kk_baris') is not null then 4 else 0 end
                                                  + case when to_regclass('public.keu_pok_unggah') is not null then 6 else 0 end
                                                  + case when to_regclass('public.keu_adm_dok') is not null then 3 else 0 end
                                                  + case when to_regclass('public.keu_kekurangan') is not null then 3 else 0 end
                                                  + case when to_regclass('public.keu_struktur_usulan') is not null then 2 else 0 end)
  union all select 5, 'peran / kewenangan / matriks (9 / 17 / 31)',
    (select count(*) from keu_master_peran) || ' / ' || (select count(*) from keu_master_kewenangan) || ' / ' || (select count(*) from keu_master_kewenangan_peran)
  union all select 6, 'akun / kelompok / pola (43 / 4 / 7)',
    (select count(*) from keu_master_akun) || ' / ' || (select count(*) from keu_master_kelompok) || ' / ' || (select count(*) from keu_master_pola_dok)
  union all select 7, 'satuan / alias / belum pasti (20 / 29 / 0)',
    (select count(*) from keu_master_satuan) || ' / ' || (select count(*) from keu_master_satuan_alias) || ' / ' || (select count(*) from keu_master_satuan where not pasti)
  union all select 8, 'level / tampil / jalur (8 / 7 / 26)',
    (select count(*) from keu_struktur_level) || ' / ' || (select count(*) from keu_struktur_level where tampil) || ' / ' || (select count(*) from keu_master_jalur)
  union all select 9, 'RO terdaftar / dokumen (35 / 297)',
    (select count(*) from keu_ro) || ' / ' || (select count(*) from keu_master_dok)
  union all select 10, 'bobot skor jumlah 100 dan ambang baik > cukup (harus true)',
    (select (bobot_penarikan + bobot_volume + bobot_cakupan + bobot_disiplin = 100 and ambang_baik > ambang_cukup)::text from keu_master_skor)
  union all select 11, 'profil penarikan jumlah (harus 100)', (select sum(persen) from keu_master_profil_penarikan)::text
  union all select 12, 'akun tanpa kelompok (harus 0)', (select count(*) from keu_master_akun where kelompok_kode is null)::text
  union all select 13, 'PPK aktif hari ini (harus 1 setelah penugasan diisi; 0 sebelumnya)',
    (select count(*) from keu_penugasan where peran_kode = 'PPK' and dibatalkan_at is null and masa @> current_date)::text
  union all select 14, 'RO tanpa ketua tim aktif hari ini (daftar belum diisi = 35)',
    (select count(*) from keu_ro r where r.aktif and not exists (select 1 from keu_penugasan p where p.ro_kode = r.kode and p.peran_kode = 'KETUA' and p.dibatalkan_at is null and p.masa @> current_date))::text
  union all select 15, 'versi POK berlaku (harus 0 atau 1 per tahun)', (select count(*) from keu_pok_versi where status = 'berlaku')::text
  union all select 16, 'node POK tidak konsisten pada versi berlaku (harus 0)',
    (select count(*) from keu_v_pok_selisih s join keu_pok_versi v on v.id = s.versi_id where v.status = 'berlaku' and s.selisih <> 0)::text
)
select urut, nama, hasil from cek order by urut;
