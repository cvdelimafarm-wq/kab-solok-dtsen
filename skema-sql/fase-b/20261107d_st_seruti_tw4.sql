-- 20261107d_st_seruti_tw4.sql
-- (7 Nov 2026) Memasukkan 23 surat tugas Seruti TW IV yang sudah terbit dan bertanda tangan elektronik (B-1615 .. B-1637, tanggal 6 Nov 2026) ke
-- pendataan Seruti TW IV (kegiatan 6) dan ke buku nomor menu Arsip. Prinsip: PDF bertanda tangan yang menang. Karena itu kode arsip VS.220 (bukan
-- kode bawaan ST VS.330) dipakai untuk kegiatan ini, dan nomor dicatat apa adanya.
-- Prasyarat: 20261107c_arsip_penomoran.sql sudah dijalankan. Aman diulang (tidak menggandakan). Berhenti dengan pesan jelas bila ada nama yang tidak cocok.
-- Setelah ini: unggah PDF gabungan lewat kartu "Unggah PDF Surat Tugas gabungan" di Kelola Penugasan Seruti TW IV supaya tiap halaman tersimpan sebagai file ST petugas.

begin;

-- Daftar ST bertanda tangan elektronik (BSrE) tanggal 6 Nov 2026, sumber: PDF "Surat Tugas Seruti TW IV 2026 TTE Gabungan" (23 halaman).
create temp table _st_seruti (nomor text, nama text, peran text, tujuan text[], untuk text) on commit drop;
insert into _st_seruti values
  ('B-1615/13030/VS.220/2026', 'M. Iqbal Hadi, SST.', 'pml', array['Gunung Talang']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1616/13030/VS.220/2026', 'Adriyanto', 'pml', array['Pantai Cermin', 'Lembah Gumanti']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1617/13030/VS.220/2026', 'Faisal Siddiq, S.Tr.Stat.', 'pml', array['Lembah Gumanti']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1618/13030/VS.220/2026', 'Inggrit Yulia Hastri', 'pml', array['Kubung']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1619/13030/VS.220/2026', 'Lucia Veronica', 'pml', array['X Koto Singkarak', 'Kubung']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1620/13030/VS.220/2026', 'Nurafiza Thamrin, S.Tr.Stat.', 'pml', array['IX Koto Sungai Lasi', 'Gunung Talang']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1621/13030/VS.220/2026', 'Riko Putra Roma', 'pml', array['Lembah Gumanti']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1622/13030/VS.220/2026', 'Riva Hestaria, A.Md.', 'pml', array['Danau Kembar']::text[], 'Pengawasan dan pemeriksaan hasil pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1623/13030/VS.220/2026', 'Aldi Gusnanda', 'ppl', array['Lembah Gumanti']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1624/13030/VS.220/2026', 'Aprila Insan Suci', 'ppl', array['Gunung Talang']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1625/13030/VS.220/2026', 'Ayu Sepriani', 'ppl', array['X Koto Singkarak']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1626/13030/VS.220/2026', 'Farah Sahara', 'ppl', array['Kubung']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1627/13030/VS.220/2026', 'Gusna Wirda', 'ppl', array['Lembah Gumanti']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1628/13030/VS.220/2026', 'Hadisty Nelva', 'ppl', array['Danau Kembar']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1629/13030/VS.220/2026', 'Hudra Marfiadi', 'ppl', array['Lembah Gumanti']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1630/13030/VS.220/2026', 'Lingga Ayunda Pradipta', 'ppl', array['Kubung']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1631/13030/VS.220/2026', 'Nisa Anggraini', 'ppl', array['Pantai Cermin']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1632/13030/VS.220/2026', 'Putri Marvina Coswari', 'ppl', array['Kubung']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1633/13030/VS.220/2026', 'Riri Puspita', 'ppl', array['Lembah Gumanti']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1634/13030/VS.220/2026', 'Solvia Maivita', 'ppl', array['Danau Kembar']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1635/13030/VS.220/2026', 'Wahyuni Oktavia', 'ppl', array['Lembah Gumanti']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1636/13030/VS.220/2026', 'Wirastri Widuri', 'ppl', array['IX Koto Sungai Lasi']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026'),
  ('B-1637/13030/VS.220/2026', 'Yola Septya Syamsi', 'ppl', array['Gunung Talang']::text[], 'Pendataan rumah tangga sampel Survei Ekonomi Rumah Tangga Triwulanan (Seruti) Triwulan IV 2026');

-- Pemeriksaan awal: setiap nama pada PDF harus cocok dengan tepat satu penugasan aktif Seruti TW IV (kegiatan 6).
create temp table _st_cocok on commit drop as
select s.*, p.id as pid, a.nama as nama_akun
  from _st_seruti s
  left join public.sigap_akun a on lower(btrim(a.nama)) = lower(btrim(s.nama))
  left join public.sigap_penugasan p on p.akun_id = a.id and p.kegiatan_id = 6 and p.aktif and lower(p.peran) = s.peran;
do $cek$ begin
  if (select count(*) from _st_cocok) <> 23 or (select count(*) from _st_cocok where pid is null) > 0 or (select count(distinct pid) from _st_cocok) <> 23 then
    raise exception 'Nama pada PDF tidak cocok satu-satu dengan penugasan aktif Seruti TW IV: %', (select string_agg(nama, '; ') from _st_cocok where pid is null);
  end if;
end $cek$;

-- Kode arsip VS.220 (dipakai pada ST Seruti TW IV) dan kode bawaan kegiatan Seruti TW IV. PDF yang sudah ditandatangani yang dimenangkan atas kode bawaan ST (VS.330).
insert into public.arsip_kode (kode, nama, kelompok, catatan, diverifikasi) values
  ('VS.220', 'Dipakai pada surat tugas Seruti Triwulan IV 2026', 'substantif', 'Tercatat dari ST bertanda tangan elektronik B-1615..B-1637 (6 Nov 2026). Arti resmi belum diverifikasi.', false)
on conflict do nothing;
insert into public.arsip_kegiatan_kka (kegiatan_id, kka) values (6, 'VS.220') on conflict (kegiatan_id) do update set kka = excluded.kka, diubah_at = now();

-- Surat tugas per petugas (file PDF diunggah sesudahnya lewat kartu "Unggah PDF Surat Tugas gabungan" di Kelola Penugasan).
insert into public.sigap_surat_tugas (kegiatan_id, nomor_st, tanggal_st, tanggal_mulai, tanggal_selesai, penugasan_id, nama_tertera, peran_tertera, tujuan, untuk)
select 6, c.nomor, date '2026-11-06', date '2026-11-10', date '2026-11-20', c.pid, c.nama, c.peran, c.tujuan, c.untuk
  from _st_cocok c
 where not exists (select 1 from public.sigap_surat_tugas x where x.nomor_st = c.nomor);

update public.sigap_penugasan p set surat_tugas_id = st.id
  from public.sigap_surat_tugas st
 where st.penugasan_id = p.id and p.kegiatan_id = 6 and p.surat_tugas_id is null and st.kegiatan_id = 6;

-- Buku nomor (menu Arsip): nomor terbit di luar SIGAP dicatat apa adanya; hitungan register dinaikkan ke 1637.
insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, rujukan, dibuat_nama)
select 'st', 'surat_keluar', 2026, split_part(split_part(c.nomor, '-', 2), '/', 1)::integer, c.nomor, 'VS.220', date '2026-11-06',
       'Surat tugas ' || c.nama || ' (Seruti TW IV, ST ber-TTE)', 6, 'luar', 'sigap_penugasan:' || c.pid, 'Impor ST ber-TTE 6 Nov 2026'
  from _st_cocok c
