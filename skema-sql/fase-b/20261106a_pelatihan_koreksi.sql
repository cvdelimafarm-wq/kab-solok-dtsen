-- 20261106a_pelatihan_koreksi.sql
--
-- (6 Nov 2026) Kelola Pelatihan > Kendala, tahap kedua: KENDALA TES (tambah waktu / buka ulang / nonaktifkan soal + hitung ulang nilai),
-- PINDAH KELAS atau ATASAN, dan TAMBAH PESERTA MENDADAK. AMAN DIULANG. Dijalankan Iqbal sendiri.
--
-- 1) sigap_tes_soal.aktif : soal bermasalah dinonaktifkan (tidak dihapus). Soal nonaktif tidak tampil ke peserta dan tidak ikut nilai;
--    jawaban peserta untuk soal itu tetap tersimpan sehingga pengaktifan kembali (urungkan) mengembalikan nilai semula.
-- 2) sigap_pelatihan_koreksi : satu baris = satu tindakan koreksi (siapa, kapan, alasan, keadaan sebelumnya untuk diurungkan).
--    Hanya server (service role) yang membaca dan menulis: RLS aktif tanpa kebijakan.
-- Tanpa SQL ini bagian baru di tab Kendala menampilkan petunjuk; fitur lain tetap jalan.

alter table sigap_tes_soal add column if not exists aktif boolean not null default true;

create table if not exists sigap_pelatihan_koreksi (
  id              bigserial   primary key,
  kegiatan_id     bigint      not null references sigap_kegiatan(id) on delete cascade,
  jenis           text        not null check (jenis in ('tes_waktu','tes_buka_ulang','soal_nonaktif','pindah','peserta_tambah')),
  akun_id         bigint      references sigap_akun(id),
  tes_id          bigint      references sigap_tes(id) on delete set null,
  alasan          text        not null,
  detail          jsonb       not null default '{}'::jsonb,
  snapshot        jsonb       not null default '{}'::jsonb,
  oleh            bigint      references sigap_akun(id),
  at              timestamptz not null default now(),
  dibatalkan_at   timestamptz,
  dibatalkan_oleh bigint      references sigap_akun(id),
  check (jsonb_typeof(detail) = 'object'),
  check (jsonb_typeof(snapshot) = 'object')
);

create index if not exists sigap_pelatihan_koreksi_kegiatan_idx on sigap_pelatihan_koreksi (kegiatan_id, at desc);

alter table sigap_pelatihan_koreksi enable row level security;

-- Cek cepat (harus 2 baris):
--   select table_name||'.'||column_name from information_schema.columns
--    where table_schema='public' and ((table_name='sigap_tes_soal' and column_name='aktif') or (table_name='sigap_pelatihan_koreksi' and column_name='jenis'));
