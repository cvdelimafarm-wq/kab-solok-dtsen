-- =====================================================================
-- 20261022j_pelengkap_sdm_tatakelola.sql
-- Pelengkap SDM-kinerja dan tata kelola: umpan balik, pembinaan, pengingat,
-- bukti dukung, keberatan, kontrak belajar, ringkasan bahan, kesenjangan;
-- retensi, klasifikasi data, dugaan, KRI, penilaian dan keputusan risiko,
-- pengecualian SoD, SOP, tinjauan regulasi, pengingat, galat, laju,
-- pernyataan konflik kepentingan, uji kesiapan.
-- Bergantung pada a sampai i. Tanpa DROP/DELETE. RLS aktif tanpa policy.
-- Prinsip: sistem menyiapkan BAHAN dan DUGAAN; manusia memutuskan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. SDM kinerja
-- ---------------------------------------------------------------------
create table sdm_umpan_balik (
  id            bigint generated always as identity primary key,
  pegawai_id    bigint not null references sigap_akun(id),
  pemberi_id    bigint not null references sigap_akun(id),
  butir_id      bigint references sdm_skp_butir(id),
  versi         smallint not null default 1 check (versi >= 1),
  menggantikan_id bigint unique references sdm_umpan_balik(id),
  tanggal_kejadian date not null,
  tanggal_catat date not null default current_date,
  situasi       text not null check (length(btrim(situasi)) >= 10),
  perilaku      text not null check (length(btrim(perilaku)) >= 10),
  dampak        text,
  check (pegawai_id <> pemberi_id),
  check (tanggal_catat >= tanggal_kejadian),
  check ((versi = 1) = (menggantikan_id is null)),
  check ((situasi || ' ' || perilaku || ' ' || coalesce(dampak, '')) !~* '\m(malas|ceroboh|bodoh|pemalas|lamban|usia|agama|suku|perkawinan|kesehatan|disabilitas|jenis kelamin)\M')
);
comment on table sdm_umpan_balik is 'Catatan umpan balik kinerja berpola situasi-perilaku-dampak. Tambah-saja: koreksi = versi baru yang menunjuk versi lama. Kata sifat tentang pribadi dan atribut sensitif ditolak oleh CHECK sebagai pagar kedua (validasi utama di aplikasi).';
create trigger sdm_umpan_balik_tolak_ubah_tr before update or delete on sdm_umpan_balik
  for each row execute function tkl_tolak_ubah();

create table sdm_pengingat (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null references sdm_skp(id),
  jenis         text not null check (jenis in ('pemantauan_triwulan','percakapan_kinerja','keberatan_tenggat','kontrak_belajar')),
  sumber_tabel  text not null,
  sumber_id     text not null,
  tujuan_id     bigint not null references sigap_akun(id),
  jatuh_tempo   date not null,
  status        text not null default 'terjadwal' check (status in ('terjadwal','terkirim','dikerjakan','naik_ke_ketua','batal')),
  naik_ke_id    bigint references sigap_akun(id),
  selesai_at    timestamptz,
  dibuat_at     timestamptz not null default now(),
  check (status <> 'naik_ke_ketua' or naik_ke_id is not null),
  check (status <> 'dikerjakan' or selesai_at is not null)
);
comment on table sdm_pengingat is 'Pengingat percakapan kinerja. Pemicu dihitung dari catatan bercap waktu di modul sumber (sumber_tabel/sumber_id), bukan penilaian subjektif. Bila atasan tidak menjadwalkan sampai batas, pengingat naik ke Ketua Tim.';
create trigger sdm_pengingat_jejak_tr after insert or update on sdm_pengingat
  for each row execute function tkl_catat_jejak();

create table sdm_pembinaan (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null references sdm_skp(id),
  pengingat_id  bigint references sdm_pengingat(id),
  tanggal       date not null,
  ringkasan     text not null check (length(btrim(ringkasan)) >= 10),
  kesepakatan   text,
  dicatat_oleh  bigint not null references sigap_akun(id),
  dibuat_at     timestamptz not null default now()
);
comment on table sdm_pembinaan is 'Catatan percakapan pembinaan (tanggal, ringkasan, kesepakatan). Peserta = pegawai dan atasan pada sdm_skp. Bukan catatan negatif.';
create trigger sdm_pembinaan_jejak_tr after insert or update on sdm_pembinaan
  for each row execute function tkl_catat_jejak();

