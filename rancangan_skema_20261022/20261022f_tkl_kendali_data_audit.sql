-- =====================================================================
-- 20261022f_tkl_kendali_data_audit.sql
-- Lapis: layanan bersama tata kelola (prefix tkl_), bagian 2. Bergantung 20261022a-e.
-- Isi: kewajiban berkala, RACI + pemisahan tugas (SoD), risiko SPIP dan kontrol,
--      pelindungan data pribadi (RoPA, DPIA, hak subjek, insiden), bukti dan retensi,
--      temuan dan tindak lanjut, uji penerimaan (UAT) peluncuran bertahap.
-- Dasar yang dirujuk berstatus di tkl_regulasi (terverifikasi / perlu_dicek).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kewajiban berkala -> kalender
-- ---------------------------------------------------------------------
create table tkl_kewajiban (
  id             bigint generated always as identity primary key,
  regulasi_id    bigint references tkl_regulasi(id),
  kode           text not null unique check (kode ~ '^KW-[0-9]{3}$'),
  uraian         text not null,
  pemilik_peran_id bigint references sigap_peran(id),
  frekuensi      text not null check (frekuensi in ('sekali','bulanan','triwulan','semester','tahunan','kejadian')),
  bulan_awal     smallint check (bulan_awal between 1 and 12),
  tenggat_hari   smallint check (tenggat_hari between 1 and 366),
  aktif          boolean not null default true,
  check (frekuensi = 'kejadian' or bulan_awal is not null)
);
comment on table tkl_kewajiban is 'Daftar kewajiban yang menurunkan kalender kepatuhan. Tenggat dari teks regulasi: kosong sampai diisi admin.';
create table tkl_kewajiban_realisasi (
  id            bigint generated always as identity primary key,
  kewajiban_id  bigint not null references tkl_kewajiban(id),
  periode       date not null check (extract(day from periode) = 1),
  status        text not null default 'belum' check (status in ('belum','berjalan','selesai','terlambat','tidak_berlaku')),
  bukti_id      bigint,
  selesai_oleh  bigint references sigap_akun(id),
  selesai_at    timestamptz,
  catatan       text,
  unique (kewajiban_id, periode),
  check (status <> 'selesai' or (selesai_oleh is not null and selesai_at is not null and bukti_id is not null)),
  check (status <> 'tidak_berlaku' or catatan is not null)
);

-- ---------------------------------------------------------------------
-- 2. Proses, RACI, dan pemisahan tugas
-- ---------------------------------------------------------------------
create table tkl_proses (
  id         bigint generated always as identity primary key,
  kode       text not null unique check (kode ~ '^[A-Z]{2,4}-[0-9]{2}$'),
  nama       text not null,
  modul      text not null check (modul in ('keu','mitra','kual','sdm','tkl','lapangan','diseminasi')),
  hulu_hilir smallint not null check (hulu_hilir between 1 and 8),
  aktif      boolean not null default true
);
comment on column tkl_proses.hulu_hilir is '1 perencanaan ... 8 evaluasi dan pertanggungjawaban (urutan alur hulu ke hilir).';

create table tkl_kewenangan (
  id            bigint generated always as identity primary key,
  versi         smallint not null default 1 check (versi >= 1),
  proses_id     bigint not null references tkl_proses(id),
  peran_id      bigint not null references sigap_peran(id),
  kode          text not null check (kode in ('R','A','M','C','I')),
  sk_nomor      text,
  disetujui_oleh bigint references sigap_akun(id),
  berlaku_mulai date not null default current_date,
  berlaku_sampai date,
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  unique (versi, proses_id, peran_id)
);
create unique index tkl_kewenangan_satu_a on tkl_kewenangan (versi, proses_id) where kode = 'A';
create index tkl_kewenangan_peran_idx on tkl_kewenangan (peran_id);
comment on table tkl_kewenangan is 'Matriks kewenangan berversi (RACI + M). R pelaksana, A penanggung jawab akhir (tepat satu per proses per versi), M memutuskan, C dikonsultasi, I diberi tahu. Mengikuti SK pejabat (keu_pejabat); perubahan = versi baru.';

