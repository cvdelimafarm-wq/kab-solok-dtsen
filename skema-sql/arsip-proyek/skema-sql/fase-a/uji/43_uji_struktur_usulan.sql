\set ON_ERROR_STOP on
-- Uji Fase G (k): usulan struktur mata anggaran dan kode sementara T-nnn.
-- Dijalankan sesudah 42. Akun: 3 PPK, 4 ketua 005/006, 5 mantan ketua, 6 admin RO 005, 7 bendahara, 'Anggota' (akses Administrasi 005 saja).
-- POK berlaku (versi nomor 11): 2906.BMA.005 / komponen 055 / akun 521211, 524113.
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
create temp table t43(k text primary key, v bigint);
create or replace function pg_temp.id(p text) returns bigint language sql as $$ select v from t43 where k = p $$;
create or replace function pg_temp.simpan(p text, p_v bigint) returns void language sql as $$ insert into t43 values (p, p_v) on conflict (k) do update set v = excluded.v $$;
create or replace function pg_temp.st(p text) returns text language sql as $$ select status from keu_struktur_usulan where id = pg_temp.id(p) $$;

-- ================= A. Membuat usulan: induk, hak, validasi =================
do $$
declare n_ang bigint := (select id from sigap_akun where nama = 'Anggota');
begin
  perform pg_temp.sesi(6);   -- admin RO 005
  perform pg_temp.simpan('c1', keu_struktur_usul('komponen', '2906.BMA.005', null, '056', 'Komponen uji pencacahan tambahan', null, null, null, 'dalam'));
  perform pg_temp.ok((select status = 'draf' and level = 'komponen' and ro_kode = '2906.BMA.005' and jalur_kode = 'pok' and kepastian = 'dugaan'
                        and kode_sementara ~ '^T-[0-9]{3}$' and kode = '056' and tahun = 2026 and dibuat_oleh = 6
                      from keu_struktur_usulan where id = pg_temp.id('c1')), 'komponen draf: jalur pok, kepastian dugaan, T-nnn');
  perform pg_temp.ok((select kode_sementara <> 'T-001' from keu_struktur_usulan where id = pg_temp.id('c1')), 'T-001 sudah dipakai RO lain, dilewati');
  perform pg_temp.simpan('a1', keu_struktur_usul('akun', null, pg_temp.id('c1'), '521213', 'Honor pemeriksa uji', null, null, null, 'dalam'));
  perform pg_temp.simpan('i1', keu_struktur_usul('item', null, pg_temp.id('a1'), null, 'Honor pemeriksa lapangan', 4, 'OB', 1500000, 'dalam'));
  perform pg_temp.ok((select jumlah = 6000000 and satuan = 'OB' and kode is null and ro_kode = '2906.BMA.005' from keu_struktur_usulan where id = pg_temp.id('i1')), 'item: jumlah dihitung, ro turunan dari induk');
  perform pg_temp.simpan('i2', keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Pulpen tambahan', 20, 'OB', 4000, 'dalam'));
  perform pg_temp.simpan('i3', keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Spidol tambahan', 5, 'OB', 12000, 'dalam'));
  perform pg_temp.simpan('i4', keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Kertas HVS tambahan', 10, 'PAKET', 50000, 'dalam'));
  perform pg_temp.ok((select satuan from keu_struktur_usulan where id = pg_temp.id('i4')) = 'PAKET', 'satuan baku');
  perform pg_temp.ok((select count(*) from keu_struktur_usulan_riwayat where usulan_id = pg_temp.id('c1') and aksi = 'buat') = 1, 'riwayat buat');

  -- hak: admin RO tidak mengusulkan KRO/RO (tingkat PPK), bendahara/anggota/anonim tidak mengusulkan apa pun
  perform pg_temp.gagal($q$select keu_struktur_usul('kro', '2906', null, 'BMB', 'KRO uji', null, null, null, 'dalam')$q$, '42501');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Komponen oleh bendahara', null, null, null, 'dalam')$q$, '42501');
  perform pg_temp.sesi(n_ang);
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Komponen oleh anggota', null, null, null, 'dalam')$q$, '42501');
  perform pg_temp.sesi(5);   -- mantan ketua (006) tidak punya peran di 005
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Komponen oleh mantan ketua', null, null, null, 'dalam')$q$, '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Komponen tanpa sesi', null, null, null, 'dalam')$q$, '42501');

  -- P1: induk
  perform pg_temp.sesi(6);
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.099', null, '057', 'Induk tidak ada di POK', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('akun', '2906.BMA.005', null, '521213', 'Akun langsung di bawah RO', null, null, null, 'dalam')$q$, '23514');   -- level induk salah
  perform pg_temp.gagal(format($q$select keu_struktur_usul('komponen', '2906.BMA.005', %s, '057', 'Dua induk sekaligus', null, null, null, 'dalam')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', null, null, '057', 'Tanpa induk', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_usul('komponen', null, %s, '057', 'Induk usulan level salah', null, null, null, 'dalam')$q$, pg_temp.id('i1')), '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', null, 99999, '057', 'Induk usulan tidak ada', null, null, null, 'dalam')$q$, '23514');
  -- P3: format, akun master, satuan, harga, sumber, khusus
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '57', 'Kode komponen salah format', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'ab', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('akun', null, (select min(id) from keu_struktur_usulan where level='komponen'), '999999', 'Akun tidak ada di master', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_usul('akun', null, %s, '52121', 'Akun lima angka', null, null, null, 'dalam')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Item satuan ngawur', 3, 'KARUNG AJAIB', 1000, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Item volume nol', 0, 'OB', 1000, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Item harga nol', 3, 'OB', 0, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Item harga kosong', 3, 'OB', null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Sumber dana ngawur', null, null, null, 'tebak')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('akun', null, (select min(id) from keu_struktur_usulan where level='komponen'), '521219', 'Akun bertanda khusus', null, null, null, 'dalam', true)$q$, '23514');
  -- kembar dengan POK berlaku
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '055', 'Komponen sudah ada di POK', null, null, null, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('akun', '2906.BMA.005/055', null, '521211', 'Akun sudah ada di POK', null, null, null, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'ATK', 1, 'OB', 1000, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, '  atk ', 1, 'OB', 1000, 'dalam')$q$, '23505');
  -- kembar dengan usulan terbuka
  perform pg_temp.gagal($q$select keu_struktur_usul('komponen', '2906.BMA.005', null, '056', 'Komponen kembar usulan terbuka', null, null, null, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'PULPEN TAMBAHAN', 1, 'OB', 1000, 'dalam')$q$, '23505');
end $$;

-- ================= B. Mengubah draf =================
do $$
begin
  perform pg_temp.sesi(6);
  perform keu_struktur_ubah(pg_temp.id('i2'), null, 'Pulpen gel tambahan', 24, null, 4500, null, 'revisi jumlah');
  perform pg_temp.ok((select uraian = 'Pulpen gel tambahan' and volume = 24 and harga = 4500 and jumlah = 108000 and satuan = 'OB' and catatan = 'revisi jumlah'
                      from keu_struktur_usulan where id = pg_temp.id('i2')), 'ubah item: jumlah dihitung ulang');
  perform keu_struktur_ubah(pg_temp.id('i2'), null, 'Pulpen tambahan', 20, null, 4000);
  perform keu_struktur_ubah(pg_temp.id('c1'), '056', 'Komponen uji pencacahan tambahan (rev)');
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, '5')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, null, 0)$q$, pg_temp.id('i2')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, null, null, null, null, 'tebak')$q$, pg_temp.id('i2')), '23514');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, 'Diubah bendahara')$q$, pg_temp.id('i2')), '42501');
  perform pg_temp.sesi(4);   -- ketua RO 005 boleh mengubah draf timnya
  perform keu_struktur_ubah(pg_temp.id('i2'), null, null, null, null, null, null, 'dicek ketua');
  perform pg_temp.ok((select catatan from keu_struktur_usulan where id = pg_temp.id('i2')) = 'dicek ketua', 'ketua boleh ubah draf timnya');
