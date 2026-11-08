-- 20261108a_tes_bawaan_pelatihan.sql
--
-- (8 Nov 2026) Aturan: setiap kegiatan berjenis 'pelatihan' HARUS punya pretest dan posttest (kartu unggah soal dan jadwal di Kelola Pelatihan > Soal & Jadwal),
-- dari mana pun pelatihan itu dibuat. Temuan: "Pelatihan Petugas Seruti Triwulan IV 2026" (id 7) dibuat tanpa keduanya, sehingga kartunya tidak tampil.
--
-- 1. Mengisi yang kurang untuk pelatihan yang sudah ada (saat ini hanya id 7). Pola sama dengan tombol "+ Pelatihan baru": buka 07.00 WIB hari pertama,
--    tutup 22.00 WIB hari terakhir, durasi 15 menit, TIDAK AKTIF (belum tampil bagi peserta) sampai soal diunggah, wajib lulus mati. Baris yang ada tidak diubah.
-- 2. Pemicu pada sigap_kegiatan: pelatihan baru (atau kegiatan yang jenisnya diubah menjadi 'pelatihan') otomatis mendapat keduanya. Pengaman utama di sisi basis data;
--    kode aplikasi (pastikanTesBawaan, route admin) menjadi pengaman kedua.
--
-- URUTAN: pasang kode push 126 (route "+ Pelatihan baru" memakai upsert yang mengabaikan baris kembar) SEBELUM atau SESUDAH SQL ini aman; hanya versi route LAMA
-- yang akan gagal bila pemicu sudah aktif (insert kembar) -- jadi deploy kode dulu, lalu jalankan SQL ini. Aman diulang.

begin;

-- 1. Isi yang kurang ------------------------------------------------------------------------------------------------------
insert into public.sigap_tes (kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at, aktif, ulang_maks, wajib_lulus, nilai_lulus)
select k.id, j.jenis,
       left((case j.jenis when 'pretest' then 'Pretest' else 'Posttest' end) || ' · ' || k.nama, 160),
       ((k.tanggal_mulai::text || ' 07:00:00+07')::timestamptz), 15,
       ((greatest(coalesce(k.tanggal_selesai, k.tanggal_mulai), k.tanggal_mulai)::text || ' 22:00:00+07')::timestamptz),
       false, 1, false, 70
from public.sigap_kegiatan k
cross join (values ('pretest'), ('posttest')) as j(jenis)
where k.jenis = 'pelatihan'
  and k.tanggal_mulai is not null
on conflict (kegiatan_id, jenis) do nothing;

-- 2. Pemicu: pelatihan baru dari jalur mana pun --------------------------------------------------------------------------
create or replace function public.sigap_kegiatan_tes_bawaan() returns trigger
language plpgsql as $$
begin
  if new.jenis = 'pelatihan' and new.tanggal_mulai is not null then
    insert into public.sigap_tes (kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at, aktif, ulang_maks, wajib_lulus, nilai_lulus)
    select new.id, j.jenis,
           left((case j.jenis when 'pretest' then 'Pretest' else 'Posttest' end) || ' · ' || new.nama, 160),
           ((new.tanggal_mulai::text || ' 07:00:00+07')::timestamptz), 15,
           ((greatest(coalesce(new.tanggal_selesai, new.tanggal_mulai), new.tanggal_mulai)::text || ' 22:00:00+07')::timestamptz),
           false, 1, false, 70
    from (values ('pretest'), ('posttest')) as j(jenis)
    on conflict (kegiatan_id, jenis) do nothing;
  end if;
  return new;
end $$;
comment on function public.sigap_kegiatan_tes_bawaan() is 'Pelatihan baru otomatis punya pretest dan posttest bawaan (tidak aktif). Lihat 20261108a.';

drop trigger if exists sigap_kegiatan_tes_bawaan on public.sigap_kegiatan;
create trigger sigap_kegiatan_tes_bawaan
  after insert or update of jenis, tanggal_mulai on public.sigap_kegiatan
  for each row execute function public.sigap_kegiatan_tes_bawaan();

commit;

-- Verifikasi (harapan: tiap pelatihan punya 2 tes; kegiatan 7 baru: aktif = false, 0 soal):
--   select k.id, k.nama, count(t.id) as jumlah_tes
--     from public.sigap_kegiatan k left join public.sigap_tes t on t.kegiatan_id = k.id
--    where k.jenis = 'pelatihan' group by k.id, k.nama order by k.id;