create table tkl_sod_aturan (
  id             bigint generated always as identity primary key,
  kode           text not null unique check (kode ~ '^SOD-[0-9]{2}$'),
  uraian         text not null,
  objek_a        text not null,
  objek_b        text not null,
  tingkat        text not null check (tingkat in ('blok','peringatan')),
  ditegakkan_oleh text not null check (ditegakkan_oleh in ('constraint','trigger','aplikasi','pemantauan')),
  aktif          boolean not null default true
);
comment on table tkl_sod_aturan is 'Pemisahan tugas. Yang ditegakkan constraint/trigger tidak dapat dilangkahi aplikasi; yang bertanda pemantauan dideteksi lewat view.';
insert into tkl_sod_aturan (kode, uraian, objek_a, objek_b, tingkat, ditegakkan_oleh) values
 ('SOD-01','Penyusun RAB tidak menyetujui versi RAB-nya sendiri','keu_rab_versi.dibuat_oleh','keu_rab_versi.disetujui_oleh','blok','constraint'),
 ('SOD-02','Pencatat transaksi tidak memverifikasi transaksinya sendiri','keu_transaksi.dicatat_oleh','keu_transaksi.diverifikasi_oleh','blok','constraint'),
 ('SOD-03','Pengaju revisi anggaran tidak menyetujui atau memeriksa revisinya','keu_revisi.pengaju_id','keu_revisi.penyetuju_id','blok','constraint'),
 ('SOD-04','Pemeriksa BAST berbeda dari penyetuju BAST','mitra_bast.diperiksa_oleh','mitra_bast.disetujui_oleh','blok','constraint'),
 ('SOD-05','Peninjau sanggah berbeda dari pemohon dan penilai awal','kual_sanggah.peninjau_id','kual_sanggah.penilai_awal_id','blok','constraint'),
 ('SOD-06','Penilai SKP harus atasan tercatat dan bukan pegawai yang dinilai','sdm_penilaian.penilai_id','sdm_skp.pegawai_id','blok','trigger'),
 ('SOD-07','Satu orang tidak memegang PPK dan Bendahara pada waktu yang sama','keu_pejabat(ppk)','keu_pejabat(bendahara)','peringatan','pemantauan'),
 ('SOD-08','Admin sistem tidak menyetujui permintaan hak subjek atas datanya sendiri','tkl_hak_subjek.akun_id','tkl_hak_subjek.ditangani_oleh','blok','constraint')
on conflict do nothing;

create table tkl_sod_pelanggaran (
  id          bigint generated always as identity primary key,
  aturan_id   bigint not null references tkl_sod_aturan(id),
  akun_id     bigint not null references sigap_akun(id),
  objek_tabel text,
  objek_id    text,
  terdeteksi_at timestamptz not null default now(),
  status      text not null default 'terbuka' check (status in ('terbuka','dijelaskan','dikoreksi')),
  penjelasan  text,
  ditinjau_oleh bigint references sigap_akun(id),
  check (status = 'terbuka' or (penjelasan is not null and ditinjau_oleh is not null))
);

create view tkl_v_sod_pejabat with (security_invoker = true) as
select a.akun_id, a.tahun, a.berlaku_mulai as ppk_mulai, a.berlaku_sampai as ppk_sampai,
       b.berlaku_mulai as bendahara_mulai, b.berlaku_sampai as bendahara_sampai
from keu_pejabat a join keu_pejabat b
  on b.akun_id = a.akun_id and b.tahun = a.tahun and b.peran = 'bendahara' and a.peran = 'ppk'
 and daterange(a.berlaku_mulai, coalesce(a.berlaku_sampai, 'infinity'::date), '[]')
  && daterange(b.berlaku_mulai, coalesce(b.berlaku_sampai, 'infinity'::date), '[]');
comment on view tkl_v_sod_pejabat is 'SOD-07: satu orang memegang PPK dan Bendahara pada rentang yang bertumpuk. Harus kosong.';

