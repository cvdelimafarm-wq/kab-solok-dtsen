-- Penutupan akses anon ke 25 fungsi SECURITY DEFINER dan 2 view (usulan, 22 Okt 2026)
-- STATUS: BELUM DITERAPKAN. Untuk ditinjau dan dijalankan Bapak sendiri.
-- Asal: temuan A1 (review putaran 1) + pemeriksaan basis data 22 Okt 2026.
-- Dampak yang diharapkan: aplikasi tidak terpengaruh karena memakai service_role
-- (EXECUTE service_role tidak disentuh). Dalam log 17-21 Okt tidak ada pemanggilan
-- fungsi/view ini oleh anon atau authenticated.
-- Sebelum menjalankan: (1) ambil cadangan/snapshot Supabase; (2) pastikan tidak ada klien
-- yang memanggil fungsi/view ini dengan kunci anon (mis. dashboard Seruti/DTSEN di browser).

begin;

-- A. 25 fungsi: cabut dari PUBLIC, anon, authenticated (daftar asal: =X, anon=X, authenticated=X, service_role=X)
revoke execute on function public.bencana_daftar_calon_sampel() from public, anon, authenticated;
revoke execute on function public.bencana_kebutuhan_petugas(integer) from public, anon, authenticated;
revoke execute on function public.bencana_keluarkan_jika_menolak(bigint) from public, anon, authenticated;
revoke execute on function public.bencana_kertas_kerja_alokasi() from public, anon, authenticated;
revoke execute on function public.bencana_kertas_kerja_beban() from public, anon, authenticated;
revoke execute on function public.bencana_monitoring_jorong() from public, anon, authenticated;
revoke execute on function public.bencana_monitoring_magang() from public, anon, authenticated;
revoke execute on function public.bencana_monitoring_nagari() from public, anon, authenticated;
revoke execute on function public.bencana_ringkasan_beban_korwil() from public, anon, authenticated;
revoke execute on function public.bencana_ringkasan_beban_pml() from public, anon, authenticated;
revoke execute on function public.bencana_ringkasan_beban_ppl() from public, anon, authenticated;
revoke execute on function public.bencana_skor_beban_subsls() from public, anon, authenticated;
revoke execute on function public.bencana_subsls_centroid() from public, anon, authenticated;
revoke execute on function public.bencana_subsls_titik_jarak() from public, anon, authenticated;
revoke execute on function public.bencana_tolak_permintaan_nonaktif() from public, anon, authenticated;
revoke execute on function public.bencana_trg_alokasi_isi_pml() from public, anon, authenticated;
revoke execute on function public.bencana_trg_menolak_alokasi() from public, anon, authenticated;
revoke execute on function public.bencana_trg_menolak_petugas() from public, anon, authenticated;
revoke execute on function public.bencana_trg_notif_alokasi() from public, anon, authenticated;
revoke execute on function public.bencana_trg_notif_mode() from public, anon, authenticated;
revoke execute on function public.bencana_trg_notif_tim() from public, anon, authenticated;
revoke execute on function public.bencana_trg_ppl_ganti_tim() from public, anon, authenticated;
revoke execute on function public.bencana_trg_ppl_menolak() from public, anon, authenticated;
revoke execute on function public.penyisiran_monitoring_terpadu() from public, anon, authenticated;
revoke execute on function public.spj_matriks_kelengkapan() from public, anon, authenticated;

-- B. 2 view: cabut dari anon (authenticated sengaja dibiarkan dulu; lihat catatan C)
revoke all on public.dashboard_progress from anon;
revoke all on public.seruti_progress from anon;

-- C. (OPSIONAL, jalankan terpisah setelah memastikan tidak ada klien authenticated yang memakainya)
-- revoke all on public.dashboard_progress from authenticated;
-- revoke all on public.seruti_progress from authenticated;
-- alter view public.dashboard_progress set (security_invoker = true);
-- alter view public.seruti_progress set (security_invoker = true);

commit;

-- D. Verifikasi (jalankan sesudah commit). Semua kolom harus false, kecuali service_role = true.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (p.proname like 'bencana\_%' or p.proname in ('penyisiran_monitoring_terpadu','spj_matriks_kelengkapan'))
order by p.proname;

select 'dashboard_progress' as view, has_table_privilege('anon','public.dashboard_progress','SELECT') as anon
union all select 'seruti_progress', has_table_privilege('anon','public.seruti_progress','SELECT');

-- E. ROLLBACK (bila ada klien yang rusak): kembalikan hak seperti semula
-- begin;
-- grant execute on function public.bencana_daftar_calon_sampel() to public, anon, authenticated;
-- grant execute on function public.bencana_kebutuhan_petugas(integer) to public, anon, authenticated;
-- grant execute on function public.bencana_keluarkan_jika_menolak(bigint) to public, anon, authenticated;
-- grant execute on function public.bencana_kertas_kerja_alokasi() to public, anon, authenticated;
-- grant execute on function public.bencana_kertas_kerja_beban() to public, anon, authenticated;
-- grant execute on function public.bencana_monitoring_jorong() to public, anon, authenticated;
-- grant execute on function public.bencana_monitoring_magang() to public, anon, authenticated;
-- grant execute on function public.bencana_monitoring_nagari() to public, anon, authenticated;
-- grant execute on function public.bencana_ringkasan_beban_korwil() to public, anon, authenticated;
-- grant execute on function public.bencana_ringkasan_beban_pml() to public, anon, authenticated;
-- grant execute on function public.bencana_ringkasan_beban_ppl() to public, anon, authenticated;
-- grant execute on function public.bencana_skor_beban_subsls() to public, anon, authenticated;
-- grant execute on function public.bencana_subsls_centroid() to public, anon, authenticated;
-- grant execute on function public.bencana_subsls_titik_jarak() to public, anon, authenticated;
-- grant execute on function public.bencana_tolak_permintaan_nonaktif() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_alokasi_isi_pml() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_menolak_alokasi() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_menolak_petugas() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_notif_alokasi() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_notif_mode() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_notif_tim() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_ppl_ganti_tim() to public, anon, authenticated;
-- grant execute on function public.bencana_trg_ppl_menolak() to public, anon, authenticated;
-- grant execute on function public.penyisiran_monitoring_terpadu() to public, anon, authenticated;
-- grant execute on function public.spj_matriks_kelengkapan() to public, anon, authenticated;
-- grant all on public.dashboard_progress to anon;
-- grant all on public.seruti_progress to anon;
-- commit;

-- CATATAN: fungsi baru di schema public otomatis diberi EXECUTE ke anon/authenticated oleh pengaturan
-- bawaan Supabase. Untuk mencegah kekambuhan, tambahkan uji anon otomatis pada setiap migrasi (temuan P6).
