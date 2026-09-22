-- Tabel penyisiran_fasih_assignment: simpan PERSISTEN data assignment yang
-- sudah berhasil diproses di aplikasi eksternal "FASIH" -- permintaan
-- lanjutan user atas fitur "Monitoring Assignment FASIH" (lihat migrasi
-- 20260922l_tambah_lookup_nama_wilayah_subsls.sql & komentar panjang di
-- app/api/penyisiran/alokasi/fasih-compare/route.ts): "kalau upload
-- beberapa file, data assignment yang SAMA (SUBSLS yang sama) ditimpa oleh
-- yang TERBARU" -- makanya data FASIH SEKARANG disimpan permanen di sini
-- (BUKAN lagi cuma dihitung sekali-jalan per-request spt versi awal fitur
-- ini), di-UPSERT (bukan insert baru/duplikat) satu baris per kombinasi
-- kode wilayah tiap kali pengelola upload file baru lewat endpoint yang
-- sama (POST /api/penyisiran/alokasi/fasih-compare). Dengan begini,
-- perbandingan (termasuk warning banner khusus akun M. Iqbal Hadi, lihat
-- FasihMismatchWarningBar di app/penyisiran/page.tsx) tetap bisa dihitung
-- ULANG kapan pun (GET endpoint yang sama) TANPA perlu upload ulang --
-- selalu dibandingkan terhadap data "sekarang" di penyisiran_alokasi_pilihan
-- (yang juga selalu dibaca live), jadi warning otomatis hilang begitu
-- salah satu sisi (upload FASIH baru ATAU perubahan tag "📋 Identifikasi
-- Wilayah Sampel SLS" di sistem) membuat keduanya kembali cocok.
create table if not exists public.penyisiran_fasih_assignment (
  kec_kode text not null,
  nagari_kode text not null,
  sls_kode text not null,
  subsls_kode text not null,
  email_pencacah text not null default '',
  email_pengawas text not null default '',
  sumber_file text,
  diupload_oleh text,
  diupload_at timestamptz not null default now(),
  primary key (kec_kode, nagari_kode, sls_kode, subsls_kode)
);

-- RLS diaktifkan TANPA policy apa pun (pola SAMA dgn tabel lain di app ini
-- yg cuma disentuh server-side, mis. petugas_target) -- akses SATU-SATUNYA
-- lewat SUPABASE_SERVICE_ROLE_KEY di endpoint API (yang sudah menggerbang
-- ke pengelola via bolehAksesManajemenTarget), tidak pernah langsung dari
-- browser/anon key.
alter table public.penyisiran_fasih_assignment enable row level security;