-- ---------------------------------------------------------------------
-- 3. Risiko (lima unsur SPIP: PP 60/2008, status perlu_dicek) dan kontrol
-- ---------------------------------------------------------------------
create table tkl_risiko (
  id           bigint generated always as identity primary key,
  kode         text not null unique check (kode ~ '^RS-[0-9]{3}$'),
  unsur_spip   text not null check (unsur_spip in ('lingkungan_pengendalian','penilaian_risiko','kegiatan_pengendalian','informasi_komunikasi','pemantauan')),
  proses_id    bigint references tkl_proses(id),
  uraian       text not null,
  penyebab     text,
  dampak_uraian text,
  kemungkinan  smallint not null check (kemungkinan between 1 and 5),
  dampak       smallint not null check (dampak between 1 and 5),
  skor         smallint generated always as (kemungkinan * dampak) stored,
  tingkat      text generated always as (case when kemungkinan * dampak >= 15 then 'tinggi' when kemungkinan * dampak >= 8 then 'sedang' else 'rendah' end) stored,
  jenis_fraud  boolean not null default false,
  pemilik_peran_id bigint references sigap_peran(id),
  status       text not null default 'terbuka' check (status in ('terbuka','dimitigasi','diterima','ditutup')),
  ditinjau_terakhir date,
  dibuat_at    timestamptz not null default now(),
  check (status <> 'diterima' or ditinjau_terakhir is not null)
);
comment on column tkl_risiko.tingkat is 'Ambang rancangan: skor >=15 tinggi, 8-14 sedang, <8 rendah. Ubah lewat migrasi bila kebijakan berbeda.';
create table tkl_kontrol (
  id          bigint generated always as identity primary key,
  risiko_id   bigint not null references tkl_risiko(id),
  kode        text not null unique check (kode ~ '^KT-[0-9]{3}$'),
  jenis       text not null check (jenis in ('pencegahan','deteksi','korektif')),
  penerapan   text not null check (penerapan in ('sistem','prosedur')),
  uraian      text not null,
  pemilik_peran_id bigint references sigap_peran(id),
  frekuensi   text check (frekuensi in ('setiap_transaksi','harian','mingguan','bulanan','triwulan','tahunan')),
  objek_teknis text,
  kurang_kemungkinan smallint not null default 0 check (kurang_kemungkinan between 0 and 4),
  kurang_dampak      smallint not null default 0 check (kurang_dampak between 0 and 4),
  aktif       boolean not null default true
);
comment on column tkl_kontrol.kurang_kemungkinan is 'Pengurangan skor kemungkinan risiko bila kontrol teruji efektif; bila uji gagal, pengurangan dibatalkan dalam hitungan risiko sisa.';
comment on column tkl_kontrol.objek_teknis is 'Nama constraint/trigger/view yang menegakkan kontrol (mis. keu_transaksi_jaga_pagu).';
create table tkl_kontrol_uji (
  id          bigint generated always as identity primary key,
  kontrol_id  bigint not null references tkl_kontrol(id),
  diuji_pada  date not null,
  hasil       text not null check (hasil in ('efektif','efektif_sebagian','tidak_efektif')),
  penguji_id  bigint not null references sigap_akun(id),
  catatan     text,
  bukti_id    bigint,
  check (hasil = 'efektif' or catatan is not null)
);

