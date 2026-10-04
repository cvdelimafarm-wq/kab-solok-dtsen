-- (4 Okt 2026) Kolom penanda petugas yg sudah masuk grup WA. SUDAH dijalankan di Supabase (nlwkpakyfprugqwklxiu).
alter table public.bencana_undangan add column if not exists bergabung_grup_wa_at timestamptz;
comment on column public.bencana_undangan.bergabung_grup_wa_at is 'Waktu petugas tercatat sudah masuk grup WA (diisi admin dari daftar anggota grup; NULL = belum/belum diketahui)';
