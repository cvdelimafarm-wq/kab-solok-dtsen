\set ON_ERROR_STOP on
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
create or replace function pg_temp.sesi(p bigint) returns void language sql as $$ select set_config('app.akun_id', coalesce(p::text,''), true) $$;

-- Akun: 1 ADMIN, 2 KPA, 3 PPK (ketua 2896.BMA.004), 4 ketua 2906.BMA.005 & .006, 6 admin RO 2906.BMA.005, 7 BEND, 8 TU
-- 1. Jadwal bulanan bawaan
do $$
declare n int; j record;
begin
  perform pg_temp.sesi(4);
  perform pg_temp.gagal($q$select keu_jadwal_bulanan(2026, 10)$q$, '42501');      -- ketua bukan PPK
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_jadwal_bulanan(2031, 1)$q$, '23503');       -- tahun tidak ada
  n := keu_jadwal_bulanan(2026, 10);
  perform pg_temp.ok(n = 3, 'Okt-Des = 3 jadwal, dapat ' || n);
  perform pg_temp.ok(keu_jadwal_bulanan(2026, 10) = 0, 'diulang tidak menggandakan');
  select * into j from keu_revisi_jadwal where tahun = 2026 and buka = '2026-10-10';
  perform pg_temp.ok(j.tutup = '2026-10-12' and j.status = 'terjadwal' and j.jenis = 'pok', 'tutup 2 hari setelah buka');
  perform pg_temp.ok(j.judul = 'Revisi POK Oktober 2026' and j.ulang = 'bulanan tgl 10', 'judul dan ulang');
  perform pg_temp.gagal($q$insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup) values (2026,'pok','x','2026-11-20','2026-11-19')$q$, '23514');
  perform pg_temp.gagal($q$insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup) values (2026,'pok','Dobel','2026-10-10','2026-10-11')$q$, '23505');
  perform pg_temp.sesi(4);
  perform pg_temp.gagal($q$insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup) values (2026,'administrasi','Oleh ketua','2026-11-20','2026-11-22')$q$, '42501');
  perform pg_temp.sesi(3);
  insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup,dibuat_oleh) values (2026,'administrasi','Revisi Administrasi Okt','2026-10-20','2026-10-22',3);
  perform pg_temp.gagal($q$insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup,status) values (2026,'dipa_dja','Langsung sah','2026-11-20','2026-11-22','sah')$q$, '23514');
  perform pg_temp.sesi(null);
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_revisi_jadwal.insert') >= 4, 'jejak insert jadwal');
end $$;