-- ---------------------------------------------------------------------
-- 4. Pelindungan data pribadi (UU 27/2022; aturan turunan perlu dicek status)
-- ---------------------------------------------------------------------
create table tkl_ropa (
  id            bigint generated always as identity primary key,
  kode          text not null unique check (kode ~ '^RP-[0-9]{2}$'),
  aktivitas     text not null,
  tujuan        text not null,
  dasar_pemrosesan text not null check (dasar_pemrosesan in ('persetujuan','perjanjian','kewajiban_hukum','tugas_pelayanan_publik','kepentingan_vital','kepentingan_sah')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  pemilik_peran_id bigint references sigap_peran(id),
  lokasi_simpan text not null,
  retensi_bulan smallint check (retensi_bulan > 0),
  pihak_ketiga  text,
  transfer_luar_negeri boolean not null default false,
  ditinjau_terakhir date,
  aktif         boolean not null default true
);
comment on table tkl_ropa is 'Catatan kegiatan pemrosesan data pribadi (RoPA). Retensi diisi dari jadwal retensi arsip; kosong = belum ditetapkan.';
create table tkl_ropa_data (
  id          bigint generated always as identity primary key,
  ropa_id     bigint not null references tkl_ropa(id),
  kategori    text not null check (kategori in ('identitas','kontak','lokasi','rekening','kinerja','foto_wajah','kesehatan','lainnya')),
  spesifik    boolean not null default false,
  kolom_rujukan text not null,
  dilihat_oleh_peran_id bigint references sigap_peran(id),
  unique (ropa_id, kolom_rujukan),
  check (kategori not in ('foto_wajah','kesehatan') or spesifik)
);
comment on column tkl_ropa_data.kolom_rujukan is 'Nama tabel.kolom sumber (mis. sigap_akun.nik). Tidak berisi nilai data.';

create table tkl_dpia (
  id          bigint generated always as identity primary key,
  ropa_id     bigint not null references tkl_ropa(id),
  risiko_uraian text not null,
  kemungkinan smallint not null check (kemungkinan between 1 and 5),
  dampak      smallint not null check (dampak between 1 and 5),
  mitigasi    text not null,
  sisa_risiko smallint check (sisa_risiko between 1 and 25),
  status      text not null default 'draf' check (status in ('draf','ditinjau','disetujui')),
  disusun_oleh bigint not null references sigap_akun(id),
  disetujui_oleh bigint references sigap_akun(id),
  disetujui_at timestamptz,
  check (disetujui_oleh is null or disetujui_oleh <> disusun_oleh),
  check (status <> 'disetujui' or (disetujui_oleh is not null and sisa_risiko is not null))
);

create table tkl_hak_subjek (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references sigap_akun(id),
  jenis        text not null check (jenis in ('akses','perbaikan','penghapusan','pembatasan','keberatan','portabilitas','tarik_persetujuan')),
  diajukan_at  timestamptz not null default now(),
  batas_at     timestamptz,
  status       text not null default 'diterima' check (status in ('diterima','diverifikasi','diproses','selesai','ditolak')),
  ditangani_oleh bigint references sigap_akun(id),
  alasan_tolak text,
  selesai_at   timestamptz,
  check (ditangani_oleh is null or ditangani_oleh <> akun_id),
  check (status <> 'ditolak' or alasan_tolak is not null),
  check (status not in ('selesai','ditolak') or (ditangani_oleh is not null and selesai_at is not null))
);
comment on table tkl_hak_subjek is 'Permintaan hak subjek data. Batas waktu dari parameter pdp.hak_subjek_hari (belum diisi sampai teks aturan diperiksa).';
insert into tkl_parameter (kunci, status_isi, dasar_keterangan, berlaku_mulai)
values ('pdp.hak_subjek_hari', 'belum_diisi', 'Isi dari teks UU 27/2022 dan aturan turunan setelah dicek; sesi ini tidak memverifikasi angkanya.', '2026-01-01')
on conflict do nothing;

create function tkl_hak_subjek_batas() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_hari numeric;
begin
  v_hari := tkl_param_num('pdp.hak_subjek_hari', new.diajukan_at::date);
  if new.batas_at is null and v_hari is not null then
    new.batas_at := new.diajukan_at + make_interval(days => v_hari::int);
  end if;
  return new;
end $$;
create trigger tkl_hak_subjek_batas_tr before insert on tkl_hak_subjek
  for each row execute function tkl_hak_subjek_batas();
create trigger tkl_hak_subjek_jejak_tr after insert or update on tkl_hak_subjek
  for each row execute function tkl_catat_jejak();

create table tkl_insiden (
  id            bigint generated always as identity primary key,
  jenis         text not null check (jenis in ('akses_tanpa_hak','kebocoran','kehilangan_perangkat','salah_kirim','ransomware','lainnya')),
  ditemukan_at  timestamptz not null,
  dilaporkan_at timestamptz,
  deskripsi     text not null,
  jumlah_subjek integer check (jumlah_subjek >= 0),
  kategori_data text,
  status        text not null default 'baru' check (status in ('baru','dinilai','dikendalikan','diberitahukan','ditutup')),
  batas_notifikasi_at timestamptz,
  notifikasi_subjek_at timestamptz,
  notifikasi_otoritas_at timestamptz,
  pelapor_id    bigint references sigap_akun(id),
  ditangani_oleh bigint references sigap_akun(id),
  pelajaran     text,
  check (dilaporkan_at is null or dilaporkan_at >= ditemukan_at),
  check (status <> 'ditutup' or pelajaran is not null)
);
comment on column tkl_insiden.batas_notifikasi_at is 'Dihitung dari parameter pdp.batas_notifikasi_jam (rancangan 72 jam; PERLU DICEK terhadap teks UU 27/2022 dan aturan turunan).';
create function tkl_insiden_batas() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_jam numeric;
begin
  v_jam := tkl_param_num('pdp.batas_notifikasi_jam', new.ditemukan_at::date);
  if new.batas_notifikasi_at is null and v_jam is not null then
    new.batas_notifikasi_at := new.ditemukan_at + make_interval(hours => v_jam::int);
  end if;
  return new;
end $$;
create trigger tkl_insiden_batas_tr before insert on tkl_insiden
  for each row execute function tkl_insiden_batas();
create trigger tkl_insiden_jejak_tr after insert or update on tkl_insiden
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 5. Bukti dan retensi arsip (UU 43/2009 perlu_dicek; jadwal retensi diisi admin)
-- ---------------------------------------------------------------------
create table tkl_bukti (
  id           bigint generated always as identity primary key,
  objek_tabel  text not null,
  objek_id     text not null,
  jenis        text not null check (jenis in ('dokumen','foto','surat_tugas','kwitansi','berita_acara','tangkapan_layar','log','lainnya')),
  penyimpanan_path text not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ukuran_byte  bigint check (ukuran_byte >= 0),
  klasifikasi  text not null default 'terbatas' check (klasifikasi in ('umum','terbatas','rahasia_statistik','pribadi')),
  retensi_sampai date,
  diunggah_oleh bigint references sigap_akun(id),
  diunggah_at  timestamptz not null default now(),
  dibekukan_at timestamptz,
  unique (sha256, objek_tabel, objek_id)
);
create index tkl_bukti_objek_idx on tkl_bukti (objek_tabel, objek_id);
comment on table tkl_bukti is 'Register berkas bukti dengan hash. Berkas yang dibekukan tidak diganti; versi baru = baris baru.';
alter table tkl_kewajiban_realisasi add constraint tkl_kw_real_bukti_fk foreign key (bukti_id) references tkl_bukti(id);
alter table tkl_kontrol_uji add constraint tkl_kontrol_uji_bukti_fk foreign key (bukti_id) references tkl_bukti(id);
create function tkl_bukti_tolak_ubah_beku() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if old.dibekukan_at is not null then
    raise exception 'Bukti sudah dibekukan; unggah versi baru' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger tkl_bukti_beku_tr before update on tkl_bukti
  for each row execute function tkl_bukti_tolak_ubah_beku();

-- ---------------------------------------------------------------------
-- 6. Temuan pemeriksaan dan tindak lanjut
-- ---------------------------------------------------------------------
create table tkl_temuan (
  id          bigint generated always as identity primary key,
  sumber      text not null check (sumber in ('internal','inspektorat','bpk','swa_uji','pengguna')),
  nomor       text,
  tanggal     date not null,
  uraian      text not null,
  kriteria    text,
  akibat      text,
  rekomendasi text,
  tingkat     text not null check (tingkat in ('rendah','sedang','tinggi')),
  status      text not null default 'terbuka' check (status in ('terbuka','ditindaklanjuti','menunggu_verifikasi','selesai','tidak_dapat_ditindaklanjuti')),
  batas_tl    date,
  dicatat_oleh bigint references sigap_akun(id),
  unique nulls not distinct (sumber, nomor)
);
create table tkl_tindak_lanjut (
  id          bigint generated always as identity primary key,
  temuan_id   bigint not null references tkl_temuan(id),
  uraian      text not null,
  pj_akun_id  bigint not null references sigap_akun(id),
  batas       date not null,
  selesai_at  date,
  bukti_id    bigint references tkl_bukti(id),
  diverifikasi_oleh bigint references sigap_akun(id),
  diverifikasi_at timestamptz,
  check (diverifikasi_oleh is null or diverifikasi_oleh <> pj_akun_id),
  check (selesai_at is null or bukti_id is not null)
);
create function tkl_temuan_tutup_cek() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.status = 'selesai' and (old.status is distinct from 'selesai') then
    if exists (select 1 from tkl_tindak_lanjut t where t.temuan_id = new.id
               and (t.selesai_at is null or t.diverifikasi_oleh is null)) then
      raise exception 'Temuan % belum bisa ditutup: ada tindak lanjut belum selesai atau belum diverifikasi', new.id
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from tkl_tindak_lanjut t where t.temuan_id = new.id) then
      raise exception 'Temuan % belum punya tindak lanjut', new.id using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger tkl_temuan_tutup_tr before update of status on tkl_temuan
  for each row execute function tkl_temuan_tutup_cek();
