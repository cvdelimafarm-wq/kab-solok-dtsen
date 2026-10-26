\set ON_ERROR_STOP on
-- Uji Delego (berkas 20261026c): hak, bentuk masukan, buat/ubah/terima, lapor (susulan, mewakili, batas 7 hari), tanggapan, pembinaan, penghargaan,
-- penilaian, pembacaan, kunci tulis langsung, izin dan notifikasi. Dijalankan sesudah migrasi 20261026c. Akun 354 memegang semua peran; akun lain
-- pegawai biasa. Bagian mitra dilewati bila tidak ada akun mitra aktif. Dibatalkan (rollback) di akhir; semua data fiktif.
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
create or replace function pg_temp.panggil(p_akun bigint, p_fungsi text, p_args jsonb) returns jsonb language plpgsql as $$
begin return keu_jalankan(p_akun, p_fungsi, p_args)::text::jsonb; end $$;
create or replace function pg_temp.sq(p_akun bigint, p_fungsi text, p_args jsonb) returns text language sql as $$
  select format('select keu_jalankan(%s, %L, %L::jsonb)', p_akun, p_fungsi, p_args::text)
$$;

do $$
declare
  admin bigint := 354; p bigint; o2 bigint; m bigint; ro text := '2906.BMA.001'; hari date := keu_dlg_hari_ini();
  j jsonb; ids jsonb; id1 bigint; id2 bigint; idm bigint; lp bigint; bid bigint;
