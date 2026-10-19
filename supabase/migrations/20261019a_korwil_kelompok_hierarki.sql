-- 20261019a_korwil_kelompok_hierarki.sql
--
-- (19 Okt 2026) Pendataan Pascabencana 2026: akun korwil (kortim) didaftarkan/diaktifkan dan hierarkinya disesuaikan dengan
-- tabel_alokasi_pml (6 kelompok, tiap kelompok 2 korwil + 3 PML). Sumber kebenaran kelompok = tabel bencana_kelompok_tim
-- (sudah terisi persis sama dengan tabel alokasi; 12 kortim + 18 PML), sehingga skrip ini TIDAK mengetik ulang nama.
--
-- DIJALANKAN OLEH USER (SQL Editor Supabase). Satu transaksi: gagal di tengah = tidak ada yang berubah. Idempoten (aman diulang).
-- TIDAK menghapus data apa pun.
--
-- Isi:
--  1. Faisal Siddiq (akun 200) dan Muzahar (akun 410) belum punya baris bencana_petugas -> dibuatkan (organik, korwil) dan ditautkan ke akunnya.
--  2. Peran 'korwil' dipasang pada semua kortim (sebelumnya hanya Adriyanto; yang lain peran kosong).
--  3. Hierarki: PML.atasan_id = korwil URUTAN 1 kelompoknya (pola yang sama dengan bencana_auto_plotting & bencana_ringkasan_beban_korwil).
--     Korwil urutan 2 tetap terhubung lewat bencana_kelompok_tim (kolom atasan_id hanya bisa satu orang).
--  4. Penugasan korwil pada kegiatan 1 (Pendataan Pascabencana) untuk 11 kortim yang belum punya (Adriyanto sudah). Tanpa surat tugas
--     (surat_tugas_id kosong) -- surat tugas dapat ditautkan menyusul.
--
-- Catatan: trigger atasan_hanya_peserta mensyaratkan PML dan atasannya peserta pelatihan (kegiatan 3). Seluruh korwil urutan 1
-- (Adriyanto, Deswaty, Lucia, Riva, Dina, Arini) dan 18 PML memenuhi syarat itu (dicek 19 Okt). Bila tidak, skrip berhenti dengan pesan jelas.

begin;

-- 0. Pemeriksaan awal: data kelompok harus utuh (12 kortim + 18 PML aktif pada kegiatan 1)
do $$
declare
  n_kortim int;
  n_pml int;
begin
  select count(*) into n_kortim from bencana_kelompok_tim where kegiatan_id = 1 and aktif and peran = 'kortim';
  select count(*) into n_pml from bencana_kelompok_tim where kegiatan_id = 1 and aktif and peran = 'pml';
  if n_kortim <> 12 or n_pml <> 18 then
    raise exception 'bencana_kelompok_tim tidak sesuai harapan: % kortim (harus 12), % PML (harus 18). Dibatalkan.', n_kortim, n_pml;
  end if;
end $$;

