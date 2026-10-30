-- 20261024g_impor_pok_2026_30sep (3 dari 3): baris detail 339 s.d. 677
-- DATA (bukan skema), aman diulang. Sumber: parse RKKS 30 Sep 2026, sha256 4612bdcf8137488ca0cf9ea72b3e193c324e7079ad6331c14178eca9d02c42fc
-- Versi POK nomor revisi 1 SEMENTARA (nomor revisi resmi menyusul). Tanpa DELETE/DROP.
do $impor$
declare data_ text; v bigint; st text; l text; p text[]; pid bigint; cur bigint; r record; kem int; n int := 0;
        v_komp text; v_ro text; v_dasar text; cacah jsonb := '{}'::jsonb; ada int;
begin
  select id, status into v, st from keu_pok_versi where tahun = 2026 and nomor_revisi = 1;
  if v is null then raise exception 'Jalankan bagian 1 lebih dulu'; end if;
  if st <> 'draf' then raise notice 'Versi sudah % ; bagian 3 dilewati.', st; return; end if;
  select count(*) into ada from keu_pok_detail where versi_id = v;
  if ada <> 338 then raise exception 'Jumlah detail saat ini % (seharusnya 338); hentikan dan periksa', ada; end if;
  -- peta nomor lokal -> id node (node dimasukkan berurutan sehingga nomor lokal = urutan id)
  -- cacah kemunculan dipulihkan dari detail yang sudah ada
  for r in select d.kunci_stabil from keu_pok_detail d where d.versi_id = v loop
    v_dasar := left(r.kunci_stabil, length(r.kunci_stabil) - length(split_part(r.kunci_stabil, '#', -1)) - 1);
    cacah := cacah || jsonb_build_object(v_dasar, coalesce((cacah ->> v_dasar)::int, 0) + 1);
  end loop;
  data_ := $det$
