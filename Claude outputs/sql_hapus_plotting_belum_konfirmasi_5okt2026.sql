-- ============================================================
-- DTSEN KANAL - Pendataan Bencana
-- Hapus plotting petugas yang BELUM KONFIRMASI + beri catatan
-- Jalankan sendiri di Supabase SQL Editor, LANGKAH demi LANGKAH.
-- Tanggal: 5 Okt 2026
-- ============================================================
-- Kelompok A (default, disarankan): pendaftaran_bencana_konfirmasi = false
--   PPL: 413 Annisa Suryani, 145 Asmedi Surya, 22 Elvira Okzayenti,
--        390 Fenny Anda Listi, 394 Mira Apridayanti, 31 Nadia Wati,
--        400 Salsa Billa Duwita Putri, 401 Sri Hati Putri, 334 Velmarniati
--   PML: 441 Rifa Amelia (status kontak: menolak)
--
-- Kelompok B (OPSIONAL, hati-hati): sudah konfirmasi tapi belum pernah
--   masuk portal (bencana_undangan.terakhir_masuk_at kosong):
--   310 Alhammah Alam 'Gina, 27 muhamad iqbal, 459 Hariston (PML, 5 alokasi),
--   458 Ilham (PML, 25 alokasi), 440 Reza Sativa (PML, 2 alokasi)
--   -> TIDAK dimasukkan ke langkah di bawah. Jangan ikut dihapus kecuali
--      Bapak memang memutuskan begitu (PML 458 memegang 25 alokasi).
--
-- Catatan: semua alokasi kelompok A berstatus terkunci = true.
-- ============================================================


-- ---------- LANGKAH 1: PRATINJAU (hanya membaca) ----------
select a.id, a.idsubsls, a.ppl_id, p.nama as ppl, a.pml_id, a.terkunci, a.mode_kerja
from bencana_alokasi_subsls a
left join bencana_petugas p on p.id = a.ppl_id
where a.ppl_id in (413,145,22,390,394,31,400,401,334)
   or a.pml_id = 441
order by a.ppl_id, a.idsubsls;
-- Harapan: 15 baris dengan ppl_id kelompok A + 5 baris dengan pml_id = 441
-- (baris bisa tumpang tindih bila satu baris memuat keduanya).


-- ---------- LANGKAH 2: CADANGAN (wajib sebelum langkah 3) ----------
create table bencana_alokasi_subsls_cad_20261005 as
select * from bencana_alokasi_subsls;

select count(*) as cadangan, (select count(*) from bencana_alokasi_subsls) as asli
from bencana_alokasi_subsls_cad_20261005;   -- kedua angka harus sama (215)


-- ---------- LANGKAH 3: HAPUS PLOTTING (satu transaksi) ----------
begin;

-- 3a. PPL kelompok A: hapus baris alokasinya
delete from bencana_alokasi_subsls
where ppl_id in (413,145,22,390,394,31,400,401,334);

-- 3b. PML Rifa (441): kosongkan kolom PML saja, baris PPL tetap utuh
update bencana_alokasi_subsls
set pml_id = null
where pml_id = 441;

-- cek sebelum commit: harus 0 dan 0
select
  (select count(*) from bencana_alokasi_subsls
    where ppl_id in (413,145,22,390,394,31,400,401,334)) as sisa_ppl,
  (select count(*) from bencana_alokasi_subsls where pml_id = 441) as sisa_pml;

commit;   -- jika angka tidak 0/0 ganti dengan: rollback;


-- ---------- LANGKAH 4: CATATAN "JANGAN IKUT SIMULASI/PENUGASAN" ----------
-- Disimpan di kolom catatan_penolakan_pendaftaran_bencana (ditambahkan, bukan menimpa).
update bencana_petugas
set catatan_penolakan_pendaftaran_bencana =
      trim(both ' ' from coalesce(catatan_penolakan_pendaftaran_bencana, '')
      || ' [5 Okt 2026] Belum konfirmasi pendaftaran bencana; plotting dihapus. JANGAN diikutkan lagi di simulasi/penugasan.')
where id in (413,145,22,390,394,31,400,401,334,441);

-- OPSIONAL: bila simulasi/penugasan mengecualikan petugas lewat aktif = false,
-- jalankan baris ini juga (belum saya pastikan kode simulasi membaca kolom ini):
-- update bencana_petugas set aktif = false
-- where id in (413,145,22,390,394,31,400,401,334,441);


-- ---------- LANGKAH 5: VERIFIKASI ----------
select id, nama, peran, aktif, pendaftaran_bencana_konfirmasi, catatan_penolakan_pendaftaran_bencana
from bencana_petugas
where id in (413,145,22,390,394,31,400,401,334,441)
order by nama;

select count(*) as total_alokasi_sekarang from bencana_alokasi_subsls;  -- harapan 215 - 15 = 200 (bila 15 baris PPL tidak tumpang tindih dgn PML)