-- 2. Transisi jadwal Oktober + usulan
do $$
declare j bigint; rab bigint; u1 bigint; u2 bigint; u3 bigint; u4 bigint; st text; n int;
begin
  select id into j from keu_revisi_jadwal where tahun = 2026 and buka = '2026-10-10';
  select id into rab from keu_rab where ro_kode = '2906.BMA.005' and status = 'disetujui';
  perform pg_temp.ok(rab is not null, 'ada RAB disetujui sebagai acuan');

  -- belum dibuka: usulan ditolak
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$insert into keu_revisi_usulan(jadwal_id,ro_kode,rab_id,dibuat_oleh) values (%s,'2906.BMA.005',%s,6)$q$, j, rab), '23514');

  -- aksi jadwal: hanya PPK; urutan dijaga
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''buka'')', j), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''tutup'')', j), '23514');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'',''S-1/2026'',''2026-10-15'')', j), '23514');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''ngawur'')', j), '22023');
  perform pg_temp.gagal('select keu_jadwal_aksi(999999,''buka'')', 'P0002');
  perform pg_temp.gagal(format('update keu_revisi_jadwal set status=''dibuka'' where id=%s', j), '42501');   -- tidak lewat fungsi
  st := keu_jadwal_aksi(j, 'buka');
  perform pg_temp.ok(st = 'dibuka', 'buka -> dibuka');

  -- usulan: pembuat harus berwenang pada RO
  perform pg_temp.sesi(7);   -- bendahara: bukan ketua/admin RO
  perform pg_temp.gagal(format($q$insert into keu_revisi_usulan(jadwal_id,ro_kode,rab_id,dibuat_oleh) values (%s,'2906.BMA.005',%s,7)$q$, j, rab), '42501');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh,status) values (%s,'2906.BMA.005',6,'disetujui')$q$, j), '23514');
  insert into keu_revisi_usulan(jadwal_id,ro_kode,rab_id,dibuat_oleh) values (j,'2906.BMA.005',rab,6) returning id into u1;
  perform pg_temp.gagal(format($q$insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh) values (%s,'2906.BMA.005',6)$q$, j), '23505');
  perform pg_temp.gagal(format('update keu_revisi_usulan set status=''disetujui'' where id=%s', u1), '42501');

  -- alur admin RO -> ketua -> PPK
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''setuju_ketua'')', u1), '23514');       -- masih draf
  st := keu_usulan_aksi(u1, 'ajukan');
  perform pg_temp.ok(st = 'menunggu_ketua', 'admin RO ajukan -> menunggu ketua');
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''ajukan'')', u1), '23514');
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''setuju_ketua'')', u1), '42501');       -- admin bukan ketua
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''kembalikan'',''x'')', u1), '23514');    -- alasan kependekan (ditolak sebelum hak)
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''setuju_ketua'')', u1), '42501');       -- bendahara
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''sahkan'')', u1), '23514');             -- belum menunggu PPK
  st := keu_usulan_aksi(u1, 'setuju_ketua');
  perform pg_temp.ok(st = 'menunggu_ppk', 'ketua setuju -> menunggu PPK');
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''sahkan'')', u1), '42501');             -- ketua bukan PPK
  perform pg_temp.sesi(3);
  st := keu_usulan_aksi(u1, 'sahkan');
  perform pg_temp.ok(st = 'disetujui', 'PPK sahkan -> disetujui');
  perform pg_temp.ok((select disahkan_oleh from keu_revisi_usulan where id = u1) = 3, 'pengesah tercatat');
  perform pg_temp.ok((select count(*) from keu_revisi_usulan_riwayat where usulan_id = u1) = 3, 'riwayat 3 langkah');
  perform pg_temp.gagal(format('update keu_revisi_usulan set catatan=''ubah'' where id=%s', u1), '23514');   -- disetujui terkunci

  -- ketua mengajukan sendiri -> menunggu PPK; PPK kembalikan; ajukan ulang
  perform pg_temp.sesi(4);
  insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh) values (j,'2906.BMA.006',4) returning id into u2;
  st := keu_usulan_aksi(u2, 'ajukan');
  perform pg_temp.ok(st = 'menunggu_ppk', 'ketua ajukan sendiri -> menunggu PPK');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''kembalikan'',''ya'')', u2), '23514');
  st := keu_usulan_aksi(u2, 'kembalikan', 'Perbaiki rincian transport');
  perform pg_temp.ok(st = 'dikembalikan', 'PPK kembalikan');
  perform pg_temp.ok((select catatan from keu_revisi_usulan where id = u2) = 'Perbaiki rincian transport', 'alasan tersimpan');
  perform pg_temp.sesi(4);
  update keu_revisi_usulan set catatan = 'sudah diperbaiki' where id = u2;                         -- dikembalikan boleh disunting
  st := keu_usulan_aksi(u2, 'ajukan');
  perform pg_temp.ok(st = 'menunggu_ppk', 'diajukan ulang');
  perform pg_temp.sesi(3);
  st := keu_usulan_aksi(u2, 'sahkan');
  perform pg_temp.ok(st = 'disetujui', 'disahkan setelah revisi');

  -- PPK merangkap ketua (RO 2896.BMA.004): ajukan langsung disetujui
  insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh) values (j,'2896.BMA.004',3) returning id into u3;
  st := keu_usulan_aksi(u3, 'ajukan');
  perform pg_temp.ok(st = 'disetujui', 'PPK merangkap ketua -> langsung disetujui');
  perform pg_temp.ok((select diajukan_oleh = disahkan_oleh from keu_revisi_usulan where id = u3), 'pengaju = pengesah tercatat jelas');

  -- usulan lain dibiarkan draf (dibuat lewat jalur migrasi tanpa sesi)
  perform pg_temp.sesi(null);
  insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh) values (j,'2902.FAN.ZZ1',3) returning id into u4;

  perform pg_temp.ok((select n_usulan = 4 and n_disetujui = 3 and n_draf = 1 and n_proses = 0 from keu_v_revisi_ringkas where jadwal_id = j), 'ringkasan jadwal');

  -- tutup jendela
  perform pg_temp.sesi(3);
  st := keu_jadwal_aksi(j, 'tutup');
  perform pg_temp.ok(st = 'terkumpul', 'tutup -> terkumpul');
  perform pg_temp.gagal(format('select keu_usulan_aksi(%s,''ajukan'')', u4), '23514');            -- jendela tertutup
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$insert into keu_revisi_usulan(jadwal_id,ro_kode,dibuat_oleh) values (%s,'2906.BMA.005',4)$q$, j), '23514');
  perform pg_temp.ok((select count(*) from keu_v_revisi_paket where jadwal_id = j and ikut_paket) = 3, 'paket: 3 usulan disetujui ikut');
  perform pg_temp.ok((select count(*) from keu_v_revisi_paket where jadwal_id = j and tidak_ikut_paket) = 1, 'paket: 1 usulan tidak ikut (belum disetujui)');

  -- terapkan lalu sah
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'',''S-1/2026'',''2026-10-15'')', j), '23514');   -- belum diterapkan
  st := keu_jadwal_aksi(j, 'terapkan');
  perform pg_temp.ok(st = 'diterapkan', 'terapkan');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'')', j), '23514');                                  -- tanpa nomor dan tanggal
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'',''ab'',''2026-10-15'')', j), '23514');          -- nomor kependekan
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'',''S-1/2026'')', j), '23514');                    -- tanpa tanggal
  perform pg_temp.ok((select status from keu_revisi_jadwal where id = j) = 'diterapkan', 'gagal sah tidak mengubah status');
  perform pg_temp.ok((select count(*) from keu_revisi_sah where jadwal_id = j) = 0, 'gagal sah tidak mencatat');
  st := keu_jadwal_aksi(j, 'sah', ' S-1/2026 ', '2026-10-15');
  perform pg_temp.ok(st = 'sah', 'sah');
  perform pg_temp.ok((select versi_sistem = 1 and nomor_dokumen = 'S-1/2026' and tanggal_dokumen = '2026-10-15' and dicatat_oleh = 3
                      and pok_versi_dasar_id = (select id from keu_pok_versi where tahun = 2026 and status = 'berlaku') from keu_revisi_sah where jadwal_id = j), 'catatan sah versi 1');
  perform pg_temp.ok((select count(*) from keu_laporan_kpa where jenis = 'revisi_sah' and rujukan_id = j and status = 'antre'
                      and (isi->>'usulan_disetujui')::int = 3 and isi->>'nomor_dokumen' = 'S-1/2026') = 1, 'laporan KPA antre');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''sah'',''S-2/2026'',''2026-10-16'')', j), '23514');    -- sudah sah
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''lewati'')', j), '23514');
end $$;

