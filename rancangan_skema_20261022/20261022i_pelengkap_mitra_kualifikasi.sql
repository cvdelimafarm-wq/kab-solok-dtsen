-- =====================================================================
-- 20261022i_pelengkap_mitra_kualifikasi.sql
-- Pelengkap modul mitra dan kualifikasi: versi kebijakan dan persetujuan
-- (tambah-saja), log akses data pribadi, dokumen dan gerbang pembayaran,
-- pembayaran dan bukti pajak, dugaan tumpang tindih, adendum SPK, templat
-- perjanjian, kelengkapan seleksi (soal, pengumuman, banding, daftar tunggu),
-- pemantauan keadilan agregat, hash identitas, tingkat, pelatihan, anomali.
-- Bergantung pada a sampai h. Tanpa DROP/DELETE. RLS aktif tanpa policy.
-- Data pribadi (NIK, rekening, HP) TETAP di master; di sini hanya akun_id
-- atau hash satu arah.
-- =====================================================================

-- Parameter tambahan (belum diisi: tidak dikarang)
insert into tkl_parameter (kunci, status_isi, dasar_keterangan, berlaku_mulai) values
  ('mitra.tarif_pph21',            'belum_diisi', 'Isi dari ketentuan pajak berlaku (peraturan DJP/PMK); tidak dikarang.', date '2026-01-01'),
  ('mitra.ambang_tumpang_tindih',  'belum_diisi', 'Ambang skor dugaan tumpang tindih; ditetapkan Kepala dengan dasar ketentuan.', date '2026-01-01'),
  ('mitra.banding_hari_kerja',     'belum_diisi', 'Batas hari kerja mengajukan banding seleksi; isi dari pengumuman seleksi.', date '2026-01-01'),
  ('mitra.jawab_tawaran_hari_kerja','belum_diisi','Batas jawab tawaran daftar tunggu; isi dari pengumuman seleksi.', date '2026-01-01')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1. Versi kebijakan: teks persetujuan/pakta dan persetujuan perubahan parameter
-- ---------------------------------------------------------------------
create table mitra_kebijakan_versi (
  id           bigint generated always as identity primary key,
  jenis        text not null check (jenis in ('pakta_integritas','kerahasiaan','persetujuan_data','persetujuan_foto','persetujuan_lokasi','persetujuan_analitik','parameter')),
  versi        smallint not null check (versi >= 1),
  wajib        boolean not null default true,
  parameter_id bigint references tkl_parameter(id),
  bukti_id     bigint references tkl_bukti(id),
  ringkasan    text,
  tkl_regulasi_id bigint references tkl_regulasi(id),
  berlaku_mulai date not null,
  berlaku_sampai date,
  pengusul_id  bigint references sigap_akun(id),
  disetujui_oleh bigint references sigap_akun(id),
  disetujui_at timestamptz,
  dibuat_at    timestamptz not null default now(),
  unique nulls not distinct (jenis, versi, parameter_id),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check ((jenis = 'parameter') = (parameter_id is not null)),
  check (jenis <> 'parameter' or tkl_regulasi_id is not null or ringkasan is not null),
  check (disetujui_oleh is null or disetujui_oleh is distinct from pengusul_id),
  check (disetujui_oleh is null or disetujui_at is not null),
  exclude using gist (jenis with =, daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&)
    where (jenis <> 'parameter' and disetujui_oleh is not null)
);
comment on table mitra_kebijakan_versi is 'Riwayat versi teks kebijakan (pakta, kerahasiaan, persetujuan data) dan persetujuan Kepala atas perubahan parameter mitra (batas honor, bentuk perjanjian, tarif pajak, ambang tumpang tindih). Pengusul tidak boleh sama dengan penyetuju. Perubahan = baris baru, bukan menimpa.';
comment on column mitra_kebijakan_versi.wajib is 'false = persetujuan opsional: menolaknya tidak menghalangi penugasan, hanya mematikan fitur terkait.';
comment on column mitra_kebijakan_versi.parameter_id is 'Untuk jenis parameter: baris tkl_parameter yang disetujui; dasar ketentuan wajib dilampirkan (regulasi atau ringkasan).';
create trigger mitra_kebijakan_versi_jejak_tr after insert or update on mitra_kebijakan_versi
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 2. Persetujuan mitra: tambah-saja; penarikan = baris baru
-- ---------------------------------------------------------------------
create table mitra_persetujuan (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  kebijakan_id bigint not null references mitra_kebijakan_versi(id),
  tindakan     text not null check (tindakan in ('setuju','menolak','tarik')),
  cara         text not null default 'aplikasi' check (cara in ('aplikasi','kertas','petugas_mendampingi')),
  dicatat_oleh bigint references sigap_akun(id),
  catatan      text,
  dicatat_at   timestamptz not null default now(),
  check (cara = 'aplikasi' or dicatat_oleh is not null)
);
create index mitra_persetujuan_akun_idx on mitra_persetujuan (akun_id, kebijakan_id, id);
comment on table mitra_persetujuan is 'Persetujuan, penolakan, dan penarikan persetujuan oleh mitra atas satu versi kebijakan. Tambah-saja (tidak ada UPDATE/DELETE); penarikan = baris tindakan tarik yang mengikuti baris setuju. Hak tarik persetujuan tidak dipersyaratkan alasan.';
create function mitra_persetujuan_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_jenis text; v_mulai date; v_akhir date; v_terakhir text;
begin
  select jenis, berlaku_mulai, berlaku_sampai into v_jenis, v_mulai, v_akhir
    from mitra_kebijakan_versi where id = new.kebijakan_id and disetujui_oleh is not null;
  if v_jenis is null then
    raise exception 'Kebijakan belum disetujui Kepala atau tidak ada' using errcode = 'check_violation';
  end if;
  if v_jenis = 'parameter' then
    raise exception 'Persetujuan mitra hanya untuk teks kebijakan, bukan parameter' using errcode = 'check_violation';
  end if;
  if new.tindakan <> 'tarik' and not (current_date between v_mulai and coalesce(v_akhir, 'infinity'::date)) then
    raise exception 'Versi kebijakan ini tidak berlaku pada tanggal hari ini' using errcode = 'check_violation';
  end if;
  select p.tindakan into v_terakhir from mitra_persetujuan p
    join mitra_kebijakan_versi k on k.id = p.kebijakan_id
   where p.akun_id = new.akun_id and k.jenis = v_jenis order by p.id desc limit 1;
  if new.tindakan = 'tarik' and v_terakhir is distinct from 'setuju' then
    raise exception 'Tidak ada persetujuan aktif yang dapat ditarik' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mitra_persetujuan_jaga_tr before insert on mitra_persetujuan
  for each row execute function mitra_persetujuan_jaga();
