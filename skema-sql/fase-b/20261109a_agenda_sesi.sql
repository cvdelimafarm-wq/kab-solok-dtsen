-- 9 Nov 2026 · SIGAP > Pelatihan > Agenda hari H (versi minimal): pretest/posttest DIMULAI INSTRUKTUR.
-- Aman diulang. Akses lewat API server (RLS aktif tanpa kebijakan publik).
-- Memasang kode lebih dulu dari SQL ini tidak mengubah apa pun: tes tanpa baris agenda tetap berjalan menurut jadwal (perilaku lama).

create table if not exists public.sigap_agenda_sesi (
  id            bigserial primary key,
  kegiatan_id   bigint      not null,
  kelas         integer     not null,
  tes_id        bigint      not null references public.sigap_tes(id) on delete cascade,
  jendela_menit integer     not null default 30 check (jendela_menit between 1 and 480),
  mulai_at      timestamptz,
  mulai_oleh    bigint,
  selesai_at    timestamptz,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  unique (tes_id, kelas)
);
create index if not exists sigap_agenda_sesi_kegiatan_idx on public.sigap_agenda_sesi (kegiatan_id, kelas);
alter table public.sigap_agenda_sesi enable row level security;

-- ===== BAGIAN 2 (pemasangan Seruti TW IV, kegiatan 7, kelas 1) =====
-- Pretest (19) dan Posttest (20) dimulai instruktur kelas 1 (akun 354), jendela 30 menit sejak Mulai.
-- Setelah baris ini ada, peserta kelas 1 melihat "Menunggu instruktur memulai" sampai instruktur menekan Mulai di Hari ini.
-- DARURAT (kembali ke jadwal biasa): delete from public.sigap_agenda_sesi where kegiatan_id = 7;
insert into public.sigap_agenda_sesi (kegiatan_id, kelas, tes_id, jendela_menit)
select t.kegiatan_id, 1, t.id, 30
from public.sigap_tes t
where t.kegiatan_id = 7 and t.jenis in ('pretest', 'posttest')
on conflict (tes_id, kelas) do nothing;