begin
  perform set_config('app.akun_id', '', true);
  select id into p  from sigap_akun where aktif and jenis = 'organik' and id <> admin and not super order by id limit 1;
  select id into o2 from sigap_akun where aktif and jenis = 'organik' and id not in (admin, p) and not super order by id limit 1;
  select id into m  from sigap_akun where aktif and jenis = 'mitra' order by id limit 1;
  perform pg_temp.ok(p is not null and o2 is not null, 'butuh dua akun organik aktif selain admin');

  -- ===== hak =====
  j := pg_temp.panggil(admin, 'keu_dlg_hak', '{}'::jsonb);
  perform pg_temp.ok((j ->> 'semua')::boolean, 'admin: hak semua');
  j := pg_temp.panggil(p, 'keu_dlg_hak', '{}'::jsonb);
  perform pg_temp.ok(not (j ->> 'semua')::boolean and jsonb_array_length(j -> 'beri_ro') = 0, 'pegawai biasa tidak punya hak beri');

  -- ===== buat: hak dan bentuk masukan =====
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI tanpa hak', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', o2, 'peran', 'pegawai'))))), '42501');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI tanpa penerima', 'tenggat', hari + 5, 'penerima', '[]'::jsonb))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI tenggat mundur', 'mulai', hari, 'tenggat', hari - 1, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI bobot', 'bobot', 9, 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI diri sendiri', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', admin, 'peran', 'pegawai'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI ganda', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai'), jsonb_build_object('akun', p, 'peran', 'wakil'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI peran ngawur', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'direktur'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI akun tak ada', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', 999999999, 'peran', 'pegawai'))))), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('judul', 'UJI tanpa RO', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai'))))), '23514');
  perform pg_temp.ok((select count(*) = 0 from keu_dlg_delegasi), 'penolakan tidak meninggalkan baris');

  -- ===== buat: berhasil, satu baris per penerima, notifikasi =====
  j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI Pencacahan blok 1', 'mulai', hari - 3, 'tenggat', hari + 7, 'target_harian', 60,
        'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai'), jsonb_build_object('akun', o2, 'peran', 'wakil', 'pj_bidang', 'Kualitas data')))));
  ids := j -> 'dibuat';
  perform pg_temp.ok(jsonb_array_length(ids) = 2, 'dua penerima menghasilkan dua delegasi');
  id1 := (ids ->> 0)::bigint; id2 := (ids ->> 1)::bigint;
  perform pg_temp.ok((select count(*) = 2 and bool_and(status = 'baru') from keu_dlg_delegasi where id in (id1, id2)), 'status awal baru');
  perform pg_temp.ok((select pj_bidang = 'Kualitas data' and peran_penerima = 'wakil' from keu_dlg_delegasi where id = id2), 'PJ bidang tersimpan sebagai label pada delegasi');
  perform pg_temp.ok((select count(*) = 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_baru' and tautan = '/sigap/delego/saya'), 'penerima mendapat notifikasi');
  if m is not null then
    perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI mitra pegawai', 'tenggat', hari + 5, 'penerima', jsonb_build_array(jsonb_build_object('akun', m, 'peran', 'pegawai'))))), '23514');
    j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI Pencacahan mitra', 'mulai', hari - 3, 'tenggat', hari + 7,
          'penerima', jsonb_build_array(jsonb_build_object('akun', m, 'peran', 'ppl')))));
    idm := (j -> 'dibuat' ->> 0)::bigint;
  end if;

  -- ===== terima dan ubah =====
  perform pg_temp.gagal(pg_temp.sq(o2, 'keu_dlg_terima', jsonb_build_object('p_id', id1)));              -- bukan penerima
  perform pg_temp.panggil(p, 'keu_dlg_terima', jsonb_build_object('p_id', id1));
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_ubah', jsonb_build_object('p_id', id1, 'p_data', jsonb_build_object('judul', 'UJI diubah penerima'))), '42501');
  perform pg_temp.panggil(admin, 'keu_dlg_ubah', jsonb_build_object('p_id', id1, 'p_data', jsonb_build_object('judul', 'UJI Pencacahan blok 1 (revisi)', 'target_harian', 50)));
  perform pg_temp.ok((select judul like '%revisi%' and target_harian = 50 and ver >= 2 from keu_dlg_delegasi where id = id1), 'ubah oleh pemberi menaikkan versi');
  perform pg_temp.ok((select count(*) >= 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_ubah'), 'penerima diberi tahu bila delegasi diubah');

  -- ===== lapor =====
  perform pg_temp.gagal(pg_temp.sq(o2, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 10)), '42501');           -- orang lain
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari + 1, 'p_poin', 10)), '23514');      -- mendatang
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari - 10, 'p_poin', 10)), '23514');     -- sebelum mulai
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', -1)), '23514');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 1001)), '23514');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 10, 'p_bukti', '"bukan larik"'::jsonb)), '23514');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 10, 'p_bukti', jsonb_build_array(1, 2, 3, 4, 5, 6))), '23514');
  j := pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 50, 'p_uraian', 'Selesai 6 RT', 'p_kendala', 'Sinyal lemah'));
  perform pg_temp.ok(not (j ->> 'terlambat')::boolean and not (j ->> 'mewakili')::boolean, 'laporan hari ini: tepat waktu, bukan mewakili');
  perform pg_temp.ok((select status = 'berjalan' from keu_dlg_delegasi where id = id1), 'laporan pertama menjalankan delegasi');
  j := pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari, 'p_poin', 70));
  perform pg_temp.ok((select count(*) = 1 and max(poin) = 70 from keu_dlg_laporan where delegasi_id = id1 and tanggal = hari), 'lapor ulang pada hari yang sama memperbarui, bukan menggandakan');
  j := pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari - 2, 'p_poin', 40));
  perform pg_temp.ok((j ->> 'terlambat')::boolean, 'laporan susulan ditandai terlambat, tidak diblokir');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari - 9, 'p_poin', 10)));                  -- >7 hari, bukan pemberi
  j := pg_temp.panggil(admin, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id2, 'p_tanggal', hari, 'p_poin', 30));
  perform pg_temp.ok((j ->> 'mewakili')::boolean, 'pemberi melapor untuk orang lain ditandai mewakili');
  if idm is not null then
    j := pg_temp.panggil(admin, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', idm, 'p_tanggal', hari, 'p_poin', 25));
    perform pg_temp.ok((j ->> 'mewakili')::boolean, 'laporan mitra oleh pemberi/PML ditandai mewakili');
  end if;

  -- ===== tanggapan =====
  select id into lp from keu_dlg_laporan where delegasi_id = id1 and tanggal = hari;
  perform pg_temp.gagal(pg_temp.sq(o2, 'keu_dlg_tanggapi', jsonb_build_object('p_delegasi', id1, 'p_isi', 'bukan wewenang')), '42501');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_tanggapi', jsonb_build_object('p_delegasi', id1, 'p_isi', '')), '23514');
  perform pg_temp.panggil(admin, 'keu_dlg_tanggapi', jsonb_build_object('p_delegasi', id1, 'p_isi', 'Laporan diterima, lampirkan contoh temuan.', 'p_laporan', lp));
  perform pg_temp.ok((select count(*) = 1 from keu_dlg_tanggapan where delegasi_id = id1 and laporan_id = lp), 'tanggapan tersimpan');
  perform pg_temp.ok((select count(*) >= 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_tanggapan'), 'penerima diberi tahu tanggapan');

  -- ===== pembinaan, penghargaan, penilaian =====
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_bina', jsonb_build_object('p_penerima', o2, 'p_ro', ro, 'p_langkah', 1, 'p_alasan', 'tanpa hak')), '42501');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_langkah', 9, 'p_alasan', 'langkah ngawur')), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_langkah', 1, 'p_alasan', 'ok')), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina', jsonb_build_object('p_penerima', admin, 'p_ro', ro, 'p_langkah', 1, 'p_alasan', 'diri sendiri')), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_langkah', 2, 'p_alasan', 'tinjau mundur', 'p_tinjau', hari - 1)), '23514');
  bid := (pg_temp.panggil(admin, 'keu_dlg_bina', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_langkah', 2, 'p_alasan', 'Catatan lisan karena hutang poin', 'p_tinjau', hari + 7, 'p_delegasi', id1))) #>> '{}';
  perform pg_temp.ok(bid is not null and (select status = 'berjalan' and langkah = 2 from keu_dlg_pembinaan where id = bid::bigint), 'pembinaan tercatat berjalan');
  perform pg_temp.ok((select count(*) >= 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_pembinaan'), 'penerima diberi tahu pembinaan');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina_tutup', jsonb_build_object('p_id', bid::bigint, 'p_status', 'ngawur')), '23514');
  perform pg_temp.panggil(admin, 'keu_dlg_bina_tutup', jsonb_build_object('p_id', bid::bigint, 'p_status', 'selesai', 'p_catatan', 'Membaik'));
  perform pg_temp.ok((select status = 'selesai' from keu_dlg_pembinaan where id = bid::bigint), 'pembinaan ditutup selesai');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_bina_tutup', jsonb_build_object('p_id', bid::bigint, 'p_status', 'dibatalkan')));            -- sudah ditutup

  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_hargai', jsonb_build_object('p_penerima', o2, 'p_ro', ro, 'p_alasan', 'tanpa hak')), '42501');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_hargai', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_alasan', 'ok')), '23514');
  perform pg_temp.panggil(admin, 'keu_dlg_hargai', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_alasan', 'Laporan selalu tepat waktu'));
  perform pg_temp.ok((select count(*) = 1 from keu_dlg_penghargaan where penerima_akun = p) and (select count(*) >= 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_penghargaan'), 'penghargaan tercatat dan diberitahukan');

  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_nilai', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_kualitas', 101, 'p_kepatuhan', 80)), '23514');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_nilai', jsonb_build_object('p_penerima', admin, 'p_ro', ro, 'p_kualitas', 80, 'p_kepatuhan', 80)), '23514');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_nilai', jsonb_build_object('p_penerima', o2, 'p_ro', ro, 'p_kualitas', 80, 'p_kepatuhan', 80)), '42501');
  perform pg_temp.panggil(admin, 'keu_dlg_nilai', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_periode', hari, 'p_kualitas', 80, 'p_kepatuhan', 70));
  perform pg_temp.panggil(admin, 'keu_dlg_nilai', jsonb_build_object('p_penerima', p, 'p_ro', ro, 'p_periode', hari, 'p_kualitas', 90, 'p_kepatuhan', 85, 'p_catatan', 'Dinilai ulang'));
  perform pg_temp.ok((select count(*) = 1 and max(kualitas) = 90 and max(periode) = date_trunc('month', hari)::date from keu_dlg_penilaian where penerima_akun = p), 'penilaian satu per bulan, ditimpa oleh penilai yang sama');

  -- ===== pembacaan =====
  j := pg_temp.panggil(p, 'keu_dlg_saya', '{}'::jsonb);
  perform pg_temp.ok(jsonb_array_length(j -> 'delegasi') = 1 and jsonb_array_length(j -> 'laporan') >= 2, 'bahan saya: delegasi dan laporan milik sendiri');
  perform pg_temp.ok(jsonb_array_length(j -> 'tanggapan') = 1 and jsonb_array_length(j -> 'penghargaan') = 1 and jsonb_array_length(j -> 'penilaian') = 1, 'bahan saya: tanggapan, penghargaan, penilaian');
  j := pg_temp.panggil(admin, 'keu_dlg_bahan', jsonb_build_object('p_ro', ro));
  perform pg_temp.ok(jsonb_array_length(j -> 'delegasi') >= 2, 'bahan tim memuat delegasi RO');
  j := pg_temp.panggil(p, 'keu_dlg_bahan', jsonb_build_object('p_ro', ro));
  perform pg_temp.ok(jsonb_array_length(j -> 'delegasi') = 0, 'pegawai biasa tidak melihat delegasi orang lain lewat bahan tim');
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_calon', jsonb_build_object('p_ro', ro)), '42501');
  j := pg_temp.panggil(admin, 'keu_dlg_calon', jsonb_build_object('p_ro', ro, 'p_q', ''));
  perform pg_temp.ok(jsonb_array_length(j -> 'organik') >= 2 and jsonb_typeof(j -> 'lanjutan') = 'array', 'calon penerima');

  -- ===== batal, lalu laporan ditolak =====
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_ubah', jsonb_build_object('p_id', id2, 'p_data', jsonb_build_object('status', 'batal'))), '23514');       -- tanpa alasan
  perform pg_temp.panggil(admin, 'keu_dlg_ubah', jsonb_build_object('p_id', id2, 'p_data', jsonb_build_object('status', 'batal', 'alasan', 'Dialihkan ke pegawai lain')));
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id2, 'p_tanggal', hari, 'p_poin', 5)), '23514');

  -- ===== kunci tulis langsung =====
  perform set_config('app.akun_id', admin::text, true);
  perform pg_temp.gagal(format($q$insert into keu_dlg_delegasi(tahun, ro_kode, judul, penerima_akun, peran_penerima, mulai, tenggat) values (2026, %L, 'langsung', %s, 'pegawai', current_date, current_date)$q$, ro, p), '42501');
  perform pg_temp.gagal(format($q$update keu_dlg_delegasi set status = 'selesai' where id = %s$q$, id1), '42501');
  perform pg_temp.gagal(format($q$update keu_dlg_laporan set poin = 999 where delegasi_id = %s$q$, id1), '42501');
  perform pg_temp.gagal(format($q$delete from keu_dlg_delegasi where id = %s$q$, id1), '42501');
  perform pg_temp.gagal(format($q$delete from keu_dlg_laporan where delegasi_id = %s$q$, id1), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== izin =====
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_dlg_buat(jsonb,bigint)', 'execute') and not has_function_privilege('authenticated', 'keu_dlg_buat(jsonb,bigint)', 'execute'), 'fungsi tulis tidak dapat dipanggil anon dan authenticated');
  perform pg_temp.ok(not has_table_privilege('anon', 'keu_dlg_delegasi', 'select') and not has_table_privilege('authenticated', 'keu_dlg_laporan', 'select') and has_table_privilege('service_role', 'keu_dlg_laporan', 'select'), 'hak tabel');
  perform pg_temp.ok((select count(*) >= 10 from sigap_audit where aksi like 'keu.keu\_dlg\_%'), 'perubahan tercatat di jejak audit');
  raise notice 'LULUS 57';
end $$;
rollback;