create trigger mitra_persetujuan_tolak_ubah_tr before update or delete on mitra_persetujuan
  for each row execute function tkl_tolak_ubah();
create trigger mitra_persetujuan_tolak_kosong_tr before truncate on mitra_persetujuan
  for each statement execute function tkl_tolak_ubah();

create view mitra_v_persetujuan_terkini with (security_invoker = true) as
select distinct on (p.akun_id, k.jenis)
       p.akun_id, k.jenis, k.versi, p.tindakan, p.dicatat_at, k.wajib
  from mitra_persetujuan p
  join mitra_kebijakan_versi k on k.id = p.kebijakan_id
 order by p.akun_id, k.jenis, p.id desc;
comment on view mitra_v_persetujuan_terkini is 'Status persetujuan terakhir per mitra per jenis kebijakan (baris terakhir menang). Persetujuan yang ditarik tampil sebagai tarik.';

-- ---------------------------------------------------------------------
-- 3. Log akses data pribadi mitra (alasan wajib; tambah-saja)
-- ---------------------------------------------------------------------
create table mitra_akses_log (
  id           bigint generated always as identity primary key,
  pembuka_id   bigint not null references sigap_akun(id),
  mitra_akun_id bigint not null references sigap_akun(id),
  alasan       text not null check (length(btrim(alasan)) >= 10),
  kegiatan_id  bigint references sigap_kegiatan(id),
  jenis_data   text not null check (jenis_data in ('profil','kontak','rekening','dokumen','lokasi','nilai')),
  dibuka_at    timestamptz not null default now(),
  check (pembuka_id <> mitra_akun_id)
);
create index mitra_akses_log_mitra_idx on mitra_akses_log (mitra_akun_id, dibuka_at desc);
create index mitra_akses_log_pembuka_idx on mitra_akses_log (pembuka_id, dibuka_at desc);
comment on table mitra_akses_log is 'Siapa membuka data pribadi mitra mana, kapan, atas alasan apa dan lingkup kegiatan apa. Alasan minimal 10 karakter; tanpa alasan, pembukaan ditolak aplikasi dan baris ini menolak. Tambah-saja. Dasar pemeriksaan pembukaan tidak wajar (KRI).';
create trigger mitra_akses_log_tolak_ubah_tr before update or delete on mitra_akses_log
  for each row execute function tkl_tolak_ubah();
create trigger mitra_akses_log_tolak_kosong_tr before truncate on mitra_akses_log
  for each statement execute function tkl_tolak_ubah();

