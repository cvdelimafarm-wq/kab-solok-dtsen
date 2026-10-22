-- =====================================================================
-- 20261022d_mitra_kontrak_seleksi.sql
-- Lapis: modul mitra (prefix mitra_). Bergantung pada 20261022a-c.
-- Data pribadi mitra (NIK, rekening, HP, koordinat) TETAP di sigap_akun /
-- bencana_mitra; tabel ini hanya menyimpan akun_id (aturan 5).
-- Batas honor bulanan dan bentuk perjanjian = PARAMETER (tkl_parameter),
-- belum diisi karena tidak ditemukan di ketentuan resmi (lihat brief).
-- =====================================================================

-- Riwayat status keanggotaan mitra, bermasa berlaku
create table mitra_status_riwayat (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  status        text not null check (status in ('calon','aktif','jeda','dihentikan')),
  alasan_kode   text check (alasan_kode in ('seleksi_lulus','permintaan_sendiri','tidak_memenuhi_kualifikasi','pelanggaran_terbukti','kuota','lainnya')),
  alasan        text,
  berlaku_mulai date not null,
  berlaku_sampai date,
  diputuskan_oleh bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (status <> 'dihentikan' or (alasan_kode is not null and diputuskan_oleh is not null)),
  check (alasan_kode <> 'pelanggaran_terbukti' or length(btrim(coalesce(alasan, ''))) >= 20),
  exclude using gist (
    akun_id with =,
    daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&
  )
);
comment on table mitra_status_riwayat is 'Satu status per mitra per waktu. Penghentian wajib beralasan kode dan diputuskan manusia; pelanggaran wajib uraian.';

-- Perjanjian induk per mitra per tahun
create table mitra_perjanjian (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  nomor_dokumen text not null,
  bentuk        text,
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  ppk_id        bigint not null references sigap_akun(id),
  status        text not null default 'draf' check (status in ('draf','ditandatangani','berjalan','selesai','batal')),
  dibuat_at     timestamptz not null default now(),
  unique (nomor_dokumen),
  check (tanggal_selesai >= tanggal_mulai),
  check (ppk_id <> akun_id)
);
comment on column mitra_perjanjian.bentuk is 'Bentuk perjanjian: diisi dari parameter mitra.bentuk_perjanjian (belum_diisi sampai ketentuan resmi dimasukkan).';

create function mitra_cek_penandatangan() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_ppk bigint;
begin
  if new.status in ('ditandatangani','berjalan') then
    v_ppk := keu_pejabat_aktif('ppk', new.tanggal_mulai);
    if v_ppk is null or v_ppk <> new.ppk_id then
      raise exception 'Penandatangan bukan PPK yang berlaku pada %', new.tanggal_mulai using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger mitra_perjanjian_ppk_tr before insert or update of status, ppk_id on mitra_perjanjian
  for each row execute function mitra_cek_penandatangan();
create trigger mitra_perjanjian_jejak_tr after insert or update on mitra_perjanjian
  for each row execute function tkl_catat_jejak();

-- SPK per kegiatan; honor membebani bulan tertentu
create table mitra_spk (
  id            bigint generated always as identity primary key,
  perjanjian_id bigint not null references mitra_perjanjian(id),
  kegiatan_id   bigint not null references sigap_kegiatan(id),
  penugasan_id  bigint references sigap_penugasan(id),
  rab_baris_id  bigint references keu_rab_baris(id),
  pok_detail_id bigint references keu_pok_detail(id),
  bulan_beban   date not null check (extract(day from bulan_beban) = 1),
  volume        numeric(14,2) not null check (volume > 0),
  satuan        text not null,
  harga_satuan  numeric(16,0) not null check (harga_satuan > 0),
  nilai         numeric(18,0) generated always as (round(volume * harga_satuan)) stored,
  status        text not null default 'draf' check (status in ('draf','ditandatangani','berjalan','bast','dibayar','batal')),
  alasan_batal  text,
  dibuat_at     timestamptz not null default now(),
  check ((status = 'batal') = (alasan_batal is not null))
);
create index mitra_spk_perjanjian_idx on mitra_spk (perjanjian_id, bulan_beban);
comment on table mitra_spk is 'SPK/penugasan bernilai per kegiatan. Total nilai aktif per mitra per bulan dibatasi parameter mitra.batas_honor_bulanan bila sudah diisi.';

