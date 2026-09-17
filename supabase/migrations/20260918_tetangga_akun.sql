-- Login PERSONAL utk tab baru "Identifikasi Tetangga/Lainnya" -- PERSIS
-- pola tabel petugas_penyisiran_akun (nama+tanggal lahir), TABEL SENDIRI
-- lagi (bukan ppl_akun maupun petugas_penyisiran_akun) krn sumber
-- informasinya beda: di sini adalah tetangga/pihak lain yang mengetahui
-- keluarga tsb, bukan PPL mantan pendata atau petugas penyisiran resmi.
--
-- Sama spt petugas_penyisiran_akun: TIDAK ada tabel alokasi wilayah --
-- filter kartu manual lewat Kecamatan/Nagari/Sub SLS.
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini
-- cuma catatan riwayat migrasi di repo. SEED DATA (nama, tanggal lahir,
-- no HP) SENGAJA TIDAK disertakan di sini (data pribadi) -- didaftarkan
-- lewat file terpisah yang dipegang pengguna.

create table if not exists tetangga_akun (
  id bigserial primary key,
  nama text not null,
  nama_norm text generated always as (upper(regexp_replace(btrim(nama), '\s+', ' ', 'g'))) stored,
  tanggal_lahir date, -- NULL utk yang tanggal lahirnya belum tercatat (belum bisa login)
  no_hp text,
  keterangan text, -- mis. hubungan dgn keluarga/asal informasi, opsional
  created_at timestamptz not null default now(),
  unique (nama_norm)
);

alter table tetangga_akun enable row level security;
-- Tidak ada policy publik -- semua akses lewat API route Next.js yang
-- pakai SUPABASE_SERVICE_ROLE_KEY (pola yang sama dgn ppl_akun &
-- petugas_penyisiran_akun).

-- Pembekuan (read-only) kolom identifikasi_ppl di tab Penyisiran Usaha --
-- role "penyisiran"/"identifikasi" (PIN bersama) DICABUT dari daftar role
-- yang diizinkan PATCH /api/penyisiran/identifikasi (lihat file route
-- tsb) -- satu-satunya cara mengubah identifikasi_ppl sekarang adalah
-- lewat salah satu dari TIGA tab Identifikasi personal (PPL/Jorong/
-- Tetangga). Tidak ada perubahan skema utk ini (hanya perubahan kode),
-- dicatat di sini krn satu paket permintaan dgn tabel tetangga_akun.
