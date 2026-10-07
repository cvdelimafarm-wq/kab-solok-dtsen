-- (7 Okt 2026) SIGAP > Pelatihan > Kuis Live (gaya Kahoot): bank kuis, ruang permainan, peserta, jawaban.
-- Semua akses lewat API server (service role); RLS aktif tanpa kebijakan = tertutup bagi klien langsung.
--  sigap_kuis          : satu kuis (judul) milik kegiatan pelatihan
--  sigap_kuis_soal     : soal kuis (opsi A-E, kunci, detik = waktu menjawab per soal)
--  sigap_kuis_ruang    : satu sesi permainan. status: lobi -> soal -> jawaban -> (soal ...) -> selesai. Hanya SATU ruang aktif per kegiatan.
--  sigap_kuis_peserta  : peserta yang bergabung ke ruang
--  sigap_kuis_jawaban  : jawaban + poin per peserta per soal (poin gaya Kahoot: benar 500-1000 menurut kecepatan)

create table if not exists public.sigap_kuis (
  id          bigint generated always as identity primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id) on delete cascade,
  judul       text   not null check (length(btrim(judul)) between 1 and 200),
  aktif       boolean not null default true,
  dibuat_oleh bigint references public.sigap_akun(id) on delete set null,
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now()
);
create index if not exists sigap_kuis_kegiatan_idx on public.sigap_kuis (kegiatan_id);

create table if not exists public.sigap_kuis_soal (
  kuis_id bigint  not null references public.sigap_kuis(id) on delete cascade,
  nomor   integer not null check (nomor > 0),
  teks    text    not null,
  opsi    jsonb   not null,
  kunci   text    not null,
  detik   integer not null default 20 check (detik between 5 and 120),
  primary key (kuis_id, nomor)
);

create table if not exists public.sigap_kuis_ruang (
  id             bigint generated always as identity primary key,
  kuis_id        bigint not null references public.sigap_kuis(id) on delete cascade,
  kegiatan_id    bigint not null references public.sigap_kegiatan(id) on delete cascade,
  status         text   not null default 'lobi' check (status in ('lobi','soal','jawaban','selesai')),
  soal_ke        integer not null default 0,
  soal_mulai_at  timestamptz,
  soal_batas_at  timestamptz,
  versi          integer not null default 0,
  dibuka_oleh    bigint references public.sigap_akun(id) on delete set null,
  dibuka_at      timestamptz not null default now(),
  selesai_at     timestamptz
);
create unique index if not exists sigap_kuis_ruang_satu_aktif on public.sigap_kuis_ruang (kegiatan_id) where status <> 'selesai';
create index if not exists sigap_kuis_ruang_kuis_idx on public.sigap_kuis_ruang (kuis_id);

create table if not exists public.sigap_kuis_peserta (
  ruang_id  bigint not null references public.sigap_kuis_ruang(id) on delete cascade,
  akun_id   bigint not null references public.sigap_akun(id) on delete cascade,
  gabung_at timestamptz not null default now(),
  primary key (ruang_id, akun_id)
);
create index if not exists sigap_kuis_peserta_akun_idx on public.sigap_kuis_peserta (akun_id);

create table if not exists public.sigap_kuis_jawaban (
  ruang_id   bigint  not null references public.sigap_kuis_ruang(id) on delete cascade,
  akun_id    bigint  not null references public.sigap_akun(id) on delete cascade,
  nomor      integer not null,
  pilihan    text    not null,
  benar      boolean not null,
  waktu_ms   integer not null check (waktu_ms >= 0),
  poin       integer not null default 0,
  dijawab_at timestamptz not null default now(),
  primary key (ruang_id, akun_id, nomor)
);
create index if not exists sigap_kuis_jawaban_nomor_idx on public.sigap_kuis_jawaban (ruang_id, nomor);

alter table public.sigap_kuis          enable row level security;
alter table public.sigap_kuis_soal     enable row level security;
alter table public.sigap_kuis_ruang    enable row level security;
alter table public.sigap_kuis_peserta  enable row level security;
alter table public.sigap_kuis_jawaban  enable row level security;
