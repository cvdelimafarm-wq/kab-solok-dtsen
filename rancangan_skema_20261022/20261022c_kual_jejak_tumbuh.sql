-- =====================================================================
-- 20261022c_kual_jejak_tumbuh.sql
-- Lapis: modul kualifikasi dan penilaian "Jejak & Tumbuh" (prefix kual_).
-- Bergantung pada 20261022a. Orang = sigap_akun.id; kegiatan = sigap_kegiatan.id.
-- Atribut sensitif (usia, jenis kelamin, agama, suku, status perkawinan,
-- kesehatan, disabilitas) TIDAK memiliki kolom di modul ini, sehingga tidak
-- dapat masuk skor atau penempatan.
-- =====================================================================

-- Kamus indikator (17 indikator). Versi indikator: baris baru + berlaku_sampai pada baris lama.
create table kual_indikator (
  kode           text not null check (kode ~ '^[QDCSK][0-9]$'),
  versi          smallint not null default 1 check (versi >= 1),
  komponen       text not null check (komponen in ('kualitas','kedisiplinan','kecepatan','sop','kerjasama')),
  nama           text not null,
  definisi       text not null,
  rumus          text,
  sumber_data    text,
  frekuensi      text,
  pemilik_peran  text,
  skala_min      numeric not null default 0,
  skala_maks     numeric not null default 100,
  arah           text not null default 'naik_baik' check (arah in ('naik_baik','turun_baik')),
  bobot_dalam_komponen numeric(5,2) not null default 0 check (bobot_dalam_komponen between 0 and 100),
  min_pengamatan smallint not null default 1 check (min_pengamatan >= 1),
  informasional  boolean not null default false,
  risiko_dipermainkan text,
  mitigasi       text,
  berlaku_mulai  date not null default current_date,
  berlaku_sampai date,
  primary key (kode, versi),
  check (skala_maks > skala_min),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (not informasional or bobot_dalam_komponen = 0)
);
comment on table kual_indikator is 'Kamus indikator penilaian: definisi, rumus, sumber, pemilik, risiko dipermainkan, mitigasi, minimum pengamatan. Indikator informasional (C3) berbobot 0.';

insert into kual_indikator (kode, komponen, nama, definisi, bobot_dalam_komponen, informasional, arah) values
 ('Q1','kualitas','Rasio catatan perbaikan PML per dokumen','Seberapa sering PML harus memperbaiki dokumen, dibobot menurut keparahan.',35,false,'turun_baik'),
 ('Q2','kualitas','Temuan anomali per 100 dokumen','Nilai tak wajar yang ditandai aturan konsistensi dan terbukti salah.',25,false,'turun_baik'),
 ('Q3','kualitas','Hasil uji ulang sampel','Seberapa sama isian kunci saat diwawancarai ulang.',30,false,'naik_baik'),
 ('Q4','kualitas','Waktu perbaikan catatan','Kecepatan menindaklanjuti catatan PML.',10,false,'turun_baik'),
 ('D1','kedisiplinan','Ketepatan hadir briefing dan pelatihan','Hadir tepat waktu pada sesi yang diwajibkan.',25,false,'naik_baik'),
 ('D2','kedisiplinan','Ketepatan unggah dokumen','Dokumen sampai ke sistem sebelum batas waktu.',40,false,'naik_baik'),
 ('D3','kedisiplinan','Kelengkapan administrasi sekali jadi','Kelengkapan laporan harian, foto, dan tanda terima.',25,false,'naik_baik'),
 ('D4','kedisiplinan','Hari kerja terpenuhi sesuai jadwal','Hari bertugas yang benar-benar dikerjakan.',10,false,'naik_baik'),
 ('C1','kecepatan','Dokumen per hari relatif median','Kecepatan setelah disetarakan dengan medan.',100,false,'naik_baik'),
 ('C2','kecepatan','Faktor kesulitan wilayah','Penyetara jarak, medan, jenis responden, dan cuaca (pengali pada C1).',0,true,'naik_baik'),
 ('C3','kecepatan','Konsistensi harian (informasional)','Stabilitas jumlah dokumen per hari untuk pembinaan; tidak masuk skor.',0,true,'naik_baik'),
 ('S1','sop','Kecocokan titik GPS','Entri dibuat dekat lokasi target.',40,false,'naik_baik'),
 ('S2','sop','Kelengkapan foto bukti','Foto wajib tersedia, jelas, bercap waktu.',35,false,'naik_baik'),
 ('S3','sop','Urutan kerja sesuai SOP','Langkah SOP dikerjakan berurutan.',25,false,'naik_baik'),
 ('K1','kerjasama','Umpan balik berjangkar perilaku','Penilaian perilaku dari minimal dua penilai.',60,false,'naik_baik'),
 ('K2','kerjasama','Tanggapan terhadap arahan','Kecepatan membalas arahan yang menuntut balasan.',20,false,'naik_baik'),
 ('K3','kerjasama','Bantuan kepada rekan','Bantuan yang dikonfirmasi penerimanya.',20,false,'naik_baik')
