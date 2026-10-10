-- (10 Okt 2026) Pembagian Lembar Identifikasi SLS: seluruh SLS di Kec. Danau Kembar, Lembah Gumanti, Pantai Cermin
-- dan nagari Aie Batumbuak (Kec. Gunung Talang) dialihkan ke PML Ilham (id 458) sebagai pelaksana -- permintaan user.
-- Bila Ilham sebelumnya pendamping SLS itu, PML pelaksana lama menjadi pendamping (check pelaksana <> pendamping tetap terpenuhi).
-- jarak_km dikosongkan karena jarak lama milik pelaksana sebelumnya (Ilham belum punya titik lokasi). Tidak ada data dihapus.
-- Sudah diterapkan ke DB lewat MCP (50 SLS berubah; 12 SLS sudah milik Ilham).
with t as (
  select distinct idsls from bencana_skor_beban_subsls()
  where kecamatan ilike any (array['%danau kembar%','%lembah gumanti%','%pantai cermin%']) or nagari ilike '%batumbuak%'
)
update bencana_identifikasi_alokasi a
set pml_pendamping_id = case when a.pml_pendamping_id = 458 then a.pml_pelaksana_id else a.pml_pendamping_id end,
    pml_pelaksana_id = 458,
    jarak_km = null
from t
where t.idsls = a.idsls and (a.pml_pelaksana_id <> 458 or a.pml_pendamping_id = 458);
