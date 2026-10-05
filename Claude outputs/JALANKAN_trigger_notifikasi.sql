-- (5 Okt 2026) JALANKAN di Supabase SQL Editor (sekali). Memasang 6 trigger plotting dua lapis + notifikasi.
-- Tabel, kolom pml_id, fungsi & RPC SUDAH terpasang; lewat koneksi Claude pembuatan trigger selalu timeout.
-- Menggantikan file JALANKAN_trigger_notifikasi.sql versi sebelumnya.

drop trigger if exists bencana_alokasi_isi_pml on public.bencana_alokasi_subsls;
create trigger bencana_alokasi_isi_pml before insert or update of ppl_id, pml_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_alokasi_isi_pml();

drop trigger if exists bencana_notif_alokasi on public.bencana_alokasi_subsls;
create trigger bencana_notif_alokasi after insert or delete or update of ppl_id, pml_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_alokasi();

drop trigger if exists bencana_ppl_ganti_tim on public.bencana_petugas;
create trigger bencana_ppl_ganti_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_ppl_ganti_tim();

drop trigger if exists bencana_notif_tim on public.bencana_petugas;
create trigger bencana_notif_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_notif_tim();

drop trigger if exists bencana_ppl_menolak on public.bencana_petugas;
create trigger bencana_ppl_menolak after update of status_kontak_pendaftaran_bencana on public.bencana_petugas
  for each row execute function public.bencana_trg_ppl_menolak();

drop trigger if exists bencana_notif_mode on public.bencana_alokasi_subsls;
create trigger bencana_notif_mode after update of mode_kerja on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_mode();

-- Aturan lama "menolak -> keluar tim" (20261005b) diganti trigger (c) di atas.
drop trigger if exists bencana_menolak_petugas on public.bencana_petugas;
drop trigger if exists bencana_menolak_alokasi on public.bencana_alokasi_subsls;
drop function if exists public.bencana_trg_menolak_alokasi();
drop function if exists public.bencana_trg_menolak_petugas();
drop function if exists public.bencana_keluarkan_jika_menolak(bigint);

-- Cek: harus muncul 6 baris
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal and tgrelid in ('bencana_alokasi_subsls'::regclass, 'bencana_petugas'::regclass);