-- ---------------------------------------------------------------------
-- 4. Dokumen mitra (bukti terverifikasi manusia) dan gerbang kelengkapan
-- ---------------------------------------------------------------------
create table mitra_dokumen (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  spk_id       bigint references mitra_spk(id),
  jenis        text not null check (jenis in ('pakta_integritas','kerahasiaan','persetujuan_data','spk_ditandatangani','bast','npwp','rekening_terverifikasi','bukti_pajak','kuitansi','lainnya')),
  bukti_id     bigint references tkl_bukti(id),
  status       text not null default 'diunggah' check (status in ('diunggah','terverifikasi','ditolak','kedaluwarsa')),
  diverifikasi_oleh bigint references sigap_akun(id),
  diverifikasi_at timestamptz,
  berlaku_sampai date,
  catatan      text,
  dibuat_at    timestamptz not null default now(),
  check (status <> 'terverifikasi' or (bukti_id is not null and diverifikasi_oleh is not null and diverifikasi_at is not null)),
  check (diverifikasi_oleh is null or diverifikasi_oleh <> akun_id),
  check (status <> 'ditolak' or length(btrim(coalesce(catatan, ''))) >= 10),
  check (jenis not in ('spk_ditandatangani','bast','kuitansi') or spk_id is not null)
);
create index mitra_dokumen_akun_idx on mitra_dokumen (akun_id, jenis, status);
comment on table mitra_dokumen is 'Dokumen administrasi mitra. Isi dokumen di penyimpanan berkas (tkl_bukti, hash SHA-256); di sini hanya status verifikasi. Terverifikasi butuh berkas dan verifikator manusia selain mitra; verifikator tidak boleh yang mengunggah berkas (trigger).';
create function mitra_dokumen_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_unggah bigint;
begin
  if new.status = 'terverifikasi' and new.bukti_id is not null then
    select diunggah_oleh into v_unggah from tkl_bukti where id = new.bukti_id;
    if v_unggah is not null and v_unggah = new.diverifikasi_oleh then
      raise exception 'Verifikator tidak boleh orang yang mengunggah berkas yang sama' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger mitra_dokumen_jaga_tr before insert or update on mitra_dokumen
  for each row execute function mitra_dokumen_jaga();
create trigger mitra_dokumen_jejak_tr after insert or update on mitra_dokumen
  for each row execute function tkl_catat_jejak();

-- Jenis bukti wajib yang BELUM terverifikasi untuk pembayaran honor satu SPK.
create function mitra_dokumen_lengkap(p_spk bigint, p_tahap text default 'pembayaran', p_tanggal date default current_date)
returns setof text language sql stable
set search_path = public, pg_temp
as $$
  select w.jenis_bukti
    from keu_bukti_wajib w
   where w.jenis_transaksi = 'honor_mitra' and w.tahap = p_tahap and w.wajib
     and p_tanggal between w.berlaku_mulai and coalesce(w.berlaku_sampai, 'infinity'::date)
     and not exists (
       select 1
         from mitra_dokumen d
         join mitra_spk s on s.id = p_spk
         join mitra_perjanjian pj on pj.id = s.perjanjian_id
        where d.jenis = w.jenis_bukti and d.status = 'terverifikasi'
          and d.akun_id = pj.akun_id
          and (d.spk_id = p_spk or d.spk_id is null)
          and (d.berlaku_sampai is null or d.berlaku_sampai >= p_tanggal)
     )
   order by w.jenis_bukti
$$;
comment on function mitra_dokumen_lengkap(bigint, text, date) is 'Daftar jenis bukti wajib (keu_bukti_wajib) yang belum terverifikasi pada mitra_dokumen untuk satu SPK. Kosong = lengkap. Dipakai gerbang mitra_pembayaran.';