on conflict do nothing;

-- Model skor berversi (bobot komponen + prior). Jumlah bobot wajib 100.
create table kual_model (
  id            bigint generated always as identity primary key,
  versi         smallint not null unique check (versi >= 1),
  w_kualitas    smallint not null check (w_kualitas between 0 and 100),
  w_kedisiplinan smallint not null check (w_kedisiplinan between 0 and 100),
  w_kecepatan   smallint not null check (w_kecepatan between 0 and 100),
  w_sop         smallint not null check (w_sop between 0 and 100),
  w_kerjasama   smallint not null check (w_kerjasama between 0 and 100),
  prior         numeric(5,2) not null default 62 check (prior between 0 and 100),
  k             smallint not null default 4 check (k >= 0),
  paruh_bulan   smallint not null default 6 check (paruh_bulan >= 1),
  ambang_cakap  numeric(5,2) not null default 60,
  ambang_andal  numeric(5,2) not null default 75,
  ambang_panutan numeric(5,2) not null default 90,
  min_tugas_panutan smallint not null default 12,
  disetujui_oleh bigint references sigap_akun(id),
  berlaku_mulai date not null default current_date,
  alasan        text,
  check (w_kualitas + w_kedisiplinan + w_kecepatan + w_sop + w_kerjasama = 100),
  check (ambang_cakap < ambang_andal and ambang_andal < ambang_panutan)
);
comment on table kual_model is 'Bobot komponen dan konstanta skor per versi. Perubahan model = baris baru; skor lama tetap merujuk model lamanya.';
insert into kual_model (versi, w_kualitas, w_kedisiplinan, w_kecepatan, w_sop, w_kerjasama, alasan)
values (1, 30, 25, 20, 15, 10, 'Model awal rancangan: 30/25/20/15/10') on conflict do nothing;

-- Pengamatan mentah per indikator (sumber kebenaran skor)
create table kual_pengamatan (
  id             bigint generated always as identity primary key,
  akun_id        bigint not null references sigap_akun(id),
  penugasan_id   bigint references sigap_penugasan(id),
  kegiatan_id    bigint references sigap_kegiatan(id),
  indikator_kode text not null,
  indikator_versi smallint not null default 1,
  nilai          numeric(6,2) not null check (nilai between 0 and 100),
  n_dasar        integer not null default 1 check (n_dasar >= 1),
  faktor_kesulitan numeric(4,2) not null default 1.00 check (faktor_kesulitan between 1.00 and 1.60),
  sumber         text not null default 'sistem' check (sumber in ('sistem','penilai','kalibrasi')),
  pengamat_id    bigint references sigap_akun(id),
  diamati_pada   timestamptz not null,
  status         text not null default 'aktif' check (status in ('aktif','disanggah','dikoreksi','dicabut')),
  bukti_ref      text,
  dibuat_at      timestamptz not null default now(),
  foreign key (indikator_kode, indikator_versi) references kual_indikator(kode, versi),
  check (pengamat_id is null or pengamat_id <> akun_id),
  check (sumber = 'sistem' or pengamat_id is not null)
);
create index kual_pengamatan_akun_idx on kual_pengamatan (akun_id, diamati_pada desc);
create index kual_pengamatan_ind_idx  on kual_pengamatan (indikator_kode, diamati_pada);
comment on table kual_pengamatan is 'Satu pengamatan per indikator. Penilai tidak boleh menilai dirinya sendiri; sumber non-sistem wajib punya pengamat.';

-- Snapshot skor per periode, berversi; tidak diubah, hanya digantikan.
create table kual_skor_periode (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  periode       date not null check (extract(day from periode) = 1),
  versi         smallint not null default 1 check (versi >= 1),
  model_id      bigint not null references kual_model(id),
  n_tugas       integer not null check (n_tugas >= 0),
  skor_kualitas numeric(6,2) check (skor_kualitas between 0 and 100),
  skor_kedisiplinan numeric(6,2) check (skor_kedisiplinan between 0 and 100),
  skor_kecepatan numeric(6,2) check (skor_kecepatan between 0 and 100),
  skor_sop      numeric(6,2) check (skor_sop between 0 and 100),
  skor_kerjasama numeric(6,2) check (skor_kerjasama between 0 and 100),
  obs           numeric(6,2) not null check (obs between 0 and 100),
  tampil        numeric(6,2) check (tampil between 0 and 100),
  tingkat       text not null check (tingkat in ('tumbuh','cakap','andal','panutan')),
  alasan_versi  text,
  digantikan_oleh_id bigint references kual_skor_periode(id),
  dibekukan_at  timestamptz not null default now(),
  unique (akun_id, periode, versi),
  check (versi = 1 or alasan_versi is not null),
  check (tingkat not in ('cakap','andal','panutan') or tampil >= 60),
  check (tingkat not in ('andal','panutan') or tampil >= 75),
  check (tingkat <> 'panutan' or (tampil >= 90 and n_tugas >= 12))
);
comment on table kual_skor_periode is 'Snapshot skor. Tampil = (n*obs + k*prior)/(n+k) dihitung server oleh trigger. Tingkat tidak boleh melampaui skor (cakap>=60, andal>=75, panutan>=90 dan >=12 tugas).';

