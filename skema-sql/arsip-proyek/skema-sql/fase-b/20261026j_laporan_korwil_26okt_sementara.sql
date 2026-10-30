-- 20261026j_laporan_korwil_26okt_sementara.sql
-- Tujuan: laporan harian KORWIL tanggal 26 Okt 2026 tampil "ada" (lengkap) tanpa diisi petugas.
-- Laporan asli akan diunggah Pak Iqbal kemudian lewat SQL/cara lain, jadi baris di bawah HANYA PENANDA SEMENTARA.
--
-- Cakupan: 4 penugasan korwil kegiatan 1 (Pendataan Pascabencana) yang memilih 26 Okt tetapi belum punya laporan:
--   288 Deswaty, 289 Nurafiza Thamrin, 294 Dina Marizka, 297 Kafsal.
-- Akun Iqbal (penugasan 298) sudah punya laporan sendiri -> tidak disentuh.
--
-- Aman dijalankan ulang (tidak menimpa laporan yang sudah ada). Penanda dikenali dari kolom kendala berawalan 'MENYUSUL:'.
-- Cara mengganti dengan laporan asli: lihat BAGIAN 3 di bawah (UPDATE baris yang sama, jangan INSERT baru -> ada UNIQUE penugasan/tanggal).
-- CATATAN: foto TIDAK dibuat. Hari lengkap = laporan + 5 foto; Nurafiza saat ini baru 4 dari 5 slot foto.

-- ===== BAGIAN 1. Isi penanda sementara =====
insert into public.sigap_realisasi (kegiatan_id, petugas_id, tanggal, lokasi, jumlah_realisasi, kendala, penugasan_id)
select p.kegiatan_id, null, date '2026-10-26', '[]'::jsonb, 0,
       'MENYUSUL: laporan harian korwil 26 Okt 2026 diunggah admin; penanda sementara agar status tidak kosong.',
       p.id
from public.sigap_penugasan p
join public.sigap_hari_kerja hk on hk.penugasan_id = p.id and hk.tanggal = date '2026-10-26' and hk.batal_at is null
where p.id in (288, 289, 294, 297)
  and p.peran = 'korwil'
  and p.kegiatan_id = 1
  and not exists (
    select 1 from public.sigap_realisasi r
    where r.penugasan_id = p.id and r.tanggal = date '2026-10-26' and r.nonaktif_at is null
  );

-- ===== BAGIAN 2. Pemeriksaan (jalankan sebagai query terpisah setelah bagian 1) =====
-- Harapan: 4 baris penanda + akun Iqbal (298) = 5 korwil punya laporan 26 Okt.
-- select a.nama, p.id penugasan, r.id laporan, left(r.kendala, 40) kendala,
--        (select count(distinct slot) from public.sigap_dokumentasi d
--          where d.penugasan_id = p.id and d.tanggal = date '2026-10-26' and d.nonaktif_at is null) slot_foto
-- from public.sigap_penugasan p
-- join public.sigap_akun a on a.id = p.akun_id
-- left join public.sigap_realisasi r on r.penugasan_id = p.id and r.tanggal = date '2026-10-26' and r.nonaktif_at is null
-- where p.id in (288, 289, 294, 297, 298) order by p.id;

-- ===== BAGIAN 3. Nanti: ganti penanda dengan laporan asli (contoh; isi nilai sebenarnya) =====
-- update public.sigap_realisasi
--    set lokasi = '[{"jorong":"...","nagari":"...","kecamatan":"...","idsubsls":null}]'::jsonb,
--        jumlah_realisasi = 0,          -- isi angka sebenarnya
--        kendala = 'isi uraian sebenarnya',
--        diperbarui_at = now()
--  where penugasan_id = 288 and tanggal = date '2026-10-26' and kendala like 'MENYUSUL:%';
-- Untuk menarik kembali penanda tanpa mengganti isi:
-- delete from public.sigap_realisasi where tanggal = date '2026-10-26' and penugasan_id in (288, 289, 294, 297) and kendala like 'MENYUSUL:%';