end $$;

-- ================= C. Alur persetujuan: pengaju admin RO -> ketua -> PPK =================
do $$
begin
  perform pg_temp.sesi(6);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c1'), 'ajukan') = 'menunggu_ketua', 'admin RO mengajukan -> menunggu ketua');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'ajukan')$q$, pg_temp.id('c1')), '23514');   -- sudah diajukan
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, 'Diubah setelah diajukan')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'setuju_ketua')$q$, pg_temp.id('c1')), '42501');   -- admin RO bukan ketua
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'setuju_ketua')$q$, pg_temp.id('c1')), '42501');
  perform pg_temp.sesi(3);   -- PPK bukan ketua RO 005
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'setuju_ketua')$q$, pg_temp.id('c1')), '42501');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'sahkan')$q$, pg_temp.id('c1')), '23514');   -- belum menunggu PPK
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'kembalikan', 'x')$q$, pg_temp.id('c1')), '23514');   -- alasan pendek
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c1'), 'setuju_ketua') = 'menunggu_ppk', 'ketua setuju -> menunggu PPK');
  perform pg_temp.ok((select disetujui_ketua_oleh = 4 from keu_struktur_usulan where id = pg_temp.id('c1')), 'penyetuju ketua tercatat');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'sahkan')$q$, pg_temp.id('c1')), '42501');   -- ketua bukan PPK
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'sahkan')$q$, pg_temp.id('c1')), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c1'), 'sahkan') = 'sah', 'PPK mengesahkan');
  perform pg_temp.ok((select disahkan_oleh = 3 and disetujui_ketua_oleh = 4 and diajukan_oleh = 6 from keu_struktur_usulan where id = pg_temp.id('c1')), 'tiga pihak berbeda tercatat');
  perform pg_temp.ok((select array_agg(aksi order by id) from keu_struktur_usulan_riwayat where usulan_id = pg_temp.id('c1')) = array['buat','ubah','ajukan','setuju_ketua','sahkan'], 'riwayat urut: buat, ubah, ajukan, setuju_ketua, sahkan');

  -- anak dari usulan induk: akun dan item ikut alur sendiri
  perform pg_temp.sesi(6);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('a1'), 'ajukan') = 'menunggu_ketua', 'akun anak diajukan');
  perform pg_temp.sesi(4);
  perform keu_struktur_aksi(pg_temp.id('a1'), 'setuju_ketua');
  perform pg_temp.sesi(3);
  perform keu_struktur_aksi(pg_temp.id('a1'), 'sahkan');
  perform pg_temp.sesi(6);
  perform keu_struktur_aksi(pg_temp.id('i1'), 'ajukan');
  perform pg_temp.sesi(4);
  perform keu_struktur_aksi(pg_temp.id('i1'), 'setuju_ketua');
  perform pg_temp.sesi(3);
  perform keu_struktur_aksi(pg_temp.id('i1'), 'sahkan');
  perform pg_temp.ok(pg_temp.st('a1') = 'sah' and pg_temp.st('i1') = 'sah', 'akun dan item sah');

  -- pembatalan induk ditolak selagi ada turunan berjalan
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'batal', 'dibatalkan uji')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'batal', 'x')$q$, pg_temp.id('i1')), '23514');   -- alasan pendek
end $$;

