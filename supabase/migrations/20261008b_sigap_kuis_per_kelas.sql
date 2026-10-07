-- (8 Okt 2026) Adu Sigap per kelas: satu ruang per (kegiatan, kelas), berjalan paralel.
-- Soal: topik + penjelasan. Ruang: kelas, pengaturan (snapshot), soal_main (urutan soal & opsi yg dimainkan),
-- jeda (pause), lanjut otomatis, jadwal mulai. sigap_kuis_kelas: pengaturan & pilihan soal tiap kelas (disimpan admin).

alter table sigap_kuis_soal
  add column if not exists topik text,
  add column if not exists penjelasan text;

alter table sigap_kuis_ruang
  add column if not exists kelas integer not null default 1,
  add column if not exists pengaturan jsonb not null default '{}'::jsonb,
  add column if not exists soal_main jsonb,
  add column if not exists dijeda boolean not null default false,
  add column if not exists dijeda_sisa_ms integer,
  add column if not exists lanjut_at timestamptz,
  add column if not exists jadwal_at timestamptz;

alter table sigap_kuis_ruang alter column kelas drop default;
alter table sigap_kuis_ruang drop constraint if exists sigap_kuis_ruang_kelas_check;
alter table sigap_kuis_ruang add constraint sigap_kuis_ruang_kelas_check check (kelas between 1 and 4);

drop index if exists sigap_kuis_ruang_satu_aktif;
create unique index if not exists sigap_kuis_ruang_satu_aktif_kelas on sigap_kuis_ruang (kegiatan_id, kelas) where status <> 'selesai';
create index if not exists sigap_kuis_ruang_kegiatan_kelas_idx on sigap_kuis_ruang (kegiatan_id, kelas, id desc);

create table if not exists sigap_kuis_kelas (
  kegiatan_id bigint not null references sigap_kegiatan(id) on delete cascade,
  kelas integer not null check (kelas between 1 and 4),
  kuis_id bigint references sigap_kuis(id) on delete set null,
  pengaturan jsonb not null default '{}'::jsonb,
  soal_pilihan jsonb not null default '[]'::jsonb,
  diubah_at timestamptz not null default now(),
  diubah_oleh bigint references sigap_akun(id) on delete set null,
  primary key (kegiatan_id, kelas)
);
alter table sigap_kuis_kelas enable row level security;
