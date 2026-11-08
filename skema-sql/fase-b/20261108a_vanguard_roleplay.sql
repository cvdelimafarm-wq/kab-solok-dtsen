-- 20261108a_vanguard_roleplay.sql
--
-- (8 Nov 2026) VANGUARD ROLEPLAY BERSAMA KELAS. AMAN DIULANG (create if not exists). Dijalankan Iqbal sendiri.
-- Satu roleplay per kelas per pelatihan: instruktur membuka roleplay, lalu menjalankan LANGKAH (sesi) satu per satu. Peserta mengisi jawaban responden peran di Vanguard masing-masing;
-- instruktur menekan PERIKSA, mencentang variasi jawaban yang benar, lalu lanjut. Poin roleplay TIDAK masuk nilai pelatihan, bintang, sertifikasi, atau poin kinerja.
-- Tidak ada data responden nyata (responden hanya peran di kelas) dan tidak ada kolom identitas responden.
-- Hanya server (service role) yang membaca dan menulis: RLS aktif, tanpa kebijakan, hak anon/authenticated dicabut.
--
--   sigap_vanguard_roleplay          satu roleplay (kegiatan + kelas), status berjalan/selesai
--   sigap_vanguard_roleplay_langkah  satu sesi: cakupan (Blok IV.1 menurut rentang R, atau satu blok V-VII), status berjalan/diperiksa/selesai
--   sigap_vanguard_roleplay_isian    isian satu peserta per roleplay (iv1 = daftar entri komoditas, nilai = peta kotak V-VII -> rupiah)
--   sigap_vanguard_roleplay_tanda    variasi jawaban yang dicentang BENAR per satuan (rincian/kotak) pada satu langkah

create table if not exists sigap_vanguard_roleplay (
  id            bigserial primary key,
  kegiatan_id   bigint      not null references sigap_kegiatan(id) on delete cascade,
  kelas         smallint    not null check (kelas between 1 and 20),
  judul         text        not null default 'Roleplay bareng kelas' check (char_length(judul) <= 120),
  status        text        not null default 'berjalan' check (status in ('berjalan','selesai')),
  dibuat_oleh   bigint      not null references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  selesai_at    timestamptz
);

-- Satu roleplay yang sedang berjalan per kelas per pelatihan.
create unique index if not exists sigap_vanguard_roleplay_berjalan_uq on sigap_vanguard_roleplay (kegiatan_id, kelas) where status = 'berjalan';
create index if not exists sigap_vanguard_roleplay_kegiatan_idx on sigap_vanguard_roleplay (kegiatan_id, kelas, dibuat_at desc);

create table if not exists sigap_vanguard_roleplay_langkah (
  id            bigserial primary key,
  roleplay_id   bigint      not null references sigap_vanguard_roleplay(id) on delete cascade,
  nomor         smallint    not null check (nomor >= 1),
  bagian        text        not null check (bagian in ('iv1','A','B','C','D','E','F','G','VI','VII')),
  dari          smallint    check (dari is null or dari >= 1),
  sampai        smallint    check (sampai is null or sampai >= 1),
  status        text        not null default 'berjalan' check (status in ('berjalan','diperiksa','selesai')),
  dibuat_at     timestamptz not null default now(),
  diperiksa_at  timestamptz,
  selesai_at    timestamptz,
  unique (roleplay_id, nomor),
  check (bagian = 'iv1' or (dari is null and sampai is null)),
  check (dari is null or sampai is null or dari <= sampai)
);

create index if not exists sigap_vanguard_roleplay_langkah_rp_idx on sigap_vanguard_roleplay_langkah (roleplay_id, nomor);

create table if not exists sigap_vanguard_roleplay_isian (
  roleplay_id   bigint      not null references sigap_vanguard_roleplay(id) on delete cascade,
  akun_id       bigint      not null references sigap_akun(id),
  iv1           jsonb       not null default '[]'::jsonb,
  nilai         jsonb       not null default '{}'::jsonb,
  diperbarui_at timestamptz not null default now(),
  primary key (roleplay_id, akun_id)
);

create table if not exists sigap_vanguard_roleplay_tanda (
  langkah_id    bigint      not null references sigap_vanguard_roleplay_langkah(id) on delete cascade,
  kunci         text        not null check (char_length(kunci) between 2 and 80),
  benar         jsonb       not null default '[]'::jsonb,
  oleh          bigint      not null references sigap_akun(id),
  waktu         timestamptz not null default now(),
  primary key (langkah_id, kunci)
);

alter table sigap_vanguard_roleplay          enable row level security;
alter table sigap_vanguard_roleplay_langkah  enable row level security;
alter table sigap_vanguard_roleplay_isian    enable row level security;
alter table sigap_vanguard_roleplay_tanda    enable row level security;

revoke all on sigap_vanguard_roleplay          from anon, authenticated;
revoke all on sigap_vanguard_roleplay_langkah  from anon, authenticated;
revoke all on sigap_vanguard_roleplay_isian    from anon, authenticated;
revoke all on sigap_vanguard_roleplay_tanda    from anon, authenticated;

notify pgrst, 'reload schema';

-- Cek cepat (harus 4):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_vanguard_roleplay','sigap_vanguard_roleplay_langkah','sigap_vanguard_roleplay_isian','sigap_vanguard_roleplay_tanda');