-- ---------------------------------------------------------------------
-- 5. Pembayaran honor dan bukti pajak
-- ---------------------------------------------------------------------
create table mitra_pembayaran (
  id           bigint generated always as identity primary key,
  bast_id      bigint not null references mitra_bast(id),
  bruto        numeric(18,0) not null check (bruto > 0),
  potongan_pajak numeric(18,0) not null default 0 check (potongan_pajak >= 0),
  bersih       numeric(18,0) generated always as (bruto - potongan_pajak) stored,
  status       text not null default 'tagihan' check (status in ('tagihan','diperiksa_ppk','spm_terbit','dibayar','retur','batal')),
  ppk_id       bigint references sigap_akun(id),
  ppspm_id     bigint references sigap_akun(id),
  bendahara_id bigint references sigap_akun(id),
  nomor_spm    text,
  tanggal_spm  date,
  tanggal_bayar date,
  alasan       text,
  dibuat_at    timestamptz not null default now(),
  check (potongan_pajak <= bruto),
  check (ppk_id is null or ppspm_id is null or ppk_id <> ppspm_id),
  check (ppk_id is null or bendahara_id is null or ppk_id <> bendahara_id),
  check (ppspm_id is null or bendahara_id is null or ppspm_id <> bendahara_id),
  check (status not in ('diperiksa_ppk','spm_terbit','dibayar') or ppk_id is not null),
  check (status not in ('spm_terbit','dibayar') or (ppspm_id is not null and nomor_spm is not null and tanggal_spm is not null)),
  check (status <> 'dibayar' or (bendahara_id is not null and tanggal_bayar is not null)),
  check (status not in ('retur','batal') or length(btrim(coalesce(alasan, ''))) >= 10)
);
create unique index mitra_pembayaran_aktif_uq on mitra_pembayaran (bast_id) where status not in ('retur','batal');
comment on table mitra_pembayaran is 'Hasil hitung pembayaran honor per BAST: bruto, pajak, bersih, nomor SPM, tanggal. PPK, PPSPM, dan Bendahara harus tiga orang berbeda. Penerbitan SPM/pembayaran hanya bila BAST disetujui, nilai tidak melebihi hasil BAST, dan dokumen wajib lengkap (mitra_dokumen_lengkap). Retur/batal wajib alasan; satu tagihan aktif per BAST.';
create function mitra_pembayaran_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_bast mitra_bast%rowtype; v_spk mitra_spk%rowtype; v_mitra bigint; v_hilang text[];
begin
  select * into v_bast from mitra_bast where id = new.bast_id;
  select * into v_spk from mitra_spk where id = v_bast.spk_id;
  select akun_id into v_mitra from mitra_perjanjian where id = v_spk.perjanjian_id;
  if new.ppk_id = v_mitra or new.ppspm_id = v_mitra or new.bendahara_id = v_mitra then
    raise exception 'Pejabat pembayaran tidak boleh mitra penerima honor' using errcode = 'check_violation';
  end if;
  if new.bruto > round(v_bast.volume_diterima * v_spk.harga_satuan) then
    raise exception 'Bruto melebihi hasil BAST (lebih %)', new.bruto - round(v_bast.volume_diterima * v_spk.harga_satuan)
      using errcode = 'check_violation';
  end if;
  if new.status in ('diperiksa_ppk','spm_terbit','dibayar') then
    if v_bast.status <> 'disetujui' then
      raise exception 'BAST belum disetujui; pembayaran ditolak' using errcode = 'check_violation';
    end if;
  end if;
  if new.status in ('spm_terbit','dibayar') then
    select array_agg(x) into v_hilang from mitra_dokumen_lengkap(v_bast.spk_id) x;
    if v_hilang is not null then
      raise exception 'Dokumen wajib belum lengkap: %', array_to_string(v_hilang, ', ') using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger mitra_pembayaran_jaga_tr before insert or update on mitra_pembayaran
  for each row execute function mitra_pembayaran_jaga();
create trigger mitra_pembayaran_jejak_tr after insert or update on mitra_pembayaran
  for each row execute function tkl_catat_jejak();

create table mitra_pajak_bukti (
  id           bigint generated always as identity primary key,
  pembayaran_id bigint not null references mitra_pembayaran(id),
  jenis        text not null check (jenis in ('bukti_potong','koreksi')),
  nomor        text not null,
  masa_pajak   date not null check (extract(day from masa_pajak) = 1),
  jumlah       numeric(18,0) not null check (jumlah >= 0),
  bukti_id     bigint references tkl_bukti(id),
  menggantikan_id bigint references mitra_pajak_bukti(id),
  alasan_koreksi text,
  tkl_regulasi_id bigint references tkl_regulasi(id),
  dicatat_oleh bigint not null references sigap_akun(id),
  dicatat_at   timestamptz not null default now(),
  check ((jenis = 'koreksi') = (menggantikan_id is not null)),
  check (jenis <> 'koreksi' or length(btrim(coalesce(alasan_koreksi, ''))) >= 10),
  unique (nomor)
);
comment on table mitra_pajak_bukti is 'Bukti potong pajak per pembayaran. Tambah-saja: salah potong dikoreksi dengan baris koreksi yang menunjuk baris lama beserta alasan, bukan menimpa.';
create trigger mitra_pajak_bukti_tolak_ubah_tr before update or delete on mitra_pajak_bukti
  for each row execute function tkl_tolak_ubah();
create trigger mitra_pajak_bukti_tolak_kosong_tr before truncate on mitra_pajak_bukti
  for each statement execute function tkl_tolak_ubah();

create view mitra_v_bukti_pajak_hilang with (security_invoker = true) as
select p.id as pembayaran_id, p.bast_id, p.potongan_pajak, p.tanggal_bayar
  from mitra_pembayaran p
 where p.status = 'dibayar' and p.potongan_pajak > 0
   and not exists (select 1 from mitra_pajak_bukti b where b.pembayaran_id = p.id and b.jenis = 'bukti_potong');
comment on view mitra_v_bukti_pajak_hilang is 'Pembayaran yang sudah dibayar dengan potongan pajak tetapi belum ada bukti potong (bahan pemantauan).';