287|honor pengajar pelatihan petugas susenas maret|63|OJP|111000|6993000
287|honor pengajar pelatihan petugas susenas september|27|OJP|111000|2997000
288|pencetakan buku pedoman Susenas maret 2027|1598|LMBR|1000|1598000
288|pencetakan buku pedoman Susenas september|4415|LMBR|600|2649000
288|pencetakan kuesioner lapangan Susenas maret 2027|2156|LMBR|600|1293000
288|pencetakan kuesioner lapangan Susenas september|5775|LMBR|600|3465000
288|pencetakan kuesioner pelatihan petugas Susenas maret 2027|1845|LMBR|600|1107000
288|pencetakan kuesioner pelatihan petugas Susenas september|548|LMBR|600|328000
288|pencetakan kuesioner vseruti26.inti (pelatihan petugas susenas maret)|60|LMBR|600|36000
288|pencetakan vseruti26.inti (pelaksanaan lapangan seruti triwulan 2, 3, dan 4)|2640|LMBR|600|1584000
288|pencetakan vseruti26.mak (pelaksanaan lapangan seruti triwulan 2 dan 4)|5280|LMBR|600|3168000
288|pencetakan vseruti27.inti (pelaksanaan lapangan seruti triwulan 1)|660|LMBR|600|396000
288|pengadaan atk di kab/kota|10|PAKET|395000|3950000
288|pengadaan komputer supplies di kab/kota|10|PAKET|198000|1980000
289|Perjalanan Dinas Dalam Rangka Pelatihan Susenas Maret|2|OP|380000|760000
289|Perjalanan Dinas dalam rangka Menghadiri Kunjungan Kerja Wakil Kepala BPS RI di Provinsi Sumatera Barat|4|OP|758000|3032000
290|transport responden role playing pelatihan petugas susenas september|2|OK|170000|340000
291|pelatihan petugas susenas maret|100|OP|622100|62210000
291|pelatihan petugas susenas september|75|OP|300000|22500000
291|Uang harian Pelatihan petugas sesenas september 2026|75|OP|130000|9750000
291|perjalanan petugas susenas september|25|OP|69600|1740000
294|pengawasan kab/kota ke kecamatan dalam rangka seruti|1|OP|170000|170000
294|transport lokal petugas pemeriksaan dan pendataan lapangan (susenas september )|31|OK|170000|5270000
300|pengadaan atk, kertas dan bahan cetak bps kabupaten/kota|1|PAKET|125000|125000
303|transport lokal BPS kab/kota|2|OK|170000|340000
307|Honor petugas pendataan lapangan|74|DOK|57000|4218000
308|Transport petugas pemeriksaan lapangan desa|50|OK|170000|8500000
308|Transport petugas pendataan lapangan desa|21|OK|170000|3570000
311|Perlengkapan Fullday pelatihan petugas|21|SET|50000|1050000
311|Konsumsi pelatihan petugas podes|21|OP|83000|1743000
312|Honor Pengajar Fullday pelatihan petugas|9|OJP|111000|999000
313|Penginapan pelatihan petugas podes|1|OP|177000|177000
313|Perjalanan Fullday pelatihan petugas|20|OP|64250|1285000
316|Paket Data Petugas Lapangan|14|OP|75000|1050000
317|Transport Daerah Sulit|1|OK|980000|980000
322|Konsumsi untuk rapat di daerah|200|OK|64000|12800000
322|Perlengkapan pelatihan petugas pendataan|192|SET|90000|17280000
325|Honor Inda|96|OJP|111000|10656000
326|Transport Lokal PML|980|OK|150000|147000000
326|Transport lokal Petugas PPL|3458|OK|150000|518700000
326|Supervisi pengawasan lapangan BPS Kako|10|OK|256000|2560000
326|Transport Daerah Sulit|1|OK|1144000|1144000
327|Perjalanan Peserta Pelatihan Petugas di kab/kota|200|OP|351360|70272000
327|Fullboard pelatihan petugas di kab/kota|400|OP|392025|156810000
332|Konsumsi Desa Cantik|30|OK|64000|1920000
332|Biaya cetak spanduk dalam rangka sosialisasi Desa Cantik di Kab/Kota|2|SET|200000|400000
333|Honor Narasumber (Pejabat Eselon II)|1|OJP|1000000|1000000
333|Honor Narasumber (Pejabat Eselon III)|1|OJP|900000|900000
336|Perjalanan Pengawasan/Pendampingan BPS Kabkota dalam rangka Desa cantik|1|OP|320000|320000
339|Konsumsi evaluasi desa cantik|24|OK|83000|1992000
340|Perjalanan peserta dalam rangka evaluasi desa cantik|24|OP|170000|4080000
346|Honor Petugas Pendataan Lapangan Survei Lembaga Keuangan - Koperasi Simpan Pinjam|15|DOK|75000|1125000
346|Honor Petugas Listing dan Pendataan Lapangan Survei Perusahaan/Usaha Penyedia Makan Minum UMK|60|DOK|76300|4578000
346|Honor Petugas Pendataan Lapangan Survei Statistik Keuangan BUMD|2|DOK|75000|150000
346|Honor Petugas Pendataan Lapangan Survei Usaha/Perusahaan Daya Tarik Wisata|9|DOK|75000|675000
346|Honor Petugas Pendataan Lapangan Survei Usaha/Perusahaan Penyedia Jasa Akomodasi Bulanan|252|DOK|66000|16632000
346|Honor Petugas Pendataan Lapangan Survei Usaha/Perusahaan Penyedia Jasa Akomodasi Tahunan|58|DOK|75000|4350000
346|Honor Petugas Pengolahan Survei Lembaga Keuangan Koperasi Simpan Pinjam|15|DOK|15000|225000
346|Honor Petugas Pengolahan Survei Statistik Keuangan BUMD|2|DOK|15000|30000
346|Honor Petugas Pengolahan Survei Statistik Keuangan Keuangan Pemerintah Desa - K3|30|DOK|11000|330000
347|Transport lokal Petugas Pendataan Lapangan Survei Lembaga Keuangan - Koperasi Simpan Pinjam|3|OK|170000|510000
347|Transport Lokal Petugas Pemeriksaan Lapangan Survei Perusahaan/Usaha Penyedia Makan Minum UMK|2|OK|170000|340000
347|Transport lokal Petugas Pemeriksaan Lapangan Survei Statistik Keuangan BUMD|1|OK|170000|170000
347|Transport Lokal Petugas Pemeriksaan Lapangan Survei Statistik Keuangan Keuangan Pemerintah Desa - K3|1|OK|170000|170000
347|Transport Lokal Petugas Pemeriksaan Lapangan Survei Usaha/Perusahaan Daya Tarik Wisata|1|OK|170000|170000
347|Transport Lokal Petugas Pemeriksaan Lapangan Survei Usaha/Perusahaan Penyedia Jasa Akomodasi Bulanan|9|OK|170000|1530000
347|Transport Lokal Petugas Pemeriksaan Listing Survei Perusahaan/Usaha Penyedia Makan Minum UMK|1|OK|170000|170000
350|Konsumsi Pelatihan Petugas Survei Bidang Jasa Pariwisata 2026|10|OK|83000|830000
350|Perlengkapan Pelatihan Petugas Survei Bidang Jasa Pariwisata 2026|10|OK|50000|500000
351|Honor Pengajar Pelatihan Petugas Survei Bidang Jasa Pariwisata 2026|36|OJP|111000|3996000
352|Paket Data Pelatihan Petugas Survei Bidang Jasa Pariwisata 2026|7|PAKET|50000|350000
353|Pencetakan kuesioner SLK Koperasi Simpan Pinjam|240|LMBR|600|144000
353|Pencetakan Kuesioner Survei BUMD|28|LMBR|608|17000
353|Pencetakan Kuesioner Survey Statistik Keuangan Pemerintah Desa (K3) 2025-2026|198|LMBR|596|118000
353|pengadaan atk kab/kota|2|PAKET|464750|929000
353|pengadaan komputer supplies kab/kota|2|PAKET|465000|930000
354|Transport Lokal Pelatihan Petugas Survei Bidang Jasa Pariwisata 2026|7|OP|170000|1190000
357|Biaya pulsa petugas Survei Bidang Jasa Pariwisata|23|OB|50000|1150000
363|honor petugas pendataan lapangan laporan tahunan perusahaan peternakan|3|DOK|66000|198000
366|perlengkapan pelatihan petugas survei kesejahteraan petani|17|SET|50000|850000
366|biaya konsumsi pelatihan petugas survei kesejahteraan petani|18|OK|83000|1494000
367|honor pengajar pelatihan petugas survei kesejahteraan petani|21|OJP|111000|2331000
368|transport pelatihan petugas survei kesejahteraan petani|21|OK|106000|2226000
371|Paket Data Pelatihan SKP|12|OB|50000|600000
372|pengawasan dari kabupaten ke kecamatan|1|OP|106000|106000
372|transport daerah sulit skp|1|OP|200000|200000
377|honor petugas pendataan lapangan survei pertanian terintegrasi (sampel UTP)|230|OK|67000|15410000
377|honor petugas pendataan lapangan survei pertanian terintegrasi (sampel upb)|5|DOK|100000|500000
377|honor petugas pendataan lapangan survei pertanian terintegrasi (sampel UTL)|55|DOK|67000|3685000
378|transport lokal petugas pemeriksaan lapangan survei pertanian terintegrasi (sampel upb)|1|OK|85000|85000
378|transport lokal petugas pemeriksaan lapangan survei pertanian terintegrasi (sampel UTP)|9|OK|170000|1530000
378|transport lokal petugas lapangan survei pertanian terintegrasi|5|OK|170000|850000
381|perlengkapan pelatihan petugas lapangan sitasi2026|24|SET|50000|1200000
381|biaya paket data pelatihan petugas lapangan sitasi2026|24|OB|50000|1200000
382|honor pengajar pelatihan petugas lapangan sitasi2026|18|OJP|111000|1998000
383|paket meeting fullday pelatihan petugas sitasi2026 di kab/kota|48|OP|180000|8640000
383|perjalanan paket meeting fullday pelatihan petugas sitasi2026 di kab/kota|48|OP|70000|3360000
383|penginapan pelatihan petugas sitasi2026 di kab/kota|6|OP|100000|600000
383|Uang Harian paket meeting fullday pelatihan petugas sitasi2026 di kab/kota|46|OP|85000|3910000
386|pengawasan dari kabupaten ke kecamatan|1|OP|133000|133000
392|honor petugas pendataan lapangan kerangka sampel area (ksa) jagung|480|SGMN|56000|26880000
392|honor petugas pendataan lapangan kerangka sampel area (ksa) padi|871|SGMN|110000|95810000
392|honor petugas pendataan lapangan survei pertanian tanaman pangan/ubinan padi|264|DOK|81000|21384000
392|honor petugas pendataan lapangan survei pertanian tanaman pangan/ubinan palawija|96|DOK|81000|7776000
392|honor petugas pendataan lapangan updating listing blok sensus survei pertanian tanaman pangan/ubinan palawija|32|EA|168000|5376000
393|konsultasi kab/kota ke provinsi|1|OP|3740000|3740000
394|transport lokal petugas pemeriksaan lapangan kerangka sampel area (ksa) jagung|14|OK|170000|2380000
394|transport lokal petugas pemeriksaan lapangan kerangka sampel area (ksa) padi|20|OK|170000|3400000
394|transport lokal petugas pemeriksaan lapangan survei pertanian tanaman pangan/ubinan palawija|7|OK|170000|1190000
394|Transport Lokal Petugas Pendataan KSA Padi|12|OK|170000|2040000
394|Transport Lokal Petugas Pendatan Updating Ubinan Palawija|10|OK|170000|1700000
397|konsumsi pelatihan petugas pendataan ksa (1x makan 2x snack)|42|OK|83000|3486000
397|perlengkapan pelatihan petugas pendataan ksa|40|SET|50000|2000000
397|perlengkapan petugas KSA dan Ubinan|18|SET|200000|3600000
397|Timbangan Digital Ubinan|5|SET|123600|618000
398|honor pengajar pelatihan petugas pendataan ksa|18|OJP|111000|1998000
399|pencetakan daftar sp dan sub-s|1172|LMBR|600|703000
399|pengadaan atk di kab/kota|37|PAKET|50000|1850000
399|pengadaan komputer supplies di kab/kota|2|PAKET|585000|1170000
400|transport lokal pelatihan petugas pendataan ksa|50|OK|103940|5197000
403|biaya paket data pengumpulan data kerangka sampel area (ksa) jagung|85|OB|50000|4250000
403|biaya paket data pengumpulan data kerangka sampel area (ksa) padi|218|OB|50000|10900000
403|biaya paket data Petugas Ubinan Palawija dan Updating|20|OB|50000|1000000
404|biaya penggantian biaya responden survei pertanian tanaman pangan/ubinan padi|100|RESP|59000|5900000
404|biaya penggantian biaya responden survei pertanian tanaman pangan/ubinan palawija|96|RESP|59000|5664000
405|pengawasan dari kabupaten ke kecamatan|1|OP|256000|256000
405|transport daerah sulit kab/kota kerangka sampel area (ksa) padi dan jagung|3|OK|375000|1125000
409|honor petugas pendataan lapangan listing bs indeks komstrat|22|EA|231000|5082000
409|honor petugas pendataan lapangan rumah tangga indeks komstrat|270|DOK|61000|16470000
409|honor petugas pendataan lapangan survei produksi hortikultura (utp)|36|DOK|44000|1584000
409|honor petugas pendataan lapangan listing survei produksi hortikultura (UTP)|4|EA|231000|924000
409|honor petugas pendataan lapangan survei produksi hortikultura (UTL)|78|DOK|44000|3432000
409|honor petugas pendataan lapangan survei perusahaan hortikultura|2|DOK|79000|158000
409|honor petugas pendataan lapangan survei perusahaan perkebunan bulanan|24|DOK|62000|1488000
409|honor petugas pendataan lapangan survei perusahaan perkebunan tahunan|2|DOK|85000|170000
409|honor petugas pendataan lapangan survei usaha hortikultura lainnya|66|DOK|53000|3498000
409|honor petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lainnya (dutl)|140|DOK|66000|9240000
409|honor petugas pengolahan survei perusahaan hortikultura|2|DOK|16000|32000
409|honor petugas pengolahan survei perusahaan perkebunan bulanan|24|DOK|13000|312000
409|honor petugas pengolahan survei perusahaan perkebunan tahunan|2|DOK|17000|34000
410|transport lokal petugas pemeriksaan lapangan listing bs indeks komstrat|1|OK|170000|170000
410|transport lokal petugas pemeriksaan lapangan rumah tangga indeks komstrat|26|OK|170000|4420000
410|transport lokal petugas pemeriksaan lapangan survei produksi hortikultura|17|OK|170000|2890000
410|transport lokal petugas pencacahan VP Hortikultura|1|OK|170000|170000
410|transport lokal petugas pemeriksaan lapangan survei usaha hortikultura lainnya|4|OK|170000|680000
410|transport lokal petugas pemeriksaan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lainnya (|4|OK|170000|680000
410|transport lokal petugas pendataan lapangan survei perusahaan perkebunan bulanan|2|OK|170000|340000
410|transport lokal petugas pendataan lapangan survei perusahaan perkebunan tahunan|1|OK|170000|170000
410|transport lokal petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lainnya (du|3|OK|170000|510000
413|biaya paket data pelatihan petugas survei produksi hortikultura|10|OB|50000|500000
413|biaya paket data pelatihan petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian|14|OB|50000|700000
413|konsumsi pelatihan petugas survei produksi hortikultura (2 snack 1 makan)|20|OK|73100|1462000
413|konsumsi pelatihan petugas survei komstrat (2 snack 1 makan)|30|OK|83000|2490000
413|konsumsi evaluasi triwulanan petugas survei komstrat (2 snack 1 makan)|60|OK|83000|4980000
413|konsumsi pelatihan petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lainnya|17|OK|83000|1411000
413|perlengkapan pelatihan petugas survei produksi hortikultura|12|SET|50000|600000
413|perlengkapan pelatihan petugas survei komstrat|13|SET|50000|650000
413|perlengkapan pelatihan petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lain|14|SET|50000|700000
414|honor pengajar pelatihan petugas survei produksi hortikultura|16|OJP|111000|1776000
414|honor pengajar pelatihan petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian la|9|OJP|111000|999000
414|honor pengajar pelatihan petugas survei komstrat|18|OJP|111000|1998000
415|pencetakan dokumen survei perkebunan|924|LMBR|600|554000
415|pengadaan atk di kab/kota|1|PAKET|268000|268000
415|pengadaan komputer supplies di kab/kota|1|PAKET|268000|268000
416|transport lokal pelatihan petugas survei produksi hortikultura|10|OK|128000|1280000
416|transport lokal pelatihan petugas pendataan lapangan updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian l|14|OK|106000|1484000
416|transport lokal pelatihan petugas Survei Komstrat|15|OK|130000|1950000
419|biaya paket data pengumpulan data indeks komstrat|59|OB|50000|2950000
419|biaya paket data pengumpulan data survei produksi hortikultura|27|OB|50000|1350000
419|biaya paket data pengumpulan data survei usaha hortikultura lainnya|31|OB|50000|1550000
419|biaya paket data pengumpulan data updating direktori perusahaan pertanian (dpp) dan direktori usaha pertanian lainnya (dutl)|11|OB|50000|550000
420|transport lokal pengawasi survei Komstrat|38|OP|170000|6460000
420|transport lokal evaluasi triwulanan petugas Survei Komstrat|30|OK|100000|3000000
425|honor petugas pendataan lapangan SKGB -Kering|44|DOK|81000|3564000
425|Honor petugas pemeriksa lapangan SKGB - Kering|44|DOK|27000|1188000
425|honor petugas pendataan lapangan SKGB - Giling|25|DOK|66000|1650000
425|honor petugas pemeriksa lapangan SKGB - Giling|25|DOK|22000|550000
426|Perajalanan Dinas dalam rangka rapat evaluasi SKGB|2|OP|3715000|7430000
427|transport lokal petugas SKGB|14|OK|170000|2380000
430|pengadaan atk di kab/kota|1|PAKET|250000|250000
430|pengadaan komputer supplies di kab/kota|1|PAKET|250000|250000
433|Biaya Paket Data Petugas|9|OB|75000|675000
434|Biaya Penggantian Responden SKGB - Kering|46|RESP|80000|3680000
434|Biaya Penggantian Responden SKGB - Giling|26|RESP|90000|2340000
435|pengawasan lapangan kab/kota|5|OP|256000|1280000
435|Transport Lokal Daerah|11|OK|170000|1870000
435|Transport rapat pertemuan tim SKGB|36|OK|170000|6120000
441|honor petugas pengolahan survei pertanian tanaman pangan/ubinan padi|264|DOK|17000|4488000
441|honor petugas pendataan lapangan survei kesejahteraan petani (skp)|210|DOK|66000|13860000
441|honor petugas pemeriksa lapangan survei kesejahteraan petani (skp)|105|DOK|22000|2310000
441|honor petugas pendataan lapangan laporan pemotongan ternak bulanan|12|DOK|57000|684000
441|honor petugas pengolahan survei pertanian tanaman pangan/ubinan palawija|96|DOK|17000|1632000
441|honor petugas pengolahan updating listing blok sensus survei pertanian tanaman pangan/ubinan palawija|32|DOK|34000|1088000
442|transport lokal petugas pemeriksaan lapangan data luas panen setahun/sp|1|OK|170000|170000
442|transport lokal petugas pemeriksaan lapangan laporan pemotongan ternak bulanan|1|OK|170000|170000
442|transport lokal petugas pemeriksaan lapangan laporan tahunan perusahaan peternakan|1|OK|170000|170000
442|transport lokal petugas pemeriksaan lapangan survei kesejahteraan petani (skp)|4|OK|170000|680000
442|transport lokal petugas pemeriksaan lapangan survei pertanian tanaman pangan/ubinan padi|8|OK|170000|1360000
442|transport lokal petugas pemeriksaan lapangan survei pertanian tanaman pangan/ubinan palawija|1|OK|150000|150000
442|transport lokal petugas pemeriksaan lapangan updating listing blok sensus survei pertanian tanaman pangan/ubinan palawija|3|OK|170000|510000
442|transport lokal petugas pendataan lapangan data luas panen setahun/sp|2|OK|170000|340000
442|transport lokal petugas pengolahan data luas panen setahun/sp|1|OK|170000|170000
445|pencetakan kuesioner statistik peternakan|22|LMBR|591|13000
448|Paket Data Pendataan SKP|12|OB|50000|600000
448|biaya paket data pengumpulan data laporan pemotongan ternak bulanan|8|OB|50000|400000
454|honor petugas pendataan lapangan survei captive power|2|DOK|66000|132000
454|honor petugas pendataan lapangan survei komoditas perusahaan industri manufaktur|1|DOK|79000|79000
454|honor petugas pendataan lapangan survei tahunan perusahaan industri manufaktur|7|DOK|91000|637000
454|honor petugas pendataan lapangan survei perusahaan konstruksi tahunan|19|DOK|75000|1425000
454|honor petugas pendataan lapangan survei perusahaan tahunan air bersih|1|DOK|53000|53000
454|honor petugas pendataan lapangan survei tahunan perusahaan penggalian bahan industri dan konstruksi|7|DOK|75000|525000
454|honor petugas pendataan lapangan survei tahunan usaha penggalian bahan industri dan konstruksi|18|DOK|66000|1188000
454|honor petugas pengolahan survei perusahaan pertambangan non migas|1|DOK|17000|17000
454|honor petugas pengolahan survei perusahaan tahunan air bersih|1|DOK|11000|11000
454|honor petugas pengolahan lapangan survei komoditas perusahaan industri manufaktur|1|DOK|16000|16000
454|honor petugas pengolahan survei tahunan perusahaan industri manufaktur|7|DOK|19000|133000
454|honor petugas pengolahan survei tahunan perusahaan penggalian bahan industri dan konstruksi|7|DOK|15000|105000
454|honor petugas pengolahan survei triwulanan perusahaan air bersih|4|DOK|9000|36000
454|honor petugas pengolahan survei triwulanan perusahaan penggalian bahan industri dan konstruksi - 66,00066,0001.0 DOK honor petugas|28|DOK|14000|392000
455|transport lokal petugas pemeriksaan lapangan survei komoditas perusahaan industri manufaktur|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei perusahaan konstruksi tahunan|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei perusahaan konstruksi triwulanan|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei perusahaan pertambangan non migas|1|OK|104000|104000
455|transport lokal petugas pemeriksaan lapangan survei tahunan perusahaan industri manufaktur|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei tahunan perusahaan penggalian bahan industri dan konstruksi|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei tahunan usaha penggalian bahan industri dan konstruksi|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei triwulanan perusahaan air bersih|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei triwulanan perusahaan penggalian bahan industri dan konstruksi|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan updating direktori perusahaan pertambangan dan energi|1|OK|170000|170000
455|transport lokal petugas pemeriksaan survei perusahaan tahunan air bersih|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan pemutakhiran direktori perusahaan awal (dpa)|1|OK|170000|170000
455|transport lokal petugas pemeriksaan lapangan survei captive power|1|OK|170000|170000
458|biaya paket data pemutakhiran direktori perusahaan awal (dpa)|1|OB|50000|50000
458|biaya paket data pendataan lapangan survei captive power|1|OB|50000|50000
458|biaya paket data pendataan lapangan survei perusahaan konstruksi tahunan|4|OB|50000|200000
458|biaya paket data pendataan lapangan survei perusahaan konstruksi triwulanan|4|OB|50000|200000
458|biaya paket data pendataan lapangan survei tahunan usaha penggalian bahan industri dan konstruksi|3|OB|50000|150000
465|Perjalanan dalam rangka administrasi BMN|1|OP|1481000|1481000
469|Konsumsi Rapat|72|OK|46862|3374000
473|Belanja Gaji Pokok PNS|1|THN|1069904700|1069904000
473|Belanja Gaji Pokok PNS (13)|1|BLN|89426000|89426000
473|Belanja Gaji Pokok PNS (14)|1|BLN|88723000|88723000
474|Belanja Pembulatan Gaji PNS|1|THN|22000|22000
474|Belanja Pembulatan Gaji PNS (13)|1|BLN|2000|2000
474|Belanja Pembulatan Gaji PNS (14)|1|BLN|2000|2000
475|Tunj.Suami/Istri PNS|1|THN|52190000|52190000
475|Tunj.Suami/Istri PNS (13)|1|BLN|5134000|5134000
475|Tunj.Suami/Istri PNS (14)|1|BLN|4905000|4905000
476|Tunj. Anak PNS|1|THN|15935000|15935000
476|Tunj. Anak PNS (13)|1|BLN|1364000|1364000
476|Tunj. Anak PNS (14)|1|BLN|1360000|1360000
477|Tunj.Struktural PNS|1|THN|21600000|21600000
477|Tunj.Struktural PNS (13)|1|BLN|1800000|1800000
477|Tunj.Struktural PNS (14)|1|BLN|1800000|1800000
478|Tunj.Fungsional PNS|1|THN|153278000|153278000
478|Tunj.Fungsional PNS (13)|1|BLN|12440000|12440000
478|Tunj.Fungsional PNS (14)|1|BLN|11900000|11900000
479|Tunj. PPh PNS|1|THN|119992000|119992000
479|Tunj. PPh PNS (13)|1|BLN|13646000|13646000
479|Tunj. PPh PNS (14)|1|BLN|4287000|4287000
480|Tunj. Beras PNS|1|THN|55112000|55112000
481|Uang Makan PNS|1|THN|175298000|175298000
482|Tunjangan Umum PNS|1|THN|4746000|4746000
482|Tunjangan Umum PNS (13)|1|BLN|1512000|1512000
482|Tunjangan Umum PNS (14)|1|BLN|1512000|1512000
483|Belanja Gaji Pokok PPPK|1|THN|86018000|86018000
483|Belanja Gaji Pokok PPPK (13)|1|BLN|7535000|7535000
483|Belanja Gaji Pokok PPPK (14)|1|BLN|7535000|7535000
484|Belanja Pembulatan Gaji PPPK|1|THN|3000|3000
485|Tunj.Suami/Istri PPPK (13)|1|BLN|502300|502000
485|Tunj.Suami/Istri PPPK (14)|1|BLN|503000|503000
485|Tunj.Suami/Istri PPPK|1|THN|5735000|5735000
486|Tunj. Anak PPPK (13)|1|BLN|151000|151000
486|Tunj. Anak PPPK (14)|1|BLN|151000|151000
486|Tunj. Anak PPPK|1|THN|1720000|1720000
487|Tunj.Fungsional PPPK|1|THN|6165000|6165000
487|Tunj.Fungsional PPPK (13)|1|BLN|540000|540000
487|Tunj.Fungsional PPPK (14)|1|BLN|540000|540000
488|Tunj. Beras PPPK|1|THN|7633000|7633000
489|Uang Makan PPPK|1|THN|28490000|28490000
490|Belanja Uang Lembur|1|THN|26940000|26940000
491|Tunjangan Kinerja|1|THN|1637897000|1637897000
492|Tunjangan Kinerja|1|THN|125484000|125484000
495|Biaya pengurusan surat kendaraan eselon iii/Operasional|1|U/THN|4202000|4202000
495|Biaya pengurusan surat kendaraan roda 2|1|U/THN|150000|150000
495|Keperluan sehari-hari perkantoran|1|OT|21624000|21624000
495|Biaya Air Galon|12|BLN|250000|3000000
495|lembur PPNPN|4|OH|250000|1000000
495|Langganan Zoom Pro|12|BLN|147000|1764000
495|Langganan Capcut Pro|1|THN|2727000|2727000
495|BPJS Ketenagakerjaan|12|BLN|290000|3480000
495|Retribusi Sampah|12|BLN|150000|1800000
495|Pengiriman Dokumen|3|BLN|100000|300000
495|Pengiriman Surat Dinas|1|PAKET|104000|104000
495|Pengadaan Pakaian Dinas ASN|56|PAKET|700000|39200000
496|Kuasa Pengguna Anggaran|12|OB|1593334|19120000
496|Pejabat Pembuat Komitmen|12|OB|1550000|18600000
496|Pejabat Penandatangan SPM|12|OB|656667|7880000
496|Bendahara|12|OB|576667|6920000
496|Pejabat pengadaan|12|OB|680000|8160000
496|Pengurus/penyimpan bmn|12|OB|180000|2160000
497|Biaya Instruktur Senam|17|OK|300000|5100000
498|Konsumsi Rapat dalam rangka persiapan dan evaluasi pendataan daerah terdampak bencana sumatera 2026|75|OK|36000|2700000
499|Honor Penunjuk Jalan Pendataan Daerah terdampak Bencana Sumatera 2026|18|OK|100000|1800000
500|Pengadaan kursi kantor|1|UNIT|997000|997000
500|Pengadaan tabung gas|1|UNIT|990000|990000
500|Pengadaan kompor gas|1|UNIT|990000|990000
500|Pengadaan kipas angin dinding|1|UNIT|540000|540000
501|Pengadaan ARK|1|U/THN|8848000|8848000
501|Pengadaan ATK|1|U/THN|3892000|3892000
502|Biaya langganan listrik|1|THN|18279000|18279000
503|Biaya langganan telepon|1|THN|86000|86000
504|Biaya langganan air|1|THN|1667000|1667000
505|Koneksi internet|1|THN|19496000|19496000
506|Sewa kendaraan untuk angkutan barang|1|PAKET|1000000|1000000
507|Jasa Petugas Kebersihan|12|OB|6366000|76392000
507|Biaya Jasa Manajemen Building|1|PAKET|38106000|38106000
508|Pemeliharaan gedung kantor|300|M2/TH|103570|31071000
508|Pemeliharaan halaman kantor|500|M2/TH|5846|2923000
509|Pemeliharaan kendaraan operasional roda 2|1|U/THN|3335000|3335000
509|Inventaris kantor|24|OT|66625|1599000
509|Pemeliharaan Air conditioner/AC|3|U/THN|804334|2413000
509|Pemeliharaan kendaraan operasional eselon iii/Operasional|2|U/THN|29251000|58502000
509|Pemeliharaan PC/laptop/notebook|40|U/THN|130000|5200000
509|Pemeliharaan printer|18|U/THN|100000|1800000
509|Pemeliharaan Kamera|1|U/THN|3500000|3500000
509|Pemeliharaan UPS|24|UNIT|500000|12000000
510|Bahan Bakar Genset|1|THN|1722000|1722000
511|Konsultasi kab/kota ke propinsi (Transport Perjalanan)|20|OP|491450|9829000
511|perjalanan dinas dalam rangka Rekonsiliasi iuran Jaminan Kesehatan Nasional di Kota Solok|4|OP|400000|1600000
512|Pendataan Daerah Terdampak Bencana Sumatera 2026|100|OK|167600|16760000
517|Pengelola SAI tingkat satuan kerja anggota|24|OB|150000|3600000
517|Pengelola SAI tingkat satuan kerja ketua|12|OB|150000|1800000
517|Pengelola SAI tingkat satuan koordinator|12|OB|200000|2400000
518|Perjalanan pengelola keuangan ke DJP Solok|2|OB|500000|1000000
518|Perjalanan pengelola keuangan ke Provinsi|4|OB|680000|2720000
519|Perjalanan pengelola keuangan ke KPPN|1|OB|1481000|1481000
523|Honor Narasumber Eselon III|1|OJP|900000|900000
524|Perjalanan ke DJPB Catatan : 1. U = Komponen Utama 2. P = Komponen Penunjang 3. * = Blokir|1|OP|1481000|1481000
$det$;
  if md5(data_) <> '8b10bf827da656581d623b680f686f5e' then raise exception 'Salinan data rusak (checksum tidak cocok); hentikan.'; end if;
  for l in select unnest(string_to_array(data_, E'\n')) loop
    if btrim(l) = '' then continue; end if;
    p := string_to_array(l, '|');
    select id into pid from keu_pok_node where versi_id = v order by id offset (p[1]::int - 1) limit 1;
    v_komp := null; v_ro := null; cur := pid;
    while cur is not null loop
      select induk_id, tingkat, kode, ro_kode into r from keu_pok_node where id = cur;
      if r.tingkat = 'komponen' then v_komp := r.kode; end if;
      if r.tingkat = 'ro' then v_ro := r.ro_kode; end if;
      cur := r.induk_id;
    end loop;
    v_dasar := keu_kunci_detail(v_ro, v_komp, (select kode from keu_pok_node where id = pid), p[2], 1);
    v_dasar := left(v_dasar, length(v_dasar) - 2);
    kem := coalesce((cacah ->> v_dasar)::int, 0) + 1;
    cacah := cacah || jsonb_build_object(v_dasar, kem);
    insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, kemunculan, uraian, volume, satuan, harga_satuan, jumlah)
    values (v, pid, v_dasar || '#' || kem, kem, p[2], p[3]::numeric, p[4], p[5]::numeric, p[6]::numeric);
    n := n + 1;
  end loop;
  raise notice 'Bagian 3: % detail', n;
  if (select count(*) from keu_pok_detail where versi_id = v) <> 677 then raise exception 'Jumlah detail tidak 677'; end if;
  if (select count(*) from keu_v_pok_selisih where versi_id = v and selisih <> 0) > 0 then
    raise exception 'Impor POK: ada node tidak konsisten (lihat keu_v_pok_selisih versi %)', v;
  end if;
  perform keu_pok_berlakukan(v);
  raise notice 'Impor POK selesai dan diberlakukan: versi %', v;
end
$impor$;
