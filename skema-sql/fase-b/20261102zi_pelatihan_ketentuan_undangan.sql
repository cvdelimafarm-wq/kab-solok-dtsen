-- 20261102zi_pelatihan_ketentuan_undangan.sql
--
-- (2 Nov 2026) Pelatihan 5 tab, tahap B: ketentuan pelatihan (diatur PJ kegiatan) + respons undangan (terima / tolak). AMAN DIULANG. Dijalankan Iqbal sendiri.
-- Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan. Tanpa tabel ini kode tetap jalan dengan tampilan LAMA (Langkah).
-- `tab_baru` adalah SAKLAR per kegiatan: false (bawaan) = tampilan Langkah lama; true = tampilan lima tab. Menyalakan saklar TIDAK dilakukan oleh SQL ini.

create table if not exists sigap_pelatihan_ketentuan (
  kegiatan_id bigint      primary key references sigap_kegiatan(id) on delete cascade,
  tab_baru    boolean     not null default false,
  butir       jsonb       not null default '[]'::jsonb,   -- daftar teks ketentuan tambahan dari PJ (waktu dan tempat diambil dari data undangan)
  versi       integer     not null default 1 check (versi >= 1),
  diubah_oleh text,
  diubah_at   timestamptz not null default now(),
  check (jsonb_typeof(butir) = 'array')
);

create table if not exists sigap_pelatihan_undangan_respons (
  kegiatan_id     bigint      not null references sigap_kegiatan(id) on delete cascade,
  akun_id         bigint      not null references sigap_akun(id),
  respons         text        not null check (respons in ('terima','tolak')),
  alasan          text,
  versi_ketentuan integer     not null default 1 check (versi_ketentuan >= 1),
  dijawab_at      timestamptz not null default now(),
  primary key (kegiatan_id, akun_id)
);

create index if not exists sigap_pelatihan_undangan_respons_tolak_idx on sigap_pelatihan_undangan_respons (kegiatan_id) where respons = 'tolak';

alter table sigap_pelatihan_ketentuan enable row level security;
alter table sigap_pelatihan_undangan_respons enable row level security;

-- Menyiapkan baris ketentuan untuk satu kegiatan TANPA menyalakan tampilan baru (mis. Seruti TW IV = 7), lalu mengisi ketentuan tambahan (sementara, sebelum layar Kelola tersedia):
--   insert into sigap_pelatihan_ketentuan (kegiatan_id, butir, diubah_oleh) values (7, '["Ketentuan pertama.","Ketentuan kedua."]'::jsonb, 'iqbal') on conflict (kegiatan_id) do update set butir = excluded.butir, versi = sigap_pelatihan_ketentuan.versi + 1, diubah_oleh = excluded.diubah_oleh, diubah_at = now();
-- SAKLAR tampilan lima tab (jalankan HANYA bila siap; mematikan: false):
--   insert into sigap_pelatihan_ketentuan (kegiatan_id, tab_baru, diubah_oleh) values (7, true, 'iqbal') on conflict (kegiatan_id) do update set tab_baru = true, diubah_oleh = 'iqbal', diubah_at = now();
-- Cek cepat (harus 2):
--   select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_pelatihan_ketentuan','sigap_pelatihan_undangan_respons');