-- ---------------------------------------------------------------------
-- 6. Dugaan tumpang tindih (bukan putusan)
-- ---------------------------------------------------------------------
create table mitra_tumpang_tindih (
  id           bigint generated always as identity primary key,
  spk_a_id     bigint not null references mitra_spk(id),
  spk_b_id     bigint not null references mitra_spk(id),
  skor         numeric(5,2) not null check (skor between 0 and 100),
  alasan_kode  text not null check (alasan_kode in ('wilayah_waktu_sama','volume_melebihi_kapasitas','lokasi_bukti_sama','lainnya')),
  keputusan    text not null default 'menunggu' check (keputusan in ('menunggu','wajar','koreksi','eskalasi')),
  alasan       text,
  ditinjau_oleh bigint references sigap_akun(id),
  ditinjau_at  timestamptz,
  dibuat_at    timestamptz not null default now(),
  check (spk_a_id < spk_b_id),
  unique (spk_a_id, spk_b_id),
  check (keputusan = 'menunggu' or (ditinjau_oleh is not null and ditinjau_at is not null and length(btrim(coalesce(alasan, ''))) >= 10))
);
comment on table mitra_tumpang_tindih is 'Dugaan pekerjaan tumpang tindih antar SPK. Hanya dugaan: tidak mengubah SPK, BAST, atau pembayaran secara otomatis. Keputusan manusia (wajar/koreksi/eskalasi) wajib beralasan. Atribut pribadi mitra tidak pernah menjadi masukan skor; ambang dari parameter mitra.ambang_tumpang_tindih.';
create function mitra_tumpang_tindih_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.ditinjau_oleh is not null and exists (
       select 1 from mitra_spk s join mitra_perjanjian p on p.id = s.perjanjian_id
        where s.id in (new.spk_a_id, new.spk_b_id) and p.akun_id = new.ditinjau_oleh) then
    raise exception 'Peninjau tidak boleh mitra yang diduga' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mitra_tumpang_tindih_jaga_tr before insert or update on mitra_tumpang_tindih
  for each row execute function mitra_tumpang_tindih_jaga();
create trigger mitra_tumpang_tindih_jejak_tr after insert or update on mitra_tumpang_tindih
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 7. Adendum SPK dan templat perjanjian
-- ---------------------------------------------------------------------
create table mitra_spk_adendum (
  id           bigint generated always as identity primary key,
  spk_id       bigint not null references mitra_spk(id),
  urutan       smallint not null check (urutan >= 1),
  nomor_dokumen text not null unique,
  jenis        text not null check (jenis in ('volume','harga','waktu','pembatalan_sebagian')),
  volume_baru  numeric(14,2) check (volume_baru > 0),
  harga_baru   numeric(16,0) check (harga_baru > 0),
  alasan       text not null check (length(btrim(alasan)) >= 10),
  ppk_id       bigint not null references sigap_akun(id),
  status       text not null default 'draf' check (status in ('draf','berlaku','batal')),
  berlaku_at   date,
  dibuat_at    timestamptz not null default now(),
  unique (spk_id, urutan),
  check (jenis <> 'volume' or volume_baru is not null),
  check (jenis <> 'harga' or harga_baru is not null),
  check (status <> 'berlaku' or berlaku_at is not null)
);
comment on table mitra_spk_adendum is 'Perubahan isi SPK hanya lewat adendum bernomor; baris SPK lama tidak diedit. Nilai baru tetap melewati penjaga honor bulanan saat adendum berlaku (aplikasi).';
create function mitra_spk_adendum_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_mitra bigint;
begin
  select p.akun_id into v_mitra from mitra_spk s join mitra_perjanjian p on p.id = s.perjanjian_id where s.id = new.spk_id;
  if new.ppk_id = v_mitra then
    raise exception 'PPK tidak boleh mitra pada SPK yang sama' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mitra_spk_adendum_jaga_tr before insert or update on mitra_spk_adendum
  for each row execute function mitra_spk_adendum_jaga();
create trigger mitra_spk_adendum_jejak_tr after insert or update on mitra_spk_adendum
  for each row execute function tkl_catat_jejak();

