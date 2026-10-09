-- (9 Okt 2026) Presensi rapat Zoom: akun tambahan di luar daftar PPL/PML (mis. admin/panitia) -- permintaan user: "tambahkan akses ke Iqbal".
alter table public.sigap_rapat add column if not exists akun_tambahan bigint[] not null default '{}';
-- rapat awal: tambahkan akun M. Iqbal Hadi (id 354)
update public.sigap_rapat set akun_tambahan = '{354}', diubah_at = now() where id = 1;
