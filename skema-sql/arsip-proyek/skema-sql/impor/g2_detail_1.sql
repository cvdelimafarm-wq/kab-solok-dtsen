-- 20261024g_impor_pok_2026_30sep (2 dari 3): baris detail 1 s.d. 338
-- DATA (bukan skema), aman diulang. Sumber: parse RKKS 30 Sep 2026, sha256 4612bdcf8137488ca0cf9ea72b3e193c324e7079ad6331c14178eca9d02c42fc
-- Versi POK nomor revisi 1 SEMENTARA (nomor revisi resmi menyusul). Tanpa DELETE/DROP.
do $impor$
declare data_ text; v bigint; st text; l text; p text[]; pid bigint; cur bigint; r record; kem int; n int := 0;
        v_komp text; v_ro text; v_dasar text; cacah jsonb := '{}'::jsonb; ada int;
begin
  select id, status into v, st from keu_pok_versi where tahun = 2026 and nomor_revisi = 1;
  if v is null then raise exception 'Jalankan bagian 1 lebih dulu'; end if;
  if st <> 'draf' then raise notice 'Versi sudah % ; bagian 2 dilewati.', st; return; end if;
  select count(*) into ada from keu_pok_detail where versi_id = v;
  if ada <> 0 then raise exception 'Jumlah detail saat ini % (seharusnya 0); hentikan dan periksa', ada; end if;
  -- peta nomor lokal -> id node (node dimasukkan berurutan sehingga nomor lokal = urutan id)
  -- cacah kemunculan dipulihkan dari detail yang sudah ada
  for r in select d.kunci_stabil from keu_pok_detail d where d.versi_id = v loop
    v_dasar := left(r.kunci_stabil, length(r.kunci_stabil) - length(split_part(r.kunci_stabil, '#', -1)) - 1);
    cacah := cacah || jsonb_build_object(v_dasar, coalesce((cacah ->> v_dasar)::int, 0) + 1);
  end loop;
  data_ := $det$