-- 3. Versi sistem naik pada jadwal berikutnya; lewati / pulihkan
do $$
declare jn bigint; jd bigint; jp bigint; st text;
begin
  perform pg_temp.sesi(3);
  select id into jn from keu_revisi_jadwal where tahun = 2026 and buka = '2026-11-10';
  select id into jd from keu_revisi_jadwal where tahun = 2026 and buka = '2026-12-10';
  perform keu_jadwal_aksi(jn, 'buka'); perform keu_jadwal_aksi(jn, 'tutup'); perform keu_jadwal_aksi(jn, 'terapkan');
  perform keu_jadwal_aksi(jn, 'sah', 'S-2/2026', '2026-11-14');
  perform pg_temp.ok((select versi_sistem from keu_revisi_sah where jadwal_id = jn) = 2, 'versi sistem naik jadi 2');
  perform pg_temp.ok((select (isi->>'usulan_disetujui')::int from keu_laporan_kpa where rujukan_id = jn) = 0, 'laporan tanpa usulan = 0');

  -- lewati dan pulihkan (jendela belum lewat)
  st := keu_jadwal_aksi(jd, 'lewati');
  perform pg_temp.ok(st = 'dilewati', 'lewati');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''buka'')', jd), '23514');                                  -- dilewati tidak bisa dibuka
  st := keu_jadwal_aksi(jd, 'pulihkan');
  perform pg_temp.ok(st = 'terjadwal', 'pulihkan');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''pulihkan'')', jd), '23514');

  -- jendela yang sudah lewat tidak dapat dipulihkan
  perform pg_temp.sesi(null);
  insert into keu_revisi_jadwal(tahun,jenis,judul,buka,tutup,status) values (2026,'dipa_djpb','Revisi DIPA lampau', current_date - 10, current_date - 8, 'terjadwal') returning id into jp;
  perform pg_temp.sesi(3);
  perform keu_jadwal_aksi(jp, 'lewati');
  perform pg_temp.gagal(format('select keu_jadwal_aksi(%s,''pulihkan'')', jp), '23514');
