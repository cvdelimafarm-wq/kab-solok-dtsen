-- 20261108c_tarif_panitia_instruktur.sql
--
-- (8 Nov 2026) Panitia dan instruktur pelatihan masuk Administrasi dengan dokumen yang sama seperti peserta (SPJ Transport Lokal: surat tugas, kwitansi, visum, dst.).
-- Dokumen itu membaca tarif dan label jabatan per peran dari sigap_kegiatan_tarif, jadi tiap pelatihan perlu baris tarif untuk peran 'panitia' dan 'instruktur'.
-- Nilai di bawah SAMA dengan tarif peserta (Rp170.000 per hari). UBAH angkanya sebelum dijalankan bila tarif panitia/instruktur berbeda.
-- Aman dijalankan ulang (ON CONFLICT DO NOTHING): baris yang sudah ada tidak disentuh. Ubah daftar kegiatan (3 = PSP, 7 = Seruti TW IV) sesuai kebutuhan.

insert into sigap_kegiatan_tarif (kegiatan_id, peran, uraian_detail, tarif, label_jabatan, urutan)
select k.id, p.peran, p.uraian, 170000, p.label || ' ' || regexp_replace(k.nama, '^Pelatihan( Petugas)? ', ''), 0
from sigap_kegiatan k
cross join (values
  ('panitia',    'Perjalanan Panitia Pelatihan di kab/kota',    'Panitia Pelatihan'),
  ('instruktur', 'Perjalanan Instruktur Pelatihan di kab/kota', 'Instruktur Pelatihan')
) as p(peran, uraian, label)
where k.id in (3, 7)
on conflict (kegiatan_id, peran) do nothing;

-- Pemeriksaan (hanya baca):
-- select kegiatan_id, peran, tarif, label_jabatan from sigap_kegiatan_tarif where kegiatan_id in (3, 7) order by kegiatan_id, peran;
