\set ON_ERROR_STOP on
-- Uji keu_dlg_pindah (berkas 20261026f): hak, versi basi, penampung tidak sah, delegasi lama selesai dan tenggat dipotong kemarin, delegasi baru mulai hari ini,
-- sisa target total, batal bila baru mulai hari ini, penolakan bila sudah melapor hari ini, notifikasi. Dibatalkan (rollback) di akhir; data fiktif.
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
  admin bigint := 354; p bigint; o2 bigint; o3 bigint; m bigint; ro text := '2906.BMA.001'; hari date := keu_dlg_hari_ini();
  j jsonb; id1 bigint; id2 bigint; id3 bigint; ver1 int; baru bigint;
begin
  perform set_config('app.akun_id', '', true);
  select id into p  from sigap_akun where aktif and jenis = 'organik' and id <> admin and not super order by id limit 1;
  select id into o2 from sigap_akun where aktif and jenis = 'organik' and id not in (admin, p) and not super order by id limit 1;
  select id into o3 from sigap_akun where aktif and jenis = 'organik' and id not in (admin, p, o2) and not super order by id limit 1;
  select id into m  from sigap_akun where aktif and jenis = 'mitra' order by id limit 1;
  perform pg_temp.ok(p is not null and o2 is not null and o3 is not null, 'butuh tiga akun organik aktif selain admin');

  -- delegasi berjalan sejak 3 hari lalu, target total 500, dengan 2 laporan (110 poin) sebelum hari ini
  j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI pindah blok 1', 'mulai', hari - 3, 'tenggat', hari + 7,
        'target_harian', 70, 'target_total', 500, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai')))));
  id1 := (j -> 'dibuat' ->> 0)::bigint;
  perform pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari - 2, 'p_poin', 60));
  perform pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id1, 'p_tanggal', hari - 1, 'p_poin', 50));
  select ver into ver1 from keu_dlg_delegasi where id = id1;

  -- penolakan
  perform pg_temp.gagal(pg_temp.sq(p, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', o2)), '42501');                               -- bukan pemberi
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', o2, 'p_ver', ver1 + 5)), '23514');       -- versi basi
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', p, 'p_ver', ver1)), '23514');            -- sama dengan penerima lama
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', admin, 'p_ver', ver1)), '23514');        -- pemberi sendiri
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', 999999999, 'p_ver', ver1)), '23514');    -- tak ada
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', 999999999, 'p_ke', o2)), '23514');
  if m is not null then
    perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', m, 'p_ver', ver1)), '23514');         -- mitra pada peran pegawai
  end if;
  perform pg_temp.ok((select status in ('baru','berjalan') and penerima_akun = p from keu_dlg_delegasi where id = id1), 'penolakan tidak mengubah delegasi');

  -- berhasil: lama selesai, tenggat kemarin; baru mulai hari ini untuk o2, sisa target 390
  j := pg_temp.panggil(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', o2, 'p_ver', ver1));
  baru := (j ->> 'baru')::bigint;
  perform pg_temp.ok(j ->> 'status_lama' = 'selesai', 'delegasi lama selesai');
  perform pg_temp.ok((select status = 'selesai' and tenggat = hari - 1 and alasan like 'Dipindahkan ke%' and ver = ver1 + 1 from keu_dlg_delegasi where id = id1), 'lama: selesai, tenggat kemarin, beralasan');
  perform pg_temp.ok((select penerima_akun = o2 and status = 'baru' and mulai = hari and tenggat = hari + 7 and target_harian = 70 and target_total = 390 and judul = 'UJI pindah blok 1'
                        and peran_penerima = 'pegawai' and dibuat_oleh = admin from keu_dlg_delegasi where id = baru), 'baru: penampung, mulai hari ini, tenggat lama, sisa target 390');
  perform pg_temp.ok((select count(*) = 2 and sum(poin) = 110 from keu_dlg_laporan where delegasi_id = id1), 'riwayat laporan lama tetap utuh');
  perform pg_temp.ok((select count(*) >= 1 from keu_notifikasi where akun_id = o2 and jenis = 'delegasi_baru' and judul like 'Delegasi baru: UJI pindah%'), 'penampung diberi tahu');
  perform pg_temp.ok((select count(*) >= 1 from keu_notifikasi where akun_id = p and jenis = 'delegasi_ubah' and judul like 'Delegasi dipindahkan%'), 'penerima lama diberi tahu');
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id1, 'p_ke', o3)), '23514');                           -- sudah selesai

  -- sudah melapor hari ini -> ditolak
  perform pg_temp.panggil(o2, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', baru, 'p_tanggal', hari, 'p_poin', 40));
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', baru, 'p_ke', o3)), '23514');

  -- target total tercapai -> ditolak
  j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI target tercapai', 'mulai', hari - 2, 'tenggat', hari + 5,
        'target_harian', 70, 'target_total', 100, 'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai')))));
  id2 := (j -> 'dibuat' ->> 0)::bigint;
  perform pg_temp.panggil(p, 'keu_dlg_lapor', jsonb_build_object('p_delegasi', id2, 'p_tanggal', hari - 1, 'p_poin', 100));
  perform pg_temp.gagal(pg_temp.sq(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id2, 'p_ke', o3)), '23514');

  -- baru mulai hari ini -> lama dibatalkan (tidak ada riwayat sebelum hari ini); mulai baru = hari ini
  j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI mulai hari ini', 'mulai', hari, 'tenggat', hari + 4,
        'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'pegawai')))));
  id3 := (j -> 'dibuat' ->> 0)::bigint;
  j := pg_temp.panggil(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', id3, 'p_ke', o3));
  perform pg_temp.ok(j ->> 'status_lama' = 'batal' and (select status = 'batal' and alasan like 'Dipindahkan ke%' from keu_dlg_delegasi where id = id3), 'lama dibatalkan bila baru mulai hari ini');
  perform pg_temp.ok((select penerima_akun = o3 and mulai = hari and target_total is null from keu_dlg_delegasi where id = (j ->> 'baru')::bigint), 'baru untuk penampung, tanpa target total');

  -- mitra boleh menjadi penampung bila perannya PML/PPL
  if m is not null then
    j := pg_temp.panggil(admin, 'keu_dlg_buat', jsonb_build_object('p_data', jsonb_build_object('ro_kode', ro, 'judul', 'UJI mitra ppl', 'mulai', hari - 1, 'tenggat', hari + 4,
          'penerima', jsonb_build_array(jsonb_build_object('akun', p, 'peran', 'ppl')))));
    j := pg_temp.panggil(admin, 'keu_dlg_pindah', jsonb_build_object('p_id', (j -> 'dibuat' ->> 0)::bigint, 'p_ke', m));
    perform pg_temp.ok((select penerima_akun = m and peran_penerima = 'ppl' from keu_dlg_delegasi where id = (j ->> 'baru')::bigint), 'mitra menampung peran PPL');
  end if;

  -- izin
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_dlg_pindah(bigint,bigint,integer,bigint)', 'execute') and not has_function_privilege('authenticated', 'keu_dlg_pindah(bigint,bigint,integer,bigint)', 'execute'), 'tidak dapat dipanggil anon/authenticated');
  raise notice 'LULUS 58';
end $$;
rollback;