end $$;

-- 4. Penjaga, RLS, hak
do $$
declare j bigint; u bigint; s bigint; l bigint; r record;
begin
  select id into j from keu_revisi_jadwal where tahun = 2026 and buka = '2026-10-10';
  select id into u from keu_revisi_usulan where jadwal_id = j limit 1;
  select id into s from keu_revisi_sah where jadwal_id = j;
  select id into l from keu_laporan_kpa limit 1;

  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format('delete from keu_revisi_jadwal where id=%s', j), '42501');
  perform pg_temp.gagal(format('delete from keu_revisi_usulan where id=%s', u), '42501');
  perform pg_temp.gagal('update keu_revisi_usulan_riwayat set catatan=''x''', '42501');
  perform pg_temp.gagal('delete from keu_revisi_usulan_riwayat', '42501');
  perform pg_temp.gagal(format('delete from keu_revisi_sah where id=%s', s), '42501');
  perform pg_temp.gagal(format('delete from keu_laporan_kpa where id=%s', l), '42501');
  update keu_laporan_kpa set status = 'terkirim', dikirim_at = now() where id = l;                                 -- pengiriman boleh mengubah status
  update keu_revisi_sah set pok_versi_hasil_id = (select id from keu_pok_versi where tahun = 2026 and status = 'berlaku') where id = s;   -- PPK
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format('update keu_revisi_sah set nomor_dokumen=''PALSU-1'' where id=%s', s), '42501');   -- ketua bukan PPK
  perform pg_temp.sesi(null);

  -- tanpa sesi (migrasi) tidak diperiksa, tetapi kolom tetap dijaga constraint
  perform pg_temp.gagal(format($q$insert into keu_revisi_sah(jadwal_id,versi_sistem,nomor_dokumen,tanggal_dokumen,dicatat_oleh) values (%s,5,'S-9/2026','2026-10-30',3)$q$, j), '23505');
  perform pg_temp.gagal($q$insert into keu_laporan_kpa(jenis) values ('ngawur')$q$, '23514');

  -- RLS aktif, tanpa hak untuk anon/authenticated
  for r in select c.relname, c.relrowsecurity from pg_class c where c.relname in
      ('keu_revisi_jadwal','keu_revisi_usulan','keu_revisi_usulan_riwayat','keu_revisi_sah','keu_laporan_kpa') loop
    perform pg_temp.ok(r.relrowsecurity, 'RLS aktif ' || r.relname);
    perform pg_temp.ok(not has_table_privilege('authenticated', r.relname, 'select') and not has_table_privilege('anon', r.relname, 'select'), 'tanpa hak tabel ' || r.relname);
    perform pg_temp.ok(has_table_privilege('service_role', r.relname, 'select'), 'service_role boleh ' || r.relname);
  end loop;
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_jadwal_aksi(bigint,text,text,date,bigint)', 'execute')
                     and not has_function_privilege('anon', 'keu_jadwal_aksi(bigint,text,text,date,bigint)', 'execute'), 'jadwal_aksi tertutup');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_usulan_aksi(bigint,text,text,bigint)', 'execute'), 'usulan_aksi tertutup');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_jadwal_bulanan(int,int,int,bigint)', 'execute'), 'jadwal_bulanan tertutup');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_usulan_cek()', 'execute'), 'usulan_cek tertutup');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_catat_saja()', 'execute'), 'catat_saja tertutup');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'keu_v_revisi_ringkas', 'select')
                     and not has_table_privilege('authenticated', 'keu_v_revisi_paket', 'select')
                     and not has_table_privilege('authenticated', 'keu_v_tenggat', 'select'), 'view tertutup');
  perform pg_temp.ok((select count(*) from keu_v_tenggat where sisa_hari is not null) >= 1, 'view tenggat terisi');

  -- jejak audit
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_revisi_usulan.update') >= 5, 'jejak ubah usulan');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_revisi_sah.insert') = 2, 'jejak sah (2 jadwal sah)');
end $$;

-- 5. Uji riwayat RAB juga tidak dapat diubah dari aplikasi (penjaga di d_rab)
do $$
begin
  perform pg_temp.sesi(3);
  perform pg_temp.gagal('update keu_rab_riwayat set catatan=''x''', '42501');
  perform pg_temp.gagal('delete from keu_rab_riwayat', '42501');
  perform pg_temp.sesi(null);
end $$;
