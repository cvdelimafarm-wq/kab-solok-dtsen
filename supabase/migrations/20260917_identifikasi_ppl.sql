-- Kolom "Identifikasi PPL (Mantan Pendata)": seingat PPL yang dulu
-- mendata SE2026 di wilayah ini, apakah keluarga tsb punya usaha atau
-- tidak (Ada / Tidak Ada / Ragu). Diisi lewat tab baru "Identifikasi PPL"
-- yang dibagikan ke PPL dgn PIN terpisah (lihat lib/penyisiranAuth.ts).
-- Sudah diterapkan langsung ke database lewat MCP Supabase -- file ini
-- cuma catatan riwayat migrasi di repo.

alter table penyisiran_usaha
  add column if not exists identifikasi_ppl text not null default 'belum',
  add column if not exists identifikasi_ppl_at timestamptz;

alter table penyisiran_usaha
  drop constraint if exists penyisiran_usaha_identifikasi_ppl_check;

alter table penyisiran_usaha
  add constraint penyisiran_usaha_identifikasi_ppl_check
  check (identifikasi_ppl in ('belum','ada','tidak_ada','ragu'));