create trigger tkl_temuan_jejak_tr after insert or update on tkl_temuan
  for each row execute function tkl_catat_jejak();

-- ---------------------------------------------------------------------
-- 7. Uji penerimaan (UAT) dan gerbang peluncuran bertahap
-- ---------------------------------------------------------------------
create table tkl_uat_skenario (
  id        bigint generated always as identity primary key,
  kode      text not null unique check (kode ~ '^UAT-[A-Z]{3}-[0-9]{2}$'),
  kategori  text not null check (kategori in ('keuangan','mitra','kinerja','pelindungan_data','audit','keandalan','aksesibilitas')),
  modul     text,
  given_    text not null,
  when_     text not null,
  then_     text not null,
  kritis    boolean not null default false,
  aktif     boolean not null default true
);
comment on table tkl_uat_skenario is 'Skenario Given/When/Then. Skenario kritis wajib lulus 100% sebelum fase berikutnya dibuka.';
create table tkl_uat_hasil (
  id           bigint generated always as identity primary key,
  skenario_id  bigint not null references tkl_uat_skenario(id),
  putaran      smallint not null check (putaran >= 1),
  hasil        text not null check (hasil in ('lulus','gagal','terblokir')),
  penguji_id   bigint not null references sigap_akun(id),
  diuji_at     timestamptz not null default now(),
  catatan      text,
  bukti_id     bigint references tkl_bukti(id),
  unique (skenario_id, putaran),
  check (hasil = 'lulus' or catatan is not null)
);
create view tkl_v_uat_gerbang with (security_invoker = true) as
with terbaru as (
  select distinct on (h.skenario_id) h.skenario_id, h.hasil
  from tkl_uat_hasil h order by h.skenario_id, h.putaran desc
)
select s.kategori,
       count(*) as total,
       count(*) filter (where t.hasil = 'lulus') as lulus,
       round(100.0 * count(*) filter (where t.hasil = 'lulus') / count(*), 1) as persen_lulus,
       count(*) filter (where s.kritis) as kritis_total,
       count(*) filter (where s.kritis and t.hasil = 'lulus') as kritis_lulus,
       (count(*) filter (where s.kritis) = count(*) filter (where s.kritis and t.hasil = 'lulus')) as gerbang_kritis_terpenuhi