-- 1. Baris bencana_petugas untuk kortim yang akunnya belum tertaut (saat ini: Faisal #200 dan Muzahar #410)
with baru as (
  insert into bencana_petugas (nama, status_kepegawaian, peran, aktif)
  select a.nama, 'organik', 'korwil', true
    from sigap_akun a
    join bencana_kelompok_tim k on k.akun_id = a.id and k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim'
   where a.aktif and a.petugas_bencana_id is null
  returning id, nama
)
update sigap_akun a
   set petugas_bencana_id = b.id
  from baru b
 where a.nama = b.nama
   and a.petugas_bencana_id is null
   and a.id in (select akun_id from bencana_kelompok_tim where kegiatan_id = 1 and aktif and peran = 'kortim');

-- 2. Peran korwil + aktif untuk seluruh kortim (hanya menyentuh baris organik yang perannya kosong / sudah korwil)
update bencana_petugas p
   set peran = 'korwil', aktif = true
  from bencana_kelompok_tim k
  join sigap_akun a on a.id = k.akun_id
 where k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim'
   and a.petugas_bencana_id = p.id
   and p.status_kepegawaian = 'organik'
   and (p.peran is null or p.peran = 'korwil')
   and (p.peran is distinct from 'korwil' or p.aktif is distinct from true);

-- 3. Hierarki: tiap PML -> korwil urutan 1 pada kelompoknya
update bencana_petugas pml
   set atasan_id = kor.id
  from bencana_kelompok_tim kp
  join sigap_akun ap on ap.id = kp.akun_id
  join bencana_kelompok_tim kk
    on kk.kegiatan_id = kp.kegiatan_id and kk.kelompok = kp.kelompok and kk.peran = 'kortim' and kk.aktif
   and kk.urutan = (select min(z.urutan) from bencana_kelompok_tim z
                     where z.kegiatan_id = kp.kegiatan_id and z.kelompok = kp.kelompok and z.peran = 'kortim' and z.aktif)
  join sigap_akun ak on ak.id = kk.akun_id
  join bencana_petugas kor on kor.id = ak.petugas_bencana_id
 where kp.kegiatan_id = 1 and kp.aktif and kp.peran = 'pml'
   and ap.petugas_bencana_id = pml.id
   and pml.peran = 'pml'
   and pml.atasan_id is distinct from kor.id;

-- 4. Penugasan korwil pada kegiatan 1 (yang sudah ada tidak diubah)
insert into sigap_penugasan (kegiatan_id, akun_id, peran, aktif, sumber)
select 1, k.akun_id, 'korwil', true, 'admin:354 (20261019a korwil kelompok)'
  from bencana_kelompok_tim k
 where k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim'
on conflict (kegiatan_id, akun_id) do nothing;

-- 5. Pemeriksaan akhir (berhenti dan membatalkan semuanya bila ada yang tidak cocok)
do $$
declare
  n_korwil int;
  n_pml_ok int;
  n_pen int;
  n_tanpa_petugas int;
begin
  select count(*) into n_tanpa_petugas
    from bencana_kelompok_tim k join sigap_akun a on a.id = k.akun_id
   where k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim' and a.petugas_bencana_id is null;
  select count(*) into n_korwil
    from bencana_kelompok_tim k join sigap_akun a on a.id = k.akun_id join bencana_petugas p on p.id = a.petugas_bencana_id
   where k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim' and p.peran = 'korwil' and p.aktif;
  select count(*) into n_pml_ok
    from bencana_kelompok_tim kp join sigap_akun ap on ap.id = kp.akun_id join bencana_petugas pml on pml.id = ap.petugas_bencana_id
    join bencana_petugas kor on kor.id = pml.atasan_id and kor.peran = 'korwil'
   where kp.kegiatan_id = 1 and kp.aktif and kp.peran = 'pml' and pml.peran = 'pml';
  select count(*) into n_pen
    from bencana_kelompok_tim k join sigap_penugasan g on g.akun_id = k.akun_id and g.kegiatan_id = 1 and g.peran = 'korwil' and g.aktif
   where k.kegiatan_id = 1 and k.aktif and k.peran = 'kortim';
  if n_tanpa_petugas <> 0 or n_korwil <> 12 or n_pml_ok <> 18 or n_pen <> 12 then
    raise exception 'Pemeriksaan akhir gagal: kortim tanpa petugas=% (0), korwil aktif=% (12), PML bertaut korwil=% (18), penugasan korwil=% (12). Dibatalkan.',
      n_tanpa_petugas, n_korwil, n_pml_ok, n_pen;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Pemeriksaan sesudah dijalankan (opsional, hanya baca):
--   select * from bencana_ringkasan_beban_korwil();      -- 6 korwil urutan 1 dengan 3 PML masing-masing
--   select p.nama as pml, k.nama as korwil from bencana_petugas p join bencana_petugas k on k.id = p.atasan_id where p.peran = 'pml' order by k.nama, p.nama;
--
-- Untuk membatalkan (bila perlu), jalankan secara manual:
--   update bencana_petugas set atasan_id = null where peran = 'pml' and atasan_id in (select id from bencana_petugas where peran = 'korwil');
--   update sigap_penugasan set aktif = false where kegiatan_id = 1 and peran = 'korwil' and sumber like 'admin:354 (20261019a%';
--   -- peran 'korwil' pada baris petugas boleh dibiarkan (RPC monitoring memperlakukan organik berperan kosong sama dengan korwil).
-- ---------------------------------------------------------------------------------------------------------------------------