create function kual_isi_tampil() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare m kual_model;
begin
  select * into m from kual_model where id = new.model_id;
  new.tampil := round((new.n_tugas * new.obs + m.k * m.prior) / nullif(new.n_tugas + m.k, 0), 2);
  return new;
end $$;
create trigger kual_skor_tampil_tr before insert on kual_skor_periode
  for each row execute function kual_isi_tampil();
create function kual_skor_hanya_digantikan() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(old) - 'digantikan_oleh_id') is distinct from (to_jsonb(new) - 'digantikan_oleh_id') then
    raise exception 'Snapshot skor tidak boleh diubah; terbitkan versi baru (versi+1) dengan alasan' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger kual_skor_beku_tr before update on kual_skor_periode
  for each row execute function kual_skor_hanya_digantikan();
create trigger kual_skor_jejak_tr after insert or update on kual_skor_periode
  for each row execute function tkl_catat_jejak();

-- Sanggah (7 hari kerja) dengan peninjau independen
create table kual_sanggah (
  id             bigint generated always as identity primary key,
  pengamatan_id  bigint not null references kual_pengamatan(id),
  pemohon_id     bigint not null references sigap_akun(id),
  penilai_awal_id bigint references sigap_akun(id),
  peninjau_id    bigint references sigap_akun(id),
  alasan         text not null check (length(btrim(alasan)) >= 20),
  diajukan_at    timestamptz not null default now(),
  batas_ajukan_at timestamptz not null,
  status         text not null default 'diajukan'
                 check (status in ('diajukan','ditinjau','diterima','sebagian','ditolak','dicabut')),
  putusan_alasan text,
  diputus_at     timestamptz,
  skor_baru_id   bigint references kual_skor_periode(id),
  check (diajukan_at <= batas_ajukan_at),
  check (peninjau_id is null or (peninjau_id <> pemohon_id and peninjau_id is distinct from penilai_awal_id)),
  check (status in ('diajukan','dicabut') or peninjau_id is not null),
  check (status in ('diajukan','ditinjau','dicabut') or (putusan_alasan is not null and diputus_at is not null))
);
comment on table kual_sanggah is 'Sanggah atas pengamatan. batas_ajukan_at dihitung server dari parameter kual.sanggah_hari_kerja. Peninjau wajib berbeda dari pemohon dan penilai awal.';
create trigger kual_sanggah_jejak_tr after insert or update on kual_sanggah
  for each row execute function tkl_catat_jejak();

create function kual_sanggah_tandai_pengamatan() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update kual_pengamatan set status = 'disanggah' where id = new.pengamatan_id and status = 'aktif';
  elsif new.status = 'ditolak' or new.status = 'dicabut' then
    update kual_pengamatan set status = 'aktif' where id = new.pengamatan_id and status = 'disanggah';
  elsif new.status in ('diterima','sebagian') then
    update kual_pengamatan set status = 'dikoreksi' where id = new.pengamatan_id and status = 'disanggah';
  end if;
  return null;
end $$;
create trigger kual_sanggah_tandai_tr after insert or update of status on kual_sanggah
  for each row execute function kual_sanggah_tandai_pengamatan();

-- Umpan balik berjangkar perilaku (Situasi-Perilaku-Dampak)
create table kual_umpan_balik (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  pemberi_id    bigint not null references sigap_akun(id),
  penugasan_id  bigint references sigap_penugasan(id),
  situasi       text not null,
  perilaku      text not null,
  dampak        text not null,
  saran         text,
  tugas_selesai_at timestamptz,
  batas_sla_at  timestamptz,
  diberikan_at  timestamptz not null default now(),
  dibaca_at     timestamptz,
  check (pemberi_id <> akun_id)
);
create index kual_umpan_balik_akun_idx on kual_umpan_balik (akun_id, diberikan_at desc);