from tkl_uat_skenario s left join terbaru t on t.skenario_id = s.id
where s.aktif
group by s.kategori;

-- ---------------------------------------------------------------------
-- 8. Pemantauan kesehatan tata kelola (satu pintu untuk kartu "berjalan")
-- ---------------------------------------------------------------------
create view tkl_v_kesehatan with (security_invoker = true) as
select 'parameter belum diisi'::text as pemeriksaan, count(*)::bigint as jumlah,
       'tkl_parameter dengan status belum_diisi'::text as keterangan
  from tkl_parameter p where p.status_isi = 'belum_diisi'
   and current_date between p.berlaku_mulai and coalesce(p.berlaku_sampai, 'infinity'::date)
union all
select 'regulasi perlu dicek', count(*), 'tkl_regulasi bukan terverifikasi' from tkl_regulasi where status_verifikasi <> 'terverifikasi'
union all
select 'SOD-07 PPK merangkap Bendahara', count(*), 'tkl_v_sod_pejabat harus 0' from tkl_v_sod_pejabat
union all
select 'rantai jejak rusak', count(*), 'tkl_verifikasi_rantai() harus 0' from tkl_verifikasi_rantai()
union all
select 'hak subjek lewat batas', count(*), 'status belum selesai dan batas_at terlewati'
  from tkl_hak_subjek where status not in ('selesai','ditolak') and batas_at is not null and batas_at < now()
union all
select 'insiden lewat batas notifikasi', count(*), 'notifikasi_subjek_at kosong dan batas terlewati'
  from tkl_insiden where status <> 'ditutup' and notifikasi_subjek_at is null and batas_notifikasi_at is not null and batas_notifikasi_at < now()
union all
select 'tindak lanjut lewat batas', count(*), 'selesai_at kosong dan batas terlewati'
  from tkl_tindak_lanjut where selesai_at is null and batas < current_date;

-- Jejak pada objek tata kelola penting
create trigger tkl_parameter_jejak_tr after insert or update on tkl_parameter
  for each row execute function tkl_catat_jejak();
create trigger tkl_regulasi_jejak_tr after insert or update on tkl_regulasi
  for each row execute function tkl_catat_jejak();

alter table tkl_kewajiban            enable row level security;
alter table tkl_kewajiban_realisasi  enable row level security;
alter table tkl_proses               enable row level security;
alter table tkl_kewenangan           enable row level security;
alter table tkl_sod_aturan           enable row level security;
alter table tkl_sod_pelanggaran      enable row level security;
alter table tkl_risiko               enable row level security;
alter table tkl_kontrol              enable row level security;
alter table tkl_kontrol_uji          enable row level security;
alter table tkl_ropa                 enable row level security;
alter table tkl_ropa_data            enable row level security;
alter table tkl_dpia                 enable row level security;
alter table tkl_hak_subjek           enable row level security;
alter table tkl_insiden              enable row level security;
alter table tkl_bukti                enable row level security;
alter table tkl_temuan               enable row level security;
alter table tkl_tindak_lanjut        enable row level security;
alter table tkl_uat_skenario         enable row level security;
alter table tkl_uat_hasil            enable row level security;
