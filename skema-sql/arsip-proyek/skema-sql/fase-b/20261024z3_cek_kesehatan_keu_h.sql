-- =====================================================================
-- 20261024z3_cek_kesehatan_keu_h.sql  (HANYA MEMBACA; jalankan sesudah migrasi h)
-- Baris P0 harus 0. Baris "info" hanya informasi.
-- =====================================================================
with daftar(nama) as (values
  ('keu_pok_unggah'),('keu_pok_unggah_baris'),('keu_pok_unggah_padan'),
  ('keu_item_nomor'),('keu_realisasi_unggah'),('keu_realisasi_item')
), cek(urut, nama, hasil) as (
  select 1, 'P0 tabel h yang belum ada (harus 0)',
    (select count(*) from daftar where to_regclass('public.' || nama) is null)::text
  union all select 2, 'P0 tabel h tanpa RLS atau terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from daftar d join pg_class c on c.oid = to_regclass('public.' || d.nama)
     where not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))::text
  union all select 3, 'P0 tabel h tanpa trigger penjaga (harus 0)',
    (select count(*) from daftar d where to_regclass('public.' || d.nama) is not null
       and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || d.nama) and not t.tgisinternal))::text
  union all select 4, 'P0 view keu_v_ terbuka bagi anon/authenticated atau tanpa security_invoker (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'keu\_v\_%'
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
            or coalesce(c.reloptions::text, '') not like '%security_invoker=true%'))::text
  union all select 5, 'P0 fungsi definer keu_ terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname like 'keu\_%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 6, 'P0 unggahan realisasi diterima dengan tanggal kembar (harus 0)',
    (select count(*) from (select tahun, sampai_tanggal from keu_realisasi_unggah where status = 'diterima' group by 1, 2 having count(*) > 1) x)::text
  union all select 7, 'P0 unggahan POK diterima tanpa versi, atau versi tidak sama hash (harus 0)',
    (select count(*) from keu_pok_unggah u left join keu_pok_versi v on v.id = u.versi_id
     where u.status = 'diterima' and (v.id is null or v.hash_berkas <> u.hash_berkas))::text
  union all select 8, 'P0 nomor item yang menunjuk kunci yang tidak ada pada POK berlaku (info penting; harus 0 setelah pemadanan)',
    (select count(*) from keu_item_nomor n
     where n.tahun = (select max(tahun) from keu_pok_versi where status = 'berlaku')
       and not exists (select 1 from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id
                       where v.status = 'berlaku' and v.tahun = n.tahun and d.kunci_stabil = keu_kunci_resolusi(n.kunci_stabil)))::text
  union all select 9, 'info: unggahan POK menunggu (diunggah)', (select count(*) from keu_pok_unggah where status = 'diunggah')::text
  union all select 10, 'info: unggahan realisasi diterima / tanggal data terbaru',
    (select count(*) || ' / ' || coalesce(max(sampai_tanggal)::text, '-') from keu_realisasi_unggah where status = 'diterima')
  union all select 11, 'info: item realisasi terbaru yang belum cocok dengan POK', (select count(*) from keu_v_realisasi_terbaru where detail_id is null)::text
  union all select 12, 'info: peringatan SPAN merah / kuning',
    (select count(*) filter (where tingkat = 'merah') || ' / ' || count(*) filter (where tingkat = 'kuning') from keu_v_span_peringatan)
  union all select 13, 'info: baris kertas kerja di bawah realisasi (R-06)', (select count(*) from keu_v_kk_r06)::text
  union all select 14, 'info: jumlah tabel keu_ (harus 45 sesudah a-f dan h)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%')::text
)
select urut, nama, hasil from cek order by urut;
