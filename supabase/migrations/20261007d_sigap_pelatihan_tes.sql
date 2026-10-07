-- (7 Okt 2026) SIGAP > Pelatihan: pretest & posttest, kelas peserta.
-- Permintaan user: menu Undangan & Pelatihan; soal diunggah lewat template Excel; sesi dibuka sesuai jam
-- (pretest 09.00, posttest 15.00, 15 menit); admin punya monitoring.
-- Aturan waktu (dipilih user): hitung mundur per orang + batas tutup. batas_at = LEAST(mulai + durasi, tutup_at).

alter table sigap_penugasan add column if not exists kelas smallint;
comment on column sigap_penugasan.kelas is 'Kelas pelatihan (1-4) utk kegiatan jenis pelatihan; null utk kegiatan lain.';

create table if not exists sigap_tes (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  jenis text not null check (jenis in ('pretest','posttest')),
  judul text not null,
  buka_at timestamptz not null,
  durasi_menit int not null default 15 check (durasi_menit between 1 and 240),
  tutup_at timestamptz not null,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz,
  unique (kegiatan_id, jenis),
  check (tutup_at > buka_at)
);

create table if not exists sigap_tes_soal (
  id bigserial primary key,
  tes_id bigint not null references sigap_tes(id) on delete cascade,
  nomor int not null check (nomor > 0),
  teks text not null,
  opsi jsonb not null,           -- [{"kode":"A","teks":"..."}, ...]
  kunci text not null,           -- kode opsi benar, mis. "B"
  bobot numeric not null default 1 check (bobot > 0),
  unique (tes_id, nomor)
);

create table if not exists sigap_tes_sesi (
  id bigserial primary key,
  tes_id bigint not null references sigap_tes(id) on delete cascade,
  akun_id bigint not null references sigap_akun(id),
  mulai_at timestamptz not null default now(),
  batas_at timestamptz not null,
  selesai_at timestamptz,
  jawaban jsonb not null default '{}'::jsonb,   -- {"1":"B","2":"D"}
  skor numeric,
  benar int,
  total int,
  diubah_at timestamptz not null default now(),
  unique (tes_id, akun_id)
);
create index if not exists sigap_tes_sesi_tes_idx on sigap_tes_sesi (tes_id);

alter table sigap_tes enable row level security;
alter table sigap_tes_soal enable row level security;
alter table sigap_tes_sesi enable row level security;

-- Menu & izin admin (Admin Anggaran, PJ Kegiatan, Admin Aplikasi = kelola; Bendahara = lihat)
insert into sigap_menu (kode, nama, aktif, portal, urutan, keterangan)
values ('pelatihan.kelola', 'Soal, jadwal & monitoring tes', true, 'Pelatihan', 70, 'Unggah soal pretest/posttest, atur jadwal, pantau peserta')
on conflict (kode) do nothing;
insert into sigap_peran_izin (peran_id, menu_kode, level)
select p, 'pelatihan.kelola', l from (values (1,'kelola'),(2,'kelola'),(4,'kelola'),(3,'lihat')) v(p,l)
where not exists (select 1 from sigap_peran_izin x where x.peran_id=v.p and x.menu_kode='pelatihan.kelola');

-- Jadwal bawaan Pelatihan PSP Pascabencana 2026 (kegiatan pelatihan_psp_pascabencana_2026), 8 Okt 2026 WIB
insert into sigap_tes (kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at)
select k.id, 'pretest', 'Pretest Pelatihan PSP Pascabencana 2026', timestamptz '2026-10-08 09:00:00+07', 15, timestamptz '2026-10-08 09:15:00+07'
from sigap_kegiatan k where k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id, jenis) do nothing;
insert into sigap_tes (kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at)
select k.id, 'posttest', 'Posttest Pelatihan PSP Pascabencana 2026', timestamptz '2026-10-08 15:00:00+07', 15, timestamptz '2026-10-08 15:15:00+07'
from sigap_kegiatan k where k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id, jenis) do nothing;
