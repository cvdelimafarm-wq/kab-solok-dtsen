-- (8 Okt 2026) SIGAP > Kelola Pelatihan > Pengumuman: modal pengumuman peserta yang diatur panitia (menggantikan modal "PERHATIAN" yang tertanam di kode).
-- Modal aktif tampil berurutan (antrian) di halaman Langkah peserta. Isi memakai penanda sederhana: **tebal**, ==sorot==, [teks](https://tautan), baris "- " = daftar.
-- Tidak ada penghapusan permanen: modal dimatikan lewat kolom aktif.
create table if not exists public.sigap_pengumuman (
  id bigserial primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id) on delete cascade,
  urut integer not null default 0,
  judul text not null default '',
  jenis text not null default 'info' check (jenis in ('info','perhatian','penting')),
  isi text not null default '',
  tombol_label text,
  tombol_url text,
  frekuensi text not null default 'sekali' check (frekuensi in ('tiap','sekali')),
  sasaran_kelas smallint,
  sasaran_peran text,
  mulai_at timestamptz,
  akhir_at timestamptz,
  aktif boolean not null default false,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);
create index if not exists sigap_pengumuman_kegiatan on public.sigap_pengumuman (kegiatan_id, urut);
alter table public.sigap_pengumuman enable row level security; -- akses hanya lewat service role (API)

-- modal lama (pergantian lokasi pembukaan) dipindahkan ke tabel ini dengan status NONAKTIF
insert into public.sigap_pengumuman (kegiatan_id, urut, judul, jenis, isi, tombol_label, tombol_url, frekuensi, aktif)
select k.id, 1, 'PERHATIAN', 'perhatian',
  E'**Pembukaan pelatihan dilakukan di Ully Hotel Solok** (450 meter dari Mami Hotel).',
  '📍 Klik untuk buka Google Maps', 'https://maps.app.goo.gl/cfrCpteizYPPxDju8?g_st=iw', 'tiap', false
from public.sigap_kegiatan k
where k.kode = 'pelatihan_psp_pascabencana_2026'
  and not exists (select 1 from public.sigap_pengumuman p where p.kegiatan_id = k.id);
