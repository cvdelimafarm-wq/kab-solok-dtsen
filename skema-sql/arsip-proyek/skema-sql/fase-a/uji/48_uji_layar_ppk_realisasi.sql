\set ON_ERROR_STOP on
-- Uji layar PPK, keputusan kekurangan, dan unggah realisasi: muatan PERSIS seperti yang dibangun aplikasi (lib/keu/revisi.ts, glp039-xlsx.ts)
-- lewat gerbang keu_jalankan. Dijalankan sesudah 47. Dibatalkan (rollback) di akhir. Akun: 3 PPK, 4 Ketua 2906.BMA.005, 7 Bendahara, 12 pegawai biasa.
begin;
create or replace function pg_temp.gagal(p_sql text, p_state text default null) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'SEHARUSNYA GAGAL: %', p_sql;
exception when others then
  if sqlerrm like 'SEHARUSNYA GAGAL%' then raise; end if;
  if p_state is not null and sqlstate <> p_state then raise exception 'SQLSTATE % bukan % untuk: % (%)', sqlstate, p_state, p_sql, sqlerrm; end if;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'GAGAL: %', p_msg; end if; end $$;

create or replace function pg_temp.pk(t bigint, a1 bigint, k1 text, a2 bigint, k2 text, al2 text, a3 bigint, k3 text) returns jsonb language sql as $$
  select jsonb_build_object('p_tambahan', t, 'p_keputusan',
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'keputusan', 'tunda', 'alasan', '')), '[]'::jsonb) from keu_kekurangan
      where ro_kode = '2906.BMA.005' and status in ('tercatat','ditunda') and id not in (a1, a2, a3))
    || jsonb_build_array(jsonb_build_object('id', a1, 'keputusan', k1, 'alasan', ''), jsonb_build_object('id', a2, 'keputusan', k2, 'alasan', al2), jsonb_build_object('id', a3, 'keputusan', k3, 'alasan', '')));
$$;

do $$
declare j bigint; n int; h jsonb; ke text; u bigint; t bigint; sisa numeric; kk1 bigint; kk2 bigint; kk3 bigint; r jsonb; un bigint; c int;
        saran jsonb;
