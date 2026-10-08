-- (8 Okt 2026) SIGAP > Pelatihan > Presensi: jumlah presensi per hari (1-3 sesi) dengan jam buka-tutup tiap sesi.
-- Aturan sesi disimpan di pengaturan kegiatan (presensi_sesi, jsonb: [{"nama","buka":"HH:MM","tutup":"HH:MM"}], jam WIB);
-- berlaku di setiap hari kegiatan (tanggal_mulai s.d. tanggal_selesai). NULL = bawaan: 1 sesi, jam dari presensi_buka_at/tutup_at.
-- Catatan presensi kini per (tanggal, sesi_no); data lama otomatis menjadi sesi 1 pada tanggal presensinya.
alter table public.sigap_pelatihan_pengaturan add column if not exists presensi_sesi jsonb;

alter table public.sigap_pelatihan_presensi add column if not exists tanggal date default ((now() at time zone 'Asia/Jakarta')::date);
alter table public.sigap_pelatihan_presensi add column if not exists sesi_no smallint not null default 1;
update public.sigap_pelatihan_presensi set tanggal = (at at time zone 'Asia/Jakarta')::date where tanggal is distinct from (at at time zone 'Asia/Jakarta')::date;

-- satu presensi diterima per peserta per sesi per hari (sebelumnya: satu per peserta)
create unique index if not exists sigap_pelatihan_presensi_unik2 on public.sigap_pelatihan_presensi (kegiatan_id, akun_id, tanggal, sesi_no) where diterima;
-- Hapus indeks lama (satu per peserta). Jalankan di SQL Editor Supabase (alat MCP macet pada perintah DROP):
--   drop index if exists public.sigap_pelatihan_presensi_unik;
--   alter index public.sigap_pelatihan_presensi_unik2 rename to sigap_pelatihan_presensi_unik;
