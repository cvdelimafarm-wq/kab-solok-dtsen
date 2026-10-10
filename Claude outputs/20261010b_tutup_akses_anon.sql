-- (10 Okt 2026) TUTUP AKSES ANON -- temuan evaluasi skema Portal BPS (P0).
-- Masalah: 20 tabel di schema public tanpa RLS, sehingga siapa pun yang memegang anon/publishable key
-- (ada di bundle browser & .env.example) bisa SELECT/UPDATE/DELETE langsung lewat REST, termasuk
-- bencana_mitra (NIK, tanggal lahir, no HP, koordinat rumah) dan bencana_petugas. Juga 24 fungsi
-- SECURITY DEFINER bisa dipanggil anon lewat /rest/v1/rpc/..., satu di antaranya mengubah data
-- (bencana_keluarkan_jika_menolak).
--
-- Kenapa aman untuk aplikasi: semua akses ke tabel/fungsi ini lewat route API dengan service role
-- (diperiksa 10 Okt 2026: tidak ada komponen klien yang memakai lib/supabase/client utk tabel bencana_*
-- atau penyisiran_rencana_besok_kirim; skrip hitung-jarak-rute.mjs juga memakai service role).
-- Service role melewati RLS dan punya grant eksplisit pada fungsi, jadi tetap jalan.
-- Trigger tetap berjalan: hak EXECUTE fungsi trigger tidak diperiksa saat trigger dipicu.
-- Tidak ada DROP/DELETE. Aman dijalankan ulang.

set statement_timeout = '60s';
set lock_timeout = '10s';

-- 1. Aktifkan RLS (tanpa policy = anon & authenticated tertutup; service role tetap bisa)
alter table public.bencana_alokasi_subsls                   enable row level security;
alter table public.bencana_identifikasi_jorong              enable row level security;
alter table public.bencana_identifikasi_nagari_gate         enable row level security;
alter table public.bencana_kk_subsls                        enable row level security;
alter table public.bencana_kk_subsls_override               enable row level security;
alter table public.bencana_kk_terdampak_verifikasi_jorong   enable row level security;
alter table public.bencana_mitra                            enable row level security;
alter table public.bencana_pegawai_magang                   enable row level security;
alter table public.bencana_petugas                          enable row level security;
alter table public.bencana_petugas_kegiatan_lain            enable row level security;
alter table public.bencana_sampel_subsls                    enable row level security;
alter table public.bencana_tawaran_menginap                 enable row level security;
alter table public.bencana_tawaran_menginap_kandidat        enable row level security;
alter table public.bencana_wilayah                          enable row level security;
alter table public.penyisiran_rencana_besok_kirim           enable row level security;
-- tabel cadangan 9 Okt (sementara sebelum dipindah ke schema arsip)
alter table public.bencana_alokasi_subsls_baru_20261009     enable row level security;
alter table public.bencana_alokasi_subsls_cad_20261009      enable row level security;
alter table public.bencana_alokasi_subsls_cad_dahlia_20261009 enable row level security;
alter table public.bencana_atasan_baru_20261009             enable row level security;
alter table public.bencana_petugas_atasan_cad_20261009      enable row level security;

-- 2. Fungsi SECURITY DEFINER: hanya untuk server (service role)
revoke execute on function public.bencana_daftar_calon_sampel() from public, anon, authenticated;
revoke execute on function public.bencana_kebutuhan_petugas(hari_kerja integer) from public, anon, authenticated;
revoke execute on function public.bencana_keluarkan_jika_menolak(p_id bigint) from public, anon, authenticated;
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

-- Cek sesudah: harus 0 baris
--   select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and relkind='r' and not relrowsecurity;
-- Uji cepat setelah deploy: buka /bencana (plotting, papan tim), tautan konfirmasi PPL, /penyisiran monitoring terpadu.
