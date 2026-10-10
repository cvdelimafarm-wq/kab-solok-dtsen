-- (10 Okt 2026) Pendamping Lembar Identifikasi boleh kosong -- permintaan user: wilayah yang hanya punya tim PML Ilham
-- (Danau Kembar, Lembah Gumanti, Pantai Cermin, Aie Batumbuak) tidak diberi PML pendamping dari tim lain (mis. Irawita tidak ikut di Danau Kembar).
-- Check identifikasi_alokasi_beda (pelaksana <> pendamping) tetap berlaku; bila pendamping NULL check dianggap lolos.
-- Sudah diterapkan ke DB lewat MCP (62 SLS tanpa pendamping). Tidak ada data dihapus.
alter table bencana_identifikasi_alokasi alter column pml_pendamping_id drop not null;
update bencana_identifikasi_alokasi set pml_pendamping_id = null, jarak_km = null
where pml_pelaksana_id = 458 and (idsls like '130304%' or idsls like '130305%' or idsls like '13030710%' or idsls like '13030800080%');
