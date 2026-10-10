-- (10 Okt 2026) Pembagian Lembar Identifikasi: pendamping HANYA untuk SLS yang beririsan -- permintaan user:
-- "hanya SLS yang beririsan yang diplot ke >1 PML; SLS yang tidak beririsan (tak ada Sub SLS-nya jadi wilayah PML lain) cukup PML utama".
-- Irisan = SLS yang Sub SLS-nya dipegang PPL dari >1 PML pada plotting PPL (bencana_alokasi_subsls.pml_id).
-- - SLS dengan plot PPL: PML pelaksana = PML dengan Sub SLS terbanyak di SLS itu (seri: pelaksana lama, lalu id terkecil);
--   pendamping = PML kedua terbanyak bila ada, bila tidak NULL.
-- - SLS tanpa plot PPL: pelaksana tetap hasil penyusunan jarak (20261010h), pendamping NULL.
-- - 62 SLS Ilham (Danau Kembar, Lembah Gumanti, Pantai Cermin, Aie Batumbuak) tetap pelaksana Ilham; pendamping hanya bila PML lain beririsan.
-- Sudah diterapkan ke DB lewat MCP (22 SLS dengan pendamping, 180 tanpa; pelaksana berubah di 32 SLS). jarak_km dikosongkan bila pelaksana berubah.
-- Pembagian sebelumnya (jarak murni) tersimpan di 20261010h; tidak ada data dihapus.
with pl as (select left(a.idsubsls,14) idsls, a.pml_id, count(*) n from bencana_alokasi_subsls a where a.pml_id is not null group by 1,2),
r as (select pl.idsls, pl.pml_id, pl.n, row_number() over (partition by pl.idsls order by pl.n desc, (pl.pml_id = i.pml_pelaksana_id) desc, pl.pml_id) rn from pl join bencana_identifikasi_alokasi i on i.idsls=pl.idsls),
x as (select i.idsls, case when i.pml_pelaksana_id=458 and (i.idsls like '130304%' or i.idsls like '130305%' or i.idsls like '13030710%' or i.idsls like '13030800080%') then 458 else coalesce((select pml_id from r where r.idsls=i.idsls and rn=1), i.pml_pelaksana_id) end pel from bencana_identifikasi_alokasi i),
b as (select x.idsls, x.pel, (select r.pml_id from r where r.idsls=x.idsls and r.pml_id<>x.pel order by rn limit 1) pen from x)
update bencana_identifikasi_alokasi a set pml_pelaksana_id=b.pel, pml_pendamping_id=b.pen,
  jarak_km = case when b.pel<>a.pml_pelaksana_id then null else a.jarak_km end
from b where b.idsls=a.idsls;