create table sdm_bukti_dukung (
  id            bigint generated always as identity primary key,
  butir_id      bigint not null references sdm_skp_butir(id),
  bukti_id      bigint not null references tkl_bukti(id),
  dilampir_oleh bigint not null references sigap_akun(id),
  dilampir_at   timestamptz not null default now(),
  dilepas_oleh  bigint references sigap_akun(id),
  dilepas_at    timestamptz,
  alasan_lepas  text,
  check ((dilepas_at is null) = (dilepas_oleh is null)),
  check (dilepas_at is null or length(btrim(coalesce(alasan_lepas, ''))) >= 10)
);
create unique index sdm_bukti_dukung_aktif_uq on sdm_bukti_dukung (butir_id, bukti_id) where dilepas_at is null;
comment on table sdm_bukti_dukung is 'Relasi bukti ke butir SKP. Melepas bukti = mengisi dilepas_at dengan alasan (tidak ada DELETE); lampir dan lepas masuk jejak.';
create trigger sdm_bukti_dukung_jejak_tr after insert or update on sdm_bukti_dukung
  for each row execute function tkl_catat_jejak();

create table sdm_keberatan (
  id            bigint generated always as identity primary key,
  penilaian_id  bigint not null references sdm_penilaian(id),
  versi         smallint not null default 1 check (versi >= 1),
  pengaju_id    bigint not null references sigap_akun(id),
  uraian        text not null check (length(btrim(uraian)) >= 20),
  peninjau_id   bigint references sigap_akun(id),
  hasil         text not null default 'menunggu' check (hasil in ('menunggu','tetap','diubah','dicabut')),
  alasan_hasil  text,
  diputuskan_at timestamptz,
  dibuat_at     timestamptz not null default now(),
  unique (penilaian_id, versi),
  check (peninjau_id is null or peninjau_id <> pengaju_id),
  check (hasil = 'menunggu' or (peninjau_id is not null and diputuskan_at is not null and length(btrim(coalesce(alasan_hasil, ''))) >= 10))
);
comment on table sdm_keberatan is 'Keberatan pegawai atas penilaian. Peninjau bukan pengaju dan bukan pejabat penilai (trigger). Hasil (tetap, diubah, dicabut) menambah versi baru dengan alasan tertulis; versi lama tetap tersimpan sesuai jadwal retensi.';
create function sdm_keberatan_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_penilai bigint;
begin
  if new.peninjau_id is not null then
    select penilai_id into v_penilai from sdm_penilaian where id = new.penilaian_id;
    if new.peninjau_id = v_penilai then
      raise exception 'Peninjau keberatan tidak boleh pejabat penilai yang sama' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger sdm_keberatan_jaga_tr before insert or update on sdm_keberatan
  for each row execute function sdm_keberatan_jaga();
create trigger sdm_keberatan_jejak_tr after insert or update on sdm_keberatan
  for each row execute function tkl_catat_jejak();

create table sdm_kontrak_belajar (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  atasan_id     bigint not null references sigap_akun(id),
  triwulan      date not null check (extract(day from triwulan) = 1 and extract(month from triwulan) in (1,4,7,10)),
  kompetensi_kode text not null references kual_kompetensi(kode),
  tingkat_awal  smallint not null check (tingkat_awal between 0 and 4),
  tingkat_target smallint not null check (tingkat_target between 1 and 4),
  status        text not null default 'rencana' check (status in ('rencana','berjalan','tercapai','tidak_tercapai','dibahas')),
  disepakati_at timestamptz,
  catatan       text,
  unique (akun_id, triwulan, kompetensi_kode),
  check (akun_id <> atasan_id),
  check (tingkat_target > tingkat_awal),
  check (status = 'rencana' or disepakati_at is not null)
);
comment on table sdm_kontrak_belajar is 'Kontrak belajar per triwulan: kompetensi, tingkat awal dan target. Tingkat kompetensi hanya naik dengan bukti (kual_kualifikasi dari tugas/pelatihan), bukan lewat klik di sini. Yang tidak tercapai dibahas di pembinaan, bukan catatan negatif.';
create trigger sdm_kontrak_belajar_jejak_tr after insert or update on sdm_kontrak_belajar
  for each row execute function tkl_catat_jejak();