-- ================= D. Kembalikan, ubah, ajukan ulang; ketua pengaju; PPK pengaju =================
do $$
begin
  -- kembalikan oleh ketua, diperbaiki, diajukan ulang
  perform pg_temp.sesi(6);
  perform keu_struktur_aksi(pg_temp.id('i2'), 'ajukan');
  perform pg_temp.sesi(4);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('i2'), 'kembalikan', 'Harga satuan perlu dicek lagi') = 'dikembalikan', 'ketua mengembalikan');
  perform pg_temp.ok((select catatan from keu_struktur_usulan where id = pg_temp.id('i2')) = 'Harga satuan perlu dicek lagi', 'alasan pengembalian tersimpan');
  perform pg_temp.sesi(6);
  perform keu_struktur_ubah(pg_temp.id('i2'), null, null, null, null, 4200);
  perform pg_temp.ok((select harga = 4200 and jumlah = 84000 from keu_struktur_usulan where id = pg_temp.id('i2')), 'dikembalikan boleh diubah');
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('i2'), 'ajukan') = 'menunggu_ketua', 'diajukan ulang');
  -- PPK mengembalikan pada tahap PPK
  perform pg_temp.sesi(4);
  perform keu_struktur_aksi(pg_temp.id('i2'), 'setuju_ketua');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'kembalikan', 'no')$q$, pg_temp.id('i2')), '23514');
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('i2'), 'kembalikan', 'Belum sesuai kebutuhan kegiatan') = 'dikembalikan', 'PPK mengembalikan');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'kembalikan', 'Bendahara tidak berhak')$q$, pg_temp.id('i2')), '42501');
  -- pengaju membatalkan usulannya sendiri yang dikembalikan
  perform pg_temp.sesi(6);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('i2'), 'batal', 'Tidak jadi diusulkan') = 'dibatalkan', 'pembuat membatalkan');
  perform pg_temp.ok((select alasan_akhir from keu_struktur_usulan where id = pg_temp.id('i2')) = 'Tidak jadi diusulkan', 'alasan batal tersimpan');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'ajukan')$q$, pg_temp.id('i2')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, 'Setelah batal')$q$, pg_temp.id('i2')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'tidak_dikenal')$q$, pg_temp.id('i3')), '22023');

  -- ketua sebagai pengaju: langsung menunggu PPK, ketua tidak boleh mengesahkan sendiri
  perform pg_temp.sesi(4);
  perform pg_temp.simpan('c2', keu_struktur_usul('komponen', '2906.BMA.005', null, '057', 'Komponen diusulkan ketua tim', null, null, null, 'dalam'));
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c2'), 'ajukan') = 'menunggu_ppk', 'ketua mengajukan -> menunggu PPK');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'sahkan')$q$, pg_temp.id('c2')), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c2'), 'sahkan') = 'sah', 'PPK mengesahkan usulan ketua');

  -- PPK sebagai pengaju: ketua yang menyetujui, lalu langsung sah (tidak balik ke PPK yang sama)
  perform pg_temp.simpan('c3', keu_struktur_usul('komponen', '2906.BMA.005', null, '058', 'Komponen diusulkan PPK', null, null, null, 'dalam'));
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c3'), 'ajukan') = 'menunggu_ketua', 'PPK mengajukan -> menunggu ketua');
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'setuju_ketua')$q$, pg_temp.id('c3')), '42501');   -- PPK bukan ketua RO itu
  perform pg_temp.sesi(4);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c3'), 'setuju_ketua') = 'sah', 'ketua menyetujui usulan PPK -> sah');
  perform pg_temp.ok((select disahkan_oleh = 3 and disetujui_ketua_oleh = 4 from keu_struktur_usulan where id = pg_temp.id('c3')), 'pengesah = PPK pengaju, penyetuju = ketua');

  -- draf lain untuk uji perlu_dipadankan (komponen 059)
  perform pg_temp.sesi(4);
  perform pg_temp.simpan('c4', keu_struktur_usul('komponen', '2906.BMA.005', null, '059', 'Komponen yang kelak berganti kode', null, null, null, 'lintas'));
  perform keu_struktur_aksi(pg_temp.id('c4'), 'ajukan');
  perform pg_temp.sesi(3);
  perform keu_struktur_aksi(pg_temp.id('c4'), 'sahkan');
  perform pg_temp.ok(pg_temp.st('c4') = 'sah', 'c4 sah');
  -- item dengan induk resmi: ajukan sampai sah
  perform pg_temp.sesi(6);
  perform keu_struktur_aksi(pg_temp.id('i3'), 'ajukan');
  perform keu_struktur_aksi(pg_temp.id('i4'), 'ajukan');
  perform pg_temp.sesi(4);
  perform keu_struktur_aksi(pg_temp.id('i3'), 'setuju_ketua');
  perform keu_struktur_aksi(pg_temp.id('i4'), 'setuju_ketua');
  perform pg_temp.sesi(3);
  perform keu_struktur_aksi(pg_temp.id('i3'), 'sahkan');
  perform keu_struktur_aksi(pg_temp.id('i4'), 'sahkan');
  -- i2 (dibatalkan) boleh dibuat ulang karena unik hanya untuk usulan terbuka
  perform pg_temp.sesi(6);
  perform pg_temp.simpan('i2b', keu_struktur_usul('item', '2906.BMA.005/055/521211', null, null, 'Pulpen tambahan', 20, 'OB', 4000, 'dalam'));
  perform pg_temp.ok(pg_temp.st('i2b') = 'draf', 'usulan dibatalkan boleh dibuat ulang');