create table mitra_perjanjian_templat (
  id           bigint generated always as identity primary key,
  bentuk       text not null,
  versi        smallint not null check (versi >= 1),
  status_isi   text not null default 'belum_diisi' check (status_isi in ('belum_diisi','diisi_admin','terverifikasi')),
  bukti_id     bigint references tkl_bukti(id),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  berlaku_mulai date not null,
  berlaku_sampai date,
  disusun_oleh bigint references sigap_akun(id),
  disetujui_oleh bigint references sigap_akun(id),
  unique (bentuk, versi),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (status_isi = 'belum_diisi' or (bukti_id is not null and disetujui_oleh is not null and tkl_regulasi_id is not null)),
  check (disetujui_oleh is null or disetujui_oleh is distinct from disusun_oleh),
  exclude using gist (bentuk with =, daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&)
    where (status_isi <> 'belum_diisi')
);
comment on table mitra_perjanjian_templat is 'Templat perjanjian. Bentuk dan isi KOSONG sampai admin memasukkan dari ketentuan resmi (status belum_diisi); tidak dikarang. Status terisi butuh berkas, dasar ketentuan, dan persetujuan orang lain.';
create trigger mitra_perjanjian_templat_jejak_tr after insert or update on mitra_perjanjian_templat
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 8. Kelengkapan seleksi
-- ---------------------------------------------------------------------
create table mitra_seleksi_soal (
  id           bigint generated always as identity primary key,
  kompetensi_kode text references kual_kompetensi(kode),
  tingkat_sulit text not null check (tingkat_sulit in ('mudah','sedang','sulit')),
  butir        text not null,
  kunci_jawaban text not null,
  periode_terakhir_id bigint references mitra_seleksi_periode(id),
  periode_berturut smallint not null default 0 check (periode_berturut between 0 and 2),
  aktif        boolean not null default true,
  dibuat_oleh  bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now()
);
comment on table mitra_seleksi_soal is 'Bank soal tes tulis. Soal diambil acak per peserta menurut komposisi tingkat; soal yang sudah dipakai dua periode berturut-turut tidak dipakai lagi (periode_berturut maksimum 2). Kunci jawaban hanya server.';

create table mitra_seleksi_pengumuman (
  id           bigint generated always as identity primary key,
  periode_id   bigint not null references mitra_seleksi_periode(id),
  versi        smallint not null default 1 check (versi >= 1),
  nomor_surat  text not null,
  jumlah_lulus integer not null check (jumlah_lulus >= 0),
  jumlah_tunggu integer not null default 0 check (jumlah_tunggu >= 0),
  alasan_umum  text,
  alasan_penetapan_ulang text,
  bukti_id     bigint references tkl_bukti(id),
  ditetapkan_oleh bigint not null references sigap_akun(id),
  ditetapkan_at timestamptz not null default now(),
  unique (periode_id, versi),
  check (versi = 1 or length(btrim(coalesce(alasan_penetapan_ulang, ''))) >= 10)
);
comment on table mitra_seleksi_pengumuman is 'Penetapan hasil seleksi. Tambah-saja: penetapan ulang (misalnya setelah banding) = versi baru dengan alasan, versi lama tetap tersimpan.';
create function mitra_seleksi_pengumuman_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_kuota integer;
begin
  select kuota into v_kuota from mitra_seleksi_periode where id = new.periode_id;
  if new.jumlah_lulus > v_kuota then
    raise exception 'Jumlah lulus melebihi kuota periode (lebih %)', new.jumlah_lulus - v_kuota using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mitra_seleksi_pengumuman_jaga_tr before insert on mitra_seleksi_pengumuman
  for each row execute function mitra_seleksi_pengumuman_jaga();
create trigger mitra_seleksi_pengumuman_tolak_ubah_tr before update or delete on mitra_seleksi_pengumuman
  for each row execute function tkl_tolak_ubah();

create table mitra_seleksi_banding (
  id           bigint generated always as identity primary key,
  pendaftar_id bigint not null unique references mitra_pendaftar(id),
  alasan       text not null check (length(btrim(alasan)) >= 20),
  bukti_id     bigint references tkl_bukti(id),
  diajukan_at  timestamptz not null default now(),
  peninjau_id  bigint references sigap_akun(id),
  keputusan    text not null default 'menunggu' check (keputusan in ('menunggu','diterima','ditolak')),
  alasan_keputusan text,
  diputuskan_at timestamptz,
  check (keputusan = 'menunggu' or (peninjau_id is not null and diputuskan_at is not null and length(btrim(coalesce(alasan_keputusan, ''))) >= 10))
);
comment on table mitra_seleksi_banding is 'Banding hasil seleksi. Peninjau dipilih dari panitia yang tidak pernah menilai kandidat itu dan bukan kandidat sendiri (trigger); keputusan wajib alasan tertulis yang dikirim ke pemohon.';
create function mitra_seleksi_banding_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_kandidat bigint;
begin
  if new.peninjau_id is not null then
    select akun_id into v_kandidat from mitra_pendaftar where id = new.pendaftar_id;
    if new.peninjau_id = v_kandidat then
      raise exception 'Peninjau tidak boleh kandidat sendiri' using errcode = 'check_violation';
    end if;
    if exists (select 1 from mitra_nilai_seleksi where pendaftar_id = new.pendaftar_id and penilai_id = new.peninjau_id) then
      raise exception 'Peninjau banding tidak boleh penilai kandidat ini sebelumnya' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger mitra_seleksi_banding_jaga_tr before insert or update on mitra_seleksi_banding
  for each row execute function mitra_seleksi_banding_jaga();
create trigger mitra_seleksi_banding_jejak_tr after insert or update on mitra_seleksi_banding
  for each row execute function tkl_catat_jejak();

