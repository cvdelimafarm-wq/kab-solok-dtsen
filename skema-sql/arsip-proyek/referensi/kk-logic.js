// kk-logic.js -- logika MOCKUP Kertas Kerja Revisi POK SIGAP (Draf 4, butir F1-06).
// Data: window.KK_DATA (kk-data.js) = baris POK nyata KRO 2903.BMA, Kegiatan 2903 (RKKS 30 Sep 2026, hanya dibaca).
// Angka Booked/Realisasi, RAB, RPD, hasil impor Kanwil: ILUSTRASI untuk mockup. Tidak ada yang disimpan.
(function (g) {
  'use strict';
  var D = g.KK_DATA;
  var KRO = '2903.BMA', KEG = '2903', PROG = '054.01.GG';

  // ---------------------------------------------------------------- format
  function fmt(n) { n = Math.round(n || 0); var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '−' : '') + s; }
  function sel(n) { n = Math.round(n || 0); if (n === 0) return '0'; return (n > 0 ? '+' : '−') + fmt(Math.abs(n)); }
  function vol(n) { return (Math.round(n * 100) / 100).toString().replace('.', ','); }
  function tgl(s) { var m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']; var p = s.split('-'); return +p[2] + ' ' + m[+p[1] - 1] + ' ' + p[0]; }

  // rumus sederhana: angka, + - * / ( ), titik ribuan, koma desimal. Selain itu ditolak.
  function hitungRumus(raw) {
    if (typeof raw === 'number') return raw;
    var s = String(raw == null ? '' : raw).trim().replace(/^=/, '');
    if (!s) return null;
    s = s.replace(/(\d{1,3})(\.\d{3})+(?!\d)/g, function (m) { return m.replace(/\./g, ''); }).replace(/,/g, '.');
    if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;
    try { var v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? v : null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- model
  var ROMETA = {};
  D.ros.forEach(function (r) { ROMETA[r.kode] = { kode: r.kode, nama: r.nama, pagu: r.pagu, kro: KRO, keg: KEG, prog: PROG, ext: false, alokasi: r.alokasi }; });
  D.lain.forEach(function (r) { ROMETA[r.kode] = { kode: r.kode, nama: r.nama, pagu: r.pagu, kro: r.kro, keg: r.keg, prog: r.prog, ext: true, kegNama: r.kegNama }; });
  var NAMA_KOM = { '005': 'Dukungan Penyelenggaraan Tugas dan Fungsi Unit', '051': 'Persiapan', '052': 'Pengumpulan Data', '053': 'Pengolahan dan Analisis' };
  var NAMA_AKUN = { '521211': 'Belanja Bahan', '521213': 'Belanja Honor Output Kegiatan', '521811': 'Belanja Barang Persediaan Barang Konsumsi', '522151': 'Belanja Jasa Profesi', '524111': 'Belanja Perjalanan Dinas Biasa', '524113': 'Belanja Perjalanan Dinas Dalam Kota', '524114': 'Belanja Perjalanan Dinas Paket Meeting', '524119': 'Belanja Perjalanan Dinas Paket Meeting Lainnya', '532111': 'Belanja Modal Peralatan dan Mesin' };
  D.rows.forEach(function (r) { NAMA_AKUN[r.akun] = r.akunNama; });

  // Pagu dan realisasi TA 2025 per baris: ILUSTRASI deterministik (POK tidak memuat data tahun lalu). Pada pemakaian nyata dibaca dari arsip realisasi TA 2025.
  function hashId(id) { var h = 7; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003; return h; }
  function lalu25(r) { var h = hashId(r.id), pg = Math.round(r.jum * (0.92 + (h % 17) / 100) / 1000) * 1000, rl = Math.round(pg * (0.86 + (h % 13) / 100) / 1000) * 1000; return { pg25: pg, rl25: Math.min(rl, pg) }; }
  function dasar() {
    return D.rows.map(function (r) {
      var o = {}; for (var k in r) o[k] = r[k];
      var l = lalu25(r); o.pg25 = l.pg25; o.rl25 = l.rl25;
      o.volM = r.vol; o.hargaM = r.harga; o.uraM = r.uraian; o.akunM = r.akun;
      o.baru = false; o.penggenap = false; o.ext = false; o.pert = null; o.alasan = '';
      return o;
    });
  }
  function jumM(r) { if (r.jumFix != null && r.volM === r.fixVol && r.hargaM === r.fixHarga) return r.jumFix; if (r.ext || r.baru) return Math.round((r.volM || 0) * (r.hargaM || 0)); return (r.volM === r.vol && r.hargaM === r.harga) ? r.jum : Math.round(r.volM * r.hargaM); }
  function sd(r) { return jumM(r) - r.jum; }
  function klon(s) { var c = {}; for (var k in s) c[k] = s[k]; c.rows = s.rows.map(function (r) { var o = {}; for (var k2 in r) o[k2] = r[k2]; return o; }); c.lampiran = JSON.parse(JSON.stringify(s.lampiran)); c.tutup = JSON.parse(JSON.stringify(s.tutup)); return c; }
  function cari(s, id) { for (var i = 0; i < s.rows.length; i++) if (s.rows[i].id === id) return s.rows[i]; return null; }
  var seq = 0;
  function baris(s, ro, kom, akun, uraian, v, sat, h, ekstra) {
    seq++;
    var o = { id: 'N' + seq, ro: ro, kom: kom, komNama: NAMA_KOM[kom] || kom, akun: akun, akunNama: NAMA_AKUN[akun] || akun, uraian: uraian, vol: 0, sat: sat, harga: 0, jum: 0, bk: 0, rl: 0, volM: v, hargaM: h, uraM: uraian, akunM: akun, pg25: 0, rl25: 0, baru: true, penggenap: false, ext: !!(ROMETA[ro] && ROMETA[ro].ext), pert: null, alasan: '' };
    if (ekstra) for (var k in ekstra) o[k] = ekstra[k];
    // sisip setelah baris terakhir pada kelompok yang sama; jika tidak ada, di akhir
    var idx = -1; for (var i = 0; i < s.rows.length; i++) { var r = s.rows[i]; if (r.ro === ro && r.kom === kom && r.akun === akun) idx = i; }
    if (idx < 0) for (var j = 0; j < s.rows.length; j++) if (s.rows[j].ro === ro && s.rows[j].kom === kom) idx = j;
    if (ro && ROMETA[ro] && ROMETA[ro].ext) idx = s.rows.length - 1;
    s.rows.splice(idx + 1, 0, o);
    return o;
  }

  // hari acuan tenggat = tanggal hari ini otomatis (dijepit ke 1 Okt sampai 31 Des 2026 agar contoh TA 2026 tetap bermakna; di aplikasi memakai tahun anggaran yang dipilih, siap TA 2027)
  function hariIni() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }, s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); if (s < '2026-10-01' || s > '2026-12-31') s = '2026-10-24'; return s; }
  function stateKosong() {
    var lamp = {}; LAMPIRAN.forEach(function (l) { lamp[l.kode] = { st: 'belum', nomor: '', tanggal: '' }; });
    return { rows: dasar(), jenis: 'pok', apip: '', lampiran: lamp, hari: hariIni(), tutup: {}, skenario: '', catatanSkenario: '' };
  }

  // ---------------------------------------------------------------- ganti akun (skema pasangan)
  // Mengganti akun item TIDAK mengubah kode akun pada baris semula. Yang terjadi: baris pada akun lama dikosongkan (Menjadi = 0)
  // dan sebuah baris baru dengan isi sama dibuat pada akun baru (Semula kosong). Matriks menampilkan keduanya sebagai satu pasangan P-03.
  function namaAkun(k) { return NAMA_AKUN[k] || k; }
  function batalPindah(s, nb) {
    var lama = cari(s, nb.pindahDari);
    var i = s.rows.indexOf(nb); if (i >= 0) s.rows.splice(i, 1);
    if (lama) { lama.volM = lama.volSebelum != null ? lama.volSebelum : lama.vol; delete lama.pindahKe; delete lama.volSebelum; }
    return lama;
  }
  // membuat pasangan: baris lama dikosongkan (kecuali Booked + Realisasi), baris baru berisi salinan dengan akun dan/atau redaksi baru (Semula kosong)
  function buatPasangan(s, r, akunBaru, uraBaru) {
    if (!(r.volM > 0)) return null;           // baris yang dikosongkan tidak dapat dipindah
    var jm = jumM(r), ket = (r.bk || 0) + (r.rl || 0), tetap = 0;
    if (ket > 0) {                            // sudah ada Booked/Realisasi: baris lama tetap menampungnya, hanya sisanya yang pindah
      tetap = r.hargaM > 0 ? Math.ceil(ket / r.hargaM) : r.volM;
      if (tetap >= r.volM) return null;
    }
    var vPindah = Math.round((r.volM - tetap) * 100) / 100, jTetap = tetap > 0 ? Math.round(tetap * r.hargaM) : 0;
    var nb = baris(s, r.ro, r.kom, akunBaru, uraBaru != null ? uraBaru : r.uraM, vPindah, r.sat, r.hargaM, { pindahDari: r.id, jumFix: jm - jTetap, fixVol: vPindah, fixHarga: r.hargaM });
    r.pindahKe = nb.id; r.volSebelum = r.volM; r.volM = tetap;
    return nb;
  }
  // uraBaru (opsional): redaksi baris pengganti pada penggantian akun
  function pindahAkun(s, r, akunBaru, uraBaru) {
    akunBaru = String(akunBaru);
    if (!/^\d{6}$/.test(akunBaru)) return null;
    if (r.baru && r.pindahDari) {           // baris pindahan: ganti lagi akun tujuannya
      var asal = cari(s, r.pindahDari);
      if (asal && akunBaru === asal.akun && r.uraM === asal.uraian) return batalPindah(s, r);
      r.akun = r.akunM = akunBaru; r.akunNama = namaAkun(akunBaru); return r;
    }
    if (r.baru) { if (akunBaru === r.akun) return r; r.akun = r.akunM = akunBaru; r.akunNama = namaAkun(akunBaru); return r; }   // item baru: cukup ubah akunnya
    if (r.pindahKe) { var mitra = cari(s, r.pindahKe); return mitra ? pindahAkun(s, mitra, akunBaru) : r; }   // sudah dipindah: ubah tujuan
    if (akunBaru === r.akun && uraBaru == null) return r;
    return buatPasangan(s, r, akunBaru, uraBaru);
  }
  // Redaksi item POK resmi TIDAK dapat diubah langsung (aturan kantor, 24 Okt 2026): item lama dikosongkan dan dibuat item baru dengan redaksi baru
  // pada akun yang sama. Item yang belum menjadi POK (item baru, draf) tetap dapat diedit langsung.
  function ubahRedaksi(s, r, uraBaru) {
    uraBaru = String(uraBaru == null ? '' : uraBaru).trim(); if (!uraBaru) return null;
    if (r.baru) {
      r.uraM = uraBaru;
      if (r.pindahDari) { var asal = cari(s, r.pindahDari); if (asal && asal.akun === r.akun && uraBaru === asal.uraian) return batalPindah(s, r); }
      return r;
    }
    if (r.pindahKe) { var mitra = cari(s, r.pindahKe); return mitra ? ubahRedaksi(s, mitra, uraBaru) : null; }
    if (uraBaru === r.uraian) return r;
    return buatPasangan(s, r, r.akun, uraBaru);
  }
  function gantiRedaksi(s, id, uraBaru) {
    var c = klon(s), r = cari(c, id); if (!r) return s;
    var h = ubahRedaksi(c, r, uraBaru); return h ? c : s;
  }
  function gantiAkun(s, id, akunBaru) {
    var c = klon(s), r = cari(c, id); if (!r) return s;
    var h = pindahAkun(c, r, akunBaru); return h ? c : s;
  }
  function batalGanti(s, id) {
    var c = klon(s), r = cari(c, id); if (!r) return s;
    var nb = r.pindahDari ? r : (r.pindahKe ? cari(c, r.pindahKe) : null); if (!nb) return s;
    batalPindah(c, nb); return c;
  }
  // ganti akun dari baris akun: semua item pada akun itu dipindah (duplikasi) ke akun baru. Item yang sudah habis terpakai atau sudah dikosongkan dilewati.
  function gantiAkunGrup(s, ro, kom, akun, akunBaru) {
    var c = klon(s), n = 0, lewat = 0;
    if (!/^\d{6}$/.test(String(akunBaru)) || akunBaru === akun) return { s: s, n: 0, lewat: 0 };
    c.rows.slice().forEach(function (r) {
      if (r.ro !== ro || r.kom !== kom || r.akun !== akun || r.pindahKe || r.pindahDari || r.penggenap) return;
      if (!r.baru && !(r.volM > 0)) { return; }
      var h = pindahAkun(c, r, akunBaru); if (h) n++; else lewat++;
    });
    return { s: n ? c : s, n: n, lewat: lewat };
  }
  function batalGantiGrup(s, ro, kom, akun) {
    var c = klon(s), n = 0;
    c.rows.slice().forEach(function (r) {
      if (r.ro === ro && r.kom === kom && r.akun === akun && r.pindahKe) { var nb = cari(c, r.pindahKe); if (nb) { batalPindah(c, nb); n++; } }
    });
    c.rows.slice().forEach(function (r) {
      if (r.ro === ro && r.kom === kom && r.akun === akun && r.pindahDari) { batalPindah(c, r); n++; }
    });
    return n ? c : s;
  }
  // kunci realisasi resmi (SPAN): menimpa rl tiap baris menurut peta id -> realisasi; baris yang tidak ada di peta dianggap tanpa realisasi
  function pasangRl(s, peta) { var c = klon(s); c.rows.forEach(function (r) { r.rl = peta[r.id] || 0; r.rlKunci = true; }); return c; }
  function lalu(s) {
    var pg = 0, rl = 0; s.rows.forEach(function (r) { if (!r.baru) { pg += r.pg25 || 0; rl += r.rl25 || 0; } });
    return { pg: pg, rl: rl, pct: pg ? Math.round(rl / pg * 1000) / 10 : 0 };
  }
  var AKUN = Object.keys(NAMA_AKUN).sort().map(function (k) { return { kode: k, nama: NAMA_AKUN[k] }; });

  // ---------------------------------------------------------------- skenario (mengikuti kasus uji Draf 4)
  function set(s, id, f, v) { var r = cari(s, id); if (r) r[f] = v; return r; }
  function terapkanRab(s) {
    set(s, '009.005.524113.04', 'volM', 5);       // P-01 angka
    set(s, '009.005.521213.06', 'volM', 220);     // P-01 angka
    set(s, '008.052.524113.02', 'volM', 560);     // P-01 angka (naik)
    set(s, '008.052.524113.01', 'volM', 50);      // P-01 angka
    set(s, '008.052.524113.03', 'volM', 55);      // P-01 angka
    ubahRedaksi(s, cari(s, '007.051.521811.03'), 'Pengadaan computer supplies dan tinta printer'); // P-02 redaksi: item lama dikosongkan, item baru dengan redaksi baru
    pindahAkun(s, cari(s, '009.051.521811.02'), '521211');  // P-03 akun berubah (pasangan: akun lama kosong, akun baru berisi salinan)
    baris(s, '2903.BMA.009', '052', '522151', 'Honor narasumber pejabat eselon III di kab/kota', 1, 'OJ', 900000);       // P-04 akun ditambah
    set(s, '009.051.524111.01', 'volM', 0);       // P-05 akun dikurangi
    baris(s, '2903.BMA.009', '005', '524113', 'Transport lokal petugas pemeriksaan lapangan Survei Harga Konsumen Perdesaan', 2, 'O-K', 170000); // P-06 item ditambah
    set(s, '009.052.524113.03', 'volM', 0);       // placeholder, dikembalikan di bawah
    set(s, '009.052.524113.03', 'volM', 1);
    set(s, '009.051.521211.03', 'volM', 0);       // P-07 item dikurangi
    var r8 = set(s, '009.051.524113.02', 'volM', 4); pindahAkun(s, r8, '524119', 'Transport pelatihan petugas Survei Harga Perdagangan Besar (diubah)'); // P-08 (volume, redaksi, dan akun berubah)
    return s;
  }
  // Dana penggenap (ketentuan kantor, ditegaskan 24 Okt 2026): sisa di atas RAB ditampung per akun oleh KKC.sapuSisa (akun 524: Perjalanan dinas Kabupaten; akun 52 lain: nama akun + Kabupaten).
  // Pada RAB penuh (Revisi DIPA) selisih menjadi perubahan pagu, tanpa penggenap. R-09 tetap menyala karena dasar hukumnya belum ditemukan.
  function skenario(kode) {
    var s = stateKosong(); s.skenario = kode || '';
    if (kode === 'RAB') { terapkanRab(s); s.catatanSkenario = 'RAB penuh (jalur Revisi DIPA): angka RAB v4 (ilustrasi) masuk ke kolom Menjadi, memuat semua pemicu P-01 sampai P-08. RAB lebih kecil dari POK sebesar Rp ' + fmt(-(function () { var n = 0; s.rows.forEach(function (r) { n += sd(r); }); return n; })()) + ', jadi pagu KRO turun; tidak ada baris Dana penggenap. Untuk Mode Pagu Tetap pakai Usulkan geseran minimal.'; }
    else if (kode === 'T01') { set(s, '008.051.521211.01', 'volM', 18); set(s, '009.051.521211.01', 'hargaM', 272000); s.catatanSkenario = 'T-01: geser Rp 2.000.000 antar-RO dalam KRO yang sama (akun 521211 RO 008 ke RO 009).'; }
    else if (kode === 'T03') { set(s, '008.051.521211.01', 'volM', 18); baris(s, '2906.BMA.006', '051', '521211', 'Penerima pergeseran (RO Susenas, Kegiatan 2906)', 1, 'PAKET', 2000000); s.catatanSkenario = 'T-03: pergeseran antar-Kegiatan (2903 ke 2906), program sama.'; }
    else if (kode === 'T04') { pindahAkun(s, cari(s, '007.053.521211.01'), '532111'); s.catatanSkenario = 'T-04: item akun 521211 diganti ke 532111 dalam satu RO (jenis belanja 52 ke 53): akun 521211 dikosongkan, akun 532111 berisi salinan item, volume RO tetap.'; }
    else if (kode === 'T05') { set(s, '007.051.524114.02', 'hargaM', 400000); s.catatanSkenario = 'T-05: pagu Satker bertambah (harga transport pelatihan naik).'; }
    else if (kode === 'T05b') { set(s, '008.051.521211.01', 'volM', 18); baris(s, '2886.EBA.994', '051', '524113', 'Penerima pergeseran (RO Layanan Perkantoran, Program Dukungan Manajemen)', 1, 'PAKET', 2000000); s.catatanSkenario = 'Antar-Program (054.01.GG ke 054.01.WA).'; }
    else if (kode === 'T07') { set(s, '007.051.521211.01', 'hargaM', 40000); set(s, '007.053.521213.01', 'hargaM', 258500); s.catatanSkenario = 'T-07: pagu akun 521211 diturunkan di bawah Booked ditambah Realisasi.'; }
    else if (kode === 'T15') { ubahRedaksi(s, cari(s, '007.051.521811.01'), 'Pengadaan ATK, bahan cetak, dan kertas di kab/kota'); s.catatanSkenario = 'T-15: hanya redaksi item berubah, angka dan akun sama. Sesuai aturan kantor, item lama dikosongkan dan item baru dengan redaksi baru dibuat pada akun yang sama.'; }
    else if (kode === 'T06') { set(s, '008.051.521211.01', 'volM', 18); set(s, '009.051.521211.01', 'hargaM', 272000); pindahAkun(s, cari(s, '007.053.521211.01'), '532111'); s.catatanSkenario = 'T-06: satu baris jalur POK dan satu baris jalur DJPb dalam satu kertas kerja.'; }
    s.jenis = saran(s).jenis || 'pok';
    return s;
  }
  var SKENARIO = [
    { kode: 'RAB', nama: 'RAB penuh, semua pemicu P-01 s.d. P-08' },
    { kode: 'T01', nama: 'T-01 Antar-RO dalam KRO' },
    { kode: 'T03', nama: 'T-03 Antar-Kegiatan' },
    { kode: 'T04', nama: 'T-04 Lintas jenis belanja' },
    { kode: 'T05', nama: 'T-05 Pagu Satker naik' },
    { kode: 'T05b', nama: 'Antar-Program' },
    { kode: 'T06', nama: 'T-06 Campuran POK + DJPb' },
    { kode: 'T07', nama: 'T-07 Di bawah Booked + Realisasi' },
    { kode: 'T15', nama: 'T-15 Redaksi saja' }
  ];

  // ---------------------------------------------------------------- ubah, tambah, geser
  function ubah(s, id, f, raw) {
    var c = klon(s), r = cari(c, id); if (!r) return s;
    if ((f === 'volM' || f === 'hargaM') && r.pindahKe) return s;
    if (f === 'volM' || f === 'hargaM') { var v = hitungRumus(raw); if (v === null || v < 0) return s; r[f] = f === 'volM' ? Math.round(v * 100) / 100 : Math.round(v); }
    else if (f === 'uraM') { var hu = ubahRedaksi(c, r, raw); if (!hu) return s; }
    else if (f === 'alasan') r[f] = String(raw);
    else if (f === 'akunM') { return gantiAkun(s, id, String(raw).trim()); }
    else if (f === 'pert') r.pert = (raw === 'disetujui' || raw === 'belum') ? raw : null;
    return c;
  }
  function tambahItem(s, ro, kom, akun) {
    var c = klon(s); var t = baris(c, ro, kom, akun, 'Item baru (isi uraian)', 1, 'PAKET', 0); return c;
  }
  function geser(s, dariId, keRo, jumlah) {
    var c = klon(s), r = cari(c, dariId); if (!r || !(jumlah > 0)) return s;
    var tersisa = jumM(r) - jumlah; if (tersisa < 0) return s;
    if (r.volM > 0) r.hargaM = Math.round(tersisa / r.volM); else return s;
    baris(c, keRo, keRo === r.ro ? r.kom : '051', r.akunM, 'Penerima pergeseran', 1, 'PAKET', jumlah);
    return c;
  }
  function alihTutup(s, key) { var c = klon(s); c.tutup[key] = !c.tutup[key]; return c; }
  function setJenis(s, j) { var c = klon(s); c.jenis = j; return c; }
  function setLampiran(s, kode, f, v) { var c = klon(s); c.lampiran[kode][f] = v; return c; }

  // ---------------------------------------------------------------- pemicu P-01 sampai P-08
  var PEMICU = {
    'P-01': 'Angka berubah', 'P-02': 'Redaksi item diganti (item lama dikosongkan, item baru dibuat)', 'P-03': 'Akun item berubah', 'P-04': 'Akun ditambah',
    'P-05': 'Akun dikurangi', 'P-06': 'Item ditambah', 'P-07': 'Item dikurangi', 'P-08': 'Item diubah (gabungan)'
  };
  function kodePindah(s, a, b) {   // a: baris lama, b: baris pengganti. Satu perubahan saja: akun = P-03, redaksi = P-02; lebih dari satu = P-08
    if (!a || !b) return 'P-03';
    var beda = 0, k = 'P-03';
    if (!(Math.abs(b.volM + a.volM - a.vol) < 0.001 && b.hargaM === a.harga)) { beda++; k = 'P-01'; }
    if (b.uraM !== a.uraian) { beda++; k = 'P-02'; }
    if (a.akun !== b.akun) { beda++; k = 'P-03'; }
    return beda <= 1 ? k : 'P-08';
  }
  function pemicuBaris(s, r) {
    if (r.pindahKe) return kodePindah(s, r, cari(s, r.pindahKe));
    if (r.pindahDari) return kodePindah(s, cari(s, r.pindahDari), r);
    if (r.baru) {
      var ada = s.rows.some(function (x) { return !x.baru && x.ro === r.ro && x.kom === r.kom && x.akun === r.akunM; });
      return ada ? 'P-06' : 'P-04';
    }
    if (jumM(r) === 0 && r.jum > 0) {
      var sisa = s.rows.some(function (x) { return x !== r && !x.baru && x.ro === r.ro && x.kom === r.kom && x.akun === r.akun && jumM(x) > 0; });
      return sisa ? 'P-07' : 'P-05';
    }
    var n = 0, k = '';
    if (r.volM !== r.vol || r.hargaM !== r.harga) { n++; k = 'P-01'; }
    if (r.uraM !== r.uraian) { n++; k = 'P-02'; }
    if (r.akunM !== r.akun) { n++; k = 'P-03'; }
    return n === 0 ? '' : (n === 1 ? k : 'P-08');
  }

  // ---------------------------------------------------------------- tabel untuk grid
  function ringkasKel(rows) { var a = 0, b = 0; rows.forEach(function (r) { a += r.jum; b += jumM(r); }); return { a: a, b: b, d: b - a }; }
  function sel2(n) { return { t: sel(n), c: n === 0 ? 'nol' : (n > 0 ? 'naik' : 'turun') }; }
  function tabel(s) {
    var out = [];
    var ros = D.ros.map(function (r) { return r.kode; });
    var roSemua = ros.slice(); s.rows.forEach(function (r) { if (roSemua.indexOf(r.ro) < 0) roSemua.push(r.ro); });
    roSemua.forEach(function (ro) {
      var rr = s.rows.filter(function (r) { return r.ro === ro; }); if (!rr.length) return;
      var meta = ROMETA[ro], k = ringkasKel(rr), tg = s.tutup['ro:' + ro];
      var ext = meta.ext;
      var dd = sel2(k.d);
      out.push({ tipe: 'ro', id: 'ro:' + ro, key: 'ro:' + ro, kode: ro, ind: 0, uraian: meta.nama + (ext ? '  (di luar contoh, hanya penerima pergeseran)' : ''), sub: ext ? 'Kegiatan ' + meta.keg + ' · Program ' + meta.prog : 'Pagu RO Rp ' + fmt(meta.pagu) + ' · alokasi: ' + meta.alokasi, jS: fmt(k.a), jM: fmt(k.b), d: dd.t, dc: dd.c, tutup: !!tg, bisaTutup: true, ro: ro });
      if (tg) return;
      var koms = []; rr.forEach(function (r) { if (koms.indexOf(r.kom) < 0) koms.push(r.kom); });
      koms.forEach(function (kom) {
        var rk = rr.filter(function (r) { return r.kom === kom; }), k2 = ringkasKel(rk), tg2 = s.tutup['k:' + ro + kom], d2 = sel2(k2.d);
        out.push({ tipe: 'kom', id: 'k:' + ro + kom, key: 'k:' + ro + kom, kode: kom, ind: 1, uraian: rk[0].komNama, jS: fmt(k2.a), jM: fmt(k2.b), d: d2.t, dc: d2.c, tutup: !!tg2, bisaTutup: true, ro: ro });
        if (tg2) return;
        var aks = []; rk.forEach(function (r) { if (aks.indexOf(r.akun) < 0) aks.push(r.akun); });
        aks.forEach(function (ak) {
          var ra = rk.filter(function (r) { return r.akun === ak; }), k3 = ringkasKel(ra), tg3 = s.tutup['a:' + ro + kom + ak], d3 = sel2(k3.d);
          var pg25 = 0, rl25 = 0, adaAsal = false; ra.forEach(function (r) { if (!r.baru) { pg25 += r.pg25 || 0; rl25 += r.rl25 || 0; adaAsal = true; } });
          var terbesar = ra.filter(function (r) { return !r.baru && r.rl25 > 0; }).sort(function (a, b) { return b.rl25 - a.rl25; }).slice(0, 3).map(function (r) { return r.uraian.slice(0, 44) + ' Rp ' + fmt(r.rl25); });
          var info25 = adaAsal ? 'Realisasi TA 2025 akun ' + ak + ': Rp ' + fmt(rl25) + ' dari pagu Rp ' + fmt(pg25) + ' (' + (pg25 ? Math.round(rl25 / pg25 * 1000) / 10 : 0).toString().replace('.', ',') + '%).' + (terbesar.length ? ' Terbesar: ' + terbesar.join('; ') + '.' : '') + ' Angka ilustrasi.' : 'Akun ' + ak + ' belum ada pada POK semula, jadi tidak ada realisasi TA 2025 yang dapat ditampilkan.';
          var gKe = ra.filter(function (r) { return r.pindahKe && (cari(s, r.pindahKe) || {}).akun !== r.akun; })[0], gDari = ra.filter(function (r) { return r.pindahDari && (cari(s, r.pindahDari) || {}).akun !== r.akun; })[0];
          out.push({ tipe: 'akun', id: 'a:' + ro + kom + ak, key: 'a:' + ro + kom + ak, kode: ak, ind: 2, uraian: ra[0].akunNama, jS: fmt(k3.a), jM: fmt(k3.b), d: d3.t, dc: d3.c, tutup: !!tg3, bisaTutup: true, ro: ro, kom: kom, akun: ak, bisaTambah: true, rl25: fmt(rl25), pg25: fmt(pg25), info25: info25, adaPindah: !!gKe, pindahKeAkun: gKe ? (cari(s, gKe.pindahKe) || {}).akun : '', pindahDariAkun: gDari ? (cari(s, gDari.pindahDari) || {}).akun : '' });
          if (tg3) return;
          ra.forEach(function (r) {
            var j = jumM(r), d = j - r.jum, dd2 = sel2(d), pm = pemicuBaris(s, r), ket = r.bk + r.rl;
            var cek = '';
            if (j < ket && !r.baru) cek = 'R-06';
            out.push({ tipe: 'item', id: r.id, kode: r.id.replace(/^\d{3}\./, ''), ind: 3, ro: ro,
              uraian: r.uraM, uraianAsli: r.baru ? '' : r.uraian, uraBerubah: !r.baru && r.uraM !== r.uraian,
              vS: r.baru ? '' : vol(r.vol), sat: r.sat, hS: r.baru ? '' : fmt(r.harga), jS: r.baru ? '' : fmt(r.jum),
              vM: vol(r.volM), hM: fmt(r.hargaM), jM: fmt(j), akunM: r.akunM, akunBerubah: false,
              d: dd2.t, dc: dd2.c, pem: pm, pemNama: pm ? PEMICU[pm] : '', pert: r.pert, bk: r.bk ? fmt(r.bk) : '', rl: r.rl ? fmt(r.rl) : '', cek: cek,
              baru: r.baru, penggenap: r.penggenap, ext: r.ext, ubahVol: r.volM !== r.vol && !r.baru, ubahHarga: r.hargaM !== r.harga && !r.baru, hapus: !r.baru && j === 0 && r.jum > 0 && !r.pindahKe,
              akunAsli: r.akun, pindah: !!r.pindahKe, pindahKeAkun: r.pindahKe ? (cari(s, r.pindahKe) || {}).akun : '', pindahDariAkun: r.pindahDari ? (cari(s, r.pindahDari) || {}).akun : '', sebagian: !!r.pindahKe && j > 0, pindahKeId: r.pindahKe || '', pindahDariId: r.pindahDari || '', redaksi: !!(r.pindahKe && (cari(s, r.pindahKe) || {}).akun === r.akun), redaksiDari: !!(r.pindahDari && (cari(s, r.pindahDari) || {}).akun === r.akun), kunciUra: !r.baru, terkunci: !!r.pindahKe, bisaBatalPindah: !!(r.pindahKe || r.pindahDari) });
          });
        });
      });
    });
    return out;
  }
  function total(s) { var a = 0, b = 0; s.rows.forEach(function (r) { a += r.jum; b += jumM(r); }); return { a: a, b: b, d: b - a }; }

  // ---------------------------------------------------------------- tingkat pergeseran dan saran jenis
  var TINGKAT = ['', 'Dalam satu RO', 'Antar-RO dalam satu KRO', 'Antar-KRO dalam satu Kegiatan', 'Antar-Kegiatan', 'Antar-Program'];
  function terdampak(s) { return s.rows.filter(function (r) { return sd(r) !== 0 || r.akunM !== r.akun || r.uraM !== r.uraian; }); }
  function tingkat(s) {
    var rs = terdampak(s).filter(function (r) { return sd(r) !== 0 || r.akunM !== r.akun; }); if (!rs.length) return 0;
    var u = function (f) { var m = {}; rs.forEach(function (r) { m[f(ROMETA[r.ro])] = 1; }); return Object.keys(m).length; };
    if (u(function (m) { return m.kode; }) === 1) return 1;
    if (u(function (m) { return m.keg + '/' + m.kro; }) === 1) return 2;
    if (u(function (m) { return m.keg; }) === 1) return 3;
    if (u(function (m) { return m.prog; }) === 1) return 4;
    return 5;
  }
  function lintasJenis(s) {
    var net = {}; s.rows.forEach(function (r) { var a = r.jum; net[r.akun.slice(0, 2)] = (net[r.akun.slice(0, 2)] || 0) - a; net[r.akunM.slice(0, 2)] = (net[r.akunM.slice(0, 2)] || 0) + jumM(r); });
    var nz = Object.keys(net).filter(function (k) { return Math.round(net[k]) !== 0; });
    var baris2 = s.rows.filter(function (r) { var a = r.pindahDari ? cari(s, r.pindahDari) : null; return a && a.akun.slice(0, 2) !== r.akun.slice(0, 2); });
    return { ya: nz.length > 1 || baris2.length > 0 && nz.length > 0, baris: baris2 };
  }
  var URUT = { pok: 1, administrasi: 1, dipa_djpb: 2, dipa_dja: 3 };
  var JENIS = [
    { kode: 'pok', nama: 'Revisi POK', penetap: 'KPA', mode: 'Mode Pagu Tetap', dasar: 'Pasal 173; Lampiran IV.C angka 5' },
    { kode: 'administrasi', nama: 'Revisi Administrasi', penetap: 'Kanwil DJPb (umumnya)', mode: 'Mode Pagu Tetap', dasar: 'Pasal 120 ayat 4; Pasal 124 ayat 5; Pasal 174' },
    { kode: 'dipa_djpb', nama: 'Revisi DIPA jalur DJPb (Kanwil)', penetap: 'Kepala Kanwil DJPb', mode: 'Mode Revisi DIPA', dasar: 'Pasal 124 ayat 2 huruf b; Pasal 172; Pasal 174' },
    { kode: 'dipa_dja', nama: 'Revisi DIPA jalur DJA', penetap: 'DJA (Dirjen Anggaran)', mode: 'Mode Revisi DIPA', dasar: 'Pasal 124 ayat 2 huruf a; Pasal 165; Lampiran IV.C angka 1' }
  ];
  function jenisInfo(k) { for (var i = 0; i < JENIS.length; i++) if (JENIS[i].kode === k) return JENIS[i]; return JENIS[0]; }
  function mode(jenis) { return (jenis === 'dipa_djpb' || jenis === 'dipa_dja') ? 'dipa' : 'tetap'; }

  function saran(s) {
    var t = total(s), tg = tingkat(s), lj = lintasJenis(s), alasan = [], lamp = [], penaik = [];
    var ada = terdampak(s).length > 0;
    if (!ada) return { jenis: '', tingkat: 0, tingkatNama: '', alasan: ['Belum ada perubahan pada kolom Menjadi.'], penaik: [], lampiranTambahan: [] };
    var jenis = 'pok';
    if (t.d !== 0) { jenis = 'dipa_dja'; alasan.push('Pagu Satker berubah ' + sel(t.d) + ' (Pasal 120 ayat 2; Pasal 165). Revisi POK tidak sesuai (R-01).'); s.rows.forEach(function (r) { if (sd(r) !== 0) penaik.push(r.id); }); }
    else if (tg === 5) { jenis = 'dipa_dja'; alasan.push('Pergeseran antar-Program (Lampiran IV.C angka 2.b dan 2.c). Bila hanya untuk kekurangan Belanja Operasional, jalurnya DJPb (Pasal 174 ayat 1 huruf a angka 1).'); s.rows.forEach(function (r) { if (r.ext) penaik.push(r.id); }); }
    else if (lj.ya) { jenis = 'dipa_djpb'; alasan.push('Antar-jenis belanja (dua digit pertama akun berbeda), volume RO tidak turun (Lampiran IV.C angka 2.q). Bila volume RO turun, jalur DJA (2.q dan 2.u).'); lj.baris.forEach(function (r) { penaik.push(r.id); if (r.pindahDari) penaik.push(r.pindahDari); }); }
    else if (tg === 4) { jenis = 'dipa_djpb'; alasan.push('Antar-Kegiatan: Revisi DIPA jalur DJPb dengan surat persetujuan pejabat Eselon I (Pasal 172 ayat 1 huruf a angka 2).'); lamp.push('Surat persetujuan pejabat Eselon I'); s.rows.forEach(function (r) { if (r.ext) penaik.push(r.id); }); }
    else if (tg === 3) { jenis = 'dipa_djpb'; alasan.push('Antar-KRO dalam satu Kegiatan: jalur DJPb (Lampiran IV.C; Pasal 124 ayat 2 huruf b).'); }
    else {
      jenis = 'pok';
      var angkaAtauAkun = s.rows.some(function (r) { return sd(r) !== 0 || r.akunM !== r.akun || r.baru; });
      if (tg === 1) alasan.push('Pergeseran dalam satu RO tanpa mengubah sumber dana, pagu Satker, volume RO, dan jenis belanja: wewenang KPA (Pasal 173; Lampiran IV.C angka 5).');
      else if (tg === 2) alasan.push('Pergeseran antar-RO dalam satu KRO dan satu Kegiatan tanpa mengubah pagu Satker, volume RO, sumber dana, dan jenis belanja: wewenang KPA (Pasal 173 ayat 1 dan 3).');
      else if (!angkaAtauAkun) alasan.push('Hanya redaksi item yang berubah (P-02). Disarankan Revisi POK; bila hanya ralat atau rumusan non-anggaran, PPK dapat menetapkan Revisi Administrasi (Pasal 120 ayat 4).');
    }
    // baris penaik untuk kasus campuran (jenis di atas POK tetapi ada baris yang sebenarnya jalur POK)
    var pokSaja = s.rows.filter(function (r) { return (sd(r) !== 0 || r.akunM !== r.akun) && penaik.indexOf(r.id) < 0; });
    return { jenis: jenis, tingkat: tg, tingkatNama: TINGKAT[tg] || '', alasan: alasan, penaik: penaik, pokSaja: pokSaja.map(function (r) { return r.id; }), lampiranTambahan: lamp, campuran: jenis !== 'pok' && penaik.length > 0 && pokSaja.length > 0 };
  }

  // ---------------------------------------------------------------- hari kerja dan tenggat (Pasal 175)
  var LIBUR = { '2026-12-24': 'Cuti bersama Natal', '2026-12-25': 'Natal (libur nasional)' };
  function d(str) { var p = str.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function hariKerja(str) { var dt = d(str), w = dt.getUTCDay(); return w !== 0 && w !== 6 && !LIBUR[str]; }
  function efektif(str) { var dt = d(str); while (!hariKerja(iso(dt))) dt = new Date(dt.getTime() - 86400000); return iso(dt); }
  function sisaHariKerja(dari, ke) { if (ke < dari) return -1; var n = 0, dt = d(dari), tujuan = d(ke); while (dt < tujuan) { dt = new Date(dt.getTime() + 86400000); if (hariKerja(iso(dt))) n++; } return n; }
  var TENGGAT = {
    dipa_dja: { batas: '2026-10-31', ayat: 'Pasal 175 ayat 1a', nama: 'Revisi DIPA jalur DJA, reguler' },
    dipa_djpb: { batas: '2026-11-30', ayat: 'Pasal 175 ayat 1b dan 1c', nama: 'Revisi DIPA jalur DJPb, termasuk kewenangan K/L yang mengubah DIPA' },
    administrasi: { batas: '2026-12-27', ayat: 'Pasal 175 ayat 14', nama: 'Revisi administrasi dan pemutakhiran halaman III DIPA' },
    pok: { batas: '2026-12-27', ayat: 'Pasal 175 ayat 14 (batas lunak, KPA memutuskan sendiri)', nama: 'Revisi POK oleh KPA', lunak: true }
  };
  function tenggat(jenis, hari) {
    var t = TENGGAT[jenis], ef = efektif(t.batas), sisa = sisaHariKerja(hari, ef), w = sisa < 0 ? 'lewat' : (sisa <= 3 ? 'merah' : (sisa <= 10 ? 'kuning' : 'aman'));
    var cat = ''; if (ef !== t.batas) cat = 'Batas ' + tgl(t.batas) + ' jatuh pada hari libur, dimajukan ke hari kerja terakhir sebelumnya (ayat 18).';
    if (w === 'lewat') cat = (cat ? cat + ' ' : '') + 'Lewat batas: hanya dapat diproses atas persetujuan Menteri Keuangan untuk direktif Presiden atau prioritas mendesak (Pasal 179). Tidak ada yang dikunci.';
    return { jenis: jenis, nama: t.nama, ayat: t.ayat, batas: t.batas, batasT: tgl(t.batas), efektif: ef, efektifT: tgl(ef), sisa: sisa, warna: w, catatan: cat, lunak: !!t.lunak };
  }

  // ---------------------------------------------------------------- lampiran per jenis (Draf 4)
  var LAMPIRAN = [
    { kode: 'L01', uraian: 'Data dalam Sistem Informasi (diunggah)', pok: 'Ya', administrasi: 'Ya', dipa_djpb: 'Ya', dipa_dja: 'Ya', dasar: 'Pasal 173(5); 172(1)(a)1; 165(1)(e)1' },
    { kode: 'L02', uraian: 'Surat usulan KPA', pok: 'Tidak (KPA memutuskan)', administrasi: 'Ya', dipa_djpb: 'Ya, ke Kanwil', dipa_dja: 'Ya, ke Eselon I', dasar: 'Pasal 172(1)(a); 165(1)(a)' },
    { kode: 'L03', uraian: 'Hasil reviu APIP atas RKA', pok: 'Perhatikan, catat tautan', administrasi: 'Tidak', dipa_djpb: 'Bila diminta', dipa_dja: 'LHR APIP bila pagu berubah, antar-Program menurunkan volume RO, atau ada Program, Kegiatan, KRO, atau RO baru', dasar: 'Pasal 173(3)(b); 165(1)(c)-(d)' },
    { kode: 'L04', uraian: 'Surat persetujuan pejabat Eselon I', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Bila antar-Satker, antar-Kegiatan, atau Kegiatan baru', dipa_dja: 'Surat pernyataan Eselon I (usulan disetujui, dokumen telah diteliti)', dasar: 'Pasal 172(1)(a)2; 165(1)(e)2' },
    { kode: 'L05', uraian: 'Persetujuan Menteri atau Pimpinan Lembaga', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Tidak', dipa_dja: 'Bila antar-Program (kecuali Belanja Operasional)', dasar: 'Pasal 165(1)(e)2(c)' },
    { kode: 'L06', uraian: 'Rencana kebutuhan BMN hasil penelaahan', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Bila terkait pengadaan BMN (dokumen pendukung lain)', dipa_dja: 'Bila menambah atau mengubah objek atau spesifikasi BMN', dasar: 'Pasal 165(1)(e)4' },
    { kode: 'L07', uraian: 'Rekomendasi (clearance) Komdigi atau PANRB', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Bila belanja TIK tertentu', dipa_dja: 'Bila belanja TIK tertentu', dasar: 'Pasal 172(1)(a)3; 165(1)(e)5' },
    { kode: 'L08', uraian: 'Surat pernyataan Eselon I untuk akun 526 berbasis proposal', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Bila terkait', dipa_dja: 'Bila terkait', dasar: 'Pasal 165(1)(e)6; Pasal 171(1)(a)4' },
    { kode: 'L09', uraian: 'Surat pemberitahuan perubahan RKA (format Lampiran IV huruf B)', pok: 'Tidak', administrasi: 'Bila ralat oleh K/L', dipa_djpb: 'Bila Pasal 174', dipa_dja: 'Tidak', dasar: 'Pasal 174(1)(e)-(g)' },
    { kode: 'L10', uraian: 'Dokumen pendukung lain sesuai substansi', pok: 'Ya', administrasi: 'Ya', dipa_djpb: 'Ya', dipa_dja: 'Ya', dasar: 'Pasal 172(1)(a)4; 165(1)(e)8' },
    { kode: 'L11', uraian: 'Undangan dan berita acara penelaahan', pok: 'Tidak', administrasi: 'Tidak', dipa_djpb: 'Tidak', dipa_dja: 'Dicatat bila ada', dasar: 'Pasal 165(2) dan (9)' },
    { kode: 'L12', uraian: 'Dokumen asli diarsipkan KPA', pok: 'Ya', administrasi: 'Ya', dipa_djpb: 'Ya', dipa_dja: 'Ya', dasar: 'Pasal 172(1)(b); 174(1)(d); 165(1)(f)' }
  ];
  function lampiranUntuk(s, jenis) {
    return LAMPIRAN.map(function (l) {
      var v = l[jenis], wajib = /^Ya/.test(v), kond = !wajib && !/^Tidak/.test(v);
      var st = s.lampiran[l.kode] || { st: 'belum', nomor: '', tanggal: '' };
      return { kode: l.kode, uraian: l.uraian, ket: v, wajib: wajib, kondisional: kond, tidak: !wajib && !kond, dasar: l.dasar, st: st.st, nomor: st.nomor, tanggal: st.tanggal };
    });
  }

  // ---------------------------------------------------------------- pemeriksaan kesesuaian R-01 sampai R-14
  function periksa(s) {
    var out = [], t = total(s), tg = tingkat(s), lj = lintasJenis(s), md = mode(s.jenis), sr = saran(s), tt = tenggat(s.jenis, s.hari);
    function add(k, teks, tingkatHasil, pesan, dasarPasal) { out.push({ kode: k, teks: teks, tingkat: tingkatHasil, pesan: pesan, dasar: dasarPasal }); }
    var pagu0 = s.jenis === 'dipa_dja';
    add('R-01', 'Total pagu Satker sebelum dan sesudah sama', t.d === 0 || pagu0 ? 'hijau' : 'merah', t.d === 0 ? 'Total sebelum dan sesudah sama: Rp ' + fmt(t.a) + '.' : (pagu0 ? 'Pagu berubah ' + sel(t.d) + ' (diizinkan pada jalur DJA).' : 'Pagu berubah ' + sel(t.d) + '. Jenis disarankan naik ke Revisi DIPA jalur DJA; Revisi POK tidak sesuai.'), 'Pasal 173(3)(a); 120(2)');
    add('R-02', 'Satuan dan volume RO tidak berubah', 'hijau', 'Volume dan satuan RO tidak diubah pada kertas kerja ini (RO 1 dokumen tetap). Di mockup tidak dihitung dari data; di aplikasi dihitung dari volume RO yang tersimpan.', 'Pasal 173(3)(a); Lampiran IV.C 2.q, 2.u');
    var r3 = lj.ya;
    add('R-03', 'Jenis belanja (dua digit pertama akun) sama', !r3 ? 'hijau' : (md === 'tetap' ? 'merah' : 'info'), !r3 ? 'Semua perubahan tetap dalam jenis belanja yang sama.' : 'Ada perubahan lintas jenis belanja (' + lj.baris.map(function (r) { var a = cari(s, r.pindahDari); return (a ? a.akun : '?') + ' ke ' + r.akun; }).join(', ') + '). Naik ke Revisi DIPA jalur DJPb.', 'Lampiran II PMK 62/2023; IV.C 2.q');
    add('R-04', 'Sumber dana sama', 'hijau', 'Seluruh baris bersumber RM (Rupiah Murni), tidak berubah. Di mockup tidak dihitung dari data; di aplikasi dihitung dari kolom sumber dana.', 'Pasal 173(3)(a)');
    var r5 = tg >= 3;
    add('R-05', 'Pergeseran masih dalam satu KRO dan satu Kegiatan', !r5 ? 'hijau' : (md === 'tetap' ? 'merah' : 'info'), !r5 ? (tg ? TINGKAT[tg] + '.' : 'Belum ada pergeseran.') : TINGKAT[tg] + ': ' + (tg === 3 ? 'jalur DJPb.' : (tg === 4 ? 'jalur DJPb dengan surat persetujuan Eselon I.' : 'jalur DJA.')), 'Pasal 173(1)(a); 172(1)(a)2');
    var bawah = s.rows.filter(function (r) { return !r.baru && jumM(r) < r.bk + r.rl; });
    add('R-06', 'Pagu baris sesudah revisi tidak di bawah Booked ditambah Realisasi', bawah.length ? 'merah' : 'hijau', bawah.length ? bawah.map(function (r) { return 'pagu ' + r.akun + ' ' + r.uraian.slice(0, 40) + ' menjadi ' + fmt(jumM(r)) + ', di bawah Booked ' + fmt(r.bk) + ' ditambah Realisasi ' + fmt(r.rl) + ' (' + fmt(r.bk + r.rl) + ')'; }).join('; ') + '. KPA tidak dapat menyetujui sampai dikoreksi.' : 'Semua baris sesudah revisi masih menampung Booked dan Realisasi.', 'Pasal 180(2)-(3); prinsip, bukan kalimat eksplisit');
    var peg = s.rows.filter(function (r) { return r.akun.slice(0, 2) === '51' && sd(r) < 0; });
    add('R-07', 'Belanja pegawai tidak menjadi sumber pergeseran biasa', peg.length ? 'kuning' : 'hijau', peg.length ? 'Belanja pegawai dikurangi. Jalur khusus: hanya dari belanja pegawai operasional ke belanja barang operasional, dengan persetujuan Sekjen atau Sestama.' : 'Tidak ada pengurangan belanja pegawai.', 'Pasal 146(2); 175(9)(a)');
    add('R-08', 'Baris RO Khusus atau bertanda blokir tidak disentuh', 'info', 'Penanda RO Khusus dan blokir pada POK Solok belum dicek (Q-26). Tidak ada baris bertanda blokir pada KRO contoh.', 'Pasal 157-158A; 165(8)');
    var pg = s.rows.filter(function (r) { return r.penggenap; });
    add('R-09', 'Baris Penggenap (dana penggenap)', pg.length ? 'kuning' : 'hijau', pg.length ? 'Ada ' + pg.length + ' baris Dana penggenap, total Rp ' + fmt(pg.reduce(function (t, x) { return t + jumM(x); }, 0)) + ' (akun 524: Perjalanan dinas Kabupaten; akun 52 lain: nama akun + Kabupaten, ketentuan kantor). Dasar hukum tidak ditemukan di tiga PMK; tanyakan Kanwil atau APIP.' : 'Tidak ada baris penggenap.', 'Pasal 124(4)');
    add('R-10', 'Belanja Operasional tidak menjadi sumber kegiatan non-operasional kecuali RO Khusus', 'info', 'Belum dihitung: klasifikasi Belanja Operasional pada POK Solok belum dikonfirmasi (Q-26). Ini inferensi dari teks PMK.', 'Pasal 144(1); inferensi');
    add('R-11', 'Reviu APIP tercatat', s.apip ? 'hijau' : (s.jenis === 'dipa_dja' && (t.d !== 0 || tg === 5) ? 'merah' : 'kuning'), s.apip ? 'Reviu APIP: ' + s.apip : (s.jenis === 'dipa_dja' ? 'Jalur DJA: LHR APIP diperlukan untuk kasus tertentu (Pasal 165 ayat 1 huruf c).' : 'Catat hasil reviu APIP atas RKA atau tautannya.'), 'Pasal 173(3)(b); 165(1)(c)-(d)');
    var lp = lampiranUntuk(s, s.jenis).filter(function (l) { return l.wajib && l.st === 'belum'; });
    add('R-12', 'Lampiran sesuai jenis sudah lengkap', lp.length ? 'kuning' : 'hijau', lp.length ? lp.length + ' lampiran wajib belum ada: ' + lp.map(function (l) { return l.kode; }).join(', ') + '. Kanwil mengembalikan usulan yang belum lengkap.' : 'Semua lampiran wajib sudah tercatat.', 'Pasal 172(1)(a) dan (3)');
    add('R-13', 'Relevansi akun atau detail dengan RO', 'info', 'Penelaah DJA menilai kerangka berpikir yang logis; periksa baris item baru.', 'Pasal 124(4)');
    add('R-14', 'Tenggat', 'info', 'Batas efektif ' + tt.efektifT + ', sisa ' + Math.max(tt.sisa, 0) + ' hari kerja. Pengingat saja, tidak ada yang dikunci.', 'Pasal 175');
    return out;
  }
  function hitungCek(rs) { var c = { merah: 0, kuning: 0, hijau: 0, info: 0 }; rs.forEach(function (r) { c[r.tingkat]++; }); return c; }

  // ---------------------------------------------------------------- tahap sesudah revisi: impor, versi, RPD
  function impor(s) {
    var out = [], c = 0;
    s.rows.forEach(function (r) {
      var j = jumM(r), d1 = j - r.jum;
      if (d1 === 0 && !r.baru) return;
      var st, imp, cat = '';
      if (r.baru) { st = 'baru'; imp = j; cat = r.pindahDari ? 'kunci_stabil baru diberikan; pindahan dari akun ' + (cari(s, r.pindahDari) || {}).akun : 'kunci_stabil baru diberikan'; }
      else if (j === 0) { st = 'hilang'; imp = 0; cat = r.pindahKe ? 'dikosongkan: dipindah ke akun ' + (cari(s, r.pindahKe) || {}).akun : 'dihapus sesuai usulan'; }
      else { st = 'sama'; imp = j; }
      out.push({ id: r.id, uraian: r.uraM, akun: r.akunM, ro: r.ro, st: st, jM: j, jI: imp, kunci: r.baru ? 'BARU-' + (++c) : r.id, cat: cat, cls: st === 'sama' ? 'ok' : (st === 'baru' ? 'info' : 'abu') });
    });
    var ber = out.filter(function (o) { return o.st === 'sama' && o.jM > 1000000; })[0];
    if (ber) { ber.st = 'berubah'; ber.jI = ber.jM - 1000; ber.cat = 'angka di berkas Kanwil beda Rp 1.000 dari usulan (pembulatan?)'; ber.cls = 'kuning'; }
    var luar = s.rows.filter(function (r) { return !r.baru && jumM(r) === r.jum && r.jum > 5000000; })[0];
    if (luar) out.push({ id: luar.id, uraian: luar.uraM, akun: luar.akunM, ro: luar.ro, st: 'luar', jM: luar.jum, jI: luar.jum + 1000, kunci: luar.id, cat: 'berubah di berkas padahal tidak ada di kertas kerja', cls: 'kuning' });
    var n = { sama: 0, berubah: 0, baru: 0, hilang: 0, luar: 0 }; out.forEach(function (o) { n[o.st]++; });
    return { baris: out, n: n };
  }
  function rowsRevisi(n) {
    var s = stateKosong();
    if (n >= 1) { set(s, '008.051.521211.01', 'volM', 18); set(s, '009.051.521211.01', 'hargaM', 272000); }
    if (n >= 2) { if (g.KKC && g.KKR) { s = g.KKC.contohGeser(s, g.KKR.baru()); } else { var s2 = stateKosong(); s2.rows = s.rows; terapkanRab(s2); s = s2; } }
    return s;
  }
  function versi() {
    var v0 = rowsRevisi(0), v1 = rowsRevisi(1), v2 = rowsRevisi(2);
    var kunci = v2.rows.map(function (r) { return r; });
    var daftar = kunci.map(function (r2) {
      var r0 = cari(v0, r2.id), r1 = cari(v1, r2.id);
      var a = r0 ? jumM(r0) : 0, b = r1 ? jumM(r1) : a, c = jumM(r2);
      return { id: r2.id, ro: r2.ro, akun: r2.akunM, uraian: r2.uraM, v0: a, v1: b, v2: c, d01: b - a, d12: c - b };
    }).filter(function (x) { return x.d01 !== 0 || x.d12 !== 0; });
    function totalRo(rs, ro) { var t2 = 0; rs.rows.forEach(function (r) { if (r.ro === ro) t2 += jumM(r); }); return t2; }
    var ros = D.ros.map(function (r) { var a = totalRo(v0, r.kode), b = totalRo(v1, r.kode), c = totalRo(v2, r.kode); return { kode: r.kode, nama: r.nama, v0: a, v1: b, v2: c, d01: b - a, d12: c - b }; });
    var T = { v0: total(v0).b, v1: total(v1).b, v2: total(v2).b };
    return { baris: daftar, ros: ros, T: T };
  }
  var POLA = { '051': [6, 7], '052': [7, 8, 9, 10], '053': [10, 11], '005': [7, 8, 9, 10, 11] };
  function rpd(s) {
    var A = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], B = A.slice();
    s.rows.forEach(function (r) { var p = POLA[r.kom] || [10]; p.forEach(function (m) { A[m - 1] += r.jum / p.length; B[m - 1] += jumM(r) / p.length; }); });
    var bl = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return bl.map(function (b, i) { var a = Math.round(A[i]), c = Math.round(B[i]); return { bulan: b, a: a, b: c, d: c - a, aT: fmt(a), bT: fmt(c), dT: sel(c - a), geser: Math.abs(c - a) > 0 }; });
  }

  g.KK = {
    hariIni: hariIni, fmt: fmt, sel: sel, tgl: tgl, hitungRumus: hitungRumus, baru: stateKosong, skenario: skenario, SKENARIO: SKENARIO,
    ubah: ubah, tambahItem: tambahItem, geser: geser, alihTutup: alihTutup, setJenis: setJenis, setLampiran: setLampiran,
    tabel: tabel, total: total, tingkat: tingkat, TINGKAT: TINGKAT, saran: saran, JENIS: JENIS, jenisInfo: jenisInfo, mode: mode,
    tenggat: tenggat, efektif: efektif, sisaHariKerja: sisaHariKerja, LAMPIRAN: LAMPIRAN, lampiranUntuk: lampiranUntuk,
    periksa: periksa, hitungCek: hitungCek, PEMICU: PEMICU, pemicuBaris: pemicuBaris, impor: impor, versi: versi, rpd: rpd,
    jumM: jumM, sd: sd, ROMETA: ROMETA, DATA: D, rowsRevisi: rowsRevisi, gantiAkun: gantiAkun, gantiRedaksi: gantiRedaksi, batalGanti: batalGanti, gantiAkunGrup: gantiAkunGrup, batalGantiGrup: batalGantiGrup, pasangRl: pasangRl, lalu: lalu, AKUN: AKUN, namaAkun: namaAkun
  };
  if (typeof module !== 'undefined') module.exports = g.KK;
})(typeof window !== 'undefined' ? window : globalThis);
