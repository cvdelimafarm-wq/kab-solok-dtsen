-- =====================================================================
-- 20261022e_sdm_kinerja.sql
-- Lapis: modul SDM pegawai organik (prefix sdm_). Bergantung pada 20261022a.
-- Alur mengikuti PermenPANRB 6/2022 (terverifikasi ada): perencanaan kinerja
-- (SKP) -> pelaksanaan dan pemantauan -> penilaian -> tindak lanjut.
-- Matriks predikat TIDAK disalin: predikat disimpan sebagai kode yang diisi
-- pejabat penilai "sesuai lampiran peraturan"; sistem tidak menghitungnya.
-- Skor mitra (kual_*) TIDAK dipakai menilai pegawai organik.
-- =====================================================================

create table sdm_skp (
  id            bigint generated always as identity primary key,
  pegawai_id    bigint not null references sigap_akun(id),
  atasan_id     bigint not null references sigap_akun(id),
  tahun         smallint not null check (tahun between 2020 and 2100),
  status        text not null default 'draf'
                check (status in ('draf','diajukan','disetujui_atasan','berjalan','dinilai','ditutup')),
  disetujui_at  timestamptz,
  dibuat_at     timestamptz not null default now(),
  unique (pegawai_id, tahun),
  check (pegawai_id <> atasan_id),
  check (status in ('draf','diajukan') or disetujui_at is not null)
);
comment on table sdm_skp is 'Sasaran kinerja pegawai per tahun. Atasan penilai tidak boleh pegawai itu sendiri; setelah disetujui, butir hanya berubah lewat revisi berjejak.';

create table sdm_skp_butir (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null references sdm_skp(id),
  uraian        text not null,
  kegiatan_id   bigint references sigap_kegiatan(id),
  target        numeric(14,2) not null check (target > 0),
  satuan        text not null,
  jenis         text not null default 'utama' check (jenis in ('utama','tambahan')),
  urutan        smallint not null default 1
);
create index sdm_skp_butir_skp_idx on sdm_skp_butir (skp_id);

create table sdm_pemantauan (
  id            bigint generated always as identity primary key,
  butir_id      bigint not null references sdm_skp_butir(id),
  tanggal       date not null,
  capaian       numeric(14,2) not null check (capaian >= 0),
  catatan       text,
  dicatat_oleh  bigint not null references sigap_akun(id),
  umpan_balik_atasan text,
  dibuat_at     timestamptz not null default now()
);
comment on table sdm_pemantauan is 'Pemantauan berkala (percakapan kinerja). Capaian dapat terisi otomatis dari realisasi kegiatan; catatan manual tetap dibolehkan.';

create table sdm_penilaian (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null unique references sdm_skp(id),
  nilai_hasil_kerja  text,
  nilai_perilaku     text,
  predikat_kode      text,
  dasar_penilaian    text not null default 'Sesuai lampiran PermenPANRB 6/2022 (isi oleh pejabat penilai)',
  penilai_id    bigint not null references sigap_akun(id),
  dinilai_at    timestamptz,
  diterima_pegawai_at timestamptz,
  keberatan     text,
  dibuat_at     timestamptz not null default now()
);
comment on column sdm_penilaian.predikat_kode is 'Diisi pejabat penilai sesuai lampiran peraturan. Sistem tidak menurunkan predikat dari angka.';

create table sdm_tindak_lanjut (
  id            bigint generated always as identity primary key,
  skp_id        bigint not null references sdm_skp(id),
  jenis         text not null check (jenis in ('pembinaan','pengembangan_kompetensi','penghargaan','lainnya')),
  uraian        text not null,
  batas_at      date,
  selesai_at    date,
  dicatat_oleh  bigint not null references sigap_akun(id)
);

create function sdm_penilaian_cek() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_atasan bigint; v_pegawai bigint;
begin
  select atasan_id, pegawai_id into v_atasan, v_pegawai from sdm_skp where id = new.skp_id;
  if new.penilai_id <> v_atasan then
    raise exception 'Penilai harus atasan yang tercatat pada SKP' using errcode = 'check_violation';
  end if;
  if new.penilai_id = v_pegawai then
    raise exception 'Pegawai tidak boleh menilai dirinya sendiri' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger sdm_penilaian_cek_tr before insert or update on sdm_penilaian
  for each row execute function sdm_penilaian_cek();
create trigger sdm_skp_jejak_tr after insert or update on sdm_skp
  for each row execute function tkl_catat_jejak();
create trigger sdm_penilaian_jejak_tr after insert or update on sdm_penilaian
  for each row execute function tkl_catat_jejak();

alter table sdm_skp           enable row level security;
alter table sdm_skp_butir     enable row level security;
alter table sdm_pemantauan    enable row level security;
alter table sdm_penilaian     enable row level security;
alter table sdm_tindak_lanjut enable row level security;