create function mitra_total_bulan(p_akun bigint, p_bulan date, p_kecuali bigint default null)
returns numeric language sql stable set search_path = public, pg_temp
as $$
  select coalesce(sum(s.nilai), 0)
  from mitra_spk s join mitra_perjanjian p on p.id = s.perjanjian_id
  where p.akun_id = p_akun and s.bulan_beban = p_bulan and s.status <> 'batal'
    and (p_kecuali is null or s.id <> p_kecuali)
$$;

create function mitra_spk_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_batas numeric; v_akun bigint; v_total numeric; v_pj record;
begin
  select akun_id into v_akun from mitra_perjanjian where id = new.perjanjian_id;
  select status, tanggal_mulai, tanggal_selesai into v_pj from mitra_perjanjian where id = new.perjanjian_id;
  if new.bulan_beban < date_trunc('month', v_pj.tanggal_mulai)::date or new.bulan_beban > v_pj.tanggal_selesai then
    raise exception 'Bulan beban di luar masa perjanjian' using errcode = 'check_violation';
  end if;
  if new.status <> 'batal' then
    v_batas := tkl_param_num('mitra.batas_honor_bulanan', new.bulan_beban);
    if v_batas is not null then
      v_total := mitra_total_bulan(v_akun, new.bulan_beban, case when tg_op = 'UPDATE' then new.id end) + round(new.volume * new.harga_satuan);
      if v_total > v_batas then
        raise exception 'Total honor bulan % menjadi %, melebihi batas parameter % (lebih %)', new.bulan_beban, v_total, v_batas, v_total - v_batas
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger mitra_spk_jaga_tr before insert or update of nilai, volume, harga_satuan, bulan_beban, status on mitra_spk
  for each row execute function mitra_spk_jaga();
create trigger mitra_spk_jejak_tr after insert or update on mitra_spk
  for each row execute function tkl_catat_jejak();

-- BAST (berita acara serah terima) dengan pemisahan pemeriksa dan penyetuju
create table mitra_bast (
  id            bigint generated always as identity primary key,
  spk_id        bigint not null references mitra_spk(id),
  tanggal       date not null,
  volume_diterima numeric(14,2) not null check (volume_diterima >= 0),
  status        text not null default 'draf' check (status in ('draf','diperiksa','disetujui','ditolak')),
  diperiksa_oleh bigint references sigap_akun(id),
  disetujui_oleh bigint references sigap_akun(id),
  catatan       text,
  dibuat_at     timestamptz not null default now(),
  check (disetujui_oleh is null or disetujui_oleh is distinct from diperiksa_oleh),
  check (status <> 'disetujui' or (diperiksa_oleh is not null and disetujui_oleh is not null)),
  check (status <> 'ditolak' or catatan is not null)
);
create function mitra_bast_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_vol numeric; v_sudah numeric;
begin
  select volume into v_vol from mitra_spk where id = new.spk_id;
  select coalesce(sum(volume_diterima), 0) into v_sudah from mitra_bast
    where spk_id = new.spk_id and status <> 'ditolak' and (tg_op = 'INSERT' or id <> new.id);
  if new.status <> 'ditolak' and v_sudah + new.volume_diterima > v_vol then
    raise exception 'Volume BAST % melebihi volume SPK %', v_sudah + new.volume_diterima, v_vol using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger mitra_bast_jaga_tr before insert or update of volume_diterima, status on mitra_bast
  for each row execute function mitra_bast_jaga();
create trigger mitra_bast_jejak_tr after insert or update on mitra_bast
  for each row execute function tkl_catat_jejak();

-- Potongan pajak (metode dan tarif dari ketentuan; PMK 168/2023 berstatus perlu_dicek)
create table mitra_potongan (
  id            bigint generated always as identity primary key,
  bast_id       bigint not null references mitra_bast(id),
  jenis         text not null check (jenis in ('pph21','lainnya')),
  dasar         numeric(18,0) not null check (dasar >= 0),
  tarif_persen  numeric(6,3) not null check (tarif_persen between 0 and 100),
  jumlah        numeric(18,0) generated always as (round(dasar * tarif_persen / 100)) stored,
  tkl_regulasi_id bigint references tkl_regulasi(id),
  keterangan    text,
  unique (bast_id, jenis)
);
comment on table mitra_potongan is 'Potongan per BAST. Tarif diisi dari ketentuan berlaku; rujukan regulasi wajib tercatat agar tarif dapat ditelusuri.';