begin
  perform set_config('app.akun_id', '', true);

  -- ===== jadwal: buat bulanan, buka, tutup, terapkan, sah =====
  perform pg_temp.gagal($q$select keu_jalankan(12, 'keu_jadwal_bulanan', '{"p_tahun":2026,"p_dari":12,"p_hari":17}')$q$, '42501');
  h := keu_jalankan(3, 'keu_jadwal_bulanan', '{"p_tahun":2026,"p_dari":12,"p_hari":17}');
  perform pg_temp.ok((h #>> '{}')::int >= 0, 'jadwal bulanan mengembalikan bilangan');
  select id into j from keu_revisi_jadwal where tahun = 2026 and jenis = 'pok' and buka = date '2026-12-17';
  perform pg_temp.ok(j is not null, 'jadwal Desember ada');
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_jadwal_aksi', '{"p_jadwal":%s,"p_aksi":"buka"}')$q$, j), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_jadwal_aksi', '{"p_jadwal":%s,"p_aksi":"sah","p_nomor":"S-1","p_tanggal":"2026-10-24"}')$q$, j), '23514'); -- belum diterapkan
  h := keu_jalankan(3, 'keu_jadwal_aksi', format('{"p_jadwal":%s,"p_aksi":"buka"}', j)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'dibuka', 'buka -> dibuka');

  -- ===== usulan menunggu PPK: sahkan dan kembalikan lewat gerbang =====
  perform set_config('app.akun_id', '4', true);
  insert into keu_revisi_usulan(jadwal_id, ro_kode, status, dibuat_oleh) values (j, '2906.BMA.005', 'draf', 4) returning id into u;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_revisi_usulan set status = 'menunggu_ppk', diajukan_oleh = 4, diajukan_at = now(), disetujui_ketua_oleh = 4, disetujui_ketua_at = now() where id = u;
  perform set_config('keu.via_fungsi', '', true);
  perform set_config('app.akun_id', '', true);
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_usulan_aksi', '{"p_usulan":%s,"p_aksi":"sahkan"}')$q$, u), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_usulan_aksi', '{"p_usulan":%s,"p_aksi":"kembalikan","p_catatan":"x"}')$q$, u), '23514');
  h := keu_jalankan(3, 'keu_usulan_aksi', format('{"p_usulan":%s,"p_aksi":"kembalikan","p_catatan":"lengkapi rincian dulu"}', u)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'dikembalikan', 'kembalikan');
  perform set_config('keu.via_fungsi', '1', true);
  update keu_revisi_usulan set status = 'menunggu_ppk' where id = u;
  perform set_config('keu.via_fungsi', '', true);
  h := keu_jalankan(3, 'keu_usulan_aksi', format('{"p_usulan":%s,"p_aksi":"sahkan"}', u)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'disetujui', 'sahkan');

  h := keu_jalankan(3, 'keu_jadwal_aksi', format('{"p_jadwal":%s,"p_aksi":"tutup"}', j)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'terkumpul', 'tutup');
  h := keu_jalankan(3, 'keu_jadwal_aksi', format('{"p_jadwal":%s,"p_aksi":"terapkan"}', j)::jsonb);
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_jadwal_aksi', '{"p_jadwal":%s,"p_aksi":"sah","p_nomor":"S-","p_tanggal":"2026-10-24"}')$q$, j), '23514');
  h := keu_jalankan(3, 'keu_jadwal_aksi', format('{"p_jadwal":%s,"p_aksi":"sah","p_nomor":"S-123/KN.2/2026","p_tanggal":"2026-10-24"}', j)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'sah', 'sah');
  perform pg_temp.ok((select nomor_dokumen = 'S-123/KN.2/2026' from keu_revisi_sah where jadwal_id = j), 'nomor sah tercatat');

  -- ===== tambahan pagu resmi + keputusan kekurangan (RO 2906.BMA.005) =====
  -- catat tiga kekurangan terbuka oleh ketua tim (muatan argsCatat)
  kk1 := (keu_jalankan(4, 'keu_kekurangan_catat', '{"p_ro":"2906.BMA.005","p_akun_kode":"521211","p_uraian":"ATK tambahan","p_jumlah":600,"p_prioritas":"inti","p_alasan":"kurang","p_komponen":null}'))::text::bigint;
  kk2 := (keu_jalankan(4, 'keu_kekurangan_catat', '{"p_ro":"2906.BMA.005","p_akun_kode":"521211","p_uraian":"Konsumsi tambahan","p_jumlah":500,"p_prioritas":"penting","p_alasan":"kurang","p_komponen":null}'))::text::bigint;
  kk3 := (keu_jalankan(4, 'keu_kekurangan_catat', '{"p_ro":"2906.BMA.005","p_akun_kode":"521211","p_uraian":"Cetak tambahan","p_jumlah":300,"p_prioritas":"tunda","p_alasan":"kurang","p_komponen":null}'))::text::bigint;

  perform pg_temp.gagal($q$select keu_jalankan(4, 'keu_tambahan_pagu_catat', '{"p_ro":"2906.BMA.005","p_jumlah":1000,"p_jalur":"djpb","p_nomor":"S-9/2026","p_tanggal":"2026-10-20","p_catatan":""}')$q$, '42501'); -- ketua bukan PPK
  h := keu_jalankan(3, 'keu_tambahan_pagu_catat', '{"p_ro":"2906.BMA.005","p_jumlah":1000,"p_jalur":"djpb","p_nomor":"S-9/2026","p_tanggal":"2026-10-20","p_catatan":""}');
  t := (h #>> '{}')::bigint;
  perform pg_temp.gagal($q$select keu_jalankan(3, 'keu_tambahan_pagu_catat', '{"p_ro":"2906.BMA.005","p_jumlah":1000,"p_jalur":"djpb","p_nomor":"S-9/2026","p_tanggal":"2026-10-20","p_catatan":""}')$q$);  -- dokumen ganda

  -- saran (fungsi mengembalikan tabel -> larik JSON, dibaca aplikasi lewat awalKeputusan)
  saran := keu_jalankan(4, 'keu_kekurangan_saran', format('{"p_tambahan":%s}', t)::jsonb);
  perform pg_temp.ok(jsonb_typeof(saran) = 'array' and jsonb_array_length(saran) >= 3, 'saran berupa larik');
  perform pg_temp.ok(saran -> 0 ? 'kekurangan_id' and saran -> 0 ? 'saran', 'saran memuat kekurangan_id dan saran');
  perform pg_temp.ok((select s ->> 'saran' from jsonb_array_elements(saran) s where (s ->> 'kekurangan_id')::bigint = kk1) = 'penuhi', 'saran 1 penuhi');
  perform pg_temp.ok((select s ->> 'saran' from jsonb_array_elements(saran) s where (s ->> 'kekurangan_id')::bigint = kk2) = 'tunda', 'saran 2 tunda (tidak muat)');

  -- keputusan: harus lengkap; melebihi tambahan ditolak; tolak wajib alasan; bukan ketua ditolak
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_kekurangan_putuskan', '{"p_tambahan":%s,"p_keputusan":[{"id":%s,"keputusan":"penuhi","alasan":""}]}')$q$, t, kk1), '23514');           -- belum semua
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_kekurangan_putuskan', %L::jsonb)$q$, pg_temp.pk(t, kk1, 'penuhi', kk2, 'penuhi', '', kk3, 'tunda')::text), '23514'); -- 1100 > 1000
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_kekurangan_putuskan', %L::jsonb)$q$, pg_temp.pk(t, kk1, 'penuhi', kk2, 'tolak', 'x', kk3, 'tunda')::text), '23514'); -- alasan tolak terlalu pendek
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_kekurangan_putuskan', '{"p_tambahan":%s,"p_keputusan":[]}')$q$, t), '42501');
  h := keu_jalankan(4, 'keu_kekurangan_putuskan', pg_temp.pk(t, kk1, 'penuhi', kk2, 'tolak', 'tidak prioritas', kk3, 'tunda'));
  perform pg_temp.ok((h #>> '{}')::numeric = 400, 'sisa penggenap 400');
  perform pg_temp.ok((select status from keu_kekurangan where id = kk1) = 'dipenuhi' and (select status from keu_kekurangan where id = kk2) = 'ditolak' and (select status from keu_kekurangan where id = kk3) = 'ditunda', 'status kekurangan sesuai keputusan');
  perform pg_temp.ok((select status = 'diputus' and dipenuhi_total = 600 and sisa_penggenap = 400 from keu_tambahan_pagu where id = t), 'tambahan diputus');

  -- tambahan kedua dibatalkan oleh PPK
  h := keu_jalankan(3, 'keu_tambahan_pagu_catat', '{"p_ro":"2906.BMA.006","p_jumlah":2500,"p_jalur":"dja","p_nomor":"S-77/2026","p_tanggal":"2026-10-21","p_catatan":"uji"}');
  t := (h #>> '{}')::bigint;
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_tambahan_pagu_batal', '{"p_id":%s,"p_alasan":"x"}')$q$, t), '23514');
  perform keu_jalankan(3, 'keu_tambahan_pagu_batal', format('{"p_id":%s,"p_alasan":"salah catat nomor"}', t)::jsonb);
  perform pg_temp.ok((select status = 'dibatalkan' from keu_tambahan_pagu where id = t), 'tambahan dibatalkan');

  -- ===== realisasi: muatan p_item seperti keluaran uraiGlp039 =====
  perform pg_temp.gagal($q$select keu_jalankan(12, 'keu_realisasi_masuk', '{"p_tahun":2026,"p_sampai":"2026-10-31","p_nama":"x.xlsx","p_hash":"aa","p_item":[]}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(7, 'keu_realisasi_masuk', '{"p_tahun":2026,"p_sampai":"2026-10-31","p_nama":"x.xlsx","p_hash":"aa","p_item":[]}')$q$, '22023');
  perform pg_temp.gagal($q$select keu_jalankan(7, 'keu_realisasi_masuk', '{"p_tahun":2026,"p_sampai":"2026-10-31","p_nama":"x.xlsx","p_hash":"aa","p_item":[{"nomor_item":"900001","ro_kode":"2906.BMA.005","komponen_kode":"051","akun_kode":"521211","uraian":"salah","pagu":1000,"lock_pagu":0,"real_lalu":200,"real_ini":300,"real_sd":400,"sisa":600}]}')$q$, '23514');
  h := keu_jalankan(7, 'keu_realisasi_masuk', '{"p_tahun":2026,"p_sampai":"2026-10-31","p_nama":"Laporan_Fa_Detail.xlsx","p_hash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","p_item":[
     {"nomor_item":"900001","ro_kode":"2906.BMA.005","komponen_kode":"051","akun_kode":"521211","uraian":"Item uji satu","pagu":1000,"lock_pagu":0,"real_lalu":200,"real_ini":300,"real_sd":500,"sisa":500},
     {"nomor_item":"900002","ro_kode":"2906.BMA.005","komponen_kode":"051","akun_kode":"521211","uraian":"Item uji dua","pagu":2000,"lock_pagu":100,"real_lalu":0,"real_ini":0,"real_sd":0,"sisa":1900}]}'::jsonb);
  un := (h #>> '{}')::bigint;
  perform pg_temp.ok((select n_item = 2 and total_pagu = 3000 and total_lock = 100 and total_sd = 500 and status = 'diterima' from keu_realisasi_unggah where id = un), 'unggahan tercatat dengan total');
  perform pg_temp.gagal($q$select keu_jalankan(7, 'keu_realisasi_masuk', '{"p_tahun":2026,"p_sampai":"2026-10-31","p_nama":"lagi.xlsx","p_hash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","p_item":[{"nomor_item":"900001","ro_kode":"2906.BMA.005","komponen_kode":"051","akun_kode":"521211","uraian":"Item uji satu","pagu":1000,"lock_pagu":0,"real_lalu":200,"real_ini":300,"real_sd":500,"sisa":500}]}')$q$);  -- satu tanggal satu kali
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_realisasi_batalkan', '{"p_unggah":%s,"p_alasan":"salah berkas"}')$q$, un), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(7, 'keu_realisasi_batalkan', '{"p_unggah":%s,"p_alasan":"x"}')$q$, un), '23514');
  perform keu_jalankan(7, 'keu_realisasi_batalkan', format('{"p_unggah":%s,"p_alasan":"salah berkas"}', un)::jsonb);
  perform pg_temp.ok((select status = 'dibatalkan' from keu_realisasi_unggah where id = un), 'unggahan dibatalkan');

  raise notice 'LULUS 48';
end $$;
rollback;
