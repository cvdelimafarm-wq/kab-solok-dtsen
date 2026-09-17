-- Login PERSONAL PPL (nama + tanggal lahir) utk tab "Identifikasi PPL",
-- menggantikan PIN bersama (PENYISIRAN_IDENTIFIKASI_PIN). Sumber data:
-- sheet "PPL (Login)" dan "Alokasi IDSLS" pada file "Kode Wilayah dan
-- Alokasi IDSLS - Rapi.xlsx" yang sudah dibersihkan & dikonfirmasi
-- bersama pengguna (lihat sheet "Catatan" di file tsb utk metodologi &
-- item terbuka: 2 konflik ID Sub SLS dialokasikan ke >1 nama, 2 ID Sub
-- SLS belum dialokasikan ke PPL manapun).
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase (skema + seed
-- 368 baris ppl_akun + 1080 baris ppl_alokasi_idsls) -- file ini cuma
-- catatan riwayat migrasi di repo; SEED DATA (nama, tanggal lahir, no HP)
-- SENGAJA TIDAK disertakan di sini (data pribadi PPL) -- ada di file
-- Excel yang dipegang pengguna.

create table if not exists ppl_akun (
  id bigserial primary key,
  nama text not null,
  nama_norm text generated always as (upper(regexp_replace(btrim(nama), '\s+', ' ', 'g'))) stored,
  tanggal_lahir date, -- NULL utk PPL yang tanggal lahirnya belum tercatat (belum bisa login)
  no_hp text,
  korwil text,
  pml text,
  catatan text,
  created_at timestamptz not null default now(),
  unique (nama_norm)
);

create table if not exists ppl_alokasi_idsls (
  id bigserial primary key,
  idsubsls text not null unique,
  ppl_id bigint not null references ppl_akun(id) on delete cascade,
  status_pencocokan text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ppl_alokasi_idsls_ppl on ppl_alokasi_idsls(ppl_id);

alter table ppl_akun enable row level security;
alter table ppl_alokasi_idsls enable row level security;
-- Tidak ada policy publik -- semua akses lewat API route Next.js yang
-- pakai SUPABASE_SERVICE_ROLE_KEY (pola yang sama dgn tabel
-- penyisiran_usaha), jadi RLS di sini murni pagar tambahan.

-- Perbaikan data: kolom idsubsls pada penyisiran_usaha ternyata membawa
-- awalan tanda kutip satu di SEMUA baris (artefak ekspor Excel, mis.
-- "'1303050001000101" -- 17 karakter, bukan 16) sehingga tidak pernah
-- cocok dgn idsubsls bersih di ppl_alokasi_idsls. Ditemukan & diperbaiki
-- saat menyambungkan fitur login PPL ini (sebelumnya luput krn kolom ini
-- tidak dipakai utk pencarian/filter apa pun, hanya utk fitur baru ini).
update penyisiran_usaha set idsubsls = ltrim(idsubsls, '''') where idsubsls like '''%';
