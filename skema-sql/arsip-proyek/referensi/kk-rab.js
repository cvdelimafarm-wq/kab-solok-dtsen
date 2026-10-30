// kk-rab.js -- model RAB rinci untuk MOCKUP Kertas Kerja Revisi POK. Bergantung pada kk-data.js dan kk-logic.js.
// RAB per item POK: satu item boleh punya beberapa baris rincian (mis. PML 2 x 170.000, PPL 10 x 170.000); jumlahnya masuk ke item.
// Status per item: belum (tidak ada RAB), sama (RAB = Item, bentuk paling sederhana), rinci (ada rincian/perubahan keterangan), selesai (item selesai: RAB dikosongkan sampai Booked + Realisasi).
// Jadwal pencairan per baris rincian: disusun PER BULAN (12 bulan), tiap bulan punya nilai (Rp) dan tag minggu M1-M4.
// Pembangkit otomatis dari periode (Sekali, Bulanan, Triwulanan), bulan mulai, sampai, dan tag minggu bawaan; tiap bulan boleh diubah tangan (manual).
// Semua angka dan pembagian PML/PPL pada contoh adalah ILUSTRASI. Tidak ada yang disimpan.
(function (g) {
  'use strict';
  var K = g.KK;
  var POLA = { '051': [6, 7], '052': [7, 8, 9, 10], '053': [10, 11], '005': [7, 8, 9, 10, 11] };
    var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var seq = 0;

  // USULAN tag minggu bawaan menurut akun (ilustrasi, dapat diubah per baris dan per bulan). M1 = tgl 1-7, M2 = 8-14, M3 = 15-21, M4 = 22 sampai akhir bulan.
  var TAG_USULAN = [
    { akun: '521213, 522151', nama: 'Honor output kegiatan, jasa profesi', tag: 4, alasan: 'dibayar setelah pekerjaan selesai dan daftar hadir atau BAST lengkap, jadi akhir bulan' },
    { akun: '524111, 524113', nama: 'Perjalanan dinas, transport lokal', tag: 4, alasan: 'dibayar setelah SPJ kegiatan lapangan terkumpul, jadi akhir bulan' },
    { akun: '524114, 524119', nama: 'Paket meeting', tag: 3, alasan: 'dibayar sekitar atau setelah pelaksanaan pertemuan, pertengahan sampai akhir bulan' },
    { akun: '521211, 521811', nama: 'Belanja bahan, persediaan', tag: 2, alasan: 'pengadaan didahulukan agar barang ada sebelum kegiatan, awal sampai pertengahan bulan' },
    { akun: '53xxxx', nama: 'Belanja modal', tag: 3, alasan: 'proses pengadaan lebih panjang, pertengahan bulan' },
    { akun: 'lainnya', nama: 'Akun lain', tag: 3, alasan: 'bawaan netral; ubah sesuai kebiasaan satker' }
  ];
  function tagUsulan(akun) {
    var a = String(akun || '');
    if (a === '521213' || a === '522151') return 4;
    if (a === '524111' || a === '524113') return 4;
    if (a === '524114' || a === '524119') return 3;
    if (a === '521211' || a === '521811') return 2;
    if (a.slice(0, 2) === '53') return 3;
    return 3;
  }
  function garis(it, ket, vol, sat, harga, auto) {
    var p = POLA[it.kom] || [10];
    return { id: 'L' + (++seq), ket: ket, vol: vol, sat: sat, harga: harga, catatan: '', link: '', bulan: p[0], minggu: tagUsulan(it.akunM || it.akun), periode: p.length > 1 ? 'bulanan' : 'sekali', sampai: p[p.length - 1], auto: !!auto, manual: false };
  }
  function lineJum(it, l) { return (it.lines.length === 1 && l.vol === it.vol && l.harga === it.harga) ? it.jum : Math.round((l.vol || 0) * (l.harga || 0)); }
  function sisaBebas(it) { return it.selesai ? Math.max(0, it.jum - (it.bk || 0) - (it.rl || 0)) : 0; }
  function jumItem(it) { if (it.selesai) return Math.min(it.jum, (it.bk || 0) + (it.rl || 0)); var a = 0; it.lines.forEach(function (l) { a += lineJum(it, l); }); return a; }
  function volItem(it) { var a = 0; it.lines.forEach(function (l) { a += l.vol || 0; }); return a; }
  function status(it) { if (it.selesai) return 'selesai'; if (!it.lines.length) return 'belum'; if (it.lines.length === 1 && it.lines[0].auto) return 'sama'; return 'rinci'; }
  function klon(r) { return JSON.parse(JSON.stringify(r)); }
  function cari(r, id) { for (var i = 0; i < r.items.length; i++) if (r.items[i].id === id) return r.items[i]; return null; }

  function pmlPpl(it, vol, harga) {
    var pml = Math.max(1, Math.round(vol * 0.2)), ppl = vol - pml;
    var a = [garis(it, 'PML', pml, it.sat, harga, false)];
    if (ppl > 0) a.push(garis(it, 'PPL', ppl, it.sat, harga, false));
    return a;
  }

  function baru() {
    var base = K.skenario('RAB'), items = [], idx = 0;
    var byId = {}; base.rows.forEach(function (x) { byId[x.id] = x; });
    base.rows.forEach(function (r0) {
      if (r0.penggenap) return;
      if (r0.pindahKe) return;                 // baris akun lama dilipat ke pasangannya: di RAB satu item punya satu akun tujuan
      var r = r0;
      if (r0.pindahDari) { var o = byId[r0.pindahDari]; r = {}; for (var k in o) r[k] = o[k]; r.volM = (o.volM || 0) + r0.volM; r.hargaM = r0.hargaM; r.uraM = r0.uraM; r.akunM = r0.akun; r.jumFix = null; }
      var it = { id: r.id, ro: r.ro, kom: r.kom, komNama: r.komNama, akun: r.akun, akunNama: r.akunNama, uraian: r.uraian, sat: r.sat, vol: r.vol, harga: r.harga, jum: r.jum, bk: r.bk, rl: r.rl, baru: !!r.baru, uraM: r.uraM, akunM: r.akunM, lines: [] };
      var berubah = r.baru || K.jumM(r) !== r.jum || r.uraM !== r.uraian || r.akunM !== r.akun;
      var trans = r.akunM === '524113';
      if (berubah) {
        if (trans && r.volM >= 2) it.lines = pmlPpl(it, r.volM, r.hargaM);
        else it.lines = [garis(it, 'RAB = item', r.volM, r.sat, r.hargaM, true)];
      } else if (r.jum > 0) {
        if (idx % 3 !== 0) {
          if (trans && r.vol >= 5) it.lines = pmlPpl(it, r.vol, r.harga);
          else it.lines = [garis(it, 'RAB = item', r.vol, r.sat, r.harga, true)];
        }
        idx++;
      }
      // catatan contoh
      if (it.lines.length > 1) { it.lines[0].catatan = 'Pemeriksa mengikuti jadwal pendataan'; it.lines[0].link = ''; }
      items.push(it);
    });
    // contoh catatan, spesifikasi, dan tautan pada beberapa baris
    var c = items.filter(function (x) { return x.akunM === '521811' && x.lines.length; })[0];
    if (c) { c.lines[0].catatan = 'Spesifikasi: tinta printer hitam dan warna, 2 set'; c.lines[0].link = 'https://contoh.bps.go.id/katalog/tinta-printer'; }
    return { items: items };
  }

  // ganti akun pada RAB: item tetap satu; akun tujuan disimpan di akunM. Saat diterapkan ke Menjadi, terbentuk pasangan (akun lama dikosongkan, akun baru berisi salinan).
  function gantiAkun(r, itemId, akun) {
    akun = String(akun || '').trim();
    if (!/^\d{6}$/.test(akun)) return r;
    var c = klon(r), it = cari(c, itemId); if (!it || it.selesai) return r;
    it.akunM = akun; if (it.baru) it.akun = akun;
    return c;
  }

  function ringkas(r) {
    var n = { belum: 0, sama: 0, rinci: 0, selesai: 0 }, rab = 0, pok = 0, net = 0, netNon = 0, bebas = 0;
    r.items.forEach(function (it) {
      var s = status(it); n[s]++;
      if (s === 'selesai') { bebas += sisaBebas(it); }
      if (s !== 'belum') { var j = jumItem(it); rab += j; pok += it.jum; net += j - it.jum; if (s !== 'selesai') netNon += j - it.jum; }
    });
    var dipakai = netNon > 0 ? Math.min(netNon, bebas) : 0;
    return { n: n, rab: rab, pok: pok, net: net, netNon: netNon, bebas: bebas, dipakai: dipakai, kurangiPagu: bebas - dipakai, penggenap: 0, total: r.items.length };
  }

  function ubahLine(r, itemId, lineId, f, raw) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    var l = it.lines.filter(function (x) { return x.id === lineId; })[0]; if (!l) return r;
    if (f === 'vol' || f === 'harga') { var v = K.hitungRumus(raw); if (v === null || v < 0) return r; l[f] = f === 'vol' ? Math.round(v * 100) / 100 : Math.round(v); }
    else if (f === 'bulan') { var b = parseInt(raw, 10); if (!(b >= 1 && b <= 12)) return r; l.bulan = b; if (l.sampai < b) l.sampai = b; l.manual = false; delete l.jd; }
    else if (f === 'minggu') { var m = parseInt(raw, 10); if (!(m >= 1 && m <= 4)) return r; l.minggu = m; if (l.manual && l.jd) l.jd.forEach(function (x) { if (x.n > 0) x.w = m; }); }
    else if (f === 'periode') { if (raw !== 'sekali' && raw !== 'bulanan' && raw !== 'triwulan') return r; l.periode = raw; if (raw !== 'sekali' && l.sampai <= l.bulan) l.sampai = Math.min(12, raw === 'triwulan' ? l.bulan + 3 : l.bulan + 1); l.manual = false; delete l.jd; }
    else if (f === 'sampai') { var e = parseInt(raw, 10); if (!(e >= 1 && e <= 12)) return r; l.sampai = Math.max(e, l.bulan); l.manual = false; delete l.jd; }
    else if (f === 'ket') { l.ket = String(raw); l.auto = false; }
    else if (f === 'sat' || f === 'catatan' || f === 'link') l[f] = String(raw);
    return c;
  }
  function tambahLine(r, itemId) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    if (it.lines.length === 1 && it.lines[0].auto) it.lines[0].auto = false;
    it.lines.push(garis(it, 'Rincian baru', 1, it.sat, 0, false));
    return c;
  }
  function hapusLine(r, itemId, lineId) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    it.lines = it.lines.filter(function (x) { return x.id !== lineId; });
    return c;
  }
  function jadikanItem(r, itemId) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    it.lines = [garis(it, 'RAB = item', it.baru ? 1 : it.vol, it.sat, it.baru ? 0 : it.harga, true)];
    return c;
  }

  function salinLine(l) { return JSON.parse(JSON.stringify(l)); }
  function dupLine(r, itemId, lineId) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    var i = -1; it.lines.forEach(function (x, k) { if (x.id === lineId) i = k; }); if (i < 0) return r;
    var n = salinLine(it.lines[i]); n.id = 'L' + (++seq); n.auto = false;
    if (!/\(salinan\)$/.test(n.ket)) n.ket = n.ket + ' (salinan)';
    it.lines.forEach(function (x) { x.auto = false; });
    it.lines.splice(i + 1, 0, n);
    return c;
  }
  // pindahkan satu baris rincian: ke sebelum/sesudah baris sasaran (bila sasaran null: ke akhir daftar item tujuan). Boleh lintas item.
  function moveLine(r, dariItem, lineId, keItem, sasaranId) {
    var c = klon(r), a = cari(c, dariItem), b = cari(c, keItem); if (!a || !b) return r;
    var i = -1; a.lines.forEach(function (x, k) { if (x.id === lineId) i = k; }); if (i < 0) return r;
    if (sasaranId === lineId) return r;
    var j0 = -1; b.lines.forEach(function (x, k) { if (x.id === sasaranId) j0 = k; });
    var l = a.lines.splice(i, 1)[0];
    var j = -1; b.lines.forEach(function (x, k) { if (x.id === sasaranId) j = k; });
    var ke;
    if (sasaranId == null || j < 0) ke = b.lines.length;
    else if (a === b && i < j0) ke = j + 1; else ke = j;
    b.lines.splice(ke, 0, l);
    if (b.lines.length > 1) b.lines.forEach(function (x) { x.auto = false; });
    if (a !== b && a.lines.length > 1) a.lines.forEach(function (x) { x.auto = false; });
    return c;
  }
  function geserLine(r, itemId, lineId, arah) {
    var it = cari(r, itemId); if (!it) return r;
    var i = -1; it.lines.forEach(function (x, k) { if (x.id === lineId) i = k; }); var j = i + arah;
    if (i < 0 || j < 0 || j >= it.lines.length) return r;
    var c = klon(r), t = cari(c, itemId), tmp = t.lines[i]; t.lines[i] = t.lines[j]; t.lines[j] = tmp;
    return c;
  }
  function tempel(r, itemId, lines) {
    var c = klon(r), it = cari(c, itemId); if (!it || !lines || !lines.length) return r;
    it.lines.forEach(function (x) { x.auto = false; });
    lines.forEach(function (l) { var n = salinLine(l); n.id = 'L' + (++seq); n.auto = false; it.lines.push(n); });
    return c;
  }
  function hapusRab(r, itemId) { var c = klon(r), it = cari(c, itemId); if (!it) return r; it.lines = []; return c; }
  function semuaJadiItem(r) {
    var c = klon(r);
    c.items.forEach(function (it) { if (!it.lines.length && it.jum > 0) it.lines = [garis(it, 'RAB = item', it.vol, it.sat, it.harga, true)]; });
    return c;
  }

  // bulan-bulan pencairan menurut periode (pembangkit otomatis)
  function bulanCair(l) {
    var out = [], b0 = l.bulan, b1 = Math.max(l.sampai || l.bulan, l.bulan);
    if (l.periode === 'sekali' || !l.periode) return [b0];
    var step = l.periode === 'triwulan' ? 3 : 1;
    for (var b = b0; b <= b1; b += step) out.push(b);
    return out;
  }
  // jadwal per bulan satu baris rincian: 12 sel {n: Rp, w: tag minggu 1-4}. Otomatis (dibagi rata) kecuali l.manual.
  function jadwalLine(it, l) {
    if (l.manual && l.jd && l.jd.length === 12) return l.jd;
    var amt = lineJum(it, l), bl = bulanCair(l), n = bl.length, bagi = Math.floor(amt / n), sisa = amt - bagi * n, out = [];
    for (var i = 1; i <= 12; i++) { var k = bl.indexOf(i); out.push({ n: k < 0 ? 0 : bagi + (k === n - 1 ? sisa : 0), w: l.minggu }); }
    return out;
  }
  function jadwalSelisih(it, l) { var a = lineJum(it, l), t = 0; jadwalLine(it, l).forEach(function (x) { t += x.n; }); return a - t; }
  function ubahBulan(r, itemId, lineId, b, f, raw) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    var l = it.lines.filter(function (x) { return x.id === lineId; })[0]; if (!l || !(b >= 1 && b <= 12)) return r;
    var jd = jadwalLine(it, l).map(function (x) { return { n: x.n, w: x.w }; });
    if (f === 'n') { var v = K.hitungRumus(raw); if (v === null || v < 0) return r; jd[b - 1].n = Math.round(v); }
    else if (f === 'w') { var w = parseInt(raw, 10); if (!(w >= 1 && w <= 4)) return r; jd[b - 1].w = w; }
    else return r;
    l.jd = jd; l.manual = true; return c;
  }
  function ratakan(r, itemId, lineId) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    var l = it.lines.filter(function (x) { return x.id === lineId; })[0]; if (!l) return r;
    l.manual = false; delete l.jd; return c;
  }
  function jadwalBeda(r) {
    var out = [];
    r.items.forEach(function (it) { if (it.selesai) return; it.lines.forEach(function (l) { var d = jadwalSelisih(it, l); if (d !== 0) out.push({ item: it.id, line: l.id, ket: l.ket, d: d }); }); });
    return out;
  }
  function jadwalTeks(l) {
    var m = bulanCair(l), nama = function (x) { return BULAN[x - 1]; };
    if (l.manual) return 'Diatur per bulan (manual). Ratakan ulang untuk kembali ke periode.';
    if (l.periode === 'sekali' || !l.periode) return 'Sekali, ' + nama(l.bulan) + ' M' + l.minggu;
    return (l.periode === 'triwulan' ? 'Triwulanan' : 'Bulanan') + ' ' + nama(l.bulan) + ' sampai ' + nama(l.sampai) + ', tiap M' + l.minggu + ' (' + m.length + ' kali: ' + m.map(nama).join(', ') + ')';
  }

  // perkiraan kebutuhan pencairan: 12 bulan x 4 minggu, dari jadwal per bulan tiap baris rincian. Item selesai tidak ikut.
  function pencairan(r, ro) {
    var w = [], det = []; for (var i = 0; i < 12; i++) { w.push([0, 0, 0, 0]); det.push([]); }
    r.items.forEach(function (it) {
      if (it.selesai) return;
      if (ro && ro !== 'semua' && it.ro !== ro) return;
      jadwalSisa(it).e.forEach(function (x) {
        if (!x.n) return;
        w[x.b - 1][x.w - 1] += x.n;
        det[x.b - 1].push({ item: it.id, ro: it.ro, uraian: it.uraM, ket: it.lines[x.li].ket, w: x.w, n: x.n, akun: it.akunM });
      });
    });
    var bln = [], mx = 0, tot = 0;
    for (var b = 0; b < 12; b++) { var m = w[b], t = m[0] + m[1] + m[2] + m[3]; bln.push({ bulan: BULAN[b], no: b + 1, m: m, t: t, rinci: det[b] }); tot += t; m.forEach(function (x) { if (x > mx) mx = x; }); }
    return { bln: bln, total: tot, maks: mx };
  }

  // ---------------------------------------------------------------- realisasi resmi SPAN (ILUSTRASI)
  // Unggahan SPAN memuat realisasi resmi per item per bulan sampai bulan potong (contoh: September 2026). Angka resmi MENGUNCI kolom Realisasi,
  // dan dikurangkan dari jadwal RAB bulan terdepan lebih dulu (FIFO). Bila tidak cocok dengan RAB, item ditandai merah.
  var SPAN_POTONG = 9;
  function dataSpan(r) {
    var out = {}, idx = 0;
    r.items.forEach(function (it) {
      var rl = it.rl || 0; if (!(rl > 0) || it.baru) return;
      var p = POLA[it.kom] || [7], m0 = p[0], b = []; for (var i = 0; i < 12; i++) b.push(0);
      var mode = idx % 5;
      if (mode === 1) b[Math.max(1, m0 - 2)] = rl;                                  // dicairkan dua bulan sebelum jadwal RAB
      else if (mode === 3) { b[Math.min(SPAN_POTONG, m0) - 1] = Math.round(rl / 2); b[Math.min(SPAN_POTONG, m0 + 1) - 1] += rl - Math.round(rl / 2); }
      else b[Math.min(SPAN_POTONG, m0) - 1] = rl;
      out[it.id] = { rl: rl, bln: b, potong: SPAN_POTONG };
      idx++;
    });
    return out;
  }
  function pasangSpan(r, data) {
    var c = klon(r);
    c.items.forEach(function (it) { var d = data[it.id]; it.span = d || { rl: 0, bln: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], potong: SPAN_POTONG }; it.rl = it.span.rl; });
    return c;
  }
  // jadwal sisa: entri {b, w, n0 (RAB), n (sisa setelah realisasi resmi dikurangkan dari bulan terdepan)}
  function jadwalSisa(it) {
    var e = [];
    it.lines.forEach(function (l, li) { jadwalLine(it, l).forEach(function (x, b) { if (x.n) e.push({ b: b + 1, w: x.w, n0: x.n, n: x.n, li: li }); }); });
    e.sort(function (a, c) { return a.b - c.b || a.li - c.li; });
    var sisa = it.span ? (it.span.rl || 0) : 0, pakai = 0;
    e.forEach(function (x) { if (sisa > 0) { var t = Math.min(x.n, sisa); x.n -= t; sisa -= t; pakai += t; } });
    return { e: e, terpakai: pakai, lebih: sisa };
  }
  function namaBulan(b) { return BULAN[b - 1]; }
  function cekSpan(it) {
    if (!it.span || !(it.span.rl > 0) || it.selesai) return { merah: false, pesan: [] };
    var ps = [], rl = it.span.rl;
    if (!it.lines.length) { ps.push('Sudah ada realisasi resmi SPAN Rp ' + K.fmt(rl) + ' tetapi item ini belum ada RAB.'); return { merah: true, pesan: ps }; }
    var js = jadwalSisa(it), rab = jumItem(it);
    if (rl > rab) ps.push('Realisasi resmi Rp ' + K.fmt(rl) + ' melebihi RAB Rp ' + K.fmt(rab) + ' (lebih Rp ' + K.fmt(rl - rab) + ').');
    var plan = {}; js.e.forEach(function (x) { plan[x.b] = 1; });
    it.span.bln.forEach(function (v, i) { if (v > 0 && !plan[i + 1]) ps.push('Realisasi ' + namaBulan(i + 1) + ' Rp ' + K.fmt(v) + ' jatuh pada bulan yang tidak terjadwal di RAB (jadwal: ' + Object.keys(plan).map(function (k) { return namaBulan(+k); }).join(', ') + ').'); });
    return { merah: ps.length > 0, pesan: ps };
  }
  function ringkasSpan(r) {
    var n = 0, tot = 0, rl = 0; r.items.forEach(function (it) { if (it.span) { rl += it.span.rl || 0; var c = cekSpan(it); if (c.merah) { n++; tot += it.span.rl; } } });
    return { n: n, rl: rl, rlBermasalah: tot, potong: SPAN_POTONG };
  }

  // item atau seluruh RO selesai: kelebihan anggaran dikosongkan (RAB item = Booked + Realisasi). Rincian disimpan, hanya tidak dipakai.
  function tandaiSelesai(r, itemId, nilai) {
    var c = klon(r), it = cari(c, itemId); if (!it) return r;
    it.selesai = !!nilai; return c;
  }
  function selesaiRo(r, ro, nilai) {
    var c = klon(r);
    c.items.forEach(function (it) { if (it.ro === ro && (it.jum > 0 || it.selesai)) it.selesai = !!nilai; });
    return c;
  }

  // terapkan RAB ke kolom Menjadi: item yang punya RAB dipakai, item tanpa RAB tetap seperti POK semula. Sisa negatif ditutup baris Dana penggenap.
  function keMenjadi(r) {
    var s = K.skenario('');
    r.items.forEach(function (it) {
      if (it.selesai) {
        var pakai = (it.bk || 0) + (it.rl || 0);
        if (pakai <= 0) s = K.ubah(s, it.id, 'volM', 0);
        else if (pakai < it.jum) { s = K.ubah(s, it.id, 'hargaM', Math.ceil(pakai / it.vol)); }
        return;
      }
      if (!it.lines.length) { if (!it.baru && it.akunM !== it.akun) s = K.ubah(s, it.id, 'akunM', it.akunM); return; }
      var vs = volItem(it), js = jumItem(it), hg = vs ? Math.round(js / vs) : 0;
      if (!it.baru) {
        if (vs === it.vol && hg === it.harga) { /* sama dengan POK */ } else { s = K.ubah(s, it.id, 'volM', vs); s = K.ubah(s, it.id, 'hargaM', hg); }
        if (it.uraM !== it.uraian) s = K.ubah(s, it.id, 'uraM', it.uraM);
        if (it.akunM !== it.akun) s = K.ubah(s, it.id, 'akunM', it.akunM);   // pasangan: akun lama dikosongkan (sebesar sisa di luar Booked + Realisasi), akun baru berisi salinan
      } else {
        var ada = {}; s.rows.forEach(function (x) { ada[x.id] = 1; });
        s = K.tambahItem(s, it.ro, it.kom, it.akunM);
        var nb = s.rows.filter(function (x) { return !ada[x.id]; })[0];
        if (nb) { s = K.ubah(s, nb.id, 'uraM', it.uraM); s = K.ubah(s, nb.id, 'volM', vs); s = K.ubah(s, nb.id, 'hargaM', hg); }
      }
    });
    // Dana penggenap otomatis DIHAPUS: selisih RAB terhadap POK tidak ditutup baris fiktif. Pada RAB penuh (jalur Revisi DIPA) selisih menjadi perubahan pagu KRO.
    s.skenario = 'RABRINCI';
    s.catatanSkenario = 'RAB penuh (jalur Revisi DIPA): item ber-RAB masuk ke kolom Menjadi dengan jumlah dari rincian; item selesai dikosongkan sampai Booked + Realisasi; item tanpa RAB tetap seperti POK. Tanpa baris Dana penggenap: bila RAB lebih kecil dari POK pagu KRO turun, bila lebih besar pagu naik; keduanya menjadi perubahan pagu (R-01) dan jalurnya Revisi DIPA. Dana bebas dari item selesai menutup kenaikan item lain dulu.';
    s.jenis = K.saran(s).jenis || 'pok';
    return s;
  }

  g.KKR = { baru: baru, status: status, jumItem: jumItem, volItem: volItem, lineJum: lineJum, ringkas: ringkas, ubahLine: ubahLine, tambahLine: tambahLine, hapusLine: hapusLine, dupLine: dupLine, moveLine: moveLine, geserLine: geserLine, tempel: tempel, salinLine: salinLine,
    jadikanItem: jadikanItem, gantiAkun: gantiAkun, dataSpan: dataSpan, pasangSpan: pasangSpan, jadwalSisa: jadwalSisa, cekSpan: cekSpan, ringkasSpan: ringkasSpan, SPAN_POTONG: SPAN_POTONG, jadwalLine: jadwalLine, jadwalSelisih: jadwalSelisih, ubahBulan: ubahBulan, ratakan: ratakan, jadwalBeda: jadwalBeda, TAG_USULAN: TAG_USULAN, tagUsulan: tagUsulan, hapusRab: hapusRab, semuaJadiItem: semuaJadiItem, pencairan: pencairan, tandaiSelesai: tandaiSelesai, selesaiRo: selesaiRo, sisaBebas: sisaBebas, jadwalTeks: jadwalTeks, keMenjadi: keMenjadi, BULAN: BULAN };
  if (typeof module !== 'undefined') module.exports = g.KKR;
})(typeof window !== 'undefined' ? window : globalThis);
