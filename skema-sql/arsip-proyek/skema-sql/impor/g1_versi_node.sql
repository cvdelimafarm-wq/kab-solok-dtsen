-- 20261024g_impor_pok_2026_30sep (1 dari 3): versi POK draf dan 524 node
-- DATA (bukan skema), aman diulang. Sumber: parse RKKS 30 Sep 2026, sha256 4612bdcf8137488ca0cf9ea72b3e193c324e7079ad6331c14178eca9d02c42fc
-- Versi POK nomor revisi 1 SEMENTARA (nomor revisi resmi menyusul). Tanpa DELETE/DROP.
do $impor$
declare data_ text; v bigint; l text; p text[]; idmap jsonb := '{}'::jsonb; pid bigint; kem int; n int := 0;
begin
  if exists (select 1 from keu_pok_versi where tahun = 2026 and nomor_revisi = 1) then
    raise notice 'Versi POK 2026 revisi 1 sudah ada; bagian 1 dilewati.'; return;
  end if;
  insert into keu_pok_versi(tahun, nomor_revisi, jenis, nomor_pok, tanggal_efektif, sumber_berkas, hash_berkas, status)
  values (2026, 1, 'revisi', 'POK posisi 30 Sep 2026 (nomor revisi resmi menyusul)', date '2026-09-30',
          'RKKS PDF 30 Sep 2026, hasil parse pok_tree.json', '4612bdcf8137488ca0cf9ea72b3e193c324e7079ad6331c14178eca9d02c42fc', 'draf') returning id into v;
  data_ := $nodes$