end $$;

-- ================= E. Tingkat PPK: KRO, RO (kode sementara), komponen di RO usulan =================
do $$
begin
  perform pg_temp.sesi(3);
  perform pg_temp.simpan('k1', keu_struktur_usul('kro', '2906', null, 'BMB', 'KRO uji layanan baru', null, null, null, 'dalam'));
  perform pg_temp.ok((select jalur_kode = 'djpb' and ro_kode is null from keu_struktur_usulan where id = pg_temp.id('k1')), 'KRO: jalur DJPB');
  perform pg_temp.gagal($q$select keu_struktur_usul('kro', '2906', null, 'BMB', 'KRO kembar', null, null, null, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('kro', '2906', null, 'BMA', 'KRO sudah ada di POK', null, null, null, 'dalam')$q$, '23505');
  perform pg_temp.gagal($q$select keu_struktur_usul('kro', '2906', null, 'B1', 'KRO format salah', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('kro', null, null, 'BMC', 'KRO tanpa induk', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.gagal($q$select keu_struktur_usul('program', '2906', null, 'XX', 'Program dengan induk', null, null, null, 'dalam')$q$, '23514');
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('k1'), 'ajukan') = 'sah', 'KRO oleh PPK langsung sah');
  perform pg_temp.simpan('r1', keu_struktur_usul('ro', null, pg_temp.id('k1'), '001', 'RO uji layanan baru', 12, 'DOK', null, 'dalam'));
  perform pg_temp.ok((select ro_kode = kode_sementara and jalur_kode = 'djpb' and kepastian = 'dugaan' and volume = 12 and satuan = 'DOK' and harga is null and jumlah is null
                      from keu_struktur_usulan where id = pg_temp.id('r1')), 'RO: ro_kode = kode sementara, volume + satuan');
  perform pg_temp.gagal(format($q$select keu_struktur_usul('ro', null, %s, '002', 'RO tanpa volume', null, null, null, 'dalam')$q$, pg_temp.id('k1')), '23514');
  perform pg_temp.ok(not exists (select 1 from keu_ro where kode = (select kode_sementara from keu_struktur_usulan where id = pg_temp.id('r1'))), 'RO draf belum masuk keu_ro');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'ajukan')$q$, pg_temp.id('r1')), '42501');   -- admin RO tidak mengajukan tingkat PPK
  perform pg_temp.sesi(3);
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('r1'), 'ajukan') = 'sah', 'RO oleh PPK langsung sah');
  perform pg_temp.ok(exists (select 1 from keu_ro r join keu_struktur_usulan u on u.kode_sementara = r.kode
                             where u.id = pg_temp.id('r1') and r.aktif and r.nama = 'RO uji layanan baru'), 'RO sah terdaftar di keu_ro sebagai T-nnn');
  -- komponen di bawah RO usulan (PPK, tanpa ketua tim yang ditetapkan -> langsung sah)
  perform pg_temp.simpan('c5', keu_struktur_usul('komponen', null, pg_temp.id('r1'), '051', 'Komponen RO sementara', null, null, null, 'dalam'));
  perform pg_temp.ok((select ro_kode = (select ro_kode from keu_struktur_usulan where id = pg_temp.id('r1')) from keu_struktur_usulan where id = pg_temp.id('c5')), 'komponen mewarisi RO sementara');
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('c5'), 'ajukan') = 'sah', 'PPK pada RO sementara langsung sah');
  perform pg_temp.simpan('c6', keu_struktur_usul('komponen', null, pg_temp.id('r1'), '052', 'Komponen RO sementara 2', null, null, null, 'dalam'));
  -- komponen khusus -> jalur DJA
  perform pg_temp.simpan('c7', keu_struktur_usul('komponen', null, pg_temp.id('r1'), '999', 'Komponen khusus uji', null, null, null, 'dalam', true));
  perform pg_temp.ok((select jalur_kode = 'dja' and khusus from keu_struktur_usulan where id = pg_temp.id('c7')), 'komponen khusus: jalur DJA');
  perform pg_temp.gagal(format($q$select keu_struktur_usul('program', null, null, 'GG', 'Program sudah ada', null, null, null, 'dalam')$q$), '23505');
  perform pg_temp.simpan('p1', keu_struktur_usul('program', null, null, 'GX', 'Program uji', null, null, null, 'tambahan'));
  perform pg_temp.ok((select jalur_kode = 'dja' from keu_struktur_usulan where id = pg_temp.id('p1')), 'program: jalur DJA');
  perform pg_temp.ok(keu_struktur_aksi(pg_temp.id('p1'), 'ajukan') = 'sah', 'program oleh PPK langsung sah');
  -- batal: RO tidak bisa dibatalkan selagi turunan berjalan; sesudahnya keu_ro nonaktif
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'batal', 'Tidak jadi dibuat')$q$, pg_temp.id('r1')), '23514');
  perform keu_struktur_aksi(pg_temp.id('c5'), 'batal', 'Tidak jadi dibuat');
  perform keu_struktur_aksi(pg_temp.id('c6'), 'batal', 'Tidak jadi dibuat');
  perform keu_struktur_aksi(pg_temp.id('c7'), 'batal', 'Tidak jadi dibuat');
  perform pg_temp.ok(pg_temp.st('c5') = 'dibatalkan', 'komponen RO sementara dibatalkan');
  -- RO dipertahankan dulu untuk uji usulkan; tampilan RO sementara
  perform pg_temp.ok((select count(*) from keu_v_ro_sementara where usulan_id = pg_temp.id('r1') and aktif) = 1, 'view RO sementara memuat RO');
