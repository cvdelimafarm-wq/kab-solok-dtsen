// lib/keu/rkks.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK, papan 12 dan 6 mockup -- menguraikan PDF "RINCIAN KERTAS KERJA SATKER" (RKKS / POK resmi, keluaran SAKTI/Jasper) menjadi
// baris datar yang dimuat keu_pok_unggah_isi. Murni (tanpa React/DOM/pdf.js) supaya bisa diuji: masukannya potongan teks beserta koordinatnya
// (dibaca pdf.js di browser, lihat app/sigap/revisi/pok/pdf.ts), keluarannya baris POK + pemeriksaan hitung.
//
// Tata letak halaman (satuan titik PDF, tetap pada semua halaman): kolom Kode x < 78; nama/uraian x 78..280 (nama struktur di x = 83, uraian rincian di x >= 89,
// diawali tanda "-"); volume x 280..345; harga satuan rata kanan di x = 415; jumlah biaya rata kanan di x = 520 (struktur) atau 523 (rincian); kolom SD/CP x >= 528.
// Teks bertingkat (nama RO yang membungkus, uraian yang membungkus) diposisikan di tengah baris, sehingga kepemilikannya ditentukan oleh jarak vertikal.
// Hasil tidak pernah dipercaya begitu saja: pemeriksaan jumlah (rincian = akun = ... = program = ALOKASI) dikembalikan bersama baris, dan
// halaman unggah menolak lanjut bila ada yang tidak cocok.

export type ItemPdf = { str: string; x: number; y: number; w: number; hal: number };

export type BarisPok = {
  prog_kode: string; prog_nama: string; keg_kode: string; keg_nama: string; kro_kode: string; kro_nama: string;
  ro_sub: string; ro_nama: string; ro_volume: number | null; ro_satuan: string | null;
  komp_kode: string; komp_nama: string; sub_kode: string | null; sub_nama: string;
  akun_kode: string; akun_nama: string; uraian: string; volume: number; satuan: string; harga_satuan: number; jumlah: number;
  sumber_dana: string; tanda_blokir: boolean; catatan_khusus: string;
};

export type Ketidakcocokan = { tingkat: string; kode: string; nama: string; tertulis: number; dihitung: number };
export type HasilUrai = {
  baris: BarisPok[];
  alokasi: number | null;
  total: number;
  /** Simpul yang jumlahnya tidak sama dengan jumlah anak-anaknya (kosong = seluruh PDF konsisten). */
  tidakCocok: Ketidakcocokan[];
  /** Rincian yang volume x harga tidak sama dengan jumlah (selisih pembulatan wajar <= 1 rupiah per satuan diabaikan). */
  hargaTidakCocok: number;
  peringatan: string[];
  nHalaman: number;
};

const RE_MONEY = /^\d{1,3}(?:,\d{3})*$/;
const RE_PROG = /^\d{3}\.\d{2}\.[A-Z]{2}$/;
const RE_KEG = /^\d{4}$/;
const RE_KRO = /^\d{4}\.[A-Z]{3}$/;
const RE_RO = /^\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}$/;
const RE_KOMP = /^\d{3}$/;
const RE_SUB = /^[A-Z0-9]{1,2}$/;
const RE_AKUN = /^[1-9]\d{5}$/;

const X_KODE_MAKS = 78;
const X_NAMA_RINCIAN = 88;
const X_VOL_MULAI = 280;
const X_VOL_AKHIR = 345;
const X_FLAG = 528;
const Y_HEADER = 700;
const JARAK_NAMA = 12; // nama/volume struktur ke kodenya (baris struktur berjarak >= 13 titik, jadi yang terdekat selalu pemiliknya)
const JARAK_JUMLAH = 8; // jumlah struktur ke kodenya (nama RO tiga baris menaruh jumlah hingga ~6 titik dari kode; rincian selalu >= 13 dari kode terdekat)

type Level = "program" | "kegiatan" | "kro" | "ro" | "komponen" | "sub" | "akun";
type Simpul = { level: Level; kode: string; gy: number; nama: string[]; vol: string[]; jumlah: number | null; flag: string };
type Pecah = { str: string; x: number; r: number; gy: number };

const uang = (s: string): number => Number(s.replace(/,/g, ""));
const rapat = (s: string): string => s.replace(/\s+/g, " ").trim();
const SATUAN_ALIAS: Record<string, string> = { SEGMN: "SGMN", "O-K": "OK", "O-B": "OB", "O-P": "OP", OJ: "OJP", "O-J": "OJP", LBR: "LMBR", RT: "RUTA", "O-TH": "OT" };
const normSatuan = (s: string): string => {
  const u = rapat(s).toUpperCase();
  return SATUAN_ALIAS[u] ?? u;
};