create table mitra_seleksi_daftar_tunggu (
  id           bigint generated always as identity primary key,
  periode_id   bigint not null references mitra_seleksi_periode(id),
  pendaftar_id bigint not null references mitra_pendaftar(id),
  peringkat    integer not null check (peringkat >= 1),
  status       text not null default 'menunggu' check (status in ('menunggu','ditawari','diterima','menolak','kedaluwarsa')),
  jumlah_tolak smallint not null default 0 check (jumlah_tolak between 0 and 2),
  ditawari_at  timestamptz,
  batas_jawab_at timestamptz,
  dijawab_at   timestamptz,
  unique (periode_id, pendaftar_id),
  constraint mitra_daftar_tunggu_peringkat_uq unique (periode_id, peringkat) deferrable initially deferred,
  check (status <> 'menolak' or jumlah_tolak >= 1),
  check (status <> 'ditawari' or (ditawari_at is not null and batas_jawab_at is not null)),
  check (status not in ('diterima','menolak') or dijawab_at is not null)
);
comment on table mitra_seleksi_daftar_tunggu is 'Daftar tunggu mengikuti peringkat, berlaku sampai akhir periode. Penolakan kedua memindahkan kandidat ke urutan terakhir (aplikasi memperbarui peringkat; unik tertunda sampai akhir transaksi). Batas jawab dari parameter mitra.jawab_tawaran_hari_kerja.';
create trigger mitra_seleksi_daftar_tunggu_jejak_tr after insert or update on mitra_seleksi_daftar_tunggu
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 9. Keadilan agregat, hash identitas
-- ---------------------------------------------------------------------
create table mitra_keadilan_ukur (
  id           bigint generated always as identity primary key,
  semester     date not null check (extract(day from semester) = 1),
  dimensi      text not null check (dimensi in ('kecamatan','rentang_pengalaman')),
  kelompok     text not null,
  n_mitra      integer not null check (n_mitra >= 10),
  persen_andal numeric(5,2) not null check (persen_andal between 0 and 100),
  persen_tertinggi numeric(5,2) not null check (persen_tertinggi between 0 and 100),
  air          numeric(6,3) generated always as (case when persen_tertinggi = 0 then null else round(persen_andal / persen_tertinggi, 3) end) stored,
  ambang       numeric(4,2) not null default 0.80 check (ambang between 0 and 1),
  perlu_telaah boolean generated always as (case when persen_tertinggi = 0 then false else persen_andal / persen_tertinggi < ambang end) stored,
  tindak_lanjut text,
  diukur_oleh  bigint not null references sigap_akun(id),
  ditinjau_oleh bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  unique (semester, dimensi, kelompok),
  check (persen_andal <= persen_tertinggi),
  check (ditinjau_oleh is null or ditinjau_oleh <> diukur_oleh),
  check (not perlu_telaah or ditinjau_oleh is null or tindak_lanjut is not null)
);
comment on table mitra_keadilan_ukur is 'Pemantauan keadilan agregat per semester (aturan 4/5, rasio dampak merugikan). Dimensi hanya kecamatan penugasan dan rentang pengalaman; atribut sensitif tidak ada. Kelompok kurang dari 10 mitra digabung (n_mitra minimum 10) agar individu tidak dikenali. Nilai di bawah ambang berarti ditelaah, bukan putusan tidak adil.';
create trigger mitra_keadilan_ukur_jejak_tr after insert or update on mitra_keadilan_ukur
  for each row execute function tkl_catat_jejak();

create table mitra_identitas_hash (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  kunci_versi  smallint not null default 1 check (kunci_versi >= 1),
  hash_nik     text not null check (hash_nik ~ '^[0-9a-f]{64}$'),
  dibuat_at    timestamptz not null default now(),
  unique (akun_id, kunci_versi),
  unique (hash_nik, kunci_versi)
);
comment on table mitra_identitas_hash is 'Hash satu arah (HMAC-SHA256 dengan kunci server) dari NIK untuk mendeteksi akun ganda tanpa menyalin NIK. NIK asli hanya di master. Unik: hash yang sama pada akun berbeda ditolak, lalu ditinjau manusia. Tambah-saja.';
create trigger mitra_identitas_hash_tolak_ubah_tr before update or delete on mitra_identitas_hash
  for each row execute function tkl_tolak_ubah();

-- ---------------------------------------------------------------------
-- 10. Kualifikasi: tingkat, pelatihan, anomali
-- ---------------------------------------------------------------------
create table kual_tingkat_riwayat (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  tingkat      text not null check (tingkat in ('tumbuh','cakap','andal','panutan')),
  skor_id      bigint references kual_skor_periode(id),
  alasan       text,
  berlaku_mulai date not null,
  berlaku_sampai date,
  diputuskan_oleh bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (diputuskan_oleh is null or diputuskan_oleh <> akun_id),
  exclude using gist (akun_id with =, daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&)
);
comment on table kual_tingkat_riwayat is 'Riwayat tingkat mitra (tumbuh, cakap, andal, panutan) bermasa berlaku. Kenaikan menurut skor; penurunan akibat kalibrasi diberitahukan beserta alasannya. Penetap bukan mitra yang bersangkutan.';
create trigger kual_tingkat_riwayat_jejak_tr after insert or update on kual_tingkat_riwayat
  for each row execute function tkl_catat_jejak();

