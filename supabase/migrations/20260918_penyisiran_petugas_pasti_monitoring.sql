-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini cuma
-- catatan riwayat migrasi di repo.
--
-- (1) petugas_penyisiran_akun.aktif -- fitur "Kelola Petugas Penyisiran"
--     (default HIDE) di tab Monitoring Petugas Penyisiran, utk
--     mengaktifkan/menonaktifkan akun tanpa menghapus riwayat kunjungan/
--     identifikasi yang sudah tercatat atas nama petugas itu.
-- (2) petugas_penyisiran_akun.lat/lng -- lokasi RUMAH petugas, diisi
--     SENDIRI lewat tombol "Tetapkan Lokasi Rumah Saya" (Geolocation API
--     browser) di tab Penyisiran Usaha -- dipakai skor prioritas berbasis
--     jarak (skor turun kalau lokasi sampel jauh dari rumah petugas yang
--     sedang login).
-- (3) penyisiran_usaha.prioritas_pasti -- tombol "Pasti" di tab Penyisiran
--     Usaha: kalau ditandai, skor prioritas dipaksa maksimal apa pun hasil
--     hitungan otomatisnya.
-- (4) penyisiran_usaha.identifikasi_ppl_role -- role yang MENGISI
--     identifikasi_ppl paling akhir (identifikasi_ppl/identifikasi_jorong/
--     identifikasi_tetangga). Perlu disimpan terpisah dari
--     identifikasi_ppl_oleh (nama) krn nama yg sama bisa terdaftar di lebih
--     dari satu tabel akun (mis. satu orang terdaftar di
--     petugas_penyisiran_akun MAUPUN tetangga_akun) -- nama saja tidak
--     cukup utk membedakan lewat tab mana identifikasi itu masuk. Dipakai
--     tab Monitoring Petugas Penyisiran utk memisahkan hitungan
--     "diidentifikasi lewat Jorong" vs "lewat Tetangga/Lainnya" per orang.
-- (5) penyisiran_usaha.penyisiran_oleh_id/penyisiran_oleh -- siapa yang
--     terakhir menyimpan checklist di tab Penyisiran Usaha (dipilih lewat
--     dropdown "Nama Anda", dicocokkan ke petugas_penyisiran_akun) -- dipakai
--     hitungan "Jumlah Dikunjungi"/"Jumlah Didata" per petugas di tab
--     Monitoring. Tab Penyisiran Usaha TETAP dikunci PIN bersama (role
--     "penyisiran", TIDAK diubah jadi login personal) -- dropdown "Nama
--     Anda" ini sekadar label atribusi biasa yang dikirim sekali per
--     checklist yang disimpan, bukan token/sesi baru.
--
-- Definisi "Jumlah Dikunjungi" vs "Jumlah Didata" di RPC di bawah:
--  - Dikunjungi = status_kunjungan sudah bukan 'belum' (ada hasil kunjungan
--    apa pun -- ditemukan / tidak ditemukan / tidak bisa ditemui).
--  - Didata = subset dari itu yang status_kunjungan = 'ditemukan' (usaha
--    ditemukan & datanya sempat dicatat).

alter table petugas_penyisiran_akun
  add column if not exists aktif boolean not null default true,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table penyisiran_usaha
  add column if not exists prioritas_pasti boolean not null default false,
  add column if not exists identifikasi_ppl_role text,
  add column if not exists penyisiran_oleh_id bigint,
  add column if not exists penyisiran_oleh text;

create index if not exists idx_penyisiran_usaha_identifikasi_ppl_oleh
  on penyisiran_usaha(identifikasi_ppl_oleh);
create index if not exists idx_penyisiran_usaha_penyisiran_oleh_id
  on penyisiran_usaha(penyisiran_oleh_id);

create or replace function penyisiran_monitoring_petugas()
returns table (
  id bigint,
  nama text,
  aktif boolean,
  jumlah_identifikasi_jorong bigint,
  jumlah_identifikasi_tetangga bigint,
  jumlah_dikunjungi bigint,
  jumlah_didata bigint
)
language sql
stable
as $$
  select
    pa.id,
    pa.nama,
    pa.aktif,
    coalesce((
      select count(*) from penyisiran_usaha pu
      where pu.identifikasi_ppl_oleh = pa.nama
        and pu.identifikasi_ppl_role = 'identifikasi_jorong'
        and pu.identifikasi_ppl <> 'belum'
    ), 0) as jumlah_identifikasi_jorong,
    coalesce((
      select count(*) from penyisiran_usaha pu
      where pu.identifikasi_ppl_oleh = pa.nama
        and pu.identifikasi_ppl_role = 'identifikasi_tetangga'
        and pu.identifikasi_ppl <> 'belum'
    ), 0) as jumlah_identifikasi_tetangga,
    coalesce((
      select count(*) from penyisiran_usaha pu
      where pu.penyisiran_oleh_id = pa.id
        and pu.status_kunjungan <> 'belum'
    ), 0) as jumlah_dikunjungi,
    coalesce((
      select count(*) from penyisiran_usaha pu
      where pu.penyisiran_oleh_id = pa.id
        and pu.status_kunjungan = 'ditemukan'
    ), 0) as jumlah_didata
  from petugas_penyisiran_akun pa
  order by pa.nama;
$$;

-- SEED DATA (nama, tanggal lahir) roster 74 orang SENGAJA TIDAK disertakan
-- di sini (data pribadi) -- sudah didaftarkan langsung ke petugas_penyisiran_akun
-- & tetangga_akun lewat MCP Supabase (upsert berdasar nama_norm, idempoten).
