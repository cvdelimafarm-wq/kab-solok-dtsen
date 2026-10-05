-- (5 Okt 2026) Jalankan di Supabase SQL Editor. Tabel & fungsi sudah dibuat;
-- tinggal memasang 2 trigger (lewat MCP selalu timeout karena menunggu lock).
drop trigger if exists bencana_notif_alokasi on public.bencana_alokasi_subsls;
create trigger bencana_notif_alokasi after insert or delete or update of ppl_id on public.bencana_alokasi_subsls
  for each row execute function public.bencana_trg_notif_alokasi();

drop trigger if exists bencana_notif_tim on public.bencana_petugas;
create trigger bencana_notif_tim after update of atasan_id on public.bencana_petugas
  for each row execute function public.bencana_trg_notif_tim();

-- Cek: harus muncul 2 baris
select tgname, tgrelid::regclass from pg_trigger where tgname like 'bencana_notif%';
