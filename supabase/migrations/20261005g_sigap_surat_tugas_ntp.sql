-- (5 Okt 2026) Data Surat Tugas SPDT NTP 2026 (55 ST per petugas, dari "Surat Tugas SPDT NTP 1.pdf") -- permintaan user.
-- ST bersifat per petugas: 1 baris sigap_surat_tugas per penugasan. File PDF ST diupload terpisah (file_path diisi kemudian).
-- Tujuan disimpan sebagai array (bisa >1 kecamatan); semua ST ini 1 tujuan.
set statement_timeout = '60s';
set lock_timeout = '10s';

alter table sigap_surat_tugas add column if not exists penugasan_id bigint references sigap_penugasan(id);
alter table sigap_surat_tugas add column if not exists nama_tertera text;
alter table sigap_surat_tugas add column if not exists peran_tertera text;
alter table sigap_surat_tugas add column if not exists tujuan text[];
alter table sigap_surat_tugas add column if not exists untuk text;
create unique index if not exists sigap_surat_tugas_nomor_uq on sigap_surat_tugas (nomor_st);

-- Periode kegiatan = rentang ST.
update sigap_kegiatan set tanggal_mulai = '2026-10-12', tanggal_selesai = '2026-11-12' where kode = 'spdt_ntp_2026';

-- Petugas yg ada di ST tetapi belum punya penugasan SPDT NTP -> dibuatkan (ST = acuan).
insert into sigap_penugasan (kegiatan_id, akun_id, peran, sumber)
select k.id, a.id, 'ppl', 'surat_tugas'
from sigap_akun a join sigap_kegiatan k on k.kode = 'spdt_ntp_2026'
where a.id in (252, 340)  -- Hadisty Nelva, Lingga Ayunda Pradipta
on conflict (kegiatan_id, akun_id) do nothing;

