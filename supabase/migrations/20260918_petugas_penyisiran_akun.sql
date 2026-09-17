-- Login PERSONAL "petugas penyisiran" (nama + tanggal lahir) utk tab baru
-- "Identifikasi Jorong" -- TABEL TERPISAH dari ppl_akun (PPL/mantan
-- pendata SE2026), krn "petugas penyisiran" adalah kelompok orang yang
-- BEDA (staf/mitra yg menyisir lapangan sekarang), walau ada irisan
-- (sebagian PPL lama ikut jadi petugas penyisiran juga -- boleh, dua
-- tabel independen, orang yg sama tercatat di keduanya tanpa konflik).
--
-- Beda dari ppl_akun: TIDAK ada tabel alokasi wilayah (ppl_alokasi_idsls)
-- utk petugas penyisiran -- mereka bebas pilih Kecamatan/Nagari/Sub SLS
-- mana saja lewat filter manual (spt tab Penyisiran Usaha), bukan
-- dibatasi otomatis ke wilayah tertentu.
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini
-- cuma catatan riwayat migrasi di repo. SEED DATA (nama, tanggal lahir,
-- no HP) SENGAJA TIDAK disertakan di sini (data pribadi) -- didaftarkan
-- lewat file terpisah yang dipegang pengguna.

create table if not exists petugas_penyisiran_akun (
  id bigserial primary key,
  nama text not null,
  nama_norm text generated always as (upper(regexp_replace(btrim(nama), '\s+', ' ', 'g'))) stored,
  tanggal_lahir date, -- NULL utk petugas yang tanggal lahirnya belum tercatat (belum bisa login)
  no_hp text,
  keterangan text, -- mis. asal kecamatan/tim, opsional
  created_at timestamptz not null default now(),
  unique (nama_norm)
);

alter table petugas_penyisiran_akun enable row level security;
-- Tidak ada policy publik -- semua akses lewat API route Next.js yang
-- pakai SUPABASE_SERVICE_ROLE_KEY (pola yang sama dgn ppl_akun).

-- Jejak siapa yang mengisi/mengubah "Identifikasi PPL" (dipakai bersama
-- oleh tab "Identifikasi PPL" MAUPUN "Identifikasi Jorong" yang baru --
-- keduanya menulis ke kolom identifikasi_ppl yang sama) -- supaya bisa
-- ditelusuri siapa yang menjawab, sesuai permintaan tab Identifikasi
-- Jorong ("akan ditandai siapa yg edit/identifikasi").
alter table penyisiran_usaha
  add column if not exists identifikasi_ppl_oleh text;