create table sdm_kontrak_belajar_komitmen (
  id            bigint generated always as identity primary key,
  kontrak_id    bigint not null references sdm_kontrak_belajar(id),
  uraian        text not null,
  tenggat       date not null,
  selesai_at    date,
  pelatihan_id  bigint references kual_pelatihan(id),
  bukti_id      bigint references tkl_bukti(id),
  check (selesai_at is null or bukti_id is not null or pelatihan_id is not null)
);
comment on table sdm_kontrak_belajar_komitmen is 'Butir komitmen dalam kontrak belajar (misalnya pelatihan atau tugas pendamping). Selesai butuh bukti atau pelatihan tercatat.';

create view sdm_kesenjangan with (security_invoker = true) as
select g.akun_id, g.kegiatan_id, g.peran, g.kompetensi_kode, g.tingkat_min, g.tingkat_dimiliki, g.kurang
  from kual_v_gap g
 where g.kurang > 0
   and exists (select 1 from sdm_skp s where s.pegawai_id = g.akun_id);
comment on view sdm_kesenjangan is 'Kesenjangan kompetensi pegawai (yang memiliki SKP) terhadap kebutuhan kegiatan, dari kual_v_gap. Dibaca per triwulan sebagai bahan kontrak belajar dan rencana diklat; agregat untuk Subbag Umum.';

create table sdm_ringkasan_bahan (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null references sdm_skp(id),
  periode       date not null check (extract(day from periode) = 1),
  isi           jsonb not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  disusun_oleh  bigint references sigap_akun(id),
  disusun_at    timestamptz not null default now(),
  unique (skp_id, periode, sha256),
  check (not (isi ? 'nilai' or isi ? 'predikat' or isi ? 'skor_akhir'))
);
comment on table sdm_ringkasan_bahan is 'Bahan bercap waktu untuk penilai: capaian per butir, daftar bukti, riwayat umpan balik. BUKAN nilai dan BUKAN predikat (CHECK menolak kunci nilai/predikat). Nilai dan predikat hanya di sistem resmi. Tambah-saja.';
create trigger sdm_ringkasan_bahan_tolak_ubah_tr before update or delete on sdm_ringkasan_bahan
  for each row execute function tkl_tolak_ubah();