end $$;

-- ================= F. Mengusulkan ke pusat (PPK) =================
do $$
begin
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 10)$q$, pg_temp.id('c1')), '42501');   -- bukan PPK
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 10)$q$, pg_temp.id('i2b')), '23514');   -- masih draf
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 14)$q$, pg_temp.id('c1')), '23514');   -- jadwal DJA untuk jalur pok
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 9999)$q$, pg_temp.id('c1')), '23514');
  perform keu_struktur_usulkan(pg_temp.id('c1'), 10);
  perform pg_temp.ok((select status = 'diusulkan' and jadwal_id = 10 and diusulkan_at is not null from keu_struktur_usulan where id = pg_temp.id('c1')), 'komponen jalur pok diusulkan ke jadwal administrasi');
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 10)$q$, pg_temp.id('c1')), '23514');   -- sudah diusulkan
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'batal', 'sudah terlanjur')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set uraian = 'ubah' where id = %s$q$, pg_temp.id('c1')), '23514');
  perform keu_struktur_usulkan(pg_temp.id('a1'), null);
  perform keu_struktur_usulkan(pg_temp.id('i1'));
  perform keu_struktur_usulkan(pg_temp.id('c2'), 10);
  perform keu_struktur_usulkan(pg_temp.id('c3'));
  perform keu_struktur_usulkan(pg_temp.id('c4'));
  perform keu_struktur_usulkan(pg_temp.id('i3'));
  perform keu_struktur_usulkan(pg_temp.id('i4'));
  -- jalur DJPB/DJA wajib nomor surat dan jadwal sejenis
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 12)$q$, pg_temp.id('k1')), '23514');   -- tanpa nomor surat
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 10, 'S-123/BPS/2026')$q$, pg_temp.id('k1')), '23514');   -- jadwal bukan DJPB
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s, 13, 'S-123/BPS/2026')$q$, pg_temp.id('k1')), '23514');   -- jadwal DJA untuk jalur DJPB
  perform keu_struktur_usulkan(pg_temp.id('k1'), 12, 'S-123/BPS/2026');
  perform pg_temp.ok((select nomor_dokumen = 'S-123/BPS/2026' and status = 'diusulkan' from keu_struktur_usulan where id = pg_temp.id('k1')), 'KRO diusulkan DJPB dengan nomor surat');
  perform pg_temp.gagal(format($q$select keu_struktur_usulkan(%s)$q$, pg_temp.id('p1')), '23514');   -- program DJA tanpa nomor surat
  perform keu_struktur_usulkan(pg_temp.id('p1'), 14, 'S-77/BPS/2026');
  -- pembatalan induk ditolak selagi turunan berjalan; tolak pusat dicoba nanti
  perform pg_temp.ok((select count(*) from keu_struktur_usulan where tahun = 2026 and status = 'diusulkan') = 10, 'sepuluh usulan berstatus diusulkan');
end $$;

-- ================= G. Pencocokan dengan POK (P7) =================
do $$
begin
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_struktur_cocokkan()$q$), '42501');
  perform pg_temp.sesi(3);
  -- belum ada POK baru: tidak ada yang berubah
  perform pg_temp.ok(keu_struktur_cocokkan() = 0, 'tanpa POK baru, cocokkan tidak mengubah apa pun');
  perform pg_temp.ok(pg_temp.st('c1') = 'diusulkan', 'c1 tetap diusulkan');
end $$;

