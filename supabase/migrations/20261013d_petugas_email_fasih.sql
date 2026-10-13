-- 13 Okt 2026 -- Email akun FASIH per petugas untuk templat upload Pengawas-Pencacah. Sudah diterapkan ke Supabase; berkas ini = salinan untuk repo.
-- Diutamakan di atas email data mitra (bencana_mitra.email); diisi admin dari layar Permintaan daftar KK. Rini Nofsiska Sari (PPL, petugas 466) diisi atas permintaan user.
alter table public.bencana_petugas add column if not exists email_fasih text;
alter table public.bencana_petugas drop constraint if exists bencana_petugas_email_fasih_format;
alter table public.bencana_petugas add constraint bencana_petugas_email_fasih_format check (email_fasih is null or (char_length(email_fasih) <= 120 and email_fasih ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
comment on column public.bencana_petugas.email_fasih is 'Email akun FASIH petugas (dipakai templat upload Pengawas-Pencacah). Diutamakan di atas email data mitra; diisi admin.';
update public.bencana_petugas set email_fasih = 'rininofsiska4@gmail.com' where id = 466 and nama ilike 'Rini Nofsiska%' and coalesce(email_fasih,'') = '';