-- ---------------------------------------------------------------------
-- B. Tata kelola: data
-- ---------------------------------------------------------------------
create table tkl_retensi_aturan (
  id            bigint generated always as identity primary key,
  objek_tabel   text not null,
  masa_simpan_bulan integer check (masa_simpan_bulan > 0),
  tindakan      text not null check (tindakan in ('arsip','anonimkan','tinjau_pemusnahan')),
  status_isi    text not null default 'belum_diisi' check (status_isi in ('belum_diisi','ilustrasi','diisi_admin','terverifikasi')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  berlaku_mulai date not null default date '2026-01-01',
  berlaku_sampai date,
  diubah_oleh   bigint references sigap_akun(id),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (status_isi = 'belum_diisi' or masa_simpan_bulan is not null),
  exclude using gist (objek_tabel with =, daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&)
);
comment on table tkl_retensi_aturan is 'Masa simpan per jenis data. Tindakan akhir hanya arsip, anonimkan, atau tinjau pemusnahan (oleh manusia, mengikuti jadwal retensi arsip resmi); TIDAK ada penghapusan otomatis. Masa simpan yang belum ada di ketentuan dibiarkan belum_diisi.';
insert into tkl_retensi_aturan (objek_tabel, status_isi, tindakan) values
  ('mitra_akses_log','belum_diisi','arsip'),
  ('mitra_pembayaran','belum_diisi','arsip'),
  ('mitra_pajak_bukti','belum_diisi','arsip'),
  ('kual_pengamatan','belum_diisi','anonimkan'),
  ('sdm_keberatan','belum_diisi','tinjau_pemusnahan'),
  ('tkl_bukti','belum_diisi','tinjau_pemusnahan')
on conflict do nothing;
insert into tkl_retensi_aturan (objek_tabel, masa_simpan_bulan, status_isi, tindakan) values
  ('tkl_galat', 3, 'ilustrasi', 'arsip'),
  ('tkl_metrik_laju', 1, 'ilustrasi', 'arsip')
on conflict do nothing;

create table tkl_klasifikasi_data (
  id            bigint generated always as identity primary key,
  objek_tabel   text not null,
  kolom         text,
  klasifikasi   text not null check (klasifikasi in ('umum','terbatas','rahasia_statistik','pribadi','pribadi_spesifik')),
  tampilan_lain text not null default 'agregat' check (tampilan_lain in ('agregat','disamarkan','tidak_ditampilkan','penuh')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  unique nulls not distinct (objek_tabel, kolom),
  check (klasifikasi not in ('rahasia_statistik','pribadi','pribadi_spesifik') or tampilan_lain <> 'penuh')
);
comment on table tkl_klasifikasi_data is 'Klasifikasi data per tabel (atau kolom). Data individu responden berklasifikasi rahasia_statistik: hanya petugas bertugas, tampilan agregat untuk pihak lain (UU 16/1997; PP 51/1999). Data pribadi tidak pernah ditampilkan penuh kepada pihak lain.';
insert into tkl_klasifikasi_data (objek_tabel, kolom, klasifikasi, tampilan_lain) values
  ('sigap_akun','nik','pribadi','tidak_ditampilkan'),
  ('sigap_akun','nip','pribadi','disamarkan'),
  ('mitra_identitas_hash',null,'pribadi','tidak_ditampilkan'),
  ('mitra_akses_log',null,'terbatas','agregat'),
  ('mitra_pembayaran',null,'terbatas','agregat'),
  ('kual_pengamatan',null,'terbatas','agregat'),
  ('tkl_jejak',null,'terbatas','agregat'),
  ('keu_rab_versi',null,'terbatas','agregat')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- C. Tata kelola: indikator risiko, penilaian, keputusan
-- ---------------------------------------------------------------------
create table tkl_kri (
  id            bigint generated always as identity primary key,
  kode          text not null unique check (kode ~ '^KRI-[0-9]{2}$'),
  uraian        text not null,
  sumber        text not null,
  frekuensi     text not null check (frekuensi in ('harian','mingguan','bulanan','triwulan')),
  arah          text not null default 'naik_buruk' check (arah in ('naik_buruk','turun_buruk')),
  ambang_waspada numeric(14,2),
  ambang_bahaya numeric(14,2),
  risiko_id     bigint references tkl_risiko(id),
  pemilik_peran_id bigint references sigap_peran(id),
  aktif         boolean not null default true,
  check (ambang_waspada is null or ambang_bahaya is null or (arah = 'naik_buruk' and ambang_bahaya >= ambang_waspada) or (arah = 'turun_buruk' and ambang_bahaya <= ambang_waspada))
);
comment on table tkl_kri is 'Definisi indikator risiko kunci (KRI): sumber data, frekuensi, ambang waspada dan bahaya. Ambang adalah parameter yang disetujui, bukan angka bawaan.';

create table tkl_kri_ukur (
  id            bigint generated always as identity primary key,
  kri_id        bigint not null references tkl_kri(id),
  periode       date not null,
  nilai         numeric(14,2) not null,
  status        text not null check (status in ('aman','waspada','bahaya')),
  tindak_lanjut_id bigint references tkl_tindak_lanjut(id),
  diukur_at     timestamptz not null default now(),
  unique (kri_id, periode),
  check (status <> 'bahaya' or tindak_lanjut_id is not null)
);
comment on table tkl_kri_ukur is 'Hasil ukur KRI, satu baris per periode dan tidak diubah. Status bahaya wajib menaut tugas tindak lanjut (tkl_tindak_lanjut) dengan pemilik dan tenggat.';
create function tkl_kri_ukur_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare k tkl_kri%rowtype; v_status text;
begin
  select * into k from tkl_kri where id = new.kri_id;
  v_status := 'aman';
  if k.arah = 'naik_buruk' then
    if k.ambang_bahaya is not null and new.nilai >= k.ambang_bahaya then v_status := 'bahaya';
    elsif k.ambang_waspada is not null and new.nilai >= k.ambang_waspada then v_status := 'waspada'; end if;
  else
    if k.ambang_bahaya is not null and new.nilai <= k.ambang_bahaya then v_status := 'bahaya';
    elsif k.ambang_waspada is not null and new.nilai <= k.ambang_waspada then v_status := 'waspada'; end if;
  end if;
  if new.status <> v_status then
    raise exception 'Status % tidak sesuai ambang KRI (seharusnya %)', new.status, v_status using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger tkl_kri_ukur_jaga_tr before insert on tkl_kri_ukur
  for each row execute function tkl_kri_ukur_jaga();
create trigger tkl_kri_ukur_tolak_ubah_tr before update or delete on tkl_kri_ukur
  for each row execute function tkl_tolak_ubah();

create table tkl_risiko_penilaian (
  id            bigint generated always as identity primary key,
  risiko_id     bigint not null references tkl_risiko(id),
  triwulan      date not null check (extract(day from triwulan) = 1 and extract(month from triwulan) in (1,4,7,10)),
  kemungkinan   smallint not null check (kemungkinan between 1 and 5),
  dampak        smallint not null check (dampak between 1 and 5),
  skor          smallint generated always as (kemungkinan * dampak) stored,
  penilai_id    bigint not null references sigap_akun(id),
  catatan       text,
  dinilai_at    timestamptz not null default now(),
  unique (risiko_id, triwulan)
);
comment on table tkl_risiko_penilaian is 'Penilaian risiko per triwulan, tambah-saja supaya tren terlihat. Hanya tim satker yang menilai (dijaga di aplikasi); admin sistem hanya memelihara fitur.';
create trigger tkl_risiko_penilaian_tolak_ubah_tr before update or delete on tkl_risiko_penilaian
  for each row execute function tkl_tolak_ubah();

create table tkl_risiko_keputusan (
  id            bigint generated always as identity primary key,
  risiko_id     bigint not null references tkl_risiko(id),
  keputusan     text not null check (keputusan in ('terima','mitigasi','hindari','alihkan')),
  alasan        text not null check (length(btrim(alasan)) >= 20),
  pengusul_id   bigint not null references sigap_akun(id),
  penyetuju_id  bigint not null references sigap_akun(id),
  kedaluwarsa   date,
  diputuskan_at timestamptz not null default now(),
  check (pengusul_id <> penyetuju_id),
  check (keputusan <> 'terima' or kedaluwarsa is not null),
  check (kedaluwarsa is null or kedaluwarsa > diputuskan_at::date)
);
comment on table tkl_risiko_keputusan is 'Keputusan penanganan risiko. Menerima risiko wajib punya penyetuju (bukan pengusul), alasan, dan tanggal kedaluwarsa; setelah kedaluwarsa risiko kembali belum diputuskan (view tkl_v_risiko_belum_diputuskan). Tambah-saja.';
create trigger tkl_risiko_keputusan_tolak_ubah_tr before update or delete on tkl_risiko_keputusan
  for each row execute function tkl_tolak_ubah();

create view tkl_v_risiko_belum_diputuskan with (security_invoker = true) as
select r.id as risiko_id, r.kode, r.tingkat, r.status
  from tkl_risiko r
 where r.tingkat = 'tinggi'
   and not exists (
     select 1 from tkl_risiko_keputusan k
      where k.risiko_id = r.id and (k.kedaluwarsa is null or k.kedaluwarsa >= current_date));
comment on view tkl_v_risiko_belum_diputuskan is 'Risiko tinggi tanpa keputusan yang masih berlaku; bahan Ruang keputusan.';

-- ---------------------------------------------------------------------
-- D. Pernyataan konflik kepentingan, dugaan, pengecualian SoD
-- ---------------------------------------------------------------------
create table tkl_pernyataan_ki (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  objek_tabel   text not null,
  objek_id      text not null,
  ada_konflik   boolean not null,
  uraian        text,
  dinyatakan_at timestamptz not null default now(),
  check (not ada_konflik or length(btrim(coalesce(uraian, ''))) >= 10)
);
create index tkl_pernyataan_ki_objek_idx on tkl_pernyataan_ki (objek_tabel, objek_id, akun_id);
comment on table tkl_pernyataan_ki is 'Pernyataan konflik kepentingan oleh penilai/peninjau/panitia atas suatu objek (kandidat, dugaan, banding). Tambah-saja; menyatakan ada konflik wajib uraian dan berakibat penggantian orang.';
create trigger tkl_pernyataan_ki_tolak_ubah_tr before update or delete on tkl_pernyataan_ki
  for each row execute function tkl_tolak_ubah();

create table tkl_dugaan (
  id            bigint generated always as identity primary key,
  jenis         text not null check (jenis in ('klaim_ganda','pola_penugasan','akses_tidak_wajar','anomali_data','lainnya')),
  objek_tabel   text not null,
  objek_id      text not null,
  akun_terkait_id bigint references sigap_akun(id),
  skor          numeric(5,2) check (skor between 0 and 100),
  status        text not null default 'baru' check (status in ('baru','ditinjau','terbukti','tidak_terbukti','tidak_cukup_bukti','ditutup')),
  peninjau_id   bigint references sigap_akun(id),
  catatan_status text,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz,
  check (status = 'baru' or peninjau_id is not null),
  check (peninjau_id is null or peninjau_id is distinct from akun_terkait_id)
);
comment on table tkl_dugaan is 'Dugaan penyimpangan. Sistem hanya membuat dugaan berstatus baru; TIDAK ada putusan otomatis. Setiap perubahan status oleh peninjau manusia menulis langkah (tkl_dugaan_langkah). Putusan terbukti/tidak_terbukti/tidak_cukup_bukti butuh pernyataan tanpa konflik kepentingan dari peninjau pada dugaan itu.';
create table tkl_dugaan_langkah (
  id            bigint generated always as identity primary key,
  dugaan_id     bigint not null references tkl_dugaan(id),
  dari_status   text not null,
  ke_status     text not null,
  oleh_id       bigint references sigap_akun(id),
  catatan       text not null check (length(btrim(catatan)) >= 10),
  dicatat_at    timestamptz not null default now()
);
comment on table tkl_dugaan_langkah is 'Riwayat tiap perubahan status dugaan: dari, ke, siapa, catatan. Tambah-saja; ditulis otomatis oleh trigger pada tkl_dugaan.';
create trigger tkl_dugaan_langkah_tolak_ubah_tr before update or delete on tkl_dugaan_langkah
  for each row execute function tkl_tolak_ubah();
create function tkl_dugaan_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if length(btrim(coalesce(new.catatan_status, ''))) < 10 then
      raise exception 'Perubahan status dugaan wajib catatan (minimal 10 karakter)' using errcode = 'check_violation';
    end if;
    if new.status in ('terbukti','tidak_terbukti','tidak_cukup_bukti') and not exists (
         select 1 from tkl_pernyataan_ki p
          where p.objek_tabel = 'tkl_dugaan' and p.objek_id = new.id::text
            and p.akun_id = new.peninjau_id and not p.ada_konflik) then
      raise exception 'Peninjau belum menyatakan bebas konflik kepentingan untuk dugaan ini' using errcode = 'check_violation';
    end if;
    new.diubah_at := now();
  end if;
  return new;
end $$;
create trigger tkl_dugaan_jaga_tr before insert or update on tkl_dugaan
  for each row execute function tkl_dugaan_jaga();
create function tkl_dugaan_tulis_langkah() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into tkl_dugaan_langkah (dugaan_id, dari_status, ke_status, oleh_id, catatan)
    values (new.id, old.status, new.status, new.peninjau_id, new.catatan_status);
  end if;
  return null;
end $$;
create trigger tkl_dugaan_langkah_tr after update on tkl_dugaan
  for each row execute function tkl_dugaan_tulis_langkah();
create trigger tkl_dugaan_jejak_tr after insert or update on tkl_dugaan
  for each row execute function tkl_catat_jejak();

create table tkl_pengecualian_sod (
  id            bigint generated always as identity primary key,
  aturan_id     bigint not null references tkl_sod_aturan(id),
  akun_id       bigint not null references sigap_akun(id),
  alasan        text not null check (length(btrim(alasan)) >= 20),
  diajukan_oleh bigint not null references sigap_akun(id),
  penyetuju1_id bigint not null references sigap_akun(id),
  penyetuju2_id bigint not null references sigap_akun(id),
  berlaku_mulai date not null,
  berlaku_sampai date not null,
  dibuat_at     timestamptz not null default now(),
  check (berlaku_sampai >= berlaku_mulai and berlaku_sampai - berlaku_mulai <= 90),
  check (penyetuju1_id <> penyetuju2_id),
  check (diajukan_oleh not in (penyetuju1_id, penyetuju2_id)),
  check (akun_id not in (penyetuju1_id, penyetuju2_id))
);
comment on table tkl_pengecualian_sod is 'Pengecualian pemisahan tugas yang SANGAT terbatas: hanya untuk aturan yang ditegakkan lewat aplikasi/pemantauan (bukan constraint atau trigger basis data), alasan tertulis, dua penyetuju berbeda dari pengaju dan dari orang yang dikecualikan, masa maksimum 90 hari (pagar, bukan angka resmi). Tambah-saja; tetap dipantau.';
create function tkl_pengecualian_sod_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_tegak text;
begin
  select ditegakkan_oleh into v_tegak from tkl_sod_aturan where id = new.aturan_id;
  if v_tegak in ('constraint','trigger') then
    raise exception 'Aturan ini ditegakkan basis data (%) dan tidak dapat dikecualikan', v_tegak using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger tkl_pengecualian_sod_jaga_tr before insert on tkl_pengecualian_sod
  for each row execute function tkl_pengecualian_sod_jaga();
create trigger tkl_pengecualian_sod_tolak_ubah_tr before update or delete on tkl_pengecualian_sod
  for each row execute function tkl_tolak_ubah();
create trigger tkl_pengecualian_sod_jejak_tr after insert on tkl_pengecualian_sod
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- E. SOP, tinjauan regulasi, pengingat, galat, laju, uji kesiapan
-- ---------------------------------------------------------------------
create table tkl_sop (
  id            bigint generated always as identity primary key,
  proses_id     bigint not null references tkl_proses(id),
  versi         smallint not null check (versi >= 1),
  judul         text not null,
  status        text not null default 'draf' check (status in ('draf','berlaku','usang')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  berlaku_mulai date,
  disusun_oleh  bigint references sigap_akun(id),
  disetujui_oleh bigint references sigap_akun(id),
  unique (proses_id, versi),
  check (status <> 'berlaku' or (berlaku_mulai is not null and disetujui_oleh is not null)),
  check (disetujui_oleh is null or disetujui_oleh is distinct from disusun_oleh)
);
comment on table tkl_sop is 'SOP berversi per proses. Setiap perubahan membuat versi baru; SOP lama tetap berlaku untuk transaksi lama. Berlaku butuh persetujuan orang selain penyusun.';
create trigger tkl_sop_jejak_tr after insert or update on tkl_sop
  for each row execute function tkl_catat_jejak();
create table tkl_sop_langkah (
  id            bigint generated always as identity primary key,
  sop_id        bigint not null references tkl_sop(id),
  urutan        smallint not null check (urutan >= 1),
  uraian        text not null,
  peran_id      bigint references sigap_peran(id),
  batas_hari_kerja smallint check (batas_hari_kerja > 0),
  unique (sop_id, urutan)
);
comment on table tkl_sop_langkah is 'Langkah, pelaku (peran), dan batas waktu SOP yang dituangkan menjadi alur di aplikasi.';

create table tkl_tinjau_regulasi (
  id            bigint generated always as identity primary key,
  regulasi_id   bigint not null references tkl_regulasi(id),
  ditinjau_oleh bigint not null references sigap_akun(id),
  ditinjau_at   timestamptz not null default now(),
  versi_teks    text not null,
  hasil         text not null check (hasil in ('tidak_berubah','perlu_penyesuaian')),
  catatan       text,
  disetujui_oleh bigint references sigap_akun(id),
  check (disetujui_oleh is null or disetujui_oleh <> ditinjau_oleh),
  check (hasil = 'tidak_berubah' or length(btrim(coalesce(catatan, ''))) >= 10)
);
comment on table tkl_tinjau_regulasi is 'Riwayat tinjauan regulasi: siapa, kapan, teks versi mana, hasil. Perubahan status regulasi menjadi terverifikasi butuh penyetuju kedua (dua orang). Tambah-saja.';
create trigger tkl_tinjau_regulasi_tolak_ubah_tr before update or delete on tkl_tinjau_regulasi
  for each row execute function tkl_tolak_ubah();
create trigger tkl_tinjau_regulasi_jejak_tr after insert on tkl_tinjau_regulasi
  for each row execute function tkl_catat_jejak();

create table tkl_pengingat (
  id            bigint generated always as identity primary key,
  kewajiban_id  bigint not null references tkl_kewajiban(id),
  tujuan_id     bigint not null references sigap_akun(id),
  jatuh_tempo   date not null,
  status        text not null default 'terjadwal' check (status in ('terjadwal','terkirim','dikerjakan','kedaluwarsa','batal')),
  dikirim_at    timestamptz,
  selesai_at    timestamptz,
  unique (kewajiban_id, tujuan_id, jatuh_tempo),
  check (status <> 'terkirim' or dikirim_at is not null),
  check (status <> 'dikerjakan' or selesai_at is not null)
);
comment on table tkl_pengingat is 'Pengingat dinamis kewajiban (kalender kewajiban): siapa, kapan jatuh tempo, sudah dikirim atau dikerjakan.';

create table tkl_galat (
  id            bigint generated always as identity primary key,
  kode_rujukan  text not null unique check (kode_rujukan ~ '^[A-Z0-9]{8,16}$'),
  jenis         text not null check (jenis in ('jaringan','validasi','server','otorisasi','waktu_habis','lainnya')),
  jalur         text not null,
  peran_kode    text,
  jumlah        integer not null default 1 check (jumlah >= 1),
  pertama_at    timestamptz not null default now(),
  terakhir_at   timestamptz not null default now(),
  check (terakhir_at >= pertama_at)
);
comment on table tkl_galat is 'Log galat teknis: jenis, jalur halaman, peran, waktu, kode rujukan. TIDAK menyimpan isi formulir atau data pribadi (tidak ada kolom untuk itu). Galat berulang dalam 5 menit memicu pemberitahuan ke Admin sistem.';

create table tkl_metrik_laju (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  jam           timestamptz not null check (jam = date_trunc('hour', jam)),
  jumlah_tolak  integer not null default 0 check (jumlah_tolak >= 0),
  unique (akun_id, jam)
);
comment on table tkl_metrik_laju is 'Jumlah penolakan pembatasan laju per akun per jam. Hanya angka; isi permintaan tidak dicatat.';

create table tkl_uji_kesiapan (
  id            bigint generated always as identity primary key,
  jenis         text not null check (jenis in ('simulasi_pemeriksaan','uji_bukti_acak','uji_pemulihan')),
  tanggal       date not null,
  cakupan       text not null,
  jumlah_sampel integer not null check (jumlah_sampel > 0),
  jumlah_lengkap integer not null check (jumlah_lengkap >= 0),
  penguji_id    bigint not null references sigap_akun(id),
  temuan_id     bigint references tkl_temuan(id),
  catatan       text,
  check (jumlah_lengkap <= jumlah_sampel),
  check (jumlah_lengkap = jumlah_sampel or temuan_id is not null)
);
comment on table tkl_uji_kesiapan is 'Uji kesiapan menghadapi pemeriksaan: sampel bukti acak dan kelengkapannya. Ketidaklengkapan wajib menaut temuan (tkl_temuan) agar ditindaklanjuti.';
create trigger tkl_uji_kesiapan_jejak_tr after insert or update on tkl_uji_kesiapan
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- RLS: aktif, tanpa policy (hanya server/service_role)
-- ---------------------------------------------------------------------
alter table sdm_umpan_balik            enable row level security;
alter table sdm_pengingat              enable row level security;
alter table sdm_pembinaan              enable row level security;
alter table sdm_bukti_dukung           enable row level security;
alter table sdm_keberatan              enable row level security;
alter table sdm_kontrak_belajar        enable row level security;
alter table sdm_kontrak_belajar_komitmen enable row level security;
alter table sdm_ringkasan_bahan        enable row level security;
alter table tkl_retensi_aturan         enable row level security;
alter table tkl_klasifikasi_data       enable row level security;
alter table tkl_kri                    enable row level security;
alter table tkl_kri_ukur               enable row level security;
alter table tkl_risiko_penilaian       enable row level security;
alter table tkl_risiko_keputusan       enable row level security;
alter table tkl_pernyataan_ki          enable row level security;
alter table tkl_dugaan                 enable row level security;
alter table tkl_dugaan_langkah         enable row level security;
alter table tkl_pengecualian_sod       enable row level security;
alter table tkl_sop                    enable row level security;
alter table tkl_sop_langkah            enable row level security;
alter table tkl_tinjau_regulasi        enable row level security;
alter table tkl_pengingat              enable row level security;
alter table tkl_galat                  enable row level security;
alter table tkl_metrik_laju            enable row level security;
alter table tkl_uji_kesiapan           enable row level security;