with st(nomor,nama,peran,tujuan) as (values
('B-1285/13030/VS.330/2026','Yessi Adriani','pml','Bukit Sundi'),
('B-1286/13030/VS.330/2026','Audira Mart Herda Putri','ppl','Bukit Sundi'),
('B-1287/13030/VS.330/2026','Sisri Suryani','ppl','Bukit Sundi'),
('B-1288/13030/VS.330/2026','Aprilla Insan Suci','pml','Gunung Talang'),
('B-1289/13030/VS.330/2026','Ega Andini','ppl','Gunung Talang'),
('B-1290/13030/VS.330/2026','Mirvan Harvia','ppl','Gunung Talang'),
('B-1291/13030/VS.330/2026','Norlizah','ppl','Gunung Talang'),
('B-1292/13030/VS.330/2026','Lidya Rahmawati Amsah','ppl','Ix Koto Sungai Lasi'),
('B-1293/13030/VS.330/2026','Megawati','pml','Junjung Sirih'),
('B-1294/13030/VS.330/2026','Aniza Nurzanah','ppl','Junjung Sirih'),
('B-1295/13030/VS.330/2026','Elsi Febriani','ppl','Junjung Sirih'),
('B-1296/13030/VS.330/2026','Mega Nana Yulianti','pml','Kubung'),
('B-1297/13030/VS.330/2026','Putri Marvina Coswari','pml','Kubung'),
('B-1298/13030/VS.330/2026','Lingga Ayunda Pradipta','ppl','Kubung'),
('B-1299/13030/VS.330/2026','Yelli Novita Sari','ppl','Kubung'),
('B-1300/13030/VS.330/2026','Yusnita Susanti','ppl','Kubung'),
('B-1301/13030/VS.330/2026','Bukhtiar','ppl','Payung Sekaki'),
('B-1302/13030/VS.330/2026','Rahmi Febrina Sari','pml','Tigo Lurah'),
('B-1303/13030/VS.330/2026','Febra Azizah','ppl','Tigo Lurah'),
('B-1304/13030/VS.330/2026','Siski Rahma Novita','ppl','Tigo Lurah'),
('B-1305/13030/VS.330/2026','Ayu Sepriani','pml','X Koto Singkarak'),
('B-1306/13030/VS.330/2026','Widya Elvera','pml','X Koto Singkarak'),
('B-1307/13030/VS.330/2026','Dana Nokeladio','ppl','X Koto Singkarak'),
('B-1308/13030/VS.330/2026','Zahria Fitri Andini','ppl','X Koto Singkarak'),
('B-1309/13030/VS.330/2026','Cindy Mutia Agustri','ppl','X Koto Singkarak'),
('B-1310/13030/VS.330/2026','Lia Angraini','ppl','X Koto Singkarak'),
('B-1311/13030/VS.330/2026','Miftahur Rahmah','ppl','X Koto Singkarak'),
('B-1312/13030/VS.330/2026','Solvia Maivita','pml','Danau Kembar'),
('B-1313/13030/VS.330/2026','Destifa Ilhamni','ppl','Danau Kembar'),
('B-1314/13030/VS.330/2026','Hadisty Nelva','ppl','Danau Kembar'),
('B-1315/13030/VS.330/2026','Sherli Handayani','ppl','Danau Kembar'),
('B-1316/13030/VS.330/2026','Yulia Geni Putri','pml','Hiliran Gumanti'),
('B-1317/13030/VS.330/2026','Atika Millinia Putri','ppl','Hiliran Gumanti'),
('B-1318/13030/VS.330/2026','Risma Dani','ppl','Hiliran Gumanti'),
('B-1319/13030/VS.330/2026','Rahmy Annisa Adlis','pml','Lembah Gumanti'),
('B-1320/13030/VS.330/2026','Sri Mulyati','pml','Lembah Gumanti'),
('B-1321/13030/VS.330/2026','Adrinadi','ppl','Lembah Gumanti'),
('B-1322/13030/VS.330/2026','Aldi Gusnanda','ppl','Lembah Gumanti'),
('B-1323/13030/VS.330/2026','Hermansyah Putra','ppl','Lembah Gumanti'),
('B-1324/13030/VS.330/2026','Lira Indriani','ppl','Lembah Gumanti'),
('B-1325/13030/VS.330/2026','Mia Anizar Yulia Fitri','ppl','Lembah Gumanti'),
('B-1326/13030/VS.330/2026','Rahma Widya Sari','ppl','Lembah Gumanti'),
('B-1327/13030/VS.330/2026','Yola Mulia Putri','ppl','Lembah Gumanti'),
('B-1328/13030/VS.330/2026','Metri Jaya Putra','pml','Lembang Jaya'),
('B-1329/13030/VS.330/2026','Asty Novfelia','ppl','Lembang Jaya'),
('B-1330/13030/VS.330/2026','Fitri Arestia','ppl','Lembang Jaya'),
('B-1331/13030/VS.330/2026','Muhammad Rizal','ppl','Lembang Jaya'),
('B-1332/13030/VS.330/2026','Noval Afrian Putra','pml','Pantai Cermin'),
('B-1333/13030/VS.330/2026','Rabiatul Fauziah','ppl','Pantai Cermin'),
('B-1334/13030/VS.330/2026','Rona Afriyeni','ppl','Pantai Cermin'),
('B-1335/13030/VS.330/2026','Rahiyatul Ulfa','pml','X Koto Diatas'),
('B-1336/13030/VS.330/2026','Annisa Fitri','ppl','X Koto Diatas'),
('B-1337/13030/VS.330/2026','Arifandi Shafitra','ppl','X Koto Diatas'),
('B-1338/13030/VS.330/2026','Ira Novita Sari','ppl','X Koto Diatas'),
('B-1339/13030/VS.330/2026','Vegita Dwi Yuniza','ppl','X Koto Diatas')
), alias(nama_st, akun_id) as (values
  ('Aprilla Insan Suci', 64), ('Rahmi Febrina Sari', 513), ('Yessi Adriani', 727)  -- ejaan berbeda di master
), cocok as (
  select st.*, coalesce(al.akun_id, a.id) akun_id
  from st
  left join alias al on al.nama_st = st.nama
  left join sigap_akun a on al.akun_id is null and lower(regexp_replace(trim(a.nama),'\s+',' ','g')) = lower(regexp_replace(trim(st.nama),'\s+',' ','g'))
), ins as (
  insert into sigap_surat_tugas (kegiatan_id, penugasan_id, nomor_st, tanggal_st, tanggal_mulai, tanggal_selesai, nama_tertera, peran_tertera, tujuan, untuk)
  select p.kegiatan_id, p.id, c.nomor, '2026-10-02', '2026-10-12', '2026-11-12', c.nama, c.peran, array[c.tujuan],
    'Pendataan lapangan Survei Penyempurnaan Diagram Timbang Nilai Tukar Petani (SPDT NTP) sebagai ' ||
    case when c.peran = 'pml' then 'Petugas Pemeriksa Lapangan Survei (PML)' else 'Petugas Pendataan Lapangan Survei (PPL)' end
  from cocok c
  join sigap_penugasan p on p.akun_id = c.akun_id and p.kegiatan_id = (select id from sigap_kegiatan where kode = 'spdt_ntp_2026')
  on conflict (nomor_st) do nothing
  returning id, penugasan_id
)
update sigap_penugasan p set surat_tugas_id = ins.id from ins where p.id = ins.penugasan_id;
