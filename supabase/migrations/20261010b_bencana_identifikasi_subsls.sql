-- (10 Okt 2026) Lembar Identifikasi SLS untuk PML (tahap Pendataan Pascabencana) -- permintaan user.
-- Satu baris per (PML, Sub SLS): 7 Sub SLS dikerjakan 2 PML (skema keroyokan), jadi kunci = pasangan keduanya.
-- kk_terdampak = TOTAL hasil identifikasi yang diisi sendiri (BUKAN penjumlahan kolom, satu KK bisa kena beberapa jenis dampak).
create table if not exists public.bencana_identifikasi_subsls (
  pml_id            bigint      not null references public.bencana_petugas(id),
  idsubsls          text        not null,
  kk_terdampak      integer     not null check (kk_terdampak >= 0),
  rusak_berat       integer     not null default 0 check (rusak_berat >= 0),
  rusak_sedang      integer     not null default 0 check (rusak_sedang >= 0),
  rusak_ringan      integer     not null default 0 check (rusak_ringan >= 0),
  lahan_tertimbun   integer     not null default 0 check (lahan_tertimbun >= 0),
  kekeringan        integer     not null default 0 check (kekeringan >= 0),
  lainnya           integer     not null default 0 check (lainnya >= 0),
  lainnya_ket       text,
  -- (10 Okt 2026) Sub SLS dinyatakan TIDAK TERDAMPAK (sudah dinilai, hasilnya nol) -- beda dengan belum diisi; permintaan user
  tidak_terdampak   boolean     not null default false,
  aset_usaha        integer     not null default 0 check (aset_usaha >= 0),
  lahan_ternak      integer     not null default 0 check (lahan_ternak >= 0),
  korban            integer     not null default 0 check (korban >= 0),
  catatan           text,
  diisi_oleh_akun   bigint,
  diisi_at          timestamptz not null default now(),
  diperbarui_at     timestamptz not null default now(),
  primary key (pml_id, idsubsls),
  -- tiap jenis dampak tidak boleh melebihi total KK terdampak
  constraint identifikasi_rincian_wajar check (
    rusak_berat <= kk_terdampak and rusak_sedang <= kk_terdampak and rusak_ringan <= kk_terdampak
    and lahan_tertimbun <= kk_terdampak and kekeringan <= kk_terdampak and lainnya <= kk_terdampak
    and aset_usaha <= kk_terdampak and lahan_ternak <= kk_terdampak and korban <= kk_terdampak
  ),
  constraint identifikasi_tidak_terdampak_nol check (
    not tidak_terdampak or (kk_terdampak = 0 and rusak_berat = 0 and rusak_sedang = 0 and rusak_ringan = 0 and lahan_tertimbun = 0
      and kekeringan = 0 and lainnya = 0 and aset_usaha = 0 and lahan_ternak = 0 and korban = 0)
  )
);
-- akses hanya lewat API server (service role); tanpa kebijakan = tertutup untuk anon/authenticated
alter table public.bencana_identifikasi_subsls enable row level security;

-- (10 Okt 2026) Bucket penyimpanan peta (diunggah admin belakangan -- permintaan user). Tanpa tabel: nama berkas = kode wilayah.
--   wa/<10 digit kode desa>.<pdf|png|jpg>   contoh wa/1303040002.pdf   (peta Wilayah Administrasi nagari/desa)
--   sls/<14 digit kode SLS>.<pdf|png|jpg>   contoh sls/13030400020009.pdf  (peta SLS; kode = idsubsls tanpa 2 digit terakhir)
insert into storage.buckets (id, name, public) values ('peta-wilayah', 'peta-wilayah', false) on conflict (id) do nothing;
