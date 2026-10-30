/* kk-adm.js: model papan 9 sampai 15 (ruang kerja RO, peran dan akses, jadwal revisi, POK PDF, realisasi mingguan, skor RAB, tab Administrasi).
   Semua nama orang, tim, penugasan, angka realisasi, skor, dan penanda "dapat dibuat SIGAP" adalah ILUSTRASI. Data POK dan skema kelengkapan nyata (kk-adm-data.js). */
(function (g) {
  var SK = g.KKA_SKEMA, ROS = g.KKA_RO;
  function fmt(n) { var s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '-' : '') + s; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---------------------------------------------------------------- tim, pengguna, peran
  var TIM = [
    { id: 'kesra', nama: 'Tim Statistik Kesejahteraan Rakyat', keg: ['2905', '2906', '2907'] },
    { id: 'prod', nama: 'Tim Statistik Produksi', keg: ['2904', '2909', '2910', '8130', '8131'] },
    { id: 'dist', nama: 'Tim Statistik Distribusi dan Jasa', keg: ['2902', '2903', '2908'] },
    { id: 'neraca', nama: 'Tim Neraca Wilayah dan Analisis Statistik', keg: ['2896', '2898', '2899', '2900'] },
    { id: 'umum', nama: 'Tim Umum, Diseminasi, dan TI', keg: ['2886', '2897', '2901'] }
  ];
  function timOf(roKode) { var k = String(roKode).slice(0, 4); for (var i = 0; i < TIM.length; i++) if (TIM[i].keg.indexOf(k) >= 0) return TIM[i].id; return 'umum'; }
  var PERAN = {
    ADMIN: { nama: 'Admin Aplikasi', ket: 'Mengatur peran dan akses. Tidak menyetujui anggaran.' },
    KPA: { nama: 'Kepala (KPA)', ket: 'Menerima laporan revisi, realisasi, dan skor. Tidak menyetujui; sah atau tidaknya revisi cukup di PPK (ketentuan kantor, 24 Okt 2026).' },
    PPK: { nama: 'PPK', ket: 'Melihat semua RO, menyetujui, membuka jadwal, menyatakan revisi sah (sendiri), mengunggah POK resmi, memberi kewenangan verifikasi. Tidak membuat RAB kecuali merangkap ketua tim; bila merangkap, RAB-nya langsung sah.' },
    KETUA: { nama: 'Ketua Tim Kegiatan', ket: 'Satu-satunya pembuat RAB untuk RO tim sendiri; menyetujui usulan admin RO.' },
    ADMINRO: { nama: 'Admin RO', ket: 'Membantu ketua tim mengelola SIGAP pada RO yang ditunjuk, termasuk revisi; usulan butuh persetujuan ketua tim.' },
    BEND: { nama: 'Bendahara', ket: 'Mengunggah Excel realisasi tiap minggu; melihat semua RO tanpa mengubah RAB.' },
    PBJ: { nama: 'Pengelola PBJ', ket: 'Menyiapkan dokumen pengadaan pada tab Administrasi RO yang dibuka untuknya.' },
    TU: { nama: 'Tata Usaha', ket: 'Membantu administrasi; dapat diberi kewenangan verifikasi dokumen oleh PPK.' },
    RENC: { nama: 'Perencanaan', ket: 'Menyiapkan SK KPA dan dokumen perencanaan pada tab Administrasi.' }
  };
  var USERS = [
    { id: 'admin', nama: 'Admin Aplikasi (contoh)', peran: ['ADMIN'], ketua: [], roAdmin: [], adm: [] },
    { id: 'kpa', nama: 'Kepala BPS (contoh)', peran: ['KPA'], ketua: [], roAdmin: [], adm: [] },
    { id: 'ppk', nama: 'PPK (contoh, merangkap Ketua Tim Umum)', peran: ['PPK', 'KETUA'], ketua: ['umum'], roAdmin: [], adm: ['*'] },
    { id: 'bend', nama: 'Bendahara (contoh)', peran: ['BEND'], ketua: [], roAdmin: [], adm: ['*'] },
    { id: 'k-kesra', nama: 'Ketua Tim Kesra (contoh)', peran: ['KETUA'], ketua: ['kesra'], roAdmin: [], adm: [] },
    { id: 'k-prod', nama: 'Ketua Tim Produksi (contoh)', peran: ['KETUA'], ketua: ['prod'], roAdmin: [], adm: [] },
    { id: 'k-dist', nama: 'Ketua Tim Distribusi (contoh)', peran: ['KETUA'], ketua: ['dist'], roAdmin: [], adm: [] },
    { id: 'a-kesra', nama: 'Admin RO Kesra (contoh)', peran: ['ADMINRO'], ketua: [], roAdmin: ['2906.BMA.006', '2907.BMA.009', '2907.BMA.008'], adm: [] },
    { id: 'a-dist', nama: 'Admin RO Distribusi (contoh)', peran: ['ADMINRO'], ketua: [], roAdmin: ['2903.BMA.007', '2903.BMA.008', '2903.BMA.009'], adm: [] },
    { id: 'anggota', nama: 'Anggota tim dengan akses Administrasi (contoh)', peran: [], ketua: [], roAdmin: [], adm: ['2903.BMA.008'] },
    { id: 'pbj', nama: 'Pengelola PBJ (contoh)', peran: ['PBJ'], ketua: [], roAdmin: [], adm: ['*'] },
    { id: 'renc', nama: 'Staf Perencanaan (contoh)', peran: ['RENC'], ketua: [], roAdmin: [], adm: ['*'] },
    { id: 'tu', nama: 'Staf Tata Usaha (contoh)', peran: ['TU'], ketua: [], roAdmin: [], adm: ['*'], wew: ['verifikasi'] }
  ];
  function user(id) { for (var i = 0; i < USERS.length; i++) if (USERS[i].id === id) return USERS[i]; return USERS[0]; }
  function adaPeran(u, p) { return u.peran.indexOf(p) >= 0; }
  // hak seorang pengguna pada satu RO
  function hak(u, roKode) {
    var tim = timOf(roKode), ketua = u.ketua.indexOf(tim) >= 0, admro = u.roAdmin.indexOf(roKode) >= 0;
    var semua = adaPeran(u, 'ADMIN') || adaPeran(u, 'KPA') || adaPeran(u, 'PPK') || adaPeran(u, 'BEND');
    var adm = ketua || admro || u.adm.indexOf('*') >= 0 || u.adm.indexOf(roKode) >= 0;
    return {
      lihat: semua || ketua || admro,
      buatRAB: ketua, ubahRAB: ketua || admro, rabDraf: admro && !ketua,
      usulRevisi: ketua || admro, setujuKetua: ketua, setujuPPK: adaPeran(u, 'PPK'), terimaLaporan: adaPeran(u, 'KPA'),
      adm: adm, aturAkses: adaPeran(u, 'ADMIN'), ketuaRO: ketua, adminRO: admro
    };
  }
  function roTerlihat(u) { return ROS.filter(function (r) { return hak(u, r.kode).lihat; }); }
  function roAkses(u) { return ROS.filter(function (r) { var h = hak(u, r.kode); return h.lihat || h.adm; }); }
  function roAdm(u) { return ROS.filter(function (r) { return hak(u, r.kode).adm; }); }
  // alur persetujuan satu usulan RO (RAB atau revisi)
  var STATUS = {
    draf: { nama: 'Draf', cls: 'abu' }, menunggu_ketua: { nama: 'Menunggu ketua tim', cls: 'kuning' }, menunggu_ppk: { nama: 'Menunggu PPK', cls: 'kuning' },
    menunggu_kpa: { nama: 'Menunggu KPA', cls: 'kuning' }, disetujui: { nama: 'Disetujui', cls: 'hijau' }, dikembalikan: { nama: 'Dikembalikan', cls: 'merah' }
  };
  // kembalikan {aksi:[{kode,nama,ke}], alasan}
  function aksiAlur(u, roKode, status, diajukanOleh) {
    var h = hak(u, roKode), out = [], alasan = '', ppkKetua = adaPeran(u, 'PPK') && h.ketuaRO;
    // Ketentuan 24 Okt 2026: PPK yang merangkap ketua tim membuat RAB RO-nya dan RAB itu langsung sah; KPA hanya menerima laporan.
    if (status === 'draf' || status === 'dikembalikan') {
      if (h.ketuaRO) out.push({ kode: 'ajukan', nama: ppkKetua ? 'Sahkan (PPK merangkap ketua tim)' : 'Ajukan ke PPK', ke: ppkKetua ? 'disetujui' : 'menunggu_ppk', utama: true });
      else if (h.adminRO) out.push({ kode: 'ajukan', nama: 'Ajukan ke ketua tim', ke: 'menunggu_ketua', utama: true });
      else alasan = 'Hanya ketua tim atau admin RO yang dapat mengajukan.';
    } else if (status === 'menunggu_ketua') {
      if (h.ketuaRO) { out.push({ kode: 'setujui', nama: ppkKetua ? 'Setujui dan sahkan (PPK merangkap ketua tim)' : 'Setujui dan teruskan ke PPK', ke: ppkKetua ? 'disetujui' : 'menunggu_ppk', utama: true }); out.push({ kode: 'kembali', nama: 'Kembalikan ke admin RO', ke: 'dikembalikan' }); }
      else alasan = h.adminRO ? 'Admin RO tidak dapat menyetujui usulannya sendiri; menunggu ketua tim.' : 'Menunggu ketua tim RO ini.';
    } else if (status === 'menunggu_ppk') {
      if (h.setujuPPK) { out.push({ kode: 'setujui', nama: 'Setujui dan sahkan', ke: 'disetujui', utama: true }); out.push({ kode: 'kembali', nama: 'Kembalikan', ke: 'dikembalikan' }); }
      else alasan = 'Menunggu PPK.';
    } else alasan = h.terimaLaporan ? 'Sudah disahkan. KPA menerima laporan, tanpa persetujuan.' : 'Sudah disahkan.';
    return { aksi: out, alasan: alasan };
  }
  // verifikasi dokumen administrasi: PPK, bendahara (dokumen bendahara), atau akun yang diberi kewenangan
  function bolehVerif(u, roKode, pihak) {
    if (!hak(u, roKode).adm) return false;
    return adaPeran(u, 'PPK') || (adaPeran(u, 'BEND') && pihak.indexOf('Bendahara') >= 0) || (u.wew || []).indexOf('verifikasi') >= 0;
  }
  // skor kualitas RAB tampak oleh semua pengguna, semua RO (transparan; pembinaan, bukan sanksi)
  function lihatSkor() { return true; }

  // ---------------------------------------------------------------- jadwal revisi
  var HARI_INI = '2026-10-24';
  var JENIS = { pok: { nama: 'Revisi POK', cls: 'biru' }, administrasi: { nama: 'Revisi Administrasi', cls: 'info' }, dipa_djpb: { nama: 'Revisi DIPA jalur DJPb', cls: 'kuning' }, dipa_dja: { nama: 'Revisi DIPA jalur DJA', cls: 'merah' } };
  var JSTATUS = {
    terjadwal: { nama: 'Terjadwal', cls: 'abu' }, dibuka: { nama: 'Dibuka untuk usulan', cls: 'biru' }, terkumpul: { nama: 'Usulan dikumpulkan', cls: 'kuning' },
    diterapkan: { nama: 'Diterapkan, menunggu sah', cls: 'kuning' }, sah: { nama: 'Sah diterapkan', cls: 'hijau' }, dilewati: { nama: 'Dilewati', cls: 'abu' }
  };
  function jadwalAwal() {
    return [
      { id: 'j1', jenis: 'pok', judul: 'Revisi POK Oktober', buka: '2026-10-10', tutup: '2026-10-12', ulang: 'bulanan tgl 10', status: 'dilewati', catatan: 'Tidak ada usulan masuk, dilewati PPK.', usulan: [] },
      { id: 'j2', jenis: 'dipa_dja', judul: 'Revisi DIPA jalur DJA (tenggat Pasal 175: 30 Okt 2026)', buka: '2026-10-20', tutup: '2026-10-27', ulang: '', status: 'dibuka', catatan: 'Jendela usulan internal ditutup 27 Okt agar sempat diajukan sebelum 30 Okt.', usulan: [{ ro: '2903.BMA.008', status: 'disetujui' }, { ro: '2906.BMA.006', status: 'menunggu_ppk' }, { ro: '2907.BMA.009', status: 'menunggu_ketua' }, { ro: '2910.BMA.008', status: 'draf' }] },
      { id: 'j3', jenis: 'pok', judul: 'Revisi POK November', buka: '2026-11-10', tutup: '2026-11-12', ulang: 'bulanan tgl 10', status: 'terjadwal', catatan: '', usulan: [] },
      { id: 'j4', jenis: 'dipa_djpb', judul: 'Revisi DIPA jalur DJPb (tenggat Pasal 175: 30 Nov 2026)', buka: '2026-11-02', tutup: '2026-11-20', ulang: '', status: 'terjadwal', catatan: '', usulan: [] },
      { id: 'j5', jenis: 'pok', judul: 'Revisi POK Desember', buka: '2026-12-10', tutup: '2026-12-14', ulang: 'bulanan tgl 10', status: 'terjadwal', catatan: 'Tenggat Pasal 175 untuk Revisi POK dan Administrasi: 27 Des 2026.', usulan: [] },
      { id: 'j6', jenis: 'administrasi', judul: 'Revisi Administrasi akhir tahun', buka: '2026-12-01', tutup: '2026-12-20', ulang: '', status: 'terjadwal', catatan: '', usulan: [] }
    ];
  }
  // transisi jadwal; kembalikan jadwal baru atau null bila tidak boleh
  function jadwalAksi(j, aksi) {
    var t = {
      buka: { dari: ['terjadwal'], ke: 'dibuka' }, tutup: { dari: ['dibuka'], ke: 'terkumpul' }, terapkan: { dari: ['terkumpul'], ke: 'diterapkan' },
      sah: { dari: ['diterapkan'], ke: 'sah' }, lewati: { dari: ['terjadwal', 'dibuka'], ke: 'dilewati' }, pulihkan: { dari: ['dilewati'], ke: 'terjadwal' }
    }[aksi];
    if (!t || t.dari.indexOf(j.status) < 0) return null;
    var n = JSON.parse(JSON.stringify(j)); n.status = t.ke; return n;
  }
  function aksiJadwal(j) {
    var peta = { terjadwal: ['buka', 'lewati'], dibuka: ['tutup', 'lewati'], terkumpul: ['terapkan'], diterapkan: ['sah'], sah: [], dilewati: ['pulihkan'] };
    var nama = { buka: 'Buka sekarang', tutup: 'Tutup dan kumpulkan usulan', terapkan: 'Terapkan ke kertas kerja', sah: 'Nyatakan sah diterapkan', lewati: 'Lewati', pulihkan: 'Pulihkan jadwal' };
    return peta[j.status].map(function (k) { return { kode: k, nama: nama[k], utama: k === 'sah' || k === 'buka' || k === 'tutup' || k === 'terapkan' }; });
  }
  function ringkasUsulan(j) {
    var c = { draf: 0, menunggu_ketua: 0, menunggu_ppk: 0, menunggu_kpa: 0, disetujui: 0, dikembalikan: 0 };
    j.usulan.forEach(function (u) { c[u.status]++; });
    return c;
  }
  // buat jadwal bulanan bawaan (tanggal 10) untuk bulan-bulan tersisa
  function jadwalBulanan(tahun, bulanMulai, hari) {
    var out = [], nm = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    for (var b = bulanMulai; b <= 12; b++) { var bb = ('0' + b).slice(-2), t = ('0' + (hari + 2)).slice(-2), hh = ('0' + hari).slice(-2); out.push({ judul: 'Revisi POK ' + nm[b - 1], buka: tahun + '-' + bb + '-' + hh, tutup: tahun + '-' + bb + '-' + t }); }
    return out;
  }

  // ---------------------------------------------------------------- POK resmi (PDF) dan pencocokan
  var POK_PDF0 = [
    { id: 'p0', label: 'POK semula (RKKS 30 Sep 2026)', berkas: 'RKKS_Satker_30Sep2026.pdf', tgl: '2026-10-01', oleh: 'PPK (contoh)', ukuran: '1,8 MB', skenario: 'sama' }
  ];
  function bandingPok(skenario) {
    var rows = ROS.map(function (r) { return { kode: r.kode, nama: r.nama, sistem: r.pagu, pdf: r.pagu, akun: [] }; });
    if (skenario === 'beda') {
      rows.forEach(function (x) {
        if (x.kode === '2903.BMA.008') { x.pdf -= 1000000; x.akun.push({ akun: '524113', ura: 'Transport lokal SPDT NTP', sistem: 29236000, pdf: 28236000 }); }
        if (x.kode === '2906.BMA.006') { x.pdf += 4200000; x.akun.push({ akun: '521213', ura: 'Honor petugas (baris baru di PDF)', sistem: 0, pdf: 4200000 }); }
        if (x.kode === '2910.BMA.008') { x.pdf -= 640000; x.akun.push({ akun: '521811', ura: 'Pengadaan ATK', sistem: 1500000, pdf: 860000 }); }
      });
      rows.push({ kode: '2903.BMA.010', nama: 'Publikasi/Laporan Statistik Harga Gabah (baru di PDF)', sistem: 0, pdf: 12500000, akun: [{ akun: '524113', ura: 'Transport lokal', sistem: 0, pdf: 12500000 }], baru: true });
    }
    var tot = { s: 0, p: 0, beda: 0 };
    rows.forEach(function (x) { x.sel = x.pdf - x.sistem; x.status = x.baru ? 'baru' : (x.sel === 0 ? 'sama' : 'beda'); tot.s += x.sistem; tot.p += x.pdf; if (x.sel !== 0) tot.beda++; });
    return { rows: rows, tot: tot };
  }

  // ---------------------------------------------------------------- realisasi mingguan (Excel bendahara)
  function minggu(n) { var s = new Date(2026, 0, 5 + (n - 2) * 7), e = new Date(s.getTime() + 6 * 86400000), nm = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']; return 'Minggu ke-' + n + ' (' + s.getDate() + ' ' + nm[s.getMonth()] + ' sd ' + e.getDate() + ' ' + nm[e.getMonth()] + ')'; }
  function realisasiAwal() {
    return [
      { mg: 40, label: minggu(40), tgl: '2026-10-05', berkas: 'Realisasi_Mg40.xlsx', baris: 1612, total: 8124560000, peringatan: 0 },
      { mg: 41, label: minggu(41), tgl: '2026-10-12', berkas: 'Realisasi_Mg41.xlsx', baris: 1618, total: 8467120000, peringatan: 2 },
      { mg: 42, label: minggu(42), tgl: '2026-10-19', berkas: 'Realisasi_Mg42.xlsx', baris: 1621, total: 8731900000, peringatan: 0 }
    ];
  }
  function unggahRealisasi(log) {
    var last = log[log.length - 1], mg = last.mg + 1;
    return log.concat([{ mg: mg, label: minggu(mg), tgl: HARI_INI, berkas: 'Realisasi_Mg' + mg + '.xlsx', baris: last.baris + 4, total: last.total + 312840000, peringatan: 3 }]);
  }

  // ---------------------------------------------------------------- skor kualitas RAB per RO (ILUSTRASI)
  var BOBOT0 = { penarikan: 35, volume: 25, cakupan: 20, disiplin: 20 };
  var AMBANG0 = { baik: 85, cukup: 70 };
  var PROFIL = [0.03, 0.05, 0.08, 0.09, 0.1, 0.11, 0.1, 0.1, 0.09, 0.09, 0.09, 0.07];
  function skorRO(r, bobot, ambang) {
    var R = rnd(hash(r.kode + '#' + r.pagu)), bln = [], rencana = 0, real = 0, selisih = 0, mak = 0;
    for (var m = 0; m < 9; m++) { var p = r.pagu * PROFIL[m], f = 1 + (R() - 0.5) * (0.15 + R() * 0.7); var a = Math.max(0, p * f); bln.push({ m: m + 1, rencana: p, real: a }); rencana += p; real += a; selisih += Math.abs(p - a); mak += Math.max(p, a); }
    var pen = mak ? 100 * (1 - selisih / mak) : 100;
    var vol = 55 + R() * 45, cak = 40 + R() * 60, dis = 50 + R() * 50;
    if (r.pagu > 3e9) { cak = 100; dis = 88; }
    var am = ambang || AMBANG0, b = bobot || BOBOT0, tb = b.penarikan + b.volume + b.cakupan + b.disiplin || 1;
    var skor = (pen * b.penarikan + vol * b.volume + cak * b.cakupan + dis * b.disiplin) / tb;
    return { kode: r.kode, nama: r.nama, pagu: r.pagu, penarikan: pen, volume: vol, cakupan: cak, disiplin: dis, skor: skor, label: skor >= am.baik ? 'Baik' : (skor >= am.cukup ? 'Cukup' : 'Perlu perbaikan'), cls: skor >= am.baik ? 'hijau' : (skor >= am.cukup ? 'kuning' : 'merah'), bln: bln, rencana: rencana, real: real };
  }
  function skorSemua(bobot, ambang) { return ROS.filter(function (r) { return r.pagu < 1e9 && r.items.length > 1; }).map(function (r) { return skorRO(r, bobot, ambang); }).sort(function (a, b) { return b.skor - a.skor; }); }

  // ---------------------------------------------------------------- tab Administrasi per item
  function seksiSkema(kode, huruf) { if (kode === 'POLA') { for (var q = 0; q < POLA_SHEET.seksi.length; q++) if (POLA_SHEET.seksi[q].huruf === huruf) return { sheet: POLA_SHEET, seksi: POLA_SHEET.seksi[q] }; return null; } for (var i = 0; i < SK.length; i++) if (SK[i].kode === kode) { for (var j = 0; j < SK[i].seksi.length; j++) if (SK[i].seksi[j].huruf === huruf) return { sheet: SK[i], seksi: SK[i].seksi[j] }; if (!huruf) return { sheet: SK[i], seksi: SK[i].seksi[0] }; } return null; }
  // tentukan lembar dan seksi dari akun dan uraian; sumber otomatis
  function jenisKel(item) {
    var a = item.akun, u = String(item.ura).toLowerCase(), h = '', kode = a;
    if (/lembur/.test(u)) return { kode: 'Lembur', huruf: '', alasan: 'uraian memuat kata lembur' };
    if (a === '521211') { h = /konsumsi/.test(u) ? 'A' : /spanduk|baliho|banner/.test(u) ? 'C' : /pulsa|paket data|kuota/.test(u) ? 'D' : /perlengkapan|atk|penggandaan|cetak|fotokopi|bahan/.test(u) ? 'B' : 'A'; }
    else if (a === '521213') { h = /camat|kepala desa|kades|penunjuk jalan/.test(u) ? 'B' : /inda|innas|pengajar|instruktur/.test(u) ? 'C' : /pns bps|organik|pegawai/.test(u) ? 'E' : /tim pelaksana|pokja|panitia/.test(u) ? 'A' : 'D'; }
    else if (a === '524113') h = /lebih dari 8|> ?8 jam|daerah sulit/.test(u) ? 'B' : 'A';
    else if (a === '524114' || a === '524119') h = /fullboard|fullday|halfday|paket meeting|penyelenggaraan|hotel|ruang rapat/.test(u) ? 'B' : 'A';
    else if (a === '524111') h = 'A';
    else if (['521811', '521219', '522141', '522151', '522191'].indexOf(a) >= 0) h = '';
    else return null;
    var ss = seksiSkema(kode, h); if (!ss) return null;
    return { kode: kode, huruf: h, alasan: 'akun ' + a + (h ? ' dan uraian' : '') };
  }
  // Ketentuan 24 Okt 2026: semua dokumen ditandai dapat dibuat SIGAP lebih dulu (templat sementara), lalu dikoreksi satu per satu di Master.
  // Dokumen asli pihak ketiga (nota, tiket, foto) tetap diunggah; yang dibuat SIGAP adalah templat, rekap, atau lembar pengantarnya.
  var GEN_SEMUA = true;
  function dokItem(item, override, status) {
    var jk = (override && override[item.id]) || jenisKel(item) || polaJk(item); if (!jk) return null;
    var ss = seksiSkema(jk.kode, jk.huruf); if (!ss) return null;
    var R = rnd(hash(item.id)), tahap = R();
    var docs = ss.seksi.docs.map(function (d, i) {
      var st = (status && status[item.id + '|' + d.no]) || null;
      if (!st) { var x = R(); st = tahap < 0.3 ? 'belum' : (x < (tahap - 0.3) * 1.4 ? 'terverifikasi' : (x < (tahap - 0.3) * 1.4 + 0.25 ? 'terunggah' : 'belum')); }
      return { no: d.no, uraian: d.uraian, pihak: d.pihak, ket: d.ket, gen: GEN_SEMUA || d.gen, status: st, key: item.id + '|' + d.no };
    });
    return { jk: jk, sheet: ss.sheet, seksi: ss.seksi, judulSeksi: jk.kode === 'POLA' ? 'Pola umum: ' + ss.seksi.judul : ss.sheet.kode + (jk.huruf ? '-' + jk.huruf : '') + ' ' + (ss.seksi.judul), docs: docs };
  }
  function hitungDok(docs) { var c = { belum: 0, terunggah: 0, terverifikasi: 0, draf: 0 }; docs.forEach(function (d) { c[d.status]++; }); return c; }
  var PIHAK_PERAN = { 'Tim Kerja': ['KETUA', 'ADMINRO'], 'PBJ': ['PBJ'], 'PPK': ['PPK'], 'Bendahara': ['BEND'], 'Perencanaan': ['RENC'], 'Tata Usaha': ['TU'] };
  function bolehUnggah(u, roKode, pihak) {
    var h = hak(u, roKode); if (!h.adm) return false;
    return pihak.some(function (p) { return (PIHAK_PERAN[p.trim()] || []).some(function (r) { return adaPeran(u, r); }); }) || adaPeran(u, 'PPK') || u.adm.indexOf(roKode) >= 0 && pihak.indexOf('Tim Kerja') >= 0;
  }


  // ---------------------------------------------------------------- MASTER (akun, anggaran, waktu, kewenangan, dokumen)
  // Akun dan nama diambil dari POK 30 Sep 2026 (PDF); kolom pola ditentukan dari awalan akun (ILUSTRASI, dapat diubah di Master).
  var KELOMPOK = { '51': 'Belanja pegawai (51xxxx)', '524': 'Perjalanan dinas (524xxx)', '52L': 'Belanja barang lain (52xxxx selain 524)', '53': 'Belanja modal (53xxxx)' };
  var AKUN_M = [["511111", "Belanja Gaji Pokok PNS", "51", "PEG"], ["511119", "Belanja Pembulatan Gaji PNS", "51", "PEG"], ["511121", "Belanja Tunj. Suami/Istri PNS", "51", "PEG"], ["511122", "Belanja Tunj. Anak PNS", "51", "PEG"], ["511123", "Belanja Tunj. Struktural PNS", "51", "PEG"], ["511124", "Belanja Tunj. Fungsional PNS", "51", "PEG"], ["511125", "Belanja Tunj. PPh PNS", "51", "PEG"], ["511126", "Belanja Tunj. Beras PNS", "51", "PEG"], ["511129", "Belanja Uang Makan PNS", "51", "PEG"], ["511151", "Belanja Tunjangan Umum PNS", "51", "PEG"], ["511611", "Belanja Gaji Pokok PPPK", "51", "PEG"], ["511619", "Belanja Pembulatan Gaji PPPK", "51", "PEG"], ["511621", "Belanja Tunjangan Suami/Istri PPPK", "51", "PEG"], ["511622", "Belanja Tunjangan Anak PPPK", "51", "PEG"], ["511624", "Belanja Tunjangan Fungsional PPPK", "51", "PEG"], ["511625", "Belanja Tunjangan Beras PPPK", "51", "PEG"], ["511628", "Belanja Uang Makan PPPK", "51", "PEG"], ["512211", "Belanja Uang Lembur", "51", "PEG"], ["512411", "Belanja Pegawai (Tunjangan Khusus/Kegiatan/Kinerja)", "51", "PEG"], ["512414", "Belanja Pegawai Tunjangan Khusus/Kegiatan/Kinerja PPPK", "51", "PEG"], ["521111", "Belanja Keperluan Perkantoran", "52L", "BRG"], ["521115", "Belanja Honor Operasional Satuan Kerja", "52L", "BRG"], ["521119", "Belanja Barang Operasional Lainnya", "52L", "BRG"], ["521211", "Belanja Bahan", "52L", "BRG"], ["521213", "Belanja Honor Output Kegiatan", "52L", "BRG"], ["521219", "Belanja Barang Non Operasional Lainnya", "52L", "BRG"], ["521252", "Belanja Peralatan dan Mesin - Ekstrakomptabel", "52L", "BRG"], ["521811", "Belanja Barang Persediaan Barang Konsumsi", "52L", "BRG"], ["522111", "Belanja Langganan Listrik", "52L", "LGN"], ["522112", "Belanja Langganan Telepon", "52L", "LGN"], ["522113", "Belanja Langganan Air", "52L", "LGN"], ["522119", "Belanja Langganan Daya dan Jasa Lainnya", "52L", "LGN"], ["522141", "Belanja Sewa", "52L", "JSA"], ["522151", "Belanja Jasa Profesi", "52L", "JSA"], ["522191", "Belanja Jasa Lainnya", "52L", "JSA"], ["523111", "Belanja Pemeliharaan Gedung dan Bangunan", "52L", "MLH"], ["523121", "Belanja Pemeliharaan Peralatan dan Mesin", "52L", "MLH"], ["523123", "Belanja Barang Persediaan Pemeliharaan Peralatan dan", "52L", "MLH"], ["524111", "Belanja Perjalanan Dinas Biasa", "524", "PDN"], ["524113", "Belanja Perjalanan Dinas Dalam Kota", "524", "PDN"], ["524114", "Belanja Perjalanan Dinas Paket Meeting Dalam Kota", "524", "PDN"], ["524119", "Belanja Perjalanan Dinas Paket Meeting Luar Kota", "524", "PDN"], ["532111", "Belanja Modal Peralatan dan Mesin", "53", "MDL"]].map(function (a) { return { kode: a[0], nama: a[1], kel: a[2], pola: a[3], aktif: true }; });
  var POLA = {
    PEG: { nama: 'Belanja pegawai', docs: [
      { no: 1, uraian: 'Daftar nominatif pembayaran', pihak: ['Bendahara'], ket: 'Disusun dari data pegawai dan SK', gen: true },
      { no: 2, uraian: 'SK atau dasar pembayaran (kenaikan, mutasi, penetapan)', pihak: ['Tata Usaha'], ket: 'Arsip kepegawaian', gen: false },
      { no: 3, uraian: 'Rekap potongan dan pajak', pihak: ['Bendahara'], ket: 'PPh 21 dan iuran', gen: true },
      { no: 4, uraian: 'SPM atau bukti pembayaran', pihak: ['Bendahara', 'PPK'], ket: '', gen: false }] },
    BRG: { nama: 'Belanja barang umum', docs: [
      { no: 1, uraian: 'Permintaan atau usulan pembelian', pihak: ['Tim Kerja'], ket: 'Tanda tangan pemohon dan PPK', gen: true },
      { no: 2, uraian: 'Nota, faktur, atau kuitansi', pihak: ['Bendahara'], ket: 'Berisi NPWP dan materai bila perlu', gen: true },
      { no: 3, uraian: 'Berita acara serah terima atau penerimaan barang', pihak: ['Tim Kerja', 'PPK'], ket: '', gen: true },
      { no: 4, uraian: 'Bukti pajak (PPN/PPh) bila dipungut', pihak: ['Bendahara'], ket: '', gen: false },
      { no: 5, uraian: 'Dokumentasi barang atau kegiatan', pihak: ['Tim Kerja'], ket: 'Foto bertanggal', gen: false },
      { no: 6, uraian: 'Bukti pembayaran', pihak: ['Bendahara'], ket: '', gen: false }] },
    LGN: { nama: 'Langganan daya dan jasa', docs: [
      { no: 1, uraian: 'Tagihan atau rekening bulanan', pihak: ['Tata Usaha'], ket: 'Dari penyedia', gen: false },
      { no: 2, uraian: 'Rekap tagihan bulanan', pihak: ['Tata Usaha'], ket: '', gen: true },
      { no: 3, uraian: 'Kuitansi dan bukti pembayaran', pihak: ['Bendahara'], ket: '', gen: true }] },
    JSA: { nama: 'Sewa, jasa profesi, dan jasa lainnya', docs: [
      { no: 1, uraian: 'Kerangka acuan kerja (KAK)', pihak: ['Tim Kerja', 'PPK'], ket: '', gen: true },
      { no: 2, uraian: 'Kontrak atau surat perjanjian', pihak: ['PPK', 'PBJ'], ket: 'Sesuai nilai pengadaan', gen: true },
      { no: 3, uraian: 'Laporan hasil pekerjaan', pihak: ['Tim Kerja'], ket: '', gen: false },
      { no: 4, uraian: 'Berita acara serah terima pekerjaan', pihak: ['PPK'], ket: '', gen: true },
      { no: 5, uraian: 'Kuitansi, faktur pajak, dan bukti bayar', pihak: ['Bendahara'], ket: '', gen: true }] },
    PDN: { nama: 'Perjalanan dinas', docs: [
      { no: 1, uraian: 'Surat tugas', pihak: ['Tim Kerja', 'PPK'], ket: '', gen: true },
      { no: 2, uraian: 'Surat perintah perjalanan dinas (SPD)', pihak: ['PPK'], ket: '', gen: true },
      { no: 3, uraian: 'Daftar pengeluaran riil bila ada', pihak: ['Tim Kerja'], ket: '', gen: true },
      { no: 4, uraian: 'Bukti transport, penginapan, atau tiket', pihak: ['Tim Kerja'], ket: '', gen: false },
      { no: 5, uraian: 'Laporan perjalanan dinas', pihak: ['Tim Kerja'], ket: '', gen: true },
      { no: 6, uraian: 'Kuitansi dan bukti pembayaran', pihak: ['Bendahara'], ket: '', gen: true }] },
    MLH: { nama: 'Pemeliharaan', docs: [
      { no: 1, uraian: 'Permintaan pemeliharaan', pihak: ['Tata Usaha'], ket: '', gen: true },
      { no: 2, uraian: 'Nota atau kuitansi pekerjaan', pihak: ['Bendahara'], ket: '', gen: true },
      { no: 3, uraian: 'Berita acara pekerjaan selesai', pihak: ['PPK'], ket: '', gen: true },
      { no: 4, uraian: 'Foto sebelum dan sesudah', pihak: ['Tata Usaha'], ket: '', gen: false }] },
    MDL: { nama: 'Belanja modal', docs: [
      { no: 1, uraian: 'Kontrak atau SPK', pihak: ['PPK', 'PBJ'], ket: '', gen: true },
      { no: 2, uraian: 'Berita acara pemeriksaan dan serah terima', pihak: ['PPK'], ket: '', gen: true },
      { no: 3, uraian: 'Daftar dan kode barang milik negara (BMN)', pihak: ['Tata Usaha'], ket: 'Dicatat pada aplikasi BMN', gen: false },
      { no: 4, uraian: 'Faktur, garansi, dan bukti bayar', pihak: ['Bendahara'], ket: '', gen: false }] }
  };
  var POLA_SHEET = { kode: 'Pola umum', nama: 'Pola dokumen umum (Master)', seksi: Object.keys(POLA).map(function (k) { return { huruf: k, judul: POLA[k].nama, docs: POLA[k].docs, catatanHuruf: 'Pola umum dari Master; bukan lembar subject matter.' }; }) };
  var SATUAN = [
    { kode: 'OK', arti: 'Orang kegiatan', alias: ['OK', 'O-K'], pasti: true }, { kode: 'OB', arti: 'Orang bulan', alias: ['OB', 'O-B'], pasti: true }, { kode: 'OP', arti: 'Orang paket', alias: ['OP', 'O-P'], pasti: true },
    { kode: 'OH', arti: 'Orang hari', alias: ['OH'], pasti: true }, { kode: 'OJP', arti: 'Orang jam pelajaran', alias: ['OJP', 'OJ', 'O-J'], pasti: true }, { kode: 'DOK', arti: 'Dokumen', alias: ['DOK'], pasti: true },
    { kode: 'PAKET', arti: 'Paket', alias: ['PAKET'], pasti: true }, { kode: 'BLN', arti: 'Bulan', alias: ['BLN'], pasti: true }, { kode: 'THN', arti: 'Tahun', alias: ['THN'], pasti: true },
    { kode: 'SET', arti: 'Set', alias: ['SET'], pasti: true }, { kode: 'LMBR', arti: 'Lembar', alias: ['LMBR', 'LBR'], pasti: true }, { kode: 'RUTA', arti: 'Rumah tangga', alias: ['RUTA', 'RT'], pasti: true },
    { kode: 'EA', arti: 'Each (tiap atau per unit)', alias: ['EA'], pasti: true }, { kode: 'UNIT', arti: 'Unit', alias: ['UNIT'], pasti: true }, { kode: 'RESP', arti: 'Responden', alias: ['RESP'], pasti: true },
    { kode: 'M2', arti: 'Meter persegi', alias: ['M2'], pasti: true }, { kode: 'SGMN', arti: 'Segmen', alias: ['SGMN', 'SEGMN'], pasti: true }, { kode: 'U/THN', arti: 'Unit per tahun', alias: ['U/THN'], pasti: true }, { kode: 'M2/TH', arti: 'Meter persegi per tahun', alias: ['M2/TH'], pasti: true },
    { kode: 'OT', arti: 'Orang tahun', alias: ['OT', 'O-TH'], pasti: true }
  ];
  function satuanBaku(x) { var k = String(x).toUpperCase(); for (var i = 0; i < SATUAN.length; i++) if (SATUAN[i].alias.indexOf(k) >= 0) return SATUAN[i].kode; return k; }
  function pakaiSatuan() { var c = {}; ROS.forEach(function (r) { r.items.forEach(function (i) { var b = satuanBaku(i.sat); c[b] = (c[b] || 0) + 1; }); }); return c; }
  function pakaiAkun() { var c = {}, v = {}; ROS.forEach(function (r) { r.items.forEach(function (i) { c[i.akun] = (c[i.akun] || 0) + 1; v[i.akun] = (v[i.akun] || 0) + i.jum; }); }); return { n: c, v: v }; }
  var KOMPONEN = [
    { kode: '001', nama: 'Komponen 001' }, { kode: '002', nama: 'Komponen 002' }, { kode: '005', nama: 'Dukungan penyelenggaraan' }, { kode: '051', nama: 'Persiapan' }, { kode: '052', nama: 'Pengumpulan data' },
    { kode: '053', nama: 'Pengolahan dan analisis' }, { kode: '054', nama: 'Diseminasi dan evaluasi' }, { kode: '056', nama: 'TIK' }
  ];
  var PRIO = [{ id: 'inti', nama: 'Inti', cls: 'merah' }, { id: 'penting', nama: 'Penting', cls: 'kuning' }, { id: 'tunda', nama: 'Dapat ditunda', cls: 'abu' }];
  var WAKTU = [
    { nama: 'Tahun anggaran', nilai: '2026', ket: 'Dipakai semua papan; berganti tahun melalui impor POK awal tahun.' },
    { nama: 'Jadwal bawaan Revisi POK', nilai: 'Buka tanggal 10 tiap bulan, tutup 2 hari kemudian', ket: 'PPK dapat melewati atau memulihkan tiap bulan.' },
    { nama: 'Tenggat Revisi DIPA jalur DJA', nilai: '30 Oktober 2026', ket: 'Pengingat (Pasal 175 PMK 62/2023). Tidak mengunci.' },
    { nama: 'Tenggat Revisi DIPA jalur DJPb', nilai: '30 November 2026', ket: 'Pengingat.' },
    { nama: 'Tenggat Revisi POK dan Administrasi', nilai: '27 Desember 2026', ket: 'Pengingat.' },
    { nama: 'Unggah Excel realisasi', nilai: 'Mingguan, hari Senin (data sampai Minggu lalu)', ket: 'Bendahara; pengingat bila lewat dua hari.' },
    { nama: 'Profil penarikan awal tahun', nilai: 'Jan 3%, Feb 5%, Mar 8%, Apr 9%, Mei 10%, Jun 11%, Jul 10%, Agu 10%, Sep 9%, Okt 9%, Nov 9%, Des 7%', ket: 'Bawaan rencana penarikan RAB; dapat diubah per RO.' },
    { nama: 'Masa berlaku penugasan', nilai: 'Bertanggal mulai dan berakhir', ket: 'Ketua tim, admin RO, akses Administrasi.' }
  ];
  var KEWENANGAN = [
    { id: 'rab', nama: 'Membuat dan mengubah RAB', peran: ['KETUA'], ket: 'Satu-satunya pembuat RAB per RO.' },
    { id: 'draf', nama: 'Menyusun draf RAB dan usulan revisi', peran: ['ADMINRO'], ket: 'Perlu persetujuan ketua tim.' },
    { id: 'setuju_ketua', nama: 'Menyetujui draf admin RO', peran: ['KETUA'], ket: '' },
    { id: 'sahkan', nama: 'Mengesahkan RAB dan menyatakan revisi sah', peran: ['PPK'], ket: 'PPK merangkap ketua tim: RAB langsung sah. KPA hanya menerima laporan.' },
    { id: 'jadwal', nama: 'Membuka dan membuat jadwal revisi', peran: ['PPK'], ket: '' },
    { id: 'pok_pdf', nama: 'Mengunggah PDF POK resmi', peran: ['PPK'], ket: '' },
    { id: 'realisasi', nama: 'Mengunggah Excel realisasi mingguan', peran: ['BEND'], ket: '' },
    { id: 'verifikasi', nama: 'Memverifikasi dokumen administrasi', peran: ['PPK', 'BEND', 'TU'], ket: 'Bendahara untuk dokumen bendahara; Tata Usaha bila diberi PPK; akun lain dapat diberi.' },
    { id: 'kek_catat', nama: 'Mencatat kekurangan RAB', peran: ['KETUA', 'ADMINRO'], ket: '' },
    { id: 'str_tim', nama: 'Mengusulkan Komponen, Subkomponen, Akun, atau Item baru', peran: ['KETUA', 'ADMINRO', 'PPK'], ket: 'Admin RO sebagai draf; ketua tim menyetujui; PPK mengesahkan (papan 16).' },
    { id: 'str_ppk', nama: 'Mengusulkan KRO, RO, Kegiatan, atau Program baru', peran: ['PPK'], ket: 'Program dan Kegiatan ditetapkan pusat; PPK hanya mencatat usulan.' },
    { id: 'kek_putus', nama: 'Memutuskan kekurangan RAB (penuhi, tunda, tolak)', peran: ['KETUA'], ket: 'Hanya saat ada tambahan pagu resmi RO itu.' },
    { id: 'bobot', nama: 'Mengubah bobot skor RAB', peran: ['PPK'], ket: '' },
    { id: 'skor', nama: 'Melihat skor kualitas RAB', peran: ['ADMIN', 'KPA', 'PPK', 'KETUA', 'ADMINRO', 'BEND', 'TU', 'PBJ', 'RENC'], ket: 'Semua pengguna, semua RO. Skor adalah pembinaan.' },
    { id: 'laporan', nama: 'Menerima laporan revisi, realisasi, skor', peran: ['KPA'], ket: 'Tanpa persetujuan.' },
    { id: 'master', nama: 'Mengelola master data', peran: ['ADMIN', 'PPK'], ket: 'Master kewenangan hanya Admin Aplikasi.' },
    { id: 'akses', nama: 'Mengatur peran dan akses', peran: ['ADMIN'], ket: '' }
  ];
  // pola umum untuk item tanpa lembar subject matter
  function polaJk(item) {
    var k = 'BRG', ak = AKUN_M.filter(function (a) { return a.kode === item.akun; })[0];
    if (ak) k = ak.pola; else if (String(item.akun).slice(0, 2) === '51') k = 'PEG'; else if (String(item.akun).slice(0, 2) === '53') k = 'MDL';
    return { kode: 'POLA', huruf: k, alasan: 'tidak ada lembar subject matter; memakai pola umum Master untuk akun ' + item.akun, pola: true };
  }

  // ---------------------------------------------------------------- catatan kekurangan RAB (belum ada anggaran resmi)
  // Aturan 24 Okt 2026: dana penggenap tidak boleh minus dan RO harus tepat sampai pagu, sehingga RAB yang melebihi pagu resmi
  // dicatat di sini. Saat pusat menambah pagu lewat revisi DJA atau DJPb, ketua tim memutuskan tiap catatan: penuhi, tunda, atau tolak.
  function kekuranganAwal() {
    return [
      { id: 'k1', ro: '2903.BMA.008', akun: '524113', ura: 'Transport lokal 12 petugas tambahan SPDT NTP', jumlah: 2040000, prio: 'penting', tgl: '2026-10-14', oleh: 'k-dist', alasan: 'Jumlah petugas bertambah; sisa pagu akun 524 sudah habis di RO ini.', status: 'tercatat', putus: '' },
      { id: 'k2', ro: '2903.BMA.008', akun: '521211', ura: 'Konsumsi rapat evaluasi tambahan', jumlah: 1150000, prio: 'tunda', tgl: '2026-10-15', oleh: 'a-dist', alasan: 'Rapat evaluasi diusulkan ketua tim; tidak ada pagu konsumsi tersisa.', status: 'tercatat', putus: '' },
      { id: 'k3', ro: '2903.BMA.008', akun: '521213', ura: 'Honor pemeriksa lapangan tambahan 2 OK', jumlah: 3600000, prio: 'inti', tgl: '2026-10-16', oleh: 'k-dist', alasan: 'Beban pemeriksaan melebihi rencana; tanpa tambahan, kualitas data terancam.', status: 'tercatat', putus: '' },
      { id: 'k4', ro: '2906.BMA.006', akun: '521213', ura: 'Honor petugas pendataan susulan', jumlah: 6200000, prio: 'inti', tgl: '2026-10-12', oleh: 'k-kesra', alasan: 'Cakupan SLS susulan setelah identifikasi ulang.', status: 'tercatat', putus: '' },
      { id: 'k5', ro: '2906.BMA.006', akun: '524113', ura: 'Transport lokal supervisi susulan', jumlah: 1700000, prio: 'penting', tgl: '2026-10-12', oleh: 'a-kesra', alasan: 'Supervisi ke wilayah baru.', status: 'tercatat', putus: '' },
      { id: 'k6', ro: '2910.BMA.008', akun: '521811', ura: 'ATK dan penggandaan kuesioner tambahan', jumlah: 640000, prio: 'tunda', tgl: '2026-10-09', oleh: 'k-prod', alasan: 'Kuesioner cadangan.', status: 'tunda_awal', putus: '' },
      { id: 'k7', ro: '2907.BMA.009', akun: '524119', ura: 'Paket meeting pelatihan tambahan satu angkatan', jumlah: 18500000, prio: 'penting', tgl: '2026-10-05', oleh: 'k-kesra', alasan: 'Satu angkatan tambahan untuk petugas cadangan.', status: 'ditunda', putus: 'Ditunda pada Revisi POK September: belum ada tambahan pagu.' }
    ].map(function (x) { if (x.status === 'tunda_awal') x.status = 'ditunda'; return x; });
  }
  function prioRank(p) { return { inti: 0, penting: 1, tunda: 2 }[p]; }
  function kekuranganTerbuka(daftar, ro) { return daftar.filter(function (x) { return x.ro === ro && (x.status === 'tercatat' || x.status === 'ditunda'); }); }
  // saran: urut prioritas lalu tanggal catat; ambil bila masih muat; bukan keputusan
  function saranKesempatan(daftar, ro, tambahan) {
    var sisa = tambahan, out = {};
    kekuranganTerbuka(daftar, ro).slice().sort(function (a, b) { return prioRank(a.prio) - prioRank(b.prio) || (a.tgl < b.tgl ? -1 : 1); }).forEach(function (x) { if (x.jumlah <= sisa) { out[x.id] = 'penuhi'; sisa -= x.jumlah; } else out[x.id] = 'tunda'; });
    return { saran: out, sisa: sisa };
  }
  // periksa keputusan {id: 'penuhi'|'tunda'|'tolak'}, alasanTolak {id: teks}
  function cekKeputusan(daftar, ro, tambahan, kep, alasanTolak) {
    var t = kekuranganTerbuka(daftar, ro), pakai = 0, nTunda = 0, nTolak = 0, nPenuhi = 0, blm = 0, pesan = [];
    t.forEach(function (x) { var k = kep[x.id]; if (!k) blm++; else if (k === 'penuhi') { pakai += x.jumlah; nPenuhi++; } else if (k === 'tunda') nTunda++; else if (k === 'tolak') { nTolak++; if (!(alasanTolak && alasanTolak[x.id] && String(alasanTolak[x.id]).trim())) pesan.push('Alasan penolakan wajib diisi untuk ' + x.ura.slice(0, 30)); } });
    if (pakai > tambahan) pesan.push('Yang dipenuhi Rp ' + fmt(pakai) + ' melebihi tambahan pagu Rp ' + fmt(tambahan) + '. Dana penggenap tidak boleh minus.');
    if (blm) pesan.push(blm + ' catatan belum diputuskan.');
    return { ok: pesan.length === 0, pakai: pakai, sisa: tambahan - pakai, nPenuhi: nPenuhi, nTunda: nTunda, nTolak: nTolak, belum: blm, pesan: pesan };
  }
  function terapkanKeputusan(daftar, ro, kep, alasanTolak, sumber) {
    return daftar.map(function (x) {
      if (x.ro !== ro || !kep[x.id]) return x;
      var n = JSON.parse(JSON.stringify(x));
      if (kep[x.id] === 'penuhi') { n.status = 'dipenuhi'; n.putus = 'Dipenuhi dari tambahan pagu (' + sumber + '). Masuk RAB sebagai baris resmi.'; }
      else if (kep[x.id] === 'tunda') { n.status = 'ditunda'; n.putus = 'Ditunda pada ' + sumber + '; muncul lagi saat ada tambahan pagu berikutnya.'; }
      else { n.status = 'ditolak'; n.putus = 'Ditolak: ' + (alasanTolak[x.id] || ''); }
      return n;
    });
  }
  var KSTATUS = { tercatat: { nama: 'Tercatat', cls: 'biru' }, ditunda: { nama: 'Ditunda', cls: 'kuning' }, dipenuhi: { nama: 'Dipenuhi', cls: 'hijau' }, ditolak: { nama: 'Ditolak', cls: 'abu' } };

  // ---------------------------------------------------------------- navigasi ruang kerja RO
  var TAB = [
    { id: 'ringkasan', nama: 'Ringkasan' }, { id: 'anggaran', nama: 'Anggaran (POK dan RAB)' }, { id: 'revisi', nama: 'Revisi' }, { id: 'administrasi', nama: 'Administrasi' }, { id: 'tim', nama: 'Tim dan akses' }
  ];
  var PINTU = {
    menu: { nama: 'Menu Anggaran', jejak: ['SIGAP', 'Perencanaan', 'Anggaran'], kembali: 'Kembali ke daftar RO', param: 'dari=anggaran' },
    gsbpm: { nama: 'GSBPM, Identifikasi kegiatan', jejak: ['SIGAP', 'Perencanaan', 'Alur kegiatan (GSBPM)', 'Susenas dan Seruti 2026', 'Identifikasi kegiatan'], kembali: 'Kembali ke Identifikasi kegiatan', param: 'dari=gsbpm&kegiatan=susenas-sep&tahap=identifikasi' },
    akses: { nama: 'Menu Peran dan Akses', jejak: ['SIGAP', 'Pengaturan', 'Peran dan akses', 'Tabel akses RO'], kembali: 'Kembali ke Peran dan akses', param: 'dari=akses' },
    ppk: { nama: 'Jadwal revisi (PPK)', jejak: ['SIGAP', 'Perencanaan', 'Revisi anggaran', 'Jadwal revisi'], kembali: 'Kembali ke Jadwal revisi', param: 'dari=jadwal-revisi&jadwal=j2' }
  };
  function alamat(ro, tab, pintu) { var p = PINTU[pintu] || PINTU.menu; return '/sigap/ro/' + ro + '?tab=' + tab + '&' + p.param; }

  // ---------------------------------------------------------------- struktur mata anggaran: tambah di semua level (papan 16)
  // Nama level mengikuti judul Laporan Ketersediaan Dana Detail: Program; Kegiatan; Output; SubOutput; Komponen; SubKomponen; Akun; Item.
  var LEVEL = [
    { id: 'program', no: 1, nama: 'Program', sakti: 'Program', contoh: 'GG', fmt: '2 huruf (mis. GG)', re: /^[A-Z]{2}$/, induk: '', pengusul: 'pusat' },
    { id: 'kegiatan', no: 2, nama: 'Kegiatan', sakti: 'Kegiatan', contoh: '2906', fmt: '4 angka (mis. 2906)', re: /^\d{4}$/, induk: 'program', pengusul: 'pusat' },
    { id: 'kro', no: 3, nama: 'KRO (Klasifikasi Rincian Output)', sakti: 'Output', contoh: 'BMA', fmt: '3 huruf (mis. BMA)', re: /^[A-Z]{3}$/, induk: 'kegiatan', pengusul: 'ppk' },
    { id: 'ro', no: 4, nama: 'RO (Rincian Output)', sakti: 'SubOutput', contoh: '005', fmt: '3 huruf atau angka (mis. 005 atau ZZ1, jadi BMA.005)', re: /^[A-Z0-9]{3}$/, induk: 'kro', pengusul: 'ppk' },
    { id: 'komponen', no: 5, nama: 'Komponen', sakti: 'Komponen', contoh: '055', fmt: '3 angka (mis. 055)', re: /^\d{3}$/, induk: 'ro', pengusul: 'tim' },
    { id: 'subkomp', no: 6, nama: 'Subkomponen', sakti: 'SubKomponen', contoh: 'B', fmt: '1 sampai 2 huruf atau angka (mis. B, 0A)', re: /^[A-Z0-9]{1,2}$/, induk: 'komponen', pengusul: 'tim' },
    { id: 'akun', no: 7, nama: 'Akun', sakti: 'Akun', contoh: '521211', fmt: '6 angka, harus ada di Master akun', re: /^\d{6}$/, induk: 'subkomp', pengusul: 'tim' },
    { id: 'item', no: 8, nama: 'Item (detail)', sakti: 'Item', contoh: 'honor pencacah', fmt: 'uraian + volume, satuan, harga', re: null, induk: 'akun', pengusul: 'tim' }
  ];
  var SUMBER = [
    { id: 'dalam', nama: 'Digeser dari dalam RO dan jenis belanja yang sama' },
    { id: 'lintas', nama: 'Digeser dari jenis belanja lain atau RO lain' },
    { id: 'tambahan', nama: 'Tambahan pagu dari pusat' }
  ];
  // jalur menurut level dan sumber dana. kepastian: 'catatan' = sesuai catatan cek PMK 23 Okt 2026; 'dugaan' = inferensi saya, tanyakan ke Kanwil
  function jalurTambah(level, sumber, khusus) {
    var T = { pok: '27 Des 2026', djpb: '30 Nov 2026', dja: '30 Okt 2026 (Sabtu, praktis Jumat 30 Okt)' };
    var J = function (kode, nama, pemutus, dasar, kep, tenggat, syarat) { return { kode: kode, nama: nama, pemutus: pemutus, dasar: dasar, kepastian: kep, tenggat: tenggat, syarat: syarat || [] }; };
    if (sumber === 'tambahan') return J('dja', 'Revisi DIPA jalur DJA', 'DJA melalui Eselon I', 'Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.', 'catatan', T.dja, ['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.', 'Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']);
    if (level === 'program') return J('dja', 'Revisi DIPA jalur DJA', 'DJA', 'Antar-Program atau antar-Eselon I: Lampiran IV.C 2.b, 2.c, 2.af.', 'catatan', T.dja, ['Program ditetapkan pusat. Satker hampir tidak pernah memulai; program baru masuk lewat impor DIPA dan POK resmi.']);
    if (level === 'kegiatan') return J('djpb', 'Revisi DIPA jalur DJPb (Kanwil)', 'Eselon I (surat persetujuan) lalu Kanwil DJPb', 'Penambahan Kegiatan baru: Pasal 172 ayat (1)(a)(2), (4) sampai (6).', 'catatan', T.djpb, ['Surat persetujuan Eselon I dilampirkan.', 'Kegiatan ditetapkan pusat; biasanya masuk lewat impor POK resmi.']);
    if (level === 'kro') return J('djpb', 'Revisi DIPA jalur DJPb (Kanwil)', 'Kanwil DJPb', 'Antar-KRO dalam 1 Kegiatan di luar Pasal 173; jalur Kanwil. Catatan kerancuan Lampiran 2.af masih ditanyakan.', 'catatan', T.djpb, ['Pagu satker tetap; dana digeser dari KRO lain pada Kegiatan yang sama.']);
    if (level === 'ro') return J('djpb', 'Revisi DIPA jalur DJPb (Kanwil)', 'Kanwil DJPb', 'RO baru memiliki satuan dan volume sendiri; Pasal 173 hanya mengizinkan pergeseran tanpa mengubah satuan dan volume RO. Dugaan, belum ada pasal eksplisit untuk RO baru.', 'dugaan', T.djpb, ['Wajib punya volume dan satuan RO.', 'Setelah RO ada, Admin Aplikasi menetapkan ketua tim dan tim di Peran dan Akses (PPK dapat, bila merangkap peran Admin).']);
    if (level === 'komponen') {
      if (khusus) return J('dja', 'Revisi DIPA jalur DJA', 'DJA', 'Pembentukan Komponen Khusus: Lampiran IV.C 3.e.2.d; Pasal 157 ayat (6)(c), 158A.', 'catatan', T.dja, ['Pemanfaatan memerlukan keputusan Menteri atau Pimpinan Lembaga.']);
      return J('pok', 'Revisi POK (wewenang KPA, disahkan PPK)', 'PPK; KPA menerima laporan', 'Komponen ada di POK, bukan di Halaman III DIPA; tambah atau ubah dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk komponen biasa.', 'dugaan', T.pok, ['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']);
    }
    if (level === 'subkomp') return J('pok', 'Revisi POK (wewenang KPA, disahkan PPK)', 'PPK; KPA menerima laporan', 'Dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk subkomponen.', 'dugaan', T.pok, ['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']);
    if (level === 'akun' || level === 'item') {
      if (sumber === 'lintas') return J('djpb', 'Revisi DIPA jalur DJPb (Kanwil)', 'Kanwil DJPb', 'Antar-jenis belanja tanpa menurunkan volume RO: Pasal 124 ayat (2)(b); Lampiran IV.C 2.q. Bila menurunkan volume RO total: DJA (2.q, 2.u).', 'catatan', T.djpb, ['Dana dari jenis belanja lain, atau dari RO lain: pindahkan lewat jendela geseran (papan 1 sampai 8).']);
      return J('pok', 'Revisi POK (wewenang KPA, disahkan PPK)', 'PPK; KPA menerima laporan', 'Tambah atau ubah ' + (level === 'akun' ? 'akun' : 'detail') + ' dalam 1 RO: Pasal 173 ayat (1) sampai (3); Lampiran IV.C angka 5 a sampai c. Perubahan empat digit terakhir akun adalah kelonggaran KPA.', 'catatan', T.pok, ['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja (dua digit pertama akun), sumber dana.', 'Dana digeser dalam kelompok belanja yang sama (R-16); penggenap tidak minus (R-17).']);
    }
    return J('pok', 'Revisi POK', 'PPK', '', 'dugaan', T.pok, []);
  }
  // pemeriksaan isian sebelum disimpan sebagai baris usulan
  function cekTambah(level, f) {
    var L = LEVEL.filter(function (x) { return x.id === level; })[0], out = [], kode = String(f.kode || '').trim().toUpperCase(), ura = String(f.ura || '').trim();
    var add = function (ok, t) { out.push({ ok: ok, t: t }); };
    add(!!f.induk || level === 'program', f.induk ? 'Induk dipilih: ' + f.induk : 'Pilih induk lebih dulu (' + (LEVEL.filter(function (x) { return x.id === L.induk; })[0] || { nama: '-' }).nama + ').');
    if (L.re) { add(L.re.test(kode), L.re.test(kode) ? 'Format kode sah.' : 'Format kode: ' + L.fmt + '.'); }
    if (level === 'item') {
      add(ura.length > 3, ura.length > 3 ? 'Uraian terisi.' : 'Isi uraian item (minimal 4 huruf).');
      var vol = Number(f.vol), hg = Number(f.harga);
      add(vol > 0 && hg > 0, vol > 0 && hg > 0 ? 'Jumlah = ' + fmt(Math.round(vol * hg)) + ' (volume x harga).' : 'Volume dan harga satuan harus lebih dari nol.');
      var sb = satuanBaku(f.sat || ''), sad = SATUAN.some(function (x) { return x.kode === sb; });
      add(sad, sad ? 'Satuan ' + sb + ' ada di Master satuan.' : 'Satuan belum ada di Master satuan; tambahkan dulu.');
    } else {
      add(ura.length > 3, ura.length > 3 ? 'Uraian terisi.' : 'Isi uraian (minimal 4 huruf).');
    }
    if (level === 'akun') {
      var m = AKUN_M.filter(function (x) { return x.kode === kode; })[0];
      add(!!m, m ? 'Akun ada di Master akun: ' + m.nama + ' (pola dokumen ' + m.pola + ').' : 'Akun belum ada di Master akun. Admin Aplikasi atau PPK menambahkannya dulu, lengkap dengan pola dokumen.');
    }
    if (level === 'ro') { var v2 = Number(f.vol); add(v2 > 0 && !!f.sat, v2 > 0 && !!f.sat ? 'Volume dan satuan RO terisi.' : 'RO wajib punya volume dan satuan.'); }
    add(!f.duplikat, f.duplikat ? 'Kode sudah ada di induk yang sama.' : 'Kode belum dipakai di induk ini.');
    return out;
  }
  // kode sementara dan pemadanan dengan POK resmi
  function kodeSementara(n) { return 'T-' + ('000' + n).slice(-3); }
  function pemadanan(baris, resmi) {
    // resmi: kode resmi dari POK atau laporan realisasi; cocok bila kode sama, selainnya perlu dipadankan manual
    if (!resmi) return { ok: false, t: 'Menunggu POK resmi.' };
    if (String(resmi).toUpperCase() === String(baris.kode).toUpperCase()) return { ok: true, t: 'Kode resmi sama dengan kode usulan. Baris aktif.' };
    return { ok: false, t: 'Kode resmi (' + resmi + ') berbeda dari kode usulan (' + baris.kode + '). Pilih padanan secara manual, jangan ditebak sistem.' };
  }

  g.KKA = {
    fmt: fmt, hash: hash, TIM: TIM, timOf: timOf, PERAN: PERAN, USERS: USERS, user: user, hak: hak, roTerlihat: roTerlihat, roAkses: roAkses, roAdm: roAdm, adaPeran: adaPeran, STATUS: STATUS, aksiAlur: aksiAlur,
    HARI_INI: HARI_INI, JENIS: JENIS, JSTATUS: JSTATUS, jadwalAwal: jadwalAwal, jadwalAksi: jadwalAksi, aksiJadwal: aksiJadwal, ringkasUsulan: ringkasUsulan, jadwalBulanan: jadwalBulanan,
    POK_PDF0: POK_PDF0, bandingPok: bandingPok, realisasiAwal: realisasiAwal, unggahRealisasi: unggahRealisasi, BOBOT0: BOBOT0, AMBANG0: AMBANG0, skorRO: skorRO, skorSemua: skorSemua,
    SKEMA: SK, ROS: ROS, jenisKel: jenisKel, seksiSkema: seksiSkema, dokItem: dokItem, hitungDok: hitungDok, bolehUnggah: bolehUnggah, PIHAK_PERAN: PIHAK_PERAN,
    TAB: TAB, PINTU: PINTU, alamat: alamat,
    GEN_SEMUA: GEN_SEMUA, bolehVerif: bolehVerif, lihatSkor: lihatSkor, KELOMPOK: KELOMPOK, AKUN_M: AKUN_M, POLA: POLA, POLA_SHEET: POLA_SHEET, SATUAN: SATUAN, satuanBaku: satuanBaku, pakaiSatuan: pakaiSatuan, pakaiAkun: pakaiAkun, KOMPONEN: KOMPONEN, PRIO: PRIO, WAKTU: WAKTU, KEWENANGAN: KEWENANGAN,
    kekuranganAwal: kekuranganAwal, kekuranganTerbuka: kekuranganTerbuka, saranKesempatan: saranKesempatan, cekKeputusan: cekKeputusan, terapkanKeputusan: terapkanKeputusan, KSTATUS: KSTATUS,
    LEVEL: LEVEL, SUMBER: SUMBER, jalurTambah: jalurTambah, cekTambah: cekTambah, kodeSementara: kodeSementara, pemadanan: pemadanan
  };
})(typeof window !== 'undefined' ? window : globalThis);