1||program|GG|Program Penyediaan dan Pelayanan Informasi Statistik|9084539000|
2|1|kegiatan|2896|Analisis Statistik, Tata Kelola Data Statistik Pembangunan, dan Neraca Satelit|170000|
3|2|kro|BMA|Data dan Informasi Publik[Base Line]|170000|
4|3|ro|004|PUBLIKASI/LAPORAN ANALISIS STATISTIK DAN NERACA SATELIT|170000|2896.BMA.004
5|4|komponen|052|PENGUMPULAN DATA|170000|
6|5|subkomp|A|TANPA SUB KOMPONEN|170000|
7|6|akun|524113|Belanja Perjalanan Dinas Dalam Kota|170000|
8|1|kegiatan|2897|Diseminasi, Pemberdayaan, dan Evaluasi Penyelenggaraan Statistik|3040000|
9|8|kro|BMA|Data dan Informasi Publik[Base Line]|510000|
10|9|ro|004|LAYANAN STATISTIK TERPADU|510000|2897.BMA.004
11|10|komponen|052|PENGUMPULAN DATA|510000|
12|11|subkomp|A|TANPA SUB KOMPONEN|510000|
13|12|akun|524113|Belanja Perjalanan Dinas Dalam Kota|510000|
14|8|kro|QDB|Fasilitasi dan Pembinaan Lembaga[Base Line]|2530000|
15|14|ro|003|PEMBINAAN STATISTIK SEKTORAL|2530000|2897.QDB.003
16|15|komponen|052|PENGUMPULAN DATA|2530000|
17|16|subkomp|A|TANPA SUB KOMPONEN|2530000|
18|17|akun|521211|Belanja Bahan|2530000|
19|1|kegiatan|2898|Penyediaan dan Pengembangan Statistik Neraca Pengeluaran|15160000|
20|19|kro|BMA|Data dan Informasi Publik[Base Line]|15160000|
21|20|ro|007|PUBLIKASI/LAPORAN STATISTIK NERACA PENGELUARAN|15160000|2898.BMA.007
22|21|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|6980000|
23|22|subkomp|A|TANPA SUB KOMPONEN|6980000|
24|23|akun|521213|Belanja Honor Output Kegiatan|6640000|
25|23|akun|524113|Belanja Perjalanan Dinas Dalam Kota|340000|
26|21|komponen|051|PERSIAPAN|5260000|
27|26|subkomp|A|TANPA SUB KOMPONEN|5260000|
28|27|akun|521211|Belanja Bahan|993000|
29|27|akun|521213|Belanja Honor Output Kegiatan|999000|
30|27|akun|524111|Belanja Perjalanan Dinas Biasa|2588000|
31|27|akun|524113|Belanja Perjalanan Dinas Dalam Kota|680000|
32|21|komponen|052|PENGUMPULAN DATA|2920000|
33|32|subkomp|A|TANPA SUB KOMPONEN|2920000|
34|33|akun|521211|Belanja Bahan|750000|
35|33|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2170000|
36|1|kegiatan|2899|Penyediaan dan Pengembangan Statistik Neraca Produksi|13541000|
37|36|kro|BMA|Data dan Informasi Publik[Base Line]|13541000|
38|37|ro|006|PUBLIKASI/LAPORAN NERACA PRODUKSI|13541000|2899.BMA.006
39|38|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|5410000|
40|39|subkomp|A|TANPA SUB KOMPONEN|5410000|
41|40|akun|521213|Belanja Honor Output Kegiatan|3200000|
42|40|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2210000|
43|38|komponen|051|PERSIAPAN|5371000|
44|43|subkomp|A|TANPA SUB KOMPONEN|5371000|
45|44|akun|521211|Belanja Bahan|750000|
46|44|akun|521213|Belanja Honor Output Kegiatan|1998000|
47|44|akun|521811|Belanja Barang Persediaan Barang Konsumsi|226000|
48|44|akun|522151|Belanja Jasa Profesi|900000|
49|44|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1497000|
50|38|komponen|052|PENGUMPULAN DATA|2760000|
51|50|subkomp|A|TANPA SUB KOMPONEN|2760000|
52|51|akun|521211|Belanja Bahan|200000|
53|51|akun|524111|Belanja Perjalanan Dinas Biasa|2560000|
54|1|kegiatan|2900|Pengembangan Metodologi Statistik dan Sains Data|6132000|
55|54|kro|BMA|Data dan Informasi Publik[Base Line]|1016000|
56|55|ro|005|Dokumen/Laporan Pengembangan Metodologi Statistik dan Sains Data|1016000|2900.BMA.005
57|56|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|510000|
58|57|subkomp|A|TANPA SUB KOMPONEN|510000|
59|58|akun|524113|Belanja Perjalanan Dinas Dalam Kota|510000|
60|56|komponen|051|PERSIAPAN|250000|
61|60|subkomp|A|TANPA SUB KOMPONEN|250000|
62|61|akun|521811|Belanja Barang Persediaan Barang Konsumsi|250000|
63|56|komponen|052|PENGUMPULAN DATA|256000|
64|63|subkomp|A|TANPA SUB KOMPONEN|256000|
65|64|akun|524113|Belanja Perjalanan Dinas Dalam Kota|256000|
66|54|kro|QMA|Data dan Informasi Publik[Base Line]|5116000|
67|66|ro|006|Pemanfaatan Big Data untuk Statistik Resmi|5116000|2900.QMA.006
68|67|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|4774000|
69|68|subkomp|D|TANPA SUB KOMPONEN|4774000|
70|69|akun|521213|Belanja Honor Output Kegiatan|3584000|
71|69|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1190000|
72|67|komponen|052|Pengumpulan Data|342000|
73|72|subkomp|A|TANPA SUB KOMPONEN|342000|
74|73|akun|524113|Belanja Perjalanan Dinas Dalam Kota|342000|
75|1|kegiatan|2901|Pengembangan Sistem Informasi Statistik|7945000|
76|75|kro|CAN|Sarana Bidang Teknologi Informasi dan Komunikasi[Base Line]|7945000|
77|76|ro|004|Pengembangan Infrastruktur dan Layanan Teknologi Informasi dan Komunikasi|7945000|2901.CAN.004
78|77|komponen|056|Pengembangan Infrastruktur dan Layanan Teknologi|7945000|
79|78|subkomp|A|TANPA SUB KOMPONEN|7945000|
80|79|akun|521252|Belanja Peralatan dan Mesin - Ekstrakomptabel|3996000|
81|79|akun|523121|Belanja Pemeliharaan Peralatan dan Mesin|3949000|
82|1|kegiatan|2902|Penyediaan dan Pengembangan Statistik Distribusi|6320508000|
83|82|kro|BMA|Data dan Informasi Publik[Base Line]|735039000|
84|83|ro|004|PUBLIKASI/LAPORAN STATISTIK DISTRIBUSI|4956000|2902.BMA.004
85|84|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|4906000|
86|85|subkomp|A|TANPA SUB KOMPONEN|4906000|
87|86|akun|521213|Belanja Honor Output Kegiatan|3036000|
88|86|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1870000|
89|84|komponen|052|PENGUMPULAN DATA|50000|
90|89|subkomp|A|TANPA SUB KOMPONEN|50000|
91|90|akun|521211|Belanja Bahan|50000|
92|83|ro|006|PUBLIKASI/LAPORAN SENSUS EKONOMI|730083000|2902.BMA.006
93|92|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|80268000|
94|93|subkomp|A|TANPA SUB KOMPONEN|80268000|
95|94|akun|521213|Belanja Honor Output Kegiatan|19578000|
96|94|akun|524111|Belanja Perjalanan Dinas Biasa|340000|
97|94|akun|524113|Belanja Perjalanan Dinas Dalam Kota|60350000|
98|92|komponen|523|Publisitas SE2026|12354000|
99|98|subkomp|A|TANPA SUB KOMPONEN|12354000|
100|99|akun|522191|Belanja Jasa Lainnya|4354000|
101|99|akun|524111|Belanja Perjalanan Dinas Biasa|8000000|
102|92|komponen|524|Penetapan Kerangka Geospasial dan Muatan Wilkerstat|11298000|
103|102|subkomp|A|TANPA SUB KOMPONEN|11298000|
104|103|akun|521211|Belanja Bahan|1596000|
105|103|akun|521213|Belanja Honor Output Kegiatan|1998000|
106|103|akun|521811|Belanja Barang Persediaan Barang Konsumsi|6684000|
107|103|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1020000|
108|92|komponen|529|Penerapan Prelist SBR Untuk SE2026|8627000|
109|108|subkomp|A|TANPA SUB KOMPONEN|8627000|
110|109|akun|521811|Belanja Barang Persediaan Barang Konsumsi|145000|
111|109|akun|524111|Belanja Perjalanan Dinas Biasa|1000000|
112|109|akun|524113|Belanja Perjalanan Dinas Dalam Kota|7482000|
113|92|komponen|530|Pelaksanaan SE2026|557075000|
114|113|subkomp|A|TANPA SUB KOMPONEN|537241000|
115|114|akun|521211|Belanja Bahan|11075000|
116|114|akun|522141|Belanja Sewa|3000000|
117|114|akun|524111|Belanja Perjalanan Dinas Biasa|1166000|
118|114|akun|524119|Belanja Perjalanan Dinas Paket Meeting Luar Kota|522000000|
119|113|subkomp|B|TANPA SUB KOMPONEN|19834000|
120|119|akun|521211|Belanja Bahan|13995000|
121|119|akun|521213|Belanja Honor Output Kegiatan|5200000|
122|119|akun|521811|Belanja Barang Persediaan Barang Konsumsi|639000|
123|92|komponen|532|Post Enumeration Survey (PES) SE2026|55461000|
124|123|subkomp|A|TANPA SUB KOMPONEN|55461000|
125|124|akun|521211|Belanja Bahan|5400000|
126|124|akun|521213|Belanja Honor Output Kegiatan|3996000|
127|124|akun|521219|Belanja Barang Non Operasional Lainnya|603000|
128|124|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|45462000|
129|92|komponen|535|Penyusunan Diseminasi SE2026|5000000|
130|129|subkomp|A|TANPA SUB KOMPONEN|5000000|
131|130|akun|521811|Belanja Barang Persediaan Barang Konsumsi|5000000|
132|82|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|4112486000|
133|132|ro|006|PUBLIKASI/LAPORAN SENSUS EKONOMI|4112486000|2902.BMA.006
134|133|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|4068086000|
135|134|subkomp|A|SENSUS EKONOMI 2026|4068086000|
136|135|akun|521211|Belanja Bahan|14349000|
137|135|akun|521213|Belanja Honor Output Kegiatan|4050614000|
138|135|akun|521811|Belanja Barang Persediaan Barang Konsumsi|3123000|
139|133|komponen|530|Pelaksanaan SE2026|44400000|
140|139|subkomp|A|TANPA SUB KOMPONEN|44400000|
141|140|akun|521213|Belanja Honor Output Kegiatan|44400000|
142|82|kro|CAN|Sarana Bidang Teknologi Informasi dan Komunikasi[Base Line]|45000000|
143|142|ro|004|Pengembangan Infrastruktur dan Layanan Teknologi Informasi dan Komunikasi|45000000|2902.CAN.004
144|143|komponen|056|Pengadaan TIK SE2026|45000000|
145|144|subkomp|A|TANPA SUB KOMPONEN|45000000|
146|145|akun|532111|Belanja Modal Peralatan dan Mesin|45000000|
147|82|kro|FAN|Pemenuhan Prioritas Direktif Presiden[Base Line]|1427983000|
148|147|ro|ZZ1|Pemenuhan Prioritas Direktif Presiden|1427983000|2902.FAN.ZZ1
149|148|komponen|051|SENSUS EKONOMI 2026|1427983000|
150|149|subkomp|A|TANPA SUB KOMPONEN|852231000|
151|150|akun|521213|Belanja Honor Output Kegiatan|852231000|
152|149|subkomp|B|TANPA SUB KOMPONEN|286315000|
153|152|akun|521211|Belanja Bahan|7296000|
154|152|akun|521213|Belanja Honor Output Kegiatan|17300000|
155|152|akun|524111|Belanja Perjalanan Dinas Biasa|15519000|
156|152|akun|524113|Belanja Perjalanan Dinas Dalam Kota|15980000|
157|152|akun|524119|Belanja Perjalanan Dinas Paket Meeting Luar Kota|230220000|
158|149|subkomp|C|TANPA SUB KOMPONEN|289437000|
159|158|akun|521211|Belanja Bahan|141939000|
160|158|akun|521219|Belanja Barang Non Operasional Lainnya|25909000|
161|158|akun|521811|Belanja Barang Persediaan Barang Konsumsi|3961000|
162|158|akun|524111|Belanja Perjalanan Dinas Biasa|2100000|
163|158|akun|524113|Belanja Perjalanan Dinas Dalam Kota|115528000|
164|1|kegiatan|2903|Penyediaan dan Pengembangan Statistik Harga|640959000|
165|164|kro|BMA|Data dan Informasi Publik[Base Line]|322493000|
166|165|ro|007|Publikasi/Laporan Survei Pola Konsumsi Rumah Tangga|250466000|2903.BMA.007
167|166|komponen|051|Persiapan|241058000|
168|167|subkomp|A|TANPA SUB KOMPONEN|241058000|
169|168|akun|521211|Belanja Bahan|5900000|
170|168|akun|521213|Belanja Honor Output Kegiatan|7104000|
171|168|akun|521811|Belanja Barang Persediaan Barang Konsumsi|83782000|
172|168|akun|524113|Belanja Perjalanan Dinas Dalam Kota|11560000|
173|168|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|132712000|
174|166|komponen|052|Pengumpulan Data|256000|
175|174|subkomp|A|TANPA SUB KOMPONEN|256000|
176|175|akun|524113|Belanja Perjalanan Dinas Dalam Kota|256000|
177|166|komponen|053|Pengolahan dan Analisis|9152000|
178|177|subkomp|A|TANPA SUB KOMPONEN|9152000|
179|178|akun|521211|Belanja Bahan|3674000|
180|178|akun|521213|Belanja Honor Output Kegiatan|888000|
181|178|akun|524113|Belanja Perjalanan Dinas Dalam Kota|4590000|
182|165|ro|009|PUBLIKASI/LAPORAN STATISTIK HARGA|72027000|2903.BMA.009
183|182|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|59548000|
184|183|subkomp|A|TANPA SUB KOMPONEN|59548000|
185|184|akun|521213|Belanja Honor Output Kegiatan|54108000|
186|184|akun|524113|Belanja Perjalanan Dinas Dalam Kota|5440000|
187|182|komponen|051|PERSIAPAN|10911000|
188|187|subkomp|A|TANPA SUB KOMPONEN|10911000|
189|188|akun|521211|Belanja Bahan|1211000|
190|188|akun|521213|Belanja Honor Output Kegiatan|1998000|
191|188|akun|521811|Belanja Barang Persediaan Barang Konsumsi|3566000|
192|188|akun|524111|Belanja Perjalanan Dinas Biasa|2266000|
193|188|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1870000|
194|182|komponen|052|PENGUMPULAN DATA|1568000|
195|194|subkomp|A|TANPA SUB KOMPONEN|1568000|
196|195|akun|521211|Belanja Bahan|50000|
197|195|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1518000|
198|164|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|318466000|
199|198|ro|008|Publikasi/Laporan Survei Penyempurnaan Diagram Timbang Nilai Tukar Petani|318466000|2903.BMA.008
200|199|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|159767000|
201|200|subkomp|A|TANPA SUB KOMPONEN|159767000|
202|201|akun|521213|Belanja Honor Output Kegiatan|159767000|
203|199|komponen|051|Persiapan|105898000|
204|203|subkomp|A|TANPA SUB KOMPONEN|105898000|
205|204|akun|521211|Belanja Bahan|2900000|
206|204|akun|521213|Belanja Honor Output Kegiatan|3996000|
207|204|akun|521811|Belanja Barang Persediaan Barang Konsumsi|28786000|
208|204|akun|524119|Belanja Perjalanan Dinas Paket Meeting Luar Kota|70216000|
209|199|komponen|052|Pengumpulan Data|52801000|
210|209|subkomp|A|TANPA SUB KOMPONEN|52801000|
211|210|akun|524113|Belanja Perjalanan Dinas Dalam Kota|52801000|
212|1|kegiatan|2904|Penyediaan dan Pengembangan Statistik Industri|46759000|
213|212|kro|BMA|Data dan Informasi Publik[Base Line]|46759000|
214|213|ro|006|PUBLIKASI/LAPORAN STATISTIK INDUSTRI|46759000|2904.BMA.006
215|214|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|35307000|
216|215|subkomp|A|TANPA SUB KOMPONEN|35307000|
217|216|akun|521213|Belanja Honor Output Kegiatan|32417000|
218|216|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2890000|
219|214|komponen|051|PERSIAPAN|9832000|
220|219|subkomp|A|TANPA SUB KOMPONEN|9832000|
221|220|akun|521211|Belanja Bahan|4040000|
222|220|akun|521213|Belanja Honor Output Kegiatan|2997000|
223|220|akun|521811|Belanja Barang Persediaan Barang Konsumsi|933000|
224|220|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1862000|
225|214|komponen|052|PENGUMPULAN DATA|1620000|
226|225|subkomp|A|TANPA SUB KOMPONEN|1620000|
227|226|akun|521211|Belanja Bahan|1450000|
228|226|akun|524113|Belanja Perjalanan Dinas Dalam Kota|170000|
229|1|kegiatan|2905|Penyediaan dan Pengembangan Statistik Kependudukan dan Ketenagakerjaan|188746000|
230|229|kro|BMA|Data dan Informasi Publik[Base Line]|116406000|
231|230|ro|004|PUBLIKASI/LAPORAN SURVEI ANGKATAN KERJA NASIONAL|116406000|2905.BMA.004
232|231|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|84045000|
233|232|subkomp|A|TANPA SUB KOMPONEN|84045000|
234|233|akun|521213|Belanja Honor Output Kegiatan|68065000|
235|233|akun|524113|Belanja Perjalanan Dinas Dalam Kota|15980000|
236|231|komponen|051|PERSIAPAN|30511000|
237|236|subkomp|A|TANPA SUB KOMPONEN|30511000|
238|237|akun|521211|Belanja Bahan|6250000|
239|237|akun|521213|Belanja Honor Output Kegiatan|5994000|
240|237|akun|521811|Belanja Barang Persediaan Barang Konsumsi|3370000|
241|237|akun|524111|Belanja Perjalanan Dinas Biasa|1607000|
242|237|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|13290000|
243|231|komponen|052|PENGUMPULAN DATA|1850000|
244|243|subkomp|A|TANPA SUB KOMPONEN|1850000|
245|244|akun|521211|Belanja Bahan|1850000|
246|229|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|72340000|
247|246|ro|004|PUBLIKASI/LAPORAN SURVEI ANGKATAN KERJA NASIONAL|72340000|2905.BMA.004
248|247|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|27328000|
249|248|subkomp|B|SAKERNAS MEI|11488000|
250|249|akun|521213|Belanja Honor Output Kegiatan|11488000|
251|248|subkomp|C|SAKERNAS NOVEMBER|15840000|
252|251|akun|521213|Belanja Honor Output Kegiatan|10400000|
253|251|akun|524113|Belanja Perjalanan Dinas Dalam Kota|5440000|
254|247|komponen|051|PERSIAPAN|33657000|
255|254|subkomp|B|SAKERNAS MEI|22866000|
256|255|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|4200000|
257|255|akun|524119|Belanja Perjalanan Dinas Paket Meeting Luar Kota|18666000|
258|254|subkomp|C|SAKERNAS NOVEMBER|10791000|
259|258|akun|521211|Belanja Bahan|6031000|
260|258|akun|524113|Belanja Perjalanan Dinas Dalam Kota|4760000|
261|247|komponen|052|PENGUMPULAN DATA|11355000|
262|261|subkomp|B|SAKERNAS MEI|1456000|
263|262|akun|521211|Belanja Bahan|1200000|
264|262|akun|524113|Belanja Perjalanan Dinas Dalam Kota|256000|
265|261|subkomp|C|SAKERNAS NOVEMBER|9899000|
266|265|akun|521211|Belanja Bahan|1200000|
267|265|akun|524111|Belanja Perjalanan Dinas Biasa|7424000|
268|265|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1275000|
269|1|kegiatan|2906|Penyediaan dan Pengembangan Statistik Kesejahteraan Rakyat|393951000|
270|269|kro|BMA|Data dan Informasi Publik[Base Line]|393951000|
271|270|ro|005|PUBLIKASI/LAPORAN DATA TUNGGAL SOSIAL DAN EKONOMI NASIONAL|8859000|2906.BMA.005
272|271|komponen|051|PERSIAPAN|1084000|
273|272|subkomp|A|TANPA SUB KOMPONEN|1084000|
274|273|akun|521811|Belanja Barang Persediaan Barang Konsumsi|1084000|
275|271|komponen|052|PENGUMPULAN DATA|7775000|
276|275|subkomp|A|TANPA SUB KOMPONEN|7775000|
277|276|akun|521211|Belanja Bahan|1280000|
278|276|akun|524113|Belanja Perjalanan Dinas Dalam Kota|6495000|
279|270|ro|006|PUBLIKASI/LAPORAN SURVEI SOSIAL EKONOMI NASIONAL|385092000|2906.BMA.006
280|279|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|239796000|
281|280|subkomp|A|TANPA SUB KOMPONEN|239796000|
282|281|akun|521213|Belanja Honor Output Kegiatan|231126000|
283|281|akun|524113|Belanja Perjalanan Dinas Dalam Kota|8670000|
284|279|komponen|051|PERSIAPAN|139856000|
285|284|subkomp|A|TANPA SUB KOMPONEN|139856000|
286|285|akun|521211|Belanja Bahan|7980000|
287|285|akun|521213|Belanja Honor Output Kegiatan|9990000|
288|285|akun|521811|Belanja Barang Persediaan Barang Konsumsi|21554000|
289|285|akun|524111|Belanja Perjalanan Dinas Biasa|3792000|
290|285|akun|524113|Belanja Perjalanan Dinas Dalam Kota|340000|
291|285|akun|524119|Belanja Perjalanan Dinas Paket Meeting Luar Kota|96200000|
292|279|komponen|052|PENGUMPULAN DATA|5440000|
293|292|subkomp|A|TANPA SUB KOMPONEN|5440000|
294|293|akun|524113|Belanja Perjalanan Dinas Dalam Kota|5440000|
295|1|kegiatan|2907|Penyediaan dan Pengembangan Statistik Ketahanan Sosial|971871000|
296|295|kro|BMA|Data dan Informasi Publik[Base Line]|24037000|
297|296|ro|006|PUBLIKASI/LAPORAN STATISTIK KETAHANAN SOSIAL|465000|2907.BMA.006
298|297|komponen|051|PERSIAPAN|125000|
299|298|subkomp|A|TANPA SUB KOMPONEN|125000|
300|299|akun|521811|Belanja Barang Persediaan Barang Konsumsi|125000|
301|297|komponen|052|PENGUMPULAN DATA|340000|
302|301|subkomp|A|TANPA SUB KOMPONEN|340000|
303|302|akun|524113|Belanja Perjalanan Dinas Dalam Kota|340000|
304|296|ro|008|PUBLIKASI/LAPORAN PENDATAAN POTENSI DESA|23572000|2907.BMA.008
305|304|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|16288000|
306|305|subkomp|A|TANPA SUB KOMPONEN|16288000|
307|306|akun|521213|Belanja Honor Output Kegiatan|4218000|
308|306|akun|524113|Belanja Perjalanan Dinas Dalam Kota|12070000|
309|304|komponen|051|PERSIAPAN|5254000|
310|309|subkomp|A|TANPA SUB KOMPONEN|5254000|
311|310|akun|521211|Belanja Bahan|2793000|
312|310|akun|521213|Belanja Honor Output Kegiatan|999000|
313|310|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1462000|
314|304|komponen|052|PENGUMPULAN DATA|2030000|
315|314|subkomp|A|TANPA SUB KOMPONEN|2030000|
316|315|akun|521211|Belanja Bahan|1050000|
317|315|akun|524113|Belanja Perjalanan Dinas Dalam Kota|980000|
318|295|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|937222000|
319|318|ro|009|PUBLIKASI/LAPORAN DATA TUNGGAL BENCANA|937222000|2907.BMA.009
320|319|komponen|051|Persiapan|30080000|
321|320|subkomp|A|TANPA SUB KOMPONEN|30080000|
322|321|akun|521211|Belanja Bahan|30080000|
323|319|komponen|052|Pengumpulan Data|907142000|
324|323|subkomp|A|TANPA SUB KOMPONEN|907142000|
325|324|akun|521213|Belanja Honor Output Kegiatan|10656000|
326|324|akun|524113|Belanja Perjalanan Dinas Dalam Kota|669404000|
327|324|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|227082000|
328|295|kro|UBB|Fasilitasi dan Pembinaan Pemerintah Desa[Base Line]|10612000|
329|328|ro|006|PEMBINAAN DESA CINTA STATISTIK|10612000|2907.UBB.006
330|329|komponen|051|PERSIAPAN|4220000|
331|330|subkomp|A|TANPA SUB KOMPONEN|4220000|
332|331|akun|521211|Belanja Bahan|2320000|
333|331|akun|522151|Belanja Jasa Profesi|1900000|
334|329|komponen|052|PENGUMPULAN DATA|320000|
335|334|subkomp|A|TANPA SUB KOMPONEN|320000|
336|335|akun|524113|Belanja Perjalanan Dinas Dalam Kota|320000|
337|329|komponen|054|DISEMINASI DAN EVALUASI|6072000|
338|337|subkomp|A|TANPA SUB KOMPONEN|6072000|
339|338|akun|521211|Belanja Bahan|1992000|
340|338|akun|524111|Belanja Perjalanan Dinas Biasa|4080000|
341|1|kegiatan|2908|Penyediaan dan Pengembangan Statistik Jasa|41309000|
342|341|kro|BMA|Data dan Informasi Publik[Base Line]|41309000|
343|342|ro|004|PUBLIKASI/LAPORAN STATISTIK JASA|41309000|2908.BMA.004
344|343|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|31155000|
345|344|subkomp|A|TANPA SUB KOMPONEN|31155000|
346|345|akun|521213|Belanja Honor Output Kegiatan|28095000|
347|345|akun|524113|Belanja Perjalanan Dinas Dalam Kota|3060000|
348|343|komponen|051|PERSIAPAN|9004000|
349|348|subkomp|A|TANPA SUB KOMPONEN|9004000|
350|349|akun|521211|Belanja Bahan|1330000|
351|349|akun|521213|Belanja Honor Output Kegiatan|3996000|
352|349|akun|521219|Belanja Barang Non Operasional Lainnya|350000|
353|349|akun|521811|Belanja Barang Persediaan Barang Konsumsi|2138000|
354|349|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1190000|
355|343|komponen|052|PENGUMPULAN DATA|1150000|
356|355|subkomp|A|TANPA SUB KOMPONEN|1150000|
357|356|akun|521219|Belanja Barang Non Operasional Lainnya|1150000|
358|1|kegiatan|2909|Penyediaan dan Pengembangan Statistik Peternakan, Perikanan, dan Kehutanan|51106000|
359|358|kro|BMA|Data dan Informasi Publik[Base Line]|8005000|
360|359|ro|005|PUBLIKASI/LAPORAN STATISTIK PETERNAKAN, PERIKANAN, DAN KEHUTANAN|8005000|2909.BMA.005
361|360|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|198000|
362|361|subkomp|A|TANPA SUB KOMPONEN|198000|
363|362|akun|521213|Belanja Honor Output Kegiatan|198000|
364|360|komponen|051|PERSIAPAN|6901000|
365|364|subkomp|A|TANPA SUB KOMPONEN|6901000|
366|365|akun|521211|Belanja Bahan|2344000|
367|365|akun|521213|Belanja Honor Output Kegiatan|2331000|
368|365|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2226000|
369|360|komponen|052|PENGUMPULAN DATA|906000|
370|369|subkomp|A|TANPA SUB KOMPONEN|906000|
371|370|akun|521211|Belanja Bahan|600000|
372|370|akun|524113|Belanja Perjalanan Dinas Dalam Kota|306000|
373|358|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|43101000|
374|373|ro|006|PUBLIKASI/LAPORAN SURVEI PERTANIAN TERINTEGRASI|43101000|2909.BMA.006
375|374|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|22060000|
376|375|subkomp|B|Survei Pertanian Terintegrasi|22060000|
377|376|akun|521213|Belanja Honor Output Kegiatan|19595000|
378|376|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2465000|
379|374|komponen|051|PERSIAPAN|20908000|
380|379|subkomp|B|Survei Pertanian Terintegrasi|20908000|
381|380|akun|521211|Belanja Bahan|2400000|
382|380|akun|521213|Belanja Honor Output Kegiatan|1998000|
383|380|akun|524114|Belanja Perjalanan Dinas Paket Meeting Dalam Kota|16510000|
384|374|komponen|052|PENGUMPULAN DATA|133000|
385|384|subkomp|B|Survei Pertanian Terintegrasi|133000|
386|385|akun|524113|Belanja Perjalanan Dinas Dalam Kota|133000|
387|1|kegiatan|2910|Penyediaan dan Pengembangan Statistik Tanaman Pangan, Hortikultura, dan Perkebunan|347004000|
388|387|kro|BMA|Data dan Informasi Publik[Base Line]|313777000|
389|388|ro|007|PUBLIKASI/ LAPORAN STATISTIK TANAMAN PANGAN|221393000|2910.BMA.007
390|389|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|171676000|
391|390|subkomp|A|TANPA SUB KOMPONEN|171676000|
392|391|akun|521213|Belanja Honor Output Kegiatan|157226000|
393|391|akun|524111|Belanja Perjalanan Dinas Biasa|3740000|
394|391|akun|524113|Belanja Perjalanan Dinas Dalam Kota|10710000|
395|389|komponen|051|Persiapan|20622000|
396|395|subkomp|A|TANPA SUB KOMPONEN|20622000|
397|396|akun|521211|Belanja Bahan|9704000|
398|396|akun|521213|Belanja Honor Output Kegiatan|1998000|
399|396|akun|521811|Belanja Barang Persediaan Barang Konsumsi|3723000|
400|396|akun|524113|Belanja Perjalanan Dinas Dalam Kota|5197000|
401|389|komponen|052|Pengumpulan Data|29095000|
402|401|subkomp|A|TANPA SUB KOMPONEN|29095000|
403|402|akun|521211|Belanja Bahan|16150000|
404|402|akun|521219|Belanja Barang Non Operasional Lainnya|11564000|
405|402|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1381000|
406|388|ro|008|PUBLIKASI/LAPORAN STATISTIK HORTIKULTURA DAN PERKEBUNAN|92384000|2910.BMA.008
407|406|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|52454000|
408|407|subkomp|A|TANPA SUB KOMPONEN|52454000|
409|408|akun|521213|Belanja Honor Output Kegiatan|42424000|
410|408|akun|524113|Belanja Perjalanan Dinas Dalam Kota|10030000|
411|406|komponen|051|PERSIAPAN|24070000|
412|411|subkomp|A|TANPA SUB KOMPONEN|24070000|
413|412|akun|521211|Belanja Bahan|13493000|
414|412|akun|521213|Belanja Honor Output Kegiatan|4773000|
415|412|akun|521811|Belanja Barang Persediaan Barang Konsumsi|1090000|
416|412|akun|524113|Belanja Perjalanan Dinas Dalam Kota|4714000|
417|406|komponen|052|PENGUMPULAN DATA|15860000|
418|417|subkomp|A|TANPA SUB KOMPONEN|15860000|
419|418|akun|521211|Belanja Bahan|6400000|
420|418|akun|524113|Belanja Perjalanan Dinas Dalam Kota|9460000|
421|387|kro|BMA|Data dan Informasi Publik[Penambahan alokasi dari SABA 999.08 ke 9A]|33227000|
422|421|ro|007|PUBLIKASI/ LAPORAN STATISTIK TANAMAN PANGAN|33227000|2910.BMA.007
423|422|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|16762000|
424|423|subkomp|B|Survei Konversi Gabah ke Beras|16762000|
425|424|akun|521213|Belanja Honor Output Kegiatan|6952000|
426|424|akun|524111|Belanja Perjalanan Dinas Biasa|7430000|
427|424|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2380000|
428|422|komponen|051|Persiapan|500000|
429|428|subkomp|B|Survei Konversi Gabah ke Beras|500000|
430|429|akun|521811|Belanja Barang Persediaan Barang Konsumsi|500000|
431|422|komponen|052|Pengumpulan Data|15965000|
432|431|subkomp|B|Survei Konversi Gabah ke Beras|15965000|
433|432|akun|521211|Belanja Bahan|675000|
434|432|akun|521219|Belanja Barang Non Operasional Lainnya|6020000|
435|432|akun|524113|Belanja Perjalanan Dinas Dalam Kota|9270000|
436|1|kegiatan|8130|Penyediaan dan Pengembangan Statistik Sumber Daya Hayati|28795000|
437|436|kro|BMA|Data dan Informasi Publik[Base Line]|28795000|
438|437|ro|007|PUBLIKASI/ LAPORAN STATISTIK TANAMAN PANGAN|28795000|8130.BMA.007
439|438|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|27782000|
440|439|subkomp|A|TANPA SUB KOMPONEN|27782000|
441|440|akun|521213|Belanja Honor Output Kegiatan|24062000|
442|440|akun|524113|Belanja Perjalanan Dinas Dalam Kota|3720000|
443|438|komponen|051|Persiapan|13000|
444|443|subkomp|A|TANPA SUB KOMPONEN|13000|
445|444|akun|521811|Belanja Barang Persediaan Barang Konsumsi|13000|
446|438|komponen|052|Pengumpulan Data|1000000|
447|446|subkomp|A|TANPA SUB KOMPONEN|1000000|
448|447|akun|521211|Belanja Bahan|1000000|
449|1|kegiatan|8131|Penyediaan dan Pengembangan Statistik Sumber Daya Mineral dan Konstruksi|7543000|
450|449|kro|BMA|Data dan Informasi Publik[Base Line]|7543000|
451|450|ro|005|PUBLIKASI/LAPORAN STATISTIK SUMBER DAYA MINERAL DAN KONSTRUKSI|7543000|8131.BMA.005
452|451|komponen|005|Dukungan Penyelenggaraan Tugas dan Fungsi Unit|6893000|
453|452|subkomp|A|TANPA SUB KOMPONEN|6893000|
454|453|akun|521213|Belanja Honor Output Kegiatan|4749000|
455|453|akun|524113|Belanja Perjalanan Dinas Dalam Kota|2144000|
456|451|komponen|052|Pengumpulan Data|650000|
457|456|subkomp|A|TANPA SUB KOMPONEN|650000|
458|457|akun|521211|Belanja Bahan|650000|
459||program|WA|Program Dukungan Manajemen|4346997000|
460|459|kegiatan|2886|Dukungan Manajemen dan Pelaksanaan Tugas Teknis Lainnya BPS Provinsi|4346997000|
461|460|kro|EBA|Layanan Dukungan Manajemen Internal[Base Line]|4331615000|
462|461|ro|956|Layanan BMN|1481000|2886.EBA.956
463|462|komponen|051|Tanpa Komponen|1481000|
464|463|subkomp|A|TANPA SUB KOMPONEN|1481000|
465|464|akun|524111|Belanja Perjalanan Dinas Biasa|1481000|
466|461|ro|962|Layanan Umum|3374000|2886.EBA.962
467|466|komponen|051|Tanpa Komponen|3374000|
468|467|subkomp|A|TANPA SUB KOMPONEN|3374000|
469|468|akun|521211|Belanja Bahan|3374000|
470|461|ro|994|Layanan Perkantoran|4326760000|2886.EBA.994
471|470|komponen|001|Gaji dan Tunjangan|3851432000|
472|471|subkomp|A|TANPA SUB KOMPONEN|3851432000|
473|472|akun|511111|Belanja Gaji Pokok PNS|1248053000|
474|472|akun|511119|Belanja Pembulatan Gaji PNS|26000|
475|472|akun|511121|Belanja Tunj. Suami/Istri PNS|62229000|
476|472|akun|511122|Belanja Tunj. Anak PNS|18659000|
477|472|akun|511123|Belanja Tunj. Struktural PNS|25200000|
478|472|akun|511124|Belanja Tunj. Fungsional PNS|177618000|
479|472|akun|511125|Belanja Tunj. PPh PNS|137925000|
480|472|akun|511126|Belanja Tunj. Beras PNS|55112000|
481|472|akun|511129|Belanja Uang Makan PNS|175298000|
482|472|akun|511151|Belanja Tunjangan Umum PNS|7770000|
483|472|akun|511611|Belanja Gaji Pokok PPPK|101088000|
484|472|akun|511619|Belanja Pembulatan Gaji PPPK|3000|
485|472|akun|511621|Belanja Tunjangan Suami/Istri PPPK|6740000|
486|472|akun|511622|Belanja Tunjangan Anak PPPK|2022000|
487|472|akun|511624|Belanja Tunjangan Fungsional PPPK|7245000|
488|472|akun|511625|Belanja Tunjangan Beras PPPK|7633000|
489|472|akun|511628|Belanja Uang Makan PPPK|28490000|
490|472|akun|512211|Belanja Uang Lembur|26940000|
491|472|akun|512411|Belanja Pegawai (Tunjangan Khusus/Kegiatan/Kinerja)|1637897000|
492|472|akun|512414|Belanja Pegawai Tunjangan Khusus/Kegiatan/Kinerja PPPK|125484000|
493|470|komponen|002|Operasional dan Pemeliharaan Kantor|475328000|
494|493|subkomp|A|TANPA SUB KOMPONEN|475328000|
495|494|akun|521111|Belanja Keperluan Perkantoran|79351000|
496|494|akun|521115|Belanja Honor Operasional Satuan Kerja|62840000|
497|494|akun|521119|Belanja Barang Operasional Lainnya|5100000|
498|494|akun|521211|Belanja Bahan|2700000|
499|494|akun|521213|Belanja Honor Output Kegiatan|1800000|
500|494|akun|521252|Belanja Peralatan dan Mesin - Ekstrakomptabel|3517000|
501|494|akun|521811|Belanja Barang Persediaan Barang Konsumsi|12740000|
502|494|akun|522111|Belanja Langganan Listrik|18279000|
503|494|akun|522112|Belanja Langganan Telepon|86000|
504|494|akun|522113|Belanja Langganan Air|1667000|
505|494|akun|522119|Belanja Langganan Daya dan Jasa Lainnya|19496000|
506|494|akun|522141|Belanja Sewa|1000000|
507|494|akun|522191|Belanja Jasa Lainnya|114498000|
508|494|akun|523111|Belanja Pemeliharaan Gedung dan Bangunan|33994000|
509|494|akun|523121|Belanja Pemeliharaan Peralatan dan Mesin|88349000|
510|494|akun|523123|Belanja Barang Persediaan Pemeliharaan Peralatan dan Mesin|1722000|
511|494|akun|524111|Belanja Perjalanan Dinas Biasa|11429000|
512|494|akun|524113|Belanja Perjalanan Dinas Dalam Kota|16760000|
513|460|kro|EBD|Layanan Manajemen Kinerja Internal[Base Line]|15382000|
514|513|ro|955|Layanan Manajemen Keuangan|13001000|2886.EBD.955
515|514|komponen|051|Tanpa Komponen|13001000|
516|515|subkomp|A|TANPA SUB KOMPONEN|13001000|
517|516|akun|521115|Belanja Honor Operasional Satuan Kerja|7800000|
518|516|akun|524111|Belanja Perjalanan Dinas Biasa|3720000|
519|516|akun|524113|Belanja Perjalanan Dinas Dalam Kota|1481000|
520|513|ro|961|Layanan Reformasi Kinerja|2381000|2886.EBD.961
521|520|komponen|051|Tanpa Komponen|2381000|
522|521|subkomp|A|TANPA SUB KOMPONEN|2381000|
523|522|akun|522151|Belanja Jasa Profesi|900000|
524|522|akun|524111|Belanja Perjalanan Dinas Biasa|1481000|
$nodes$;
  if md5(data_) <> '963f13176dfa682cdba40222ddc114ee' then raise exception 'Salinan data rusak (checksum tidak cocok); hentikan.'; end if;
  for l in select unnest(string_to_array(data_, E'\n')) loop
    if btrim(l) = '' then continue; end if;
    p := string_to_array(l, '|');
    pid := case when p[2] = '' then null else (idmap ->> p[2])::bigint end;
    select count(*) + 1 into kem from keu_pok_node where versi_id = v and induk_id is not distinct from pid and kode = p[4];
    insert into keu_pok_node(versi_id, induk_id, tingkat, kode, kemunculan, nama, pagu, ro_kode)
    values (v, pid, p[3], p[4], kem, p[5], p[6]::numeric, nullif(p[7], '')) returning id into pid;
    idmap := idmap || jsonb_build_object(p[1], pid);
    n := n + 1;
  end loop;
  raise notice 'Bagian 1: versi %, % node', v, n;
end
$impor$;