7|transport lokal|1|OK|170000|170000
13|Transport Lokal Pelaksanaan SKD 2026 Kabupaten/Kota|3|OK|170000|510000
18|ATK Kegiatan Pembinaan Statistik Sektoral|67|OK|15000|1005000
18|Konsumsi pembinaan statistik sektoral|20|OK|76250|1525000
24|honor petugas pendataan lapangan SKLNP Triwulanan (kabkot)|40|DOK|91000|3640000
24|honor petugas pendataan lapangan sksppi di kab/kota|40|DOK|75000|3000000
25|transport lokal petugas pemeriksaan lapangan Dokumen Survei institusi LNP|1|OK|170000|170000
25|transport lokal petugas pemeriksaan lapangan sksppi di kab/kota|1|OK|170000|170000
28|konsumsi halfday di kantor pelatihan petugas pencacahan SKLNPT|4|OK|64000|256000
28|konsumsi halfday di kantor pelatihan petugas pencacahan SKSPPI|8|OK|64000|512000
28|ATK pelatihan petugas pencacahan SKLNPT|2|OK|25000|50000
28|ATK pelatihan petugas pencacahan SKSPPI|7|OK|25000|175000
29|honor pengajar petugas halfday di kantor pelatihan petugas pencacahan SKLNPT|5|OJP|111000|555000
29|honor pengajar petugas halfday di kantor pelatihan petugas pencacahan SKSPPI|4|OJP|111000|444000
30|Perjalanan dinas ke BPS Provinsi dalam rangka Konserda Penyusunan PDRB Kabupaten/Kota Triwulanan|1|OP|2588000|2588000
31|transport lokal halfday di kantor pelatihan petugas pencacahan SKLNPT|1|OK|30000|30000
31|transport lokal halfday di kantor pelatihan petugas pencacahan SKSPPI|4|OK|162500|650000
34|paket data petugas pencacahan sksppi di kab/kota|9|OB|50000|450000
34|paket data petugas pendataan SKLNP Triwulanan di kab/kota|6|OB|50000|300000
35|Perjalanan pengawasan pencacahan survei penyusunan disagregasi pmtb dari kab/kota ke kecamatan|1|OK|150000|150000
35|Perjalanan pengawasan pencacahan sksppi dari kab/kota ke kecamatan|1|OK|150000|150000
35|transport lokal petugas pencacahan SKSPPI|4|OK|170000|680000
35|transport lokal petugas pencacahan SKLNPT|7|OK|170000|1190000
41|Honor petugas lapangan SKTNP Jasa 2026|12|DOK|66000|792000
41|honor petugas pendataan lapangan survei khusus neraca produksi (SKNP)|28|DOK|66000|1848000
41|honor petugas pengolahan dokumen SKNP|28|DOK|14000|392000
41|Honor petugas pengolahan survei SKTNP Jasa|12|DOK|14000|168000
42|transport lokal inventarisasi data sekunder penyusunan pdrb tahunan|2|OK|170000|340000
42|transport lokal inventarisasi data sekunder penyusunan pdrb triwulanan|3|OK|170000|510000
42|Transport Lokal Pengumpulan Data Kab/Kota|5|OK|170000|850000
42|transport lokal petugas pemeriksaan lapangan survei khusus neraca produksi (SKNP)|2|OK|170000|340000
42|Transport lokal petugas pemeriksaan lapangan survei SKTNP Jasa|1|OK|170000|170000
45|konsumsi pelatihan petugas survei SKTNP Jasa 2026|5|SET|48000|240000
45|konsumsi pelatihan petugas SKNP 2026|5|SET|82000|410000
45|ATK pelatihan petugas SKNP 2026|2|SET|50000|100000
46|honor pengajar petugas SKTNP Jasa 2026|8|OJP|111000|888000
46|honor pengajar petugas SKNP|10|OJP|111000|1110000
47|Penggandaan Kuesioner dan Buku Pedoman pelatihan petugas SKNP|377|LMBR|600|226000
48|honor narasumber pejabat eselon III/yang disetarakan di kabkot|1|OJP|900000|900000
49|Paket meeting penyelenggaraan pelatihan petugas survei-survei di neraca produksi|9|OP|83000|747000
49|Perjalanan halfday pelatihan petugas SKTNP Jasa 2026|3|OP|150000|450000
49|Perjalanan pelatihan petugas SKNP|2|OP|150000|300000
52|Paket data pendataan SKNP|4|OB|50000|200000
53|Perjalanan dinas ke BPS Provinsi dalam rangka Konserda Penyusunan PDRB Kabupaten/Kota Triwulanan|1|OP|2560000|2560000
59|transport lokal profiling sbr kabkot|3|OK|170000|510000
62|pengadaan atk kabkot|1|PAKET|125000|125000
62|pengadaan komputer supplies kabkot|1|PAKET|125000|125000
65|Perjalanan dinas dalam rangka supervisi kegiatan metodologi kegiatan statistik kabkot ke kec|1|OP|256000|256000
70|Honor petugas pendataan lapangan|64|SGMN|56000|3584000
71|Transport lokal petugas pengawas lapangan|7|OK|170000|1190000
74|Perjalanan Perjalanan dinas dalam rangka pengawasan kegiatan Pengembangan Mixed Method BPS Kabupaten/Kota|1|OK|342000|342000
80|Pengadaan layar monitor|4|PAKET|999000|3996000
81|Pengadaan software pendukung perwajahan publikasi BPS Kabupaten/Kota|1|PAKET|3949000|3949000
87|Honor Pendataan SPUNP|46|DOK|66000|3036000
88|Transport lokal petugas pendataan lapangan SPUNP|8|OK|170000|1360000
88|Transport lokal petugas pemeriksaan lapangan dokumen Kompilasi Data Angkutan Penumpang dan Barang-Jembatan Timbang|1|OK|170000|170000
88|transport lokal petugas pendataan lapangan Survei Jasa Penunjang Angkutan|1|OK|170000|170000
88|transport lokal petugas pemeriksaan Survei Jasa Penunjang Angkutan|1|OK|170000|170000
91|Biaya paket data pengumpulan data Survei Jasa Penunjang Angkutan|1|OB|50000|50000
95|honor pemeriksa lapangan sensus (PES)|6|OB|2453000|14718000
95|Honor pengolahan Peta (Wilkerstat)|2|OB|2430000|4860000
96|Perjalanan dinas dalam rangka rapat koordinasi pelaksanaan pendataan SE 2026|1|OP|340000|340000
97|Transport lokal dalam rangka PES|75|OK|170000|12750000
97|Task force pendataan lengkap dan CAWI BPS|280|OK|170000|47600000
100|Penayangan ILM di media cetak, online, sosial, elektronik kab/kota|1|PAKET|354000|354000
100|Jasa Influencer untuk sosialisasi Sensus Ekonomi 2026|1|PAKET|1000000|1000000
100|Penyelenggaraan Pencanangan SE2026 oleh Kepala Daerah (Kabkota)|1|PAKET|3000000|3000000
101|Perjalanan dinas dalam rangka Rapat Koordinasi Nasional Pemerintah Pusat dan Daerah Tahun 2026|1|OP|8000000|8000000
104|konsumsi pelatihan petugas pengolahan peta (2 snack 1 makan)|6|OK|166000|996000
104|Perlengkapan pelatihan petugas pengolahan peta|6|SET|100000|600000
105|honor pengajar pelatihan petugas pengolahan peta|18|OJP|111000|1998000
106|pengadaan atk kab/kota|1|PAKET|3406000|3406000
106|pengadaan computer supplies kab/kota|1|PAKET|3278000|3278000
107|Perjalanan Pengecekan Perubahan Satuan Lingkungan Setempat SE2026 Kabupaten ke Kecamatan|4|OK|170000|680000
107|perjalanan petugas pelatihan pengolahan|2|OK|170000|340000
110|pengadaan atk kab/kota|1|PAKET|145000|145000
111|Perjalanan dalam rangka Rekonsiliasi Prelist SBR untuk SE2026 di BPS Provinsi Sumatera Barat|2|OP|500000|1000000
112|Transport lokal dalam rangka pelaksanaan pendataan Groudcheck praprelist SE2026|11|OK|170000|1870000
112|Pelatihan dalam rangka uji petik DTSEN 2026|102|OK|50000|5100000
112|Perjalanan pengawasan lapangan register usaha kabupaten/kota ke kecamatan|2|OP|256000|512000
115|pengadaan souvenir sosilisasi SE 2026|300|SET|19100|5730000
115|konsumsi kegiatan pelaksanaan perekrutan petugas SE 2026|907|PAKET|5000|4535000
115|konsumsi pelaksanaan nota kesepakatan dengan instansi lain dalam rangka kegiatan pelaksanaan SE 2026|45|PAKET|18000|810000
116|Sewa tenda pelaksanaan kegiatan perekrutan petugas SE 2026|1|PAKET|3000000|3000000
117|Perjalanan dinas dalam rangka pencanangan SE 2026 ke BPS Provinsi Sumatera Barat|1|OP|1166000|1166000
118|Paket Meeting Fullboard Pelatihan Petugas Pendataan|1392|OP|375000|522000000
120|konsumsi dalam rangka penandatanganan kontrak petugas SE2026|480|PAKET|8000|3840000
120|perlengkapan pelatihan petugas SE 2026|412|SET|20000|8240000
120|penggandaan dokumen SE-2026 L|383|SET|5000|1915000
121|Honor tim pelaksana kegiatan di Kabupaten/Kota Penanggungjawab|1|OB|450000|450000
121|Honor tim pelaksana kegiatan di Kabupaten/Kota Ketua|1|OB|400000|400000
121|Honor tim pelaksana kegiatan di Kabupaten/Kota Wakil|3|OB|350000|1050000
121|Honor tim pelaksana kegiatan di Kabupaten/Kota anggota|11|OB|300000|3300000
122|Pengadaan atk, kertas, dan bahan cetak Kab/Kot|1|PAKET|639000|639000
125|biaya paket data pendataan PES SE2026|27|OB|100000|2700000
125|perlengkapan pelatihan Petugas PES SE2026|27|SET|100000|2700000
126|Honor Pengajar pelatihan petugas PES SE2026|36|OJP|111000|3996000
127|Asuransi petugas|27|OB|22334|603000
128|Paket Meeting Fullboard Pelatihan Petugas PES SE2026|66|OK|500000|33000000
128|Perjalanan Fullboard Pelatihan Petugas PES SE2026|33|OK|377637|12462000
131|pengadaan perlengkapan promosi produk statistik SE2026 (kab/kot)|1|PAKET|5000000|5000000
136|spanduk pelatihan petugas pendataan SE 2026|12|PAKET|40000|480000
136|obat-obatan pelatihan petugas pendataan SE 2026|1|PAKET|209000|209000
136|biaya konsumsi dalam rangka apel siaga pelaksaan pendataan SE 2026|1200|PAKET|8000|9600000
136|Belanja perlengkapan lainnya dalam rangka kegiatan apel siaga pelaksanaan pendataan SE 2026|1|PAKET|4060000|4060000
137|Honor petugas lapangan sensus|736|OB|4657000|3427552000
137|Honor pemeriksa lapangan sensus (PML)|127|OB|4906000|623062000
138|pengadaan atk|1|PAKET|1935000|1935000
138|pengadaan komputer supplies|1|PAKET|1188000|1188000
141|Honor pengajar pelatihan petugas pendataan|400|OJP|111000|44400000
146|Pengadaan Laptop|2|UNIT|22500000|45000000
151|Honor petugas lapangan sensus|162|OB|4657000|754434000
151|Honor petugas lapangan sensus (PES)|21|OB|4657000|97797000
153|Konsumsi pelatihan petugas pendataan|120|OK|49000|5880000
153|Pengadaan ATK pelatihan|1|PAKET|1416000|1416000
154|Honor tim pelaksana kegiatan di Kabupaten/Kota Penanggungjawab|5|OB|450000|2250000
154|Honor tim pelaksana kegiatan di Kabupaten/Kota Ketua|5|OB|400000|2000000
154|Honor tim pelaksana kegiatan di Kabupaten/Kota Wakil|21|OB|350000|7350000
154|Honor tim pelaksana kegiatan di Kabupaten/Kota anggota|19|OB|300000|5700000
155|Konsultasi Kab/Kota ke provinsi|10|OP|1223600|12236000
155|Perjalanan dinas dalam rangka administrasi SE2026|4|OP|430000|1720000
155|Perjalanan Inda Pelatihan Petugas Pengganti SE 2026|3|OP|521000|1563000
156|Role Playing Pelatihan Petugas|48|OK|170000|8160000
156|Transport lokal Pelatihan Petugas|46|OK|170000|7820000
157|Uang harian Fullboard pelatihan petugas pendataan|1344|OP|130000|174720000
157|transport Perjalanan Fullboard pelatihan petugas pendataan|500|OP|111000|55500000
159|Konsumsi rapat pertemuan tim petugas kab/kota|412|OK|94270|38839000
159|Biaya Paket Data Pelaksanaan SE2026|1031|OK|100000|103100000
160|asuransi petugas|1031|OB|25130|25909000
161|pengadaan atk|1|PAKET|3961000|3961000
162|Perjalanan dalam rangka pendataan rumah tangga khusus ke Padang|2|OP|480000|960000
162|Perjalanan dalam rangka pembukaan dan pengawasan pelatihan petugas SE2026|3|OP|380000|1140000
163|Perjalanan Pengawasan bps kab/kota ke kecamatan (Transport Kabupaten ke Kecamatan )|323|OK|170000|54910000
163|Perjalanan Petugas pendataan SE2026|38|OK|170000|6460000
163|Task force pendataan lengkap dan CAWI BPS Kab/Kota|20|OK|170000|3400000
163|Task force pendataan lengkap SE2026|90|OK|170000|15300000
163|Perjalanan rekonsiliasi lapangan|10|OP|100000|1000000
163|transport pertemuan petugas|1052|OP|30000|31560000
163|Transport penunjuk jalan|5|OK|170000|850000
163|Transport Daerah Sulit|1|OK|2048000|2048000
169|Perlengkapan pelatihan petugas pendataan lapangan|118|SET|50000|5900000
170|Honor Pengajar Pelatihan Petugas|64|OJP|111000|7104000
171|Pengadaan ATK, bahan cetak dan kertas kabupaten/kota|1|SET|500000|500000
171|Pengadaan computer supplies kabupaten/kota|1|SET|400000|400000
171|Pengadaan computer supplies|1|SET|1000000|1000000
171|Pengadaan timbangan dalam rangka kegiatan lapangan|34|SET|50000|1700000
171|Pengadaan papan alas tulis dalam rangka kegiatan lapangan|102|SET|15000|1530000
171|Pencetakan kuesioner VPKRT27-BL kabupaten/kota|28152|SET|600|16891000
171|Pencetakan kuesioner VPKRT27-BLp kabupaten/kota|8976|SET|600|5385000
171|Pencetakan kuesioner VPKRT27-HR kabupaten/kota|10200|SET|600|6120000
171|Pencetakan kuesioner VPKRT27-HRp kabupaten/kota|2992|SET|600|1795000
171|Pencetakan kuesioner VPKRT27-LK kabupaten/kota|25500|SET|600|15300000
171|Pencetakan kuesioner VPKRT27-S kabupaten/kota|35700|SET|600|21420000
171|Pencetakan kuesioner VPKRT27-KK kabupaten/kota|75|SET|600|45000
171|Pengadaan alat tulis dalam rangka kegiatan lapangan|102|SET|8000|816000
171|Pengadaan alat tulis untuk responden|2720|SET|4000|10880000
172|Transport lokal SPKRT|68|OK|170000|11560000
173|Pelatihan petugas pendataan lapangan|118|SET|750000|88500000
173|Transport pelatihan petugas pendataan lapangan|118|SET|374678|44212000
176|Pengawasan dari kab/kota ke kecamatan|1|OK|256000|256000
179|Perlengkapan pelatihan petugas pengolahan|27|SET|50000|1350000
179|Konsumsi pelatihan petugas pengolahan|28|OK|83000|2324000
180|Honor pengajar pelatihan petugas pengolahan|8|OJP|111000|888000
181|Transport pelatihan petugas pengolahan|27|OK|170000|4590000
185|Honor petugas pendataan lapangan Survei Harga Kemahalan Konstruksi|108|DOK|57000|6156000
185|Honor petugas pendataan lapangan Survei Harga Konsumen Perdesaan (HKD)|72|DOK|64000|4608000
185|Honor petugas pendataan lapangan Survei Harga Perdagangan Besar|120|DOK|48000|5760000
185|Honor petugas pendataan lapangan Survei Harga Perdagangan Besar Mingguan|96|DOK|48000|4608000
185|Honor petugas pendataan lapangan Survei Harga Produsen Identifikasi Komoditas Utama|24|DOK|48000|1152000
185|Honor petugas pendataan lapangan Survei Harga Produsen Perdesaan (HD)|228|DOK|53000|12084000
185|Honor petugas pendataan lapangan Survei Harga Produsen Sektor Industri Pengolahan, Pertambangan, dan Penggalian (HP)|156|DOK|48000|7488000
185|Honor petugas pendataan lapangan Survei Harga Produsen Sektor Jasa (HPJ)|48|DOK|48000|2304000
185|Honor petugas pendataan lapangan Survei Harga Produsen Sektor Pertanian (HPT)|12|DOK|53000|636000
185|Honor petugas pengolahan Survei Harga Produsen Perdesaan (HD)|228|DOK|11000|2508000
185|Honor petugas pengolahan Survei Harga Kemahalan Konstruksi|108|DOK|12000|1296000
185|Honor petugas pengolahan Survei Harga Konsumen Perdesaan (HKD)|72|DOK|13000|936000
185|Honor petugas pengolahan Survei Harga Perdagangan Besar|120|DOK|10000|1200000
185|Honor petugas pengolahan Survei Harga Perdagangan Besar Mingguan|96|DOK|10000|960000
185|Honor petugas pengolahan Survei Harga Produsen Identifikasi Komoditas Utama|24|DOK|10000|240000
185|Honor petugas pengolahan Survei Harga Produsen Sektor Industri Pengolahan dan Sektor Pertambangan dan Penggalian (HP)|156|DOK|10000|1560000
185|Honor petugas pengolahan Survei Harga Produsen Sektor Jasa Gas (HPJ)|48|DOK|10000|480000
185|Honor petugas pengolahan Survei Harga Produsen Sektor Pertanian (HPT)|12|DOK|11000|132000
186|Transport lokal petugas pemeriksaan Bill of Quantity kabupaten/kota|1|OK|170000|170000
186|Transport lokal petugas pemeriksaan lapangan Survei Harga Konsumen Perdesaan (HKD)|3|OK|170000|510000
186|Transport Lokal Petugas Pemeriksaan Lapangan Survei Harga Produsen Identifikasi Komoditas Utama|1|OK|170000|170000
186|Transport lokal petugas pemeriksaan lapangan Survei Harga Produsen Perdesaan (HD)|7|OK|170000|1190000
186|Transport lokal petugas pemeriksaan lapangan Survei Harga Produsen Sektor Industri Pengolahan dan Sektor Pertambangan dan Penggali|5|OK|170000|850000
186|Transport lokal petugas pemeriksaan lapangan Survei Harga Produsen Sektor Jasa Gas (HPJ)|2|OK|170000|340000
186|Transport lokal petugas pemeriksaan lapangan Survei Harga Produsen Sektor Pertanian (HPT)|1|OK|170000|170000
186|Transport lokal petugas pendataan Survei Harga Kemahalan Konstruksi|4|OK|170000|680000
186|Transport lokal petugas pemeriksaan Survei Harga Perdagangan Besar|4|OK|170000|680000
186|Transport lokal petugas pemeriksaan Survei Harga Perdagangan Besar Mingguan|3|OK|170000|510000
186|Transport lokal petugas pendataan lapangan Bill of Quantity kabupaten/kota|1|OK|170000|170000
189|Konsumsi pelatihan petugas Survei Harga Perdagangan Besar|10|OK|72000|720000
189|Konsumsi pelatihan survei harga kemahalan konstruksi|10|OK|15000|150000
189|Konsumsi briefing survei harga produsen 2026|10|OK|34100|341000
190|Honor pengajar pelatihan petugas survei harga kemahalan konstruksi|9|OJP|111000|999000
190|Honor pengajar pelatihan petugas Survei Harga Perdagangan Besar|9|OJP|111000|999000
191|pengadaan atk, kertas, dan bahan cetak kabupaten/kota|4|PAKET|466500|1866000
191|pengadaan komputer supplies kabupaten/kota|4|PAKET|425000|1700000
192|Perjalanan dinas dalam rangka Rekonsiliasi Daerah Data Indeks Kemahalan Konstruksi (Rekonda IKK) Tahun 2026|1|OP|2266000|2266000
193|Transport Lokal pelatihan survei harga kemahalan konstruksi|6|OK|170000|1020000
193|Transport pelatihan petugas Survei Harga Perdagangan Besar|5|OK|170000|850000
196|paket data Survei Harga Perdagangan Besar|1|OB|50000|50000
197|Pengawasan lapangan Survei Harga Perdesaan dari Kab/Kota ke kecamatan|1|OP|72000|72000
197|Perjalanan petugas dalam rangka briefing survei harga produsen|7|OP|170000|1190000
197|Pengawasan Survei Harga Perdagangan Besar dari kab/kota ke kecamatan|1|OP|256000|256000
202|Honor petugas pengolahan SPDT NTP|811|DOK|26000|21086000
202|Honor petugas pendataan lapangan SPDT NTP|811|DOK|128000|103808000
202|Honor petugas pemeriksa lapangan SPDT NTP|811|DOK|43000|34873000
205|Perlengkapan Pelatihan Petugas SPDT NTP 2026|58|SET|50000|2900000
206|Honor Pengajar Pelatihan Petugas SPDT NTP 2026|36|OJP|111000|3996000
207|Pencetakan Buku Pedoman SPDT NTP 2026|14012|LMBR|600|8407000
207|Pengadaan ATK|10|SET|375100|3751000
207|Pencetakan Kuesioner SPDT NTP 2026|27714|LMBR|600|16628000
208|Paket Meeting Pelatihan Petugas SPDT NTP 2026|58|OP|860000|49880000
208|Uang Harian dan Perjalanan Pelatihan Petugas SPDT NTP 2026|58|OH|350621|20336000
211|Pengawasan SPDT NTP dari kab/kota ke kecamatan|60|OP|256000|15360000
211|Transport lokal SPDT NTP|500|OK|58472|29236000
211|Transport daerah sulit|60|OP|136750|8205000
217|honor petugas pendataan lapangan listing survei imk tahunan|24|DOK|231000|5544000
217|honor petugas pendataan lapangan listing survei imk triwulanan|11|DOK|231000|2541000
217|honor petugas pendataan lapangan pemutakhiran direktori perusahaan awal (dpa)|7|DOK|46000|322000
217|honor petugas pendataan lapangan survei imk tahunan|134|DOK|53000|7102000
217|honor petugas pendataan lapangan survei imk triwulanan|171|DOK|53000|9063000
217|honor petugas pendataan lapangan survei imk triwulanan (vimk25 triwulan 4)|34|DOK|53000|1802000
217|honor petugas pendataan lapangan survei industri besar dan sedang (ibs) triwulanan|12|DOK|75000|900000
217|honor petugas pendataan lapangan survei perusahaan konstruksi triwulanan|12|DOK|66000|792000
217|honor petugas pendataan lapangan survei triwulanan perusahaan penggalian bahan industri dan konstruksi|28|DOK|66000|1848000
217|honor petugas pendataan lapangan updating direktori perusahaan pertambangan dan energi|13|DOK|66000|858000
217|honor petugas pengolahan survei imk tahunan|134|DOK|11000|1474000
217|honor petugas pengolahan survei industri besar dan sedang (ibs) triwulanan|7|DOK|15000|105000
217|honor petugas pendataan updating direktori pertambangan dan energi tahap 2|1|DOK|66000|66000
218|transport lokal petugas pemeriksaan lapangan listing survei imk tahunan|3|OK|170000|510000
218|transport lokal petugas pemeriksaan lapangan listing survei imk triwulanan|2|OK|170000|340000
218|transport lokal petugas pemeriksaan lapangan survei imk tahunan|4|OK|170000|680000
218|transport lokal petugas pemeriksaan lapangan survei imk triwulanan|6|OK|170000|1020000
218|transport lokal petugas pemeriksaan lapangan survei imk triwulanan (vimk25 triwulan 4)|1|OK|170000|170000
218|transport lokal petugas pemeriksaan lapangan survei industri besar dan sedang (ibs) triwulanan|1|OK|170000|170000
221|konsumsi pelatihan petugas survei statistik pertambangan dan energi (1x makan 2x snack)|7|OK|83000|581000
221|konsumsi pelatihan petugas survei statistik industri|8|OK|60000|480000
221|Konsumsi pelatihan petugas IMK Tahunan|13|OK|83000|1079000
221|perlengkapan pelatihan petugas IMK Tahunan|13|SET|50000|650000
221|perlengkapan pelatihan petugas survei statistik pertambangan dan energi|7|SET|50000|350000
221|perlengkapan pelatihan petugas IMK Tahunan|13|SET|50000|650000
221|perlengkapan pelatihan petugas survei statistik industri|5|SET|50000|250000
222|honor pengajar pelatihan petugas survei statistik pertambangan dan energi|9|OJP|111000|999000
222|honor pengajar pelatihan survei statistik industri|9|OJP|111000|999000
222|honor pengajar pelatihan IMK tahunan|9|OJP|111000|999000
223|pengadaan atk di kab/kota|1|PAKET|283000|283000
223|ATK Pelatihan Petugas IMK Tahunan|13|SET|50000|650000
224|transport lokal pelatihan petugas survei statistik pertambangan dan energi|5|OK|110000|550000
224|transport lokal pelatihan petugas survei statistik industri|5|OK|82400|412000
224|transport lokal pelatihan petugas IMK tahunan|9|OK|100000|900000
227|biaya paket data listing survei imk tahunan|9|OB|50000|450000
227|biaya paket data pendataan lapangan listing survei imk triwulanan|5|OB|50000|250000
227|biaya paket data pendataan lapangan survei imk triwulanan|7|OB|50000|350000
227|biaya paket data pendataan lapangan survei imk triwulanan (vimk25 triwulan 4)|4|OB|50000|200000
227|biaya paket data pendataan lapangan updating direktori perusahaan pertambangan dan energi|5|OB|40000|200000
228|penambahan dan matching direktori perusahaan awal industri manufaktur ke instansi lain di kab/kota|1|OK|170000|170000
234|honor petugas pendataan lapangan (Survei Angkatan Kerja Nasional februari)|160|RUTA|55000|8800000
234|honor petugas pendataan lapangan updating listing BS (Survei Angkatan Kerja Nasional februari)|16|EA|168000|2688000
234|honor petugas pendataan lapangan updating listing BS (Survei Angkatan Kerja Nasional agustus)|64|EA|168000|10752000
234|honor petugas pemeriksaan lapangan updating listing BS (Survei Angkatan Kerja Nasional agustus non organik)|40|EA|55000|2200000
234|honor petugas pendataan lapangan (Survei Angkatan Kerja Nasional agustus)|655|RUTA|55000|36025000
234|honor petugas pemeriksaan lapangan (Survei Angkatan Kerja Nasional agustus non organik)|400|RUTA|19000|7600000
235|transport lokal petugas ke blok sensus (Survei Angkatan Kerja Nasional agustus)|60|OK|170000|10200000
235|transport lokal petugas ke blok sensus (Survei Angkatan Kerja Nasional februari )|11|OK|170000|1870000
235|transport lokal petugas pemeriksaan lapangan (Survei Angkatan Kerja Nasional agustus)|15|OK|170000|2550000
235|transport lokal petugas pemeriksaan lapangan updating listing (Survei Angkatan Kerja Nasional agustus)|5|OK|170000|850000
235|Transport lokal pemeriksa ke blok sensus (Survei Angkatan Kerja Nasional Februari)|3|OK|170000|510000
238|paket data pelatihan petugas agustus|40|OB|50000|2000000
238|paket data pelatihan petugas februari|9|OB|50000|450000
238|Pencetakan Spanduk Sakernas Februari|4|M2|40000|160000
238|Pencetakan Spanduk Sakernas Agustus|6|M2|40000|240000
238|perlengkapan petugas Survei Angkatan Kerja Nasional agustus|54|SET|50000|2700000
238|perlengkapan petugas Survei Angkatan Kerja Nasional februari|14|SET|50000|700000
239|honor pengajar pelatihan petugas Survei Angkatan Kerja Nasional agustus|36|OJP|111000|3996000
239|honor pengajar pelatihan petugas Survei Angkatan Kerja Nasional februari|18|OJP|111000|1998000
240|pencetakan dokumen pelatihan petugas Survei Angkatan Kerja Nasional agustus|3142|LMBR|500|1571000
240|pengadaan ATK kabupaten/kota|4|PAKET|168750|675000
240|pengadaan computer supllies kabupaten/kota|4|PAKET|281000|1124000
241|konsultasi kab/kota ke provinsi|1|OP|1607000|1607000
242|pelatihan petugas Survei Angkatan Kerja Nasional februari dan agustus|60|OP|176500|10590000
242|perjalanan dinas paket meeting dalam kota petugas Survei Angkatan Kerja Nasional agustus|4|OH|122500|490000
242|perjalanan pelatihan petugas Survei Angkatan Kerja Nasional februari|13|OP|170000|2210000
245|paket data pengumpulan data Survei Angkatan Kerja Nasional agustus|28|OB|50000|1400000
245|paket data pengumpulan data Survei Angkatan Kerja Nasional februari|9|OB|50000|450000
250|honor petugas pendataan lapangan updating SLS (Sakernas Mei)|16|DOK|168000|2688000
250|honor petugas pendataan lapangan (Sakernas Mei)|160|RUTA|55000|8800000
252|honor petugas pemeriksaan lapangan (Sakernas November)|160|DOK|10000|1600000
252|honor petugas pendataan lapangan (Sakernas November)|160|DOK|55000|8800000
253|transport lokal petugas pendataan lapangan (Sakernas November)|16|DOK|170000|2720000
253|transport lokal petugas pemeriksaan lapangan (Sakernas November)|16|DOK|170000|2720000
256|perjalanan pelatihan petugas Survei Angkatan Kerja Nasional agustus|46|OP|91305|4200000
257|pelatihan petugas Survei Angkatan Kerja Nasional agustus|66|OP|180000|11880000
257|perjalanan pelatihan petugas Survei Angkatan Kerja Nasional agustus|66|OP|102820|6786000
259|Pencetakan dokumen untuk petugas (Sakernas November)|6182|LMBR|500|3091000
259|Konsumsi briefing petugas|28|OK|105000|2940000
260|Transport Briefing Petugas|28|OK|170000|4760000
263|Biaya paket data dan komunikasi pendataan lapangan sakernas mei|12|OB|100000|1200000
264|Pengawasan pencacahan dari BPS kabupaten/kota ke Kec (Sakernas Mei)|1|OP|256000|256000
266|Biaya paket data dan komunikasi pendataan lapangan (Sakernas November)|12|OB|100000|1200000
267|Konsultasi kab/kota ke provinsi|2|OP|3712000|7424000
268|Transport daerah sulit|1|OK|1275000|1275000
274|Pengadaan ATK|1|PAKET|1084000|1084000
277|Konsumsi rapat DTSEN 2026 di kab/kota|20|OK|64000|1280000
278|Transport lokal dalam rangka uji petik DTSEN 2026|5|OK|170000|850000
278|Transport daerah sulit DTSEN 2026|1|OP|375000|375000
278|Transport Ground Check DTSEN PBI|31|OP|170000|5270000
282|honor petugas pemeriksaan lapangan Survei Sosial Ekonomi Nasional (susenas maret)|360|RUTA|43000|15480000
282|honor petugas pemeriksaan lapangan Survei Sosial Ekonomi Nasional (Susenas September)|40|RUTA|43000|1720000
282|honor petugas pemeriksaan updating listing (susenas maret)|36|EA|55000|1980000
282|honor petugas pemeriksaan updating listing (susenas September)|4|EA|55000|220000
282|honor petugas pendataan lapangan Survei Ekonomi Rumah Tangga Triwulanan (Seruti)|220|RUTA|124000|27280000
282|honor petugas pemeriksaan Survei Ekonomi Rumah Tangga Triwulanan (Seruti) terintegrasi Susenas|40|RUTA|29000|1160000
282|honor petugas pendataan lapangan Survei Ekonomi Rumah Tangga Triwulanan (Seruti) terintegrasi Susenas|300|RUTA|86000|25800000
282|honor petugas pendataan lapangan Survei Sosial Ekonomi Nasional (susenas maret)|680|RUTA|128000|87040000
282|honor petugas pendataan lapangan Survei Sosial Ekonomi Nasional (susenas september)|150|RUTA|128000|19200000
282|honor petugas pendataan lapangan updating listing (susenas maret)|68|EA|168000|11424000
282|honor petugas pendataan lapangan updating listing (susenas september)|15|EA|168000|2520000
282|honor petugas pengolahan Survei Ekonomi Rumah Tangga Triwulanan (Seruti)|300|RUTA|25000|7500000
282|honor petugas pengolahan Survei Ekonomi Rumah Tangga Triwulanan (Seruti) terintegrasi Susenas|300|RUTA|18000|5400000
282|honor petugas pengolahan Survei Sosial Ekonomi Nasional (susenas maret)|680|RUTA|26000|17680000
282|honor petugas pengolahan Survei Sosial Ekonomi Nasional (susenas september)|150|RUTA|26000|3900000
282|honor petugas pengolahan updating listing (susenas maret)|68|DOK|34000|2312000
282|honor petugas pengolahan updating listing (susenas september)|15|DOK|34000|510000
283|transport lokal petugas pemeriksaan lapangan (seruti triwulan 1 dan 3)|18|OK|170000|3060000
283|transport lokal petugas pemeriksaan lapangan (seruti triwulan 2 dan 4)|2|OK|170000|340000
283|transport lokal petugas pemeriksaan lapangan (susenas maret organik)|24|OK|170000|4080000
283|transport lokal petugas pemeriksaan lapangan (susenas september organik)|1|OK|170000|170000
283|transport lokal petugas pemeriksaan lapangan updating listing (susenas september organik)|1|OK|170000|170000
283|transport lokal petugas pendataan susenas september|5|OK|170000|850000
286|paket data pelatihan petugas susenas maret|53|OB|50000|2650000
286|paket data pelatihan petugas susenas september|10|OB|31500|315000
286|Pencetakan Spanduk Pelatihan|12|M2|40000|480000
286|perlengkapan pelatihan petugas susenas september|23|SET|45000|1035000
286|perlengkapan petugas pelatihan petugas susenas maret|70|SET|50000|3500000
$det$;
  if md5(data_) <> '1bd13babf036780527674743d32e11a9' then raise exception 'Salinan data rusak (checksum tidak cocok); hentikan.'; end if;
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
  raise notice 'Bagian 2: % detail', n;
end
$impor$;