on conflict do nothing;
insert into public.arsip_counter (register, tahun, terakhir) values ('surat_keluar', 2026, 1637)
on conflict (register, tahun) do update set terakhir = greatest(public.arsip_counter.terakhir, excluded.terakhir), diubah_at = now();

do $v$ begin
  if (select count(*) from public.sigap_surat_tugas where kegiatan_id = 6 and nomor_st like 'B-16%/13030/VS.220/2026') <> 23 then raise exception 'Jumlah ST Seruti TW IV tidak 23'; end if;
  if (select count(*) from public.sigap_penugasan where kegiatan_id = 6 and aktif and surat_tugas_id is not null) <> 23 then raise exception 'Tidak semua penugasan aktif tertaut ke ST'; end if;
  if (select count(*) from public.arsip_nomor where kegiatan_id = 6 and sumber = 'luar' and status = 'terpakai') <> 23 then raise exception 'Buku nomor tidak memuat 23 nomor Seruti'; end if;
end $v$;

commit;

-- Pemeriksaan:
--   select p.peran, a.nama, st.nomor_st, st.tujuan from sigap_penugasan p join sigap_akun a on a.id = p.akun_id join sigap_surat_tugas st on st.id = p.surat_tugas_id where p.kegiatan_id = 6 order by st.nomor_st;
--   select register, tahun, terakhir from arsip_counter;