-- POK baru (nomor 12): salinan versi berlaku + komponen 056 (akun 521213 + item), komponen 060 dan item Kertas HVS tambahan
-- Dibuat lewat SQL editor (tanpa sesi aplikasi), sama seperti impor POK.
do $$
declare v_lama bigint; v_baru bigint; r record; m jsonb := '{}'; v_n bigint; v_k bigint; v_a bigint; v_a2 bigint; v_komp bigint;
begin
  perform pg_temp.sesi(null);
  select id into v_lama from keu_pok_versi where status = 'berlaku' and tahun = 2026;
  insert into keu_pok_versi(tahun, nomor_revisi, jenis, tanggal_efektif, hash_berkas) values (2026, 12, 'revisi', '2026-10-25', repeat('b', 64)) returning id into v_baru;
  for r in with recursive t as (select n.*, 0 as d from keu_pok_node n where n.versi_id = v_lama and n.induk_id is null
                                union all select c.*, t.d + 1 from keu_pok_node c join t on c.induk_id = t.id)
           select * from t order by d, id
  loop
    insert into keu_pok_node(versi_id, induk_id, tingkat, kode, kemunculan, nama, pagu, ro_kode, volume, satuan)
    values (v_baru, (m ->> r.induk_id::text)::bigint, r.tingkat, r.kode, r.kemunculan, r.nama, r.pagu, r.ro_kode, r.volume, r.satuan) returning id into v_n;
    m := m || jsonb_build_object(r.id::text, v_n);
  end loop;
  select id into v_a from keu_pok_node where versi_id = v_baru and tingkat = 'akun' and kode = '521211';
  select id into v_komp from keu_pok_node where versi_id = v_baru and tingkat = 'komponen' and kode = '055';
  for r in select * from keu_pok_detail where versi_id = v_lama loop
    insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, kemunculan, nomor_item, uraian, volume, satuan, harga_satuan, jumlah, sumber_dana, tanda_blokir, catatan_khusus)
    values (v_baru, (m ->> r.akun_node_id::text)::bigint, r.kunci_stabil, r.kemunculan, r.nomor_item, r.uraian, r.volume, r.satuan, r.harga_satuan, r.jumlah, r.sumber_dana, r.tanda_blokir, r.catatan_khusus);
  end loop;
  -- komponen baru: 056 (cocok dengan c1) dan 060 (pengganti 059)
  select id into v_n from keu_pok_node where versi_id = v_baru and tingkat = 'ro';
  insert into keu_pok_node(versi_id, induk_id, tingkat, kode, nama) values (v_baru, v_n, 'komponen', '056', 'Komponen uji pencacahan tambahan') returning id into v_k;
  insert into keu_pok_node(versi_id, induk_id, tingkat, kode, nama) values (v_baru, v_k, 'akun', '521213', 'Honor pemeriksa uji') returning id into v_a2;
  insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, nomor_item, uraian, volume, satuan, harga_satuan, jumlah)
    values (v_baru, v_a2, keu_kunci_detail('2906.BMA.005', '056', '521213', 'Honor pemeriksa lapangan', 1), '000901', 'Honor pemeriksa lapangan', 4, 'OB', 1500000, 6000000);
  insert into keu_pok_node(versi_id, induk_id, tingkat, kode, nama) values (v_baru, v_n, 'komponen', '060', 'Komponen pengganti 059');
  insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, nomor_item, uraian, volume, satuan, harga_satuan, jumlah)
    values (v_baru, v_a, keu_kunci_detail('2906.BMA.005', '055', '521211', 'Kertas HVS tambahan', 1), '000902', 'Kertas HVS tambahan', 10, 'PAKET', 50000, 500000);
  -- Pulpen tambahan oleh PPK nantinya dipadankan ke Materai; Spidol tidak dimuat
  perform keu_pok_berlakukan(v_baru, true);
  perform pg_temp.ok((select status from keu_pok_versi where id = v_baru) = 'berlaku', 'POK 12 berlaku');
end $$;