create table kual_pelatihan (
  id           bigint generated always as identity primary key,
  kode         text not null unique,
  nama         text not null,
  kompetensi_kode text references kual_kompetensi(kode),
  kegiatan_id  bigint references sigap_kegiatan(id),
  mulai        date not null,
  selesai      date not null,
  ambang_lulus numeric(5,2) not null default 70 check (ambang_lulus between 0 and 100),
  penyelenggara_id bigint references sigap_akun(id),
  check (selesai >= mulai)
);
comment on table kual_pelatihan is 'Pelatihan (satu nama untuk pelatihan mitra maupun pegawai). Peserta dan hasil di kual_pelatihan_peserta; kelulusan dapat menghasilkan baris kual_kualifikasi.';

create table kual_pelatihan_peserta (
  id           bigint generated always as identity primary key,
  pelatihan_id bigint not null references kual_pelatihan(id),
  akun_id      bigint not null references sigap_akun(id),
  ulang_ke     smallint not null default 0 check (ulang_ke between 0 and 1),
  hadir_persen numeric(5,2) check (hadir_persen between 0 and 100),
  nilai        numeric(5,2) check (nilai between 0 and 100),
  status       text not null default 'terdaftar' check (status in ('terdaftar','hadir','lulus','tidak_lulus')),
  pendamping_id bigint references sigap_akun(id),
  kualifikasi_id bigint references kual_kualifikasi(id),
  unique (pelatihan_id, akun_id, ulang_ke),
  check (status not in ('lulus','tidak_lulus') or nilai is not null),
  check (ulang_ke = 0 or pendamping_id is not null),
  check (pendamping_id is null or pendamping_id <> akun_id),
  check (status <> 'lulus' or kualifikasi_id is not null)
);
comment on table kual_pelatihan_peserta is 'Daftar hadir dan hasil pelatihan. Tidak lulus boleh mengulang satu kali (ulang_ke = 1) dengan pendamping. Kelulusan wajib tertaut ke kual_kualifikasi.';
create trigger kual_pelatihan_peserta_jejak_tr after insert or update on kual_pelatihan_peserta
  for each row execute function tkl_catat_jejak();

create table kual_anomali (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  kegiatan_id  bigint references sigap_kegiatan(id),
  penugasan_id bigint references sigap_penugasan(id),
  jenis        text not null check (jenis in ('lokasi_janggal','waktu_janggal','foto_duplikat','pola_isian','lainnya')),
  skor         numeric(5,2) not null check (skor between 0 and 100),
  ambang       numeric(5,2) not null check (ambang between 0 and 100),
  status       text not null default 'baru' check (status in ('baru','diperiksa','wajar','ditindak')),
  diperiksa_oleh bigint references sigap_akun(id),
  catatan      text,
  terdeteksi_at timestamptz not null default now(),
  diperiksa_at timestamptz,
  check (diperiksa_oleh is null or diperiksa_oleh <> akun_id),
  check (status in ('baru','diperiksa') or (diperiksa_oleh is not null and diperiksa_at is not null and length(btrim(coalesce(catatan, ''))) >= 10))
);
comment on table kual_anomali is 'Dugaan anomali lapangan (lokasi, waktu, foto ganda, pola isian). Hanya dugaan: tidak menurunkan skor otomatis; pemeriksa manusia memutuskan wajar atau ditindak dengan catatan. Ambang disetarakan lewat kalibrasi.';
create trigger kual_anomali_jejak_tr after insert or update on kual_anomali
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- RLS: aktif, tanpa policy (hanya server/service_role)
-- ---------------------------------------------------------------------
alter table mitra_kebijakan_versi    enable row level security;
alter table mitra_persetujuan        enable row level security;
alter table mitra_akses_log          enable row level security;
alter table mitra_dokumen            enable row level security;
alter table mitra_pembayaran         enable row level security;
alter table mitra_pajak_bukti        enable row level security;
alter table mitra_tumpang_tindih     enable row level security;
alter table mitra_spk_adendum        enable row level security;
alter table mitra_perjanjian_templat enable row level security;
alter table mitra_seleksi_soal       enable row level security;
alter table mitra_seleksi_pengumuman enable row level security;
alter table mitra_seleksi_banding    enable row level security;
alter table mitra_seleksi_daftar_tunggu enable row level security;
alter table mitra_keadilan_ukur      enable row level security;
alter table mitra_identitas_hash     enable row level security;
alter table kual_tingkat_riwayat     enable row level security;
alter table kual_pelatihan           enable row level security;
alter table kual_pelatihan_peserta   enable row level security;
alter table kual_anomali             enable row level security;