-- Kalibrasi penilai (z-score antar PML)
create table kual_kalibrasi (
  id           bigint generated always as identity primary key,
  periode      date not null check (extract(day from periode) = 1),
  penilai_id   bigint not null references sigap_akun(id),
  n_penilaian  integer not null check (n_penilaian >= 0),
  rata         numeric(6,2) not null,
  simpangan    numeric(6,2) not null check (simpangan >= 0),
  z_rata       numeric(6,3) not null,
  mode         text not null check (mode in ('catatan','terstandar','diskusi')),
  porsi_koreksi numeric(4,2) not null default 0 check (porsi_koreksi between 0 and 1),
  diputuskan_oleh bigint references sigap_akun(id),
  unique (periode, penilai_id)
);
comment on table kual_kalibrasi is 'Selisih gaya menilai antar penilai. Mode terstandar mengoreksi sebagian (porsi_koreksi) hanya setelah diputuskan manusia.';

-- Kompetensi, kebutuhan kegiatan, dan kualifikasi orang (gap)
create table kual_kompetensi (
  kode    text primary key check (kode ~ '^[A-Z]{2,4}-[0-9]{2}$'),
  nama    text not null,
  rumpun  text not null check (rumpun in ('teknis_lapangan','digital','analisis','administrasi','kepemimpinan','kepatuhan')),
  aktif   boolean not null default true
);
create table kual_kebutuhan (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references sigap_kegiatan(id),
  peran         text not null,
  kompetensi_kode text not null references kual_kompetensi(kode),
  tingkat_min   smallint not null check (tingkat_min between 1 and 4),
  wajib         boolean not null default true,
  unique (kegiatan_id, peran, kompetensi_kode)
);
create table kual_kualifikasi (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  kompetensi_kode text not null references kual_kompetensi(kode),
  tingkat       smallint not null check (tingkat between 1 and 4),
  sumber        text not null check (sumber in ('pelatihan','praktik','penilaian','pengakuan_pengalaman')),
  bukti_ref     text,
  berlaku_mulai date not null,
  berlaku_sampai date,
  dicatat_oleh  bigint references sigap_akun(id),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai)
);
create index kual_kualifikasi_akun_idx on kual_kualifikasi (akun_id, kompetensi_kode);

create view kual_v_gap with (security_invoker = true) as
select p.akun_id, p.kegiatan_id, kb.peran, kb.kompetensi_kode, kb.tingkat_min, kb.wajib,
       coalesce(max(k.tingkat) filter (where current_date between k.berlaku_mulai and coalesce(k.berlaku_sampai, 'infinity'::date)), 0) as tingkat_dimiliki,
       kb.tingkat_min - coalesce(max(k.tingkat) filter (where current_date between k.berlaku_mulai and coalesce(k.berlaku_sampai, 'infinity'::date)), 0) as kurang
from sigap_penugasan p
join kual_kebutuhan kb on kb.kegiatan_id = p.kegiatan_id and kb.peran = p.peran
left join kual_kualifikasi k on k.akun_id = p.akun_id and k.kompetensi_kode = kb.kompetensi_kode
where p.aktif
group by p.akun_id, p.kegiatan_id, kb.peran, kb.kompetensi_kode, kb.tingkat_min, kb.wajib;
comment on view kual_v_gap is 'Kesenjangan kualifikasi: kurang > 0 berarti tingkat dimiliki di bawah kebutuhan.';

-- Keputusan penempatan: sistem menyarankan, manusia memutuskan dan beralasan
create table kual_keputusan_penempatan (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references sigap_kegiatan(id),
  akun_id       bigint not null references sigap_akun(id),
  peran         text not null,
  saran_sistem  jsonb not null,
  keputusan     text not null check (keputusan in ('ikut_saran','ubah','tolak')),
  alasan        text,
  pengambil_id  bigint not null references sigap_akun(id),
  diputuskan_at timestamptz not null default now(),
  check (keputusan = 'ikut_saran' or length(btrim(coalesce(alasan, ''))) >= 10),
  check (not (saran_sistem ? 'agama' or saran_sistem ? 'suku' or saran_sistem ? 'jenis_kelamin'
           or saran_sistem ? 'usia' or saran_sistem ? 'status_perkawinan' or saran_sistem ? 'kesehatan'
           or saran_sistem ? 'disabilitas'))
);
comment on table kual_keputusan_penempatan is 'Saran sistem tidak mengikat: setiap penolakan/perubahan wajib beralasan. Kunci atribut sensitif dilarang ada di saran_sistem.';
create trigger kual_keputusan_jejak_tr after insert on kual_keputusan_penempatan
  for each row execute function tkl_catat_jejak();

alter table kual_indikator enable row level security;
alter table kual_model enable row level security;
alter table kual_pengamatan enable row level security;
alter table kual_skor_periode enable row level security;
alter table kual_sanggah enable row level security;
alter table kual_umpan_balik enable row level security;
alter table kual_kalibrasi enable row level security;
alter table kual_kompetensi enable row level security;
alter table kual_kebutuhan enable row level security;
alter table kual_kualifikasi enable row level security;
alter table kual_keputusan_penempatan enable row level security;