function levelKode(s: string): Level | null {
  if (RE_PROG.test(s)) return "program";
  if (RE_RO.test(s)) return "ro";
  if (RE_KRO.test(s)) return "kro";
  if (RE_KEG.test(s)) return "kegiatan";
  if (RE_AKUN.test(s)) return "akun";
  if (RE_KOMP.test(s)) return "komponen";
  if (RE_SUB.test(s)) return "sub";
  return null;
}

/** "64.0 Segmn" -> {angka 64, satuan "SGMN"}; "1.0 dokumen, Peta, Data" -> {1, "DOKUMEN, PETA, DATA"}; selain itu null. */
export function urai_volume(teks: string): { angka: number; satuan: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(rapat(teks));
  if (!m) return null;
  return { angka: Number(m[1]), satuan: normSatuan(m[2]) };
}

export function uraiRkks(masuk: ItemPdf[]): HasilUrai {
  const peringatan: string[] = [];
  const nHalaman = masuk.reduce((a, i) => Math.max(a, i.hal), 0);

  // alokasi satker (kepala halaman 1)
  let alokasi: number | null = null;
  const kepala = masuk.filter((i) => i.hal === 1 && i.y > 740 && i.y < 770);
  for (const i of kepala) if (RE_MONEY.test(i.str.trim()) && i.str.includes(",") && i.x > 100 && i.x < 200) alokasi = uang(i.str.trim());

  // buang kepala halaman dan catatan kaki (mulai "Catatan :")
  let batas = Infinity;
  for (const i of masuk) if (/^Catatan\s*:/.test(i.str.trim())) batas = Math.min(batas, i.hal * 1000 - i.y);
  const item: Pecah[] = masuk
    .filter((i) => i.y <= Y_HEADER && i.str.trim() !== "" && i.hal * 1000 - i.y < batas)
    .map((i) => ({ str: rapat(i.str), x: i.x, r: i.x + i.w, gy: i.hal * 1000 - i.y }))
    .sort((a, b) => a.gy - b.gy || a.x - b.x);

  // 1. simpul struktur dari kolom Kode
  const simpul: Simpul[] = [];
  const lain: Pecah[] = [];
  for (const p of item) {
    if (p.x < X_KODE_MAKS) {
      const lv = levelKode(p.str);
      if (lv) {
        simpul.push({ level: lv, kode: p.str, gy: p.gy, nama: [], vol: [], jumlah: null, flag: "" });
        continue;
      }
    }
    lain.push(p);
  }
  if (simpul.length === 0) {
    return { baris: [], alokasi, total: 0, tidakCocok: [], hargaTidakCocok: 0, peringatan: ["Tidak ditemukan baris berkode. Pastikan berkas adalah PDF Rincian Kertas Kerja Satker (RKKS)."], nHalaman };
  }
  const terdekat = (gy: number, maks: number): Simpul | null => {
    let b: Simpul | null = null;
    let jb = Infinity;
    for (const s of simpul) {
      const j = Math.abs(s.gy - gy);
      if (j < jb) { jb = j; b = s; }
    }
    return b && jb <= maks ? b : null;
  };

  // 2. teks non-kode: nama struktur, volume struktur, jumlah struktur, flag, atau bagian rincian
  const rincian: Pecah[] = [];
  for (const p of lain) {
    const uangP = RE_MONEY.test(p.str);
    if (p.x >= X_FLAG) {
      const s = terdekat(p.gy, JARAK_NAMA);
      if (s && (s.level === "akun" || s.level === "komponen")) s.flag = (s.flag ? `${s.flag} ` : "") + p.str;
      continue;
    }
    if (uangP && p.r > 450) {
      const s = terdekat(p.gy, JARAK_JUMLAH);
      if (s && s.jumlah === null) { s.jumlah = uang(p.str); continue; }
      rincian.push(p);
      continue;
    }
    if (p.x < X_NAMA_RINCIAN && !uangP) {
      if (p.str.startsWith("Lokasi") || p.str.startsWith("(KPPN")) continue;
      const s = terdekat(p.gy, JARAK_NAMA);
      if (s) s.nama.push(p.str);
      continue;
    }
    if (p.x >= X_VOL_MULAI && p.x < X_VOL_AKHIR && !uangP) {
      const s = terdekat(p.gy, 9);
      if (s && (s.level === "kro" || s.level === "ro")) { s.vol.push(p.str); continue; }
    }
    rincian.push(p);
  }

  // 3. rincian per akun: wilayah = dari kode akun sampai simpul berikutnya
  type Rinci = { gy: number; jumlah: number; harga: number | null; uraian: Pecah[]; vol: Pecah[] };
  const rincianAkun = new Map<Simpul, Rinci[]>();
  for (let i = 0; i < simpul.length; i++) {
    const s = simpul[i];
    if (s.level !== "akun") continue;
    const akhir = i + 1 < simpul.length ? simpul[i + 1].gy : Infinity;
    const wil = rincian.filter((p) => p.gy > s.gy && p.gy < akhir);
    const jangkar: Rinci[] = wil.filter((p) => RE_MONEY.test(p.str) && p.r > 450).map((p) => ({ gy: p.gy, jumlah: uang(p.str), harga: null, uraian: [], vol: [] }));
    if (jangkar.length === 0) {
      if (wil.length > 0) peringatan.push(`Akun ${s.kode}: ada teks rincian tetapi tidak ada jumlah biaya.`);
      rincianAkun.set(s, []);
      continue;
    }
    for (const p of wil) {
      if (RE_MONEY.test(p.str) && p.r > 450) continue;
      let b = jangkar[0];
      for (const j of jangkar) if (Math.abs(j.gy - p.gy) < Math.abs(b.gy - p.gy)) b = j;
      if (RE_MONEY.test(p.str) && p.r <= 450) { b.harga = uang(p.str); continue; }
      if (p.x >= X_VOL_MULAI && p.x < X_VOL_AKHIR) { b.vol.push(p); continue; }
      b.uraian.push(p);
    }
    rincianAkun.set(s, jangkar);
  }

  // 4. susun baris datar sambil menelusuri leluhur
  const baris: BarisPok[] = [];
  const kini: Partial<Record<Level, Simpul>> = {};
  let hargaTidakCocok = 0;
  const nama = (s: Simpul | undefined): string => (s ? rapat(s.nama.join(" ")) : "");
  const akhirKode = (s: string): string => s.slice(s.lastIndexOf(".") + 1);
  for (const s of simpul) {
    kini[s.level] = s;
    if (s.level === "program") { delete kini.kegiatan; delete kini.kro; delete kini.ro; delete kini.komponen; delete kini.sub; delete kini.akun; }
    if (s.level === "kegiatan") { delete kini.kro; delete kini.ro; delete kini.komponen; delete kini.sub; delete kini.akun; }
    if (s.level === "kro") { delete kini.ro; delete kini.komponen; delete kini.sub; delete kini.akun; }
    if (s.level === "ro") { delete kini.komponen; delete kini.sub; delete kini.akun; }
    if (s.level === "komponen") { delete kini.sub; delete kini.akun; }
    if (s.level === "sub") delete kini.akun;
    if (s.level !== "akun") continue;
    const { program, kegiatan, kro, ro, komponen, sub } = kini;
    if (!program || !kegiatan || !kro || !ro || !komponen) {
      peringatan.push(`Akun ${s.kode} tidak punya induk lengkap (program/kegiatan/KRO/RO/komponen); dilewati.`);
      continue;
    }
    const rv = ro.vol.length > 0 ? urai_volume(ro.vol.sort().join(" ")) : null;
    for (const r of rincianAkun.get(s) ?? []) {
      // tanda "-" tunggal (x ~ 90) hanya penanda awal rincian, diletakkan di tengah baris; bukan bagian uraian
      const ura = r.uraian.filter((p) => !(p.str === "-" && p.x < 95)).sort((a, b) => a.gy - b.gy || a.x - b.x).map((p) => p.str).join(" ");
      let u = rapat(ura).replace(/^-\s*/, "").replace(/\s+-\s+/g, " - ");
      const blokir = /\*\s*$/.test(u) || /^\*\s/.test(u);
      if (blokir) u = rapat(u.replace(/\*\s*$/, "").replace(/^\*\s/, ""));
      const v = urai_volume(r.vol.sort((a, b) => a.gy - b.gy || a.x - b.x).map((p) => p.str).join(" "));
      if (!v) peringatan.push(`Rincian "${u.slice(0, 40)}" pada akun ${s.kode} (${akhirKode(ro.kode)}) tanpa volume terbaca.`);
      if (u === "") { peringatan.push(`Rincian tanpa uraian pada akun ${s.kode}, RO ${ro.kode}; dilewati.`); continue; }
      const harga = r.harga ?? 0;
      const vol = v?.angka ?? 0;
      if (Math.abs(Math.round(vol * harga) - r.jumlah) > Math.max(1, Math.ceil(vol))) hargaTidakCocok++;
      baris.push({
        prog_kode: akhirKode(program.kode), prog_nama: nama(program), keg_kode: kegiatan.kode, keg_nama: nama(kegiatan),
        kro_kode: akhirKode(kro.kode), kro_nama: nama(kro), ro_sub: akhirKode(ro.kode), ro_nama: nama(ro),
        ro_volume: rv ? rv.angka : null, ro_satuan: rv ? rv.satuan : null,
        komp_kode: komponen.kode, komp_nama: nama(komponen), sub_kode: sub ? sub.kode : null, sub_nama: nama(sub),
        akun_kode: s.kode, akun_nama: nama(s), uraian: u, volume: vol, satuan: v?.satuan ?? "", harga_satuan: harga, jumlah: r.jumlah,
        sumber_dana: (s.flag.split(" ").find((f) => /^[A-Z]{2,4}$/.test(f)) ?? "RM"), tanda_blokir: blokir, catatan_khusus: "",
      });
    }
  }

  // 5. pemeriksaan jumlah: rincian -> akun -> ... -> program, dan terhadap ALOKASI
  const tidakCocok: Ketidakcocokan[] = [];
  const anak = new Map<Simpul, number>();
  const induk: Record<Level, Level | null> = { program: null, kegiatan: "program", kro: "kegiatan", ro: "kro", komponen: "ro", sub: "komponen", akun: "sub" };
  const kiniI: Partial<Record<Level, Simpul>> = {};
  const jumlahRinci = new Map<Simpul, number>();
  for (const s of simpul) {
    kiniI[s.level] = s;
    if (s.level === "akun") {
      const t = (rincianAkun.get(s) ?? []).reduce((a, r) => a + r.jumlah, 0);
      jumlahRinci.set(s, t);
      if (s.jumlah !== null && s.jumlah !== t) tidakCocok.push({ tingkat: "akun", kode: s.kode, nama: nama(s), tertulis: s.jumlah, dihitung: t });
    }
  }
  // jumlah anak langsung per simpul, mengikuti urutan baca
  const tumpukan: Partial<Record<Level, Simpul>> = {};
  const urutLevel: Level[] = ["program", "kegiatan", "kro", "ro", "komponen", "sub", "akun"];
  for (const s of simpul) {
    tumpukan[s.level] = s;
    for (const lv of urutLevel.slice(urutLevel.indexOf(s.level) + 1)) delete tumpukan[lv];
    // induk terdekat yang ada (subkomponen boleh tidak ada)
    let pl = induk[s.level];
    while (pl && !tumpukan[pl]) pl = induk[pl];
    const pj = pl ? tumpukan[pl] : undefined;
    const nilai = s.level === "akun" ? (jumlahRinci.get(s) ?? 0) : (s.jumlah ?? 0);
    if (pj) anak.set(pj, (anak.get(pj) ?? 0) + nilai);
  }
  for (const s of simpul) {
    if (s.level === "akun") continue;
    if (s.jumlah === null) { peringatan.push(`${s.level} ${s.kode} tanpa jumlah terbaca.`); continue; }
    const t = anak.get(s) ?? 0;
    if (t !== s.jumlah) tidakCocok.push({ tingkat: s.level, kode: s.kode, nama: nama(s), tertulis: s.jumlah, dihitung: t });
  }
  const total = baris.reduce((a, b) => a + b.jumlah, 0);
  if (alokasi === null) peringatan.push("ALOKASI satker pada kepala halaman 1 tidak terbaca.");
  else if (alokasi !== total) tidakCocok.push({ tingkat: "satker", kode: "ALOKASI", nama: "Alokasi satker", tertulis: alokasi, dihitung: total });
  return { baris, alokasi, total, tidakCocok, hargaTidakCocok, peringatan, nHalaman };
}

/** Berkas dianggap utuh bila tidak ada ketidakcocokan jumlah dan tidak ada peringatan penting. */
export function berkasUtuh(h: HasilUrai): boolean {
  return h.baris.length > 0 && h.tidakCocok.length === 0 && h.alokasi !== null;
}
