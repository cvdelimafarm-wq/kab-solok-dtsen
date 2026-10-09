-- (10 Okt 2026) Akun super: boleh "masuk sebagai" akun lain (uji tampilan PPL/PML) -- permintaan user:
-- "akun M. Iqbal Hadi adalah akun super, ketika masuk menggunakan akun ini ada dropdown tampilkan sebagai siapa".
-- Penanda di database (bukan kode) supaya mudah dicabut/ditambah. Hanya akun 354 (M. Iqbal Hadi, SST.).
-- (sudah diterapkan ke database lewat MCP; berkas ini untuk arsip)
alter table public.sigap_akun add column if not exists super boolean not null default false;
update public.sigap_akun set super = true where id = 354;
-- Cabut: update public.sigap_akun set super = false where id = 354;
