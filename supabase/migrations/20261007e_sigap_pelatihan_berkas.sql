-- (7 Okt 2026) SIGAP > Pelatihan > Instrumen: kuesioner, buku pedoman, PPT materi yg dapat diunduh peserta.
-- sumber 'repo' = berkas di folder data/ aplikasi; 'storage' = bucket sigap-files (diunggah admin lewat halaman Instrumen).
create table if not exists sigap_pelatihan_berkas (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  jenis text not null check (jenis in ('kuesioner','pedoman','materi')),
  judul text not null,
  nama_file text not null,
  mime text,
  ukuran bigint,
  sumber text not null default 'storage' check (sumber in ('storage','repo')),
  path text not null,
  aktif boolean not null default true,
  diunggah_oleh text,
  diunggah_at timestamptz not null default now()
);
create index if not exists sigap_pelatihan_berkas_keg_idx on sigap_pelatihan_berkas (kegiatan_id, jenis) where aktif;
alter table sigap_pelatihan_berkas enable row level security;

insert into sigap_pelatihan_berkas (kegiatan_id, jenis, judul, nama_file, mime, ukuran, sumber, path, diunggah_oleh)
select k.id, 'kuesioner', 'Kuesioner Keluarga — Pendataan Status Pemulihan Pascabencana Sumatera 2026 (versi 16.09)',
       'Kuesioner_Keluarga_PSP_Pascabencana_2026.pdf', 'application/pdf', 781529, 'repo', 'instrumen/kuesioner-keluarga-psp-pascabencana-2026.pdf', 'sistem'
from sigap_kegiatan k
where k.kode='pelatihan_psp_pascabencana_2026'
  and not exists (select 1 from sigap_pelatihan_berkas b where b.path='instrumen/kuesioner-keluarga-psp-pascabencana-2026.pdf');