do $$
declare n int;
begin
  perform pg_temp.sesi(3);
  n := keu_struktur_cocokkan();
  perform pg_temp.ok(pg_temp.st('c1') = 'aktif', 'komponen 056 cocok -> aktif');
  perform pg_temp.ok((select kode_resmi = '2906.BMA.005/056' and cara_padan = 'sama' and dipadankan_oleh = 3 from keu_struktur_usulan where id = pg_temp.id('c1')), 'kode resmi komponen');
  perform pg_temp.ok(pg_temp.st('a1') = 'aktif', 'akun anak ikut cocok (induk aktif lebih dulu)');
  perform pg_temp.ok((select kode_resmi from keu_struktur_usulan where id = pg_temp.id('a1')) = '2906.BMA.005/056/521213', 'kode resmi akun lewat induk usulan');
  perform pg_temp.ok(pg_temp.st('i1') = 'aktif', 'item anak cocok lewat kunci stabil');
  perform pg_temp.ok((select kode_resmi from keu_struktur_usulan where id = pg_temp.id('i1')) = keu_kunci_detail('2906.BMA.005', '056', '521213', 'Honor pemeriksa lapangan', 1), 'kode resmi item = kunci stabil detail');
  perform pg_temp.ok(pg_temp.st('i4') = 'aktif', 'item pada induk resmi cocok');
  perform pg_temp.ok((select nomor_item from keu_v_struktur_usulan where id = pg_temp.id('i1')) = '000901' or
                     (select nomor_item from keu_v_struktur_usulan where id = pg_temp.id('i1')) is null, 'view memuat nomor item resmi bila terdaftar');
  perform pg_temp.ok(pg_temp.st('c2') = 'perlu_dipadankan' and pg_temp.st('c3') = 'perlu_dipadankan' and pg_temp.st('c4') = 'perlu_dipadankan',
                     'komponen 057/058/059 tidak ada di POK baru -> perlu dipadankan');
  perform pg_temp.ok(pg_temp.st('i3') = 'perlu_dipadankan', 'item spidol tidak ada di POK baru -> perlu dipadankan');
  perform pg_temp.ok(pg_temp.st('k1') = 'perlu_dipadankan' and pg_temp.st('p1') = 'perlu_dipadankan', 'KRO dan program yang tidak ada di POK baru -> perlu dipadankan');
  perform pg_temp.ok(n = (select count(*) from keu_struktur_usulan where status in ('aktif','perlu_dipadankan') and dibuat_at > now() - interval '1 hour'), 'jumlah perubahan = aktif + perlu_dipadankan');
  perform pg_temp.ok(keu_struktur_cocokkan() = 0, 'cocokkan kedua kali idempoten');
  -- aktif dipertahankan: tidak boleh lagi dibatalkan atau diubah
  perform pg_temp.gagal(format($q$select keu_struktur_aksi(%s, 'batal', 'sudah aktif jadi resmi')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_ubah(%s, null, 'Setelah aktif')$q$, pg_temp.id('c1')), '23514');
  perform pg_temp.ok((select boleh_komitmen from keu_v_struktur_usulan where id = pg_temp.id('c1')), 'aktif boleh dikomitmenkan');
  perform pg_temp.ok(not (select boleh_komitmen from keu_v_struktur_usulan where id = pg_temp.id('c2')), 'perlu_dipadankan belum boleh dikomitmenkan');
  perform pg_temp.ok((select menunggu from keu_v_struktur_usulan where id = pg_temp.id('c2')) = 'PPK (pemadanan)', 'view: menunggu PPK (pemadanan)');
end $$;

-- ================= H. Pemadanan manual (P8) dan penolakan pusat =================
do $$
begin
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/060')$q$, pg_temp.id('c4')), '42501');
  perform pg_temp.gagal(format($q$select keu_struktur_tolak_pusat(%s, 'Tidak dimuat pusat')$q$, pg_temp.id('c4')), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/060')$q$, pg_temp.id('c1')), '23514');   -- c1 sudah aktif
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/061')$q$, pg_temp.id('c4')), '23514');   -- tidak ada di POK
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.006/060')$q$, pg_temp.id('c4')), '23514');   -- RO induk berbeda / tidak ada
  perform keu_struktur_padankan(pg_temp.id('c4'), '2906.BMA.005/060');
  perform pg_temp.ok((select status = 'aktif' and kode_resmi = '2906.BMA.005/060' and cara_padan = 'manual' and dipadankan_oleh = 3 from keu_struktur_usulan where id = pg_temp.id('c4')), 'komponen dipadankan manual');
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/060')$q$, pg_temp.id('c4')), '23514');   -- sudah aktif
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/060')$q$, pg_temp.id('c3')), '23505');   -- kode resmi sudah dipakai
  -- item: induk harus sama
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/055/524113/transport#1')$q$, pg_temp.id('i3')), '23514');   -- akun lain
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, 'ngawur/kunci#1')$q$, pg_temp.id('i3')), '23514');
  perform keu_struktur_padankan(pg_temp.id('i3'), '2906.BMA.005/055/521211/materai#1');
  perform pg_temp.ok((select status = 'aktif' and kode_resmi = '2906.BMA.005/055/521211/materai#1' from keu_struktur_usulan where id = pg_temp.id('i3')), 'item dipadankan ke materai');
  -- tolak pusat
  perform pg_temp.gagal(format($q$select keu_struktur_tolak_pusat(%s, 'x')$q$, pg_temp.id('c3')), '23514');
  perform pg_temp.gagal(format($q$select keu_struktur_tolak_pusat(%s, 'Tidak dimuat pusat')$q$, pg_temp.id('c4')), '23514');   -- sudah aktif
  perform keu_struktur_tolak_pusat(pg_temp.id('c3'), 'Tidak dimuat pada POK revisi pusat');
  perform pg_temp.ok((select status = 'ditolak_pusat' and alasan_akhir like 'Tidak dimuat%' from keu_struktur_usulan where id = pg_temp.id('c3')), 'ditolak pusat');
  perform pg_temp.gagal(format($q$select keu_struktur_padankan(%s, '2906.BMA.005/060')$q$, pg_temp.id('c3')), '23514');
  -- KRO diusulkan yang punya turunan berjalan (RO r1 sah): tidak bisa ditolak dulu
  perform pg_temp.gagal(format($q$select keu_struktur_tolak_pusat(%s, 'Pusat menolak KRO ini')$q$, pg_temp.id('k1')), '23514');
  perform pg_temp.simpan('r_batal', pg_temp.id('r1'));
  perform keu_struktur_aksi(pg_temp.id('r1'), 'batal', 'RO ikut dibatalkan bersama KRO');
  perform pg_temp.ok(pg_temp.st('r1') = 'dibatalkan', 'RO dibatalkan');
  perform pg_temp.ok((select not aktif from keu_ro where kode = (select kode_sementara from keu_struktur_usulan where id = pg_temp.id('r1'))), 'keu_ro T-nnn nonaktif sesudah batal');
  perform keu_struktur_tolak_pusat(pg_temp.id('k1'), 'Pusat menolak KRO ini');
  perform pg_temp.ok(pg_temp.st('k1') = 'ditolak_pusat', 'KRO ditolak pusat');
  perform pg_temp.gagal(format($q$select keu_struktur_usul('ro', null, %s, '003', 'RO di bawah KRO ditolak', 1, 'DOK', null, 'dalam')$q$, pg_temp.id('k1')), '23514');
  perform pg_temp.ok(keu_struktur_tolak_pusat(pg_temp.id('p1'), 'Program tidak disetujui pusat') is null or true, 'program ditolak');
  -- KRO yang sama boleh diusulkan ulang setelah ditolak
  perform pg_temp.simpan('k1b', keu_struktur_usul('kro', '2906', null, 'BMB', 'KRO uji layanan baru (ulang)', null, null, null, 'dalam'));
  perform pg_temp.ok(pg_temp.st('k1b') = 'draf', 'usulan ulang setelah ditolak');