-- Seleksi mitra: whitelist kriteria sebagai pengaman anti-bias
create table mitra_seleksi_periode (
  id           bigint generated always as identity primary key,
  tahun        smallint not null references keu_tahun_anggaran(tahun),
  nama         text not null,
  kuota        integer not null check (kuota > 0),
  buka_at      date not null,
  tutup_at     date not null,
  status       text not null default 'draf' check (status in ('draf','buka','penilaian','pengumuman','selesai')),
  dibuat_oleh  bigint references sigap_akun(id),
  check (tutup_at >= buka_at),
  unique (tahun, nama)
);
create table mitra_rubrik (
  id           bigint generated always as identity primary key,
  periode_id   bigint not null references mitra_seleksi_periode(id),
  jenis_kriteria text not null
               check (jenis_kriteria in ('tes_tulis','praktik','kelengkapan_berkas','pengalaman_bps','jarak_domisili','wawancara_perilaku')),
  bobot        numeric(5,2) not null check (bobot > 0 and bobot <= 100),
  keterangan   text,
  unique (periode_id, jenis_kriteria)
);
comment on table mitra_rubrik is 'Kriteria seleksi dibatasi daftar putih. Usia, jenis kelamin, agama, suku, status perkawinan, kesehatan, disabilitas tidak tersedia sebagai kriteria.';
create table mitra_pendaftar (
  id           bigint generated always as identity primary key,
  periode_id   bigint not null references mitra_seleksi_periode(id),
  akun_id      bigint not null references sigap_akun(id),
  status       text not null default 'daftar'
               check (status in ('daftar','verifikasi_berkas','tes','wawancara','lulus','cadangan','tidak_lulus','mundur')),
  alasan_kode  text check (alasan_kode in ('berkas_tidak_lengkap','nilai_di_bawah_ambang','kuota_penuh','mundur_sendiri','lainnya')),
  diputuskan_oleh bigint references sigap_akun(id),
  diputuskan_at timestamptz,
  unique (periode_id, akun_id),
  check (status not in ('lulus','cadangan','tidak_lulus') or (diputuskan_oleh is not null and diputuskan_at is not null)),
  check (status <> 'tidak_lulus' or alasan_kode is not null)
);
create table mitra_nilai_seleksi (
  id           bigint generated always as identity primary key,
  pendaftar_id bigint not null references mitra_pendaftar(id),
  rubrik_id    bigint not null references mitra_rubrik(id),
  penilai_id   bigint not null references sigap_akun(id),
  nilai        numeric(5,2) not null check (nilai between 0 and 100),
  dibuat_at    timestamptz not null default now(),
  unique (pendaftar_id, rubrik_id, penilai_id)
);
create function mitra_nilai_cek() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_akun bigint; v_p1 bigint; v_p2 bigint;
begin
  select akun_id, periode_id into v_akun, v_p1 from mitra_pendaftar where id = new.pendaftar_id;
  select periode_id into v_p2 from mitra_rubrik where id = new.rubrik_id;
  if v_p1 <> v_p2 then raise exception 'Rubrik dan pendaftar berbeda periode' using errcode = 'check_violation'; end if;
  if v_akun = new.penilai_id then raise exception 'Penilai tidak boleh menilai dirinya' using errcode = 'check_violation'; end if;
  return new;
end $$;
create trigger mitra_nilai_cek_tr before insert or update on mitra_nilai_seleksi
  for each row execute function mitra_nilai_cek();
create trigger mitra_pendaftar_jejak_tr after insert or update on mitra_pendaftar
  for each row execute function tkl_catat_jejak();
create trigger mitra_status_jejak_tr after insert or update on mitra_status_riwayat
  for each row execute function tkl_catat_jejak();

alter table mitra_status_riwayat  enable row level security;
alter table mitra_perjanjian      enable row level security;
alter table mitra_spk             enable row level security;
alter table mitra_bast            enable row level security;
alter table mitra_potongan        enable row level security;
alter table mitra_seleksi_periode enable row level security;
alter table mitra_rubrik          enable row level security;
alter table mitra_pendaftar       enable row level security;
alter table mitra_nilai_seleksi   enable row level security;