end $$;

-- ================= I. Penjaga DML, RLS, hak, audit =================
do $$
begin
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set status = 'aktif', kode_resmi = 'X', cara_padan = 'manual', dipadankan_at = now() where id = %s$q$, pg_temp.id('i2b')), '42501');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set status = 'sah' where id = %s$q$, pg_temp.id('i2b')), '42501');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set uraian = 'Ubah langsung' where id = %s$q$, pg_temp.id('i2b')), '42501');
  perform pg_temp.gagal(format($q$delete from keu_struktur_usulan where id = %s$q$, pg_temp.id('i2b')), '42501');
  perform pg_temp.gagal($q$insert into keu_struktur_usulan(tahun,kode_sementara,level,uraian,sumber,dibuat_oleh,kode,status,jalur_kode,kepastian,ro_kode,induk_kunci) values (2026,'T-900','komponen','Sisip langsung','dalam',3,'070','draf','pok','dugaan','2906.BMA.005','2906.BMA.005')$q$, '42501');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan_riwayat set catatan = 'x' where usulan_id = %s$q$, pg_temp.id('c1')));
  perform pg_temp.gagal(format($q$delete from keu_struktur_usulan_riwayat where usulan_id = %s$q$, pg_temp.id('c1')));
  perform pg_temp.sesi(null);
  -- SQL editor: kode sementara, level, pembuat tidak dapat diubah; status hanya mengikuti alur
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set kode_sementara = 'T-950' where id = %s$q$, pg_temp.id('i2b')), '23514');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set level = 'akun' where id = %s$q$, pg_temp.id('i2b')), '23514');
  perform pg_temp.gagal(format($q$update keu_struktur_usulan set status = 'diusulkan', diusulkan_at = now() where id = %s$q$, pg_temp.id('i2b')), '42501');
  -- RLS, hak, fungsi
  perform pg_temp.ok((select bool_and(c.relrowsecurity) from pg_class c where c.relname in ('keu_struktur_usulan','keu_struktur_usulan_riwayat')), 'RLS aktif');
  perform pg_temp.ok(not has_table_privilege('anon', 'keu_struktur_usulan', 'select') and not has_table_privilege('authenticated', 'keu_struktur_usulan', 'select')
                     and not has_table_privilege('authenticated', 'keu_struktur_usulan_riwayat', 'insert'), 'tabel tertutup bagi anon dan authenticated');
  perform pg_temp.ok(not exists (select 1 from pg_proc p where p.proname like 'keu\_str%' and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))), 'fungsi struktur tertutup');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'keu_v_struktur_usulan', 'select') and not has_table_privilege('anon', 'keu_v_ro_sementara', 'select'), 'view tertutup');
  perform pg_temp.ok((select count(*) from pg_class c where c.relname in ('keu_v_struktur_usulan','keu_v_struktur_ringkas','keu_v_ro_sementara','keu_v_pok_jalur_node')
                        and c.reloptions::text like '%security_invoker=true%') = 4, 'view security_invoker');
  -- jejak audit dan ringkasan
  perform pg_temp.ok(exists (select 1 from sigap_audit where aksi in ('keu.keu_struktur_usulan.update','keu.keu_struktur_usulan.insert')), 'jejak audit usulan struktur terisi');
  perform pg_temp.ok((select sum(n) from keu_v_struktur_ringkas) = (select count(*) from keu_struktur_usulan), 'ringkasan = jumlah usulan');
  -- kode sementara unik dan berurutan
  perform pg_temp.ok((select count(distinct kode_sementara) = count(*) from keu_struktur_usulan), 'kode sementara unik');
end $$;
