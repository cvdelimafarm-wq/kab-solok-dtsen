"use client";

import { useEffect, useMemo, useState } from "react";

type FormState = Record<string, string>;

const STORAGE_KEY = "neraca-rt-draft-v1";

function numVal(state: FormState, id: string): number {
  const raw = (state[id] || "").replace(/[.,\s]/g, "");
  const v = parseFloat(raw);
  return isNaN(v) ? 0 : v;
}

function formatRp(n: number): string {
  const sign = n < 0 ? "\u2212Rp " : "Rp ";
  return sign + Math.round(Math.abs(n || 0)).toLocaleString("id-ID");
}

function formatDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "" : Number(digits).toLocaleString("id-ID");
}

// ---------- Row configs (redaksi persis sesuai kuesioner asli) ----------
const A_ROWS = 6;
const B_ROWS = 5;
const D_ITEMS = [
  { key: "sewaLahan", label: "1. Sewa Lahan" },
  {
    key: "keuntunganModal",
    label:
      "2. Keuntungan atas Kepemilikan Modal pada Usaha Rumah Tangga (bagi hasil) dan usaha berbentuk CV, Firma, UD, PD, dsj",
    hint: "withdrawal",
  },
  {
    key: "keuntunganSaham",
    label:
      "3. Keuntungan atas Kepemilikan Saham pada usaha berbentuk PT, Yayasan, PT Persero dan Koperasi",
    hint: "Deviden",
  },
  {
    key: "bunga",
    label: "4. Bunga",
    hint: "Simpanan, Pinjaman, Surat Utang Negara, Obligasi, dll",
  },
];
const E_MAIN = [
  {
    key: "badanUsaha",
    label: "2. Badan Usaha",
    hint: "Klaim Asuransi kesehatan/kecelakaan/kerugian, Penerimaan/Iuran Pensiun, dll",
  },
  { key: "rtLain", label: "3. Rumah Tangga Lain" },
  {
    key: "nirlaba",
    label: "4. Lembaga Nirlaba",
    hint: "Sumbangan dari/ke Masjid, Gereja, Panti, dll",
  },
  {
    key: "luarNegeri",
    label: "5. Luar Negeri",
    hint: "Kiriman dari/ke TKI, Sumbangan LSM Luar Negeri, dll",
  },
];
const F_ROWS = [
  { key: "pemerintah", label: "1. Pemerintah" },
  { key: "badanUsaha", label: "2. Badan Usaha" },
  { key: "rtLain", label: "3. Rumah Tangga Lain" },
  { key: "nirlaba", label: "4. Lembaga Nirlaba" },
  { key: "luarNegeri", label: "5. Luar Negeri" },
];
const G_SUB = [
  {
    key: "bangunanUsaha",
    label: "a. Bangunan Bukan Tempat Tinggal",
    hint: "Warung, Ruko, Bengkel, Toko, Warnet, dll",
  },
  {
    key: "kendaraan",
    label: "b. Kendaraan",
    hint: "Mobil, Motor, Becak, Sepeda, Gerobak, dll",
  },
  {
    key: "mesin",
    label: "c. Mesin, Perlengkapan dan Peralatan",
    hint: "Mesin Cuci, Kulkas, Cangkul, Mesin Jahit, dll",
  },
  {
    key: "tanamanHewan",
    label: "d. Tanaman dan Hewan Menghasilkan Berulang",
    hint: "Hewan Indukan, Ayam Petelur, Mangga, dll",
  },
  {
    key: "lainnyaIP",
    label: "e. Lainnya",
    hint: "Produk Kekayaan Intelektual seperti Software, Database, Hak Cipta, dll",
  },
];
const G_ROWS2 = [
  { key: "bangunanTinggal", label: "2. Bangunan Tempat Tinggal" },
  {
    key: "biayaPindahLahan",
    label: "3. Biaya Pemindahan Kepemilikan Lahan/Tanah",
    hint: "Biaya Sertifikat, Biaya Balik Nama Lahan, dll",
  },
  {
    key: "lahanBerharga",
    label: "4. Lahan/Tanah dan Barang Berharga",
    hint: "Emas Batangan, Lukisan, dll",
  },
];

const SAMPLE: FormState = {
  meta_nomor: "07 (contoh)",
  meta_nama: "Budi Santoso (contoh)",
  a1_uraian: "Guru honorer SD", a1_kategori: "Jasa Pendidikan", a1_jenis: "Buruh/Karyawan",
  a1_uang: "2800000", a1_lembur: "300000",
  a2_uraian: "Ojek online", a2_kategori: "Transportasi", a2_jenis: "Pekerja bebas", a2_uang: "1500000",
  b1_uraian: "Warung kelontong", b1_kategori: "Perdagangan", b1_jenis: "Berusaha sendiri",
  b1_produksi: "4200000", b1_biaya: "2900000",
  c_sewaRumah_produksi: "600000", c_hasilLain_produksi: "250000", c_hasilLain_biaya: "100000",
  d_keuntunganModal_diterima: "150000", d_bunga_diterima: "40000",
  e_bantuan_uang: "200000",
  g_mesin_tambah: "350000",
  vi_g1: "6200000",
  vii_p2: "500000", vii_g2: "300000", vii_g5: "150000",
};

function recompute(s: FormState) {
  const n = (id: string) => numVal(s, id);

  let aUang = 0, aBarang = 0, aLembur = 0;
  const aRows: { uang: number; barang: number; lembur: number }[] = [];
  for (let i = 1; i <= A_ROWS; i++) {
    const r = { uang: n(`a${i}_uang`), barang: n(`a${i}_barang`), lembur: n(`a${i}_lembur`) };
    aRows.push(r);
    aUang += r.uang; aBarang += r.barang; aLembur += r.lembur;
  }

  let bProduksi = 0, bBiaya = 0, bSurplus = 0;
  const bRows: { produksi: number; biaya: number; surplus: number }[] = [];
  for (let i = 1; i <= B_ROWS; i++) {
    const produksi = n(`b${i}_produksi`), biaya = n(`b${i}_biaya`);
    const surplus = produksi - biaya;
    bRows.push({ produksi, biaya, surplus });
    bProduksi += produksi; bBiaya += biaya; bSurplus += surplus;
  }

  const cKeys = ["sewaRumah", "hasilLain"];
  let cProduksi = 0, cBiaya = 0, cSurplus = 0;
  const cRows: Record<string, number> = {};
  cKeys.forEach((k) => {
    const p = n(`c_${k}_produksi`), b = n(`c_${k}_biaya`);
    const surplus = p - b;
    cRows[`${k}_surplus`] = surplus;
    cProduksi += p; cBiaya += b; cSurplus += surplus;
  });

  let dDiterima = 0, dDibayar = 0;
  D_ITEMS.forEach((r) => { dDiterima += n(`d_${r.key}_diterima`); dDibayar += n(`d_${r.key}_dibayar`); });

  const ePensiunUang = n("e_pensiun_uang"), ePensiunBarang = n("e_pensiun_barang");
  const eBantuanUang = n("e_bantuan_uang"), eBantuanBarang = n("e_bantuan_barang");
  const ePemUang = ePensiunUang + eBantuanUang, ePemBarang = ePensiunBarang + eBantuanBarang;
  let eUangD = ePemUang, eBarangD = ePemBarang, eUangB = 0, eBarangB = 0;
  E_MAIN.forEach((r) => {
    eUangD += n(`e_${r.key}_uangD`); eBarangD += n(`e_${r.key}_barangD`);
    eUangB += n(`e_${r.key}_uangB`); eBarangB += n(`e_${r.key}_barangB`);
  });

  let fBangunanD = 0, fLahanD = 0, fBangunanB = 0, fLahanB = 0;
  F_ROWS.forEach((r) => {
    fBangunanD += n(`f_${r.key}_bangunanD`); fLahanD += n(`f_${r.key}_lahanD`);
    fBangunanB += n(`f_${r.key}_bangunanB`); fLahanB += n(`f_${r.key}_lahanB`);
  });

  let gAsetUsahaTambah = 0, gAsetUsahaKurang = 0, gAsetUsahaNetto = 0;
  const gSubNetto: Record<string, number> = {};
  G_SUB.forEach((r) => {
    const t = n(`g_${r.key}_tambah`), k = n(`g_${r.key}_kurang`);
    const netto = t - k;
    gSubNetto[r.key] = netto;
    gAsetUsahaTambah += t; gAsetUsahaKurang += k; gAsetUsahaNetto += netto;
  });
  let gTambahTotal = gAsetUsahaTambah, gKurangTotal = gAsetUsahaKurang, gNettoTotal = gAsetUsahaNetto;
  const g2Netto: Record<string, number> = {};
  G_ROWS2.forEach((r) => {
    const t = n(`g_${r.key}_tambah`), k = n(`g_${r.key}_kurang`);
    const netto = t - k;
    g2Netto[r.key] = netto;
    gTambahTotal += t; gKurangTotal += k; gNettoTotal += netto;
  });

  // Blok VI
  const p1 = aUang + aBarang + aLembur;
  const p2 = bSurplus;
  const p3 = cSurplus;
  const p4 = dDiterima;
  const p5 = eUangD + eBarangD;
  const p6 = fBangunanD + fLahanD;
  const totalPenerimaanVI = p1 + p2 + p3 + p4 + p5 + p6;

  const g1 = n("vi_g1");
  const g2v = dDibayar;
  const g3v = eUangB + eBarangB;
  const g4v = fBangunanB + fLahanB;
  const g5v = gNettoTotal;
  const totalPengeluaranVI = g1 + g2v + g3v + g4v + g5v;

  const selisihVI = totalPenerimaanVI - totalPengeluaranVI;

  // Blok VII input manual
  const recv2 = n("vii_p2"), recv3 = n("vii_p3"), recv4 = n("vii_p4"), recv5 = n("vii_p5");
  const pay2 = n("vii_g2"), pay3 = n("vii_g3"), pay4 = n("vii_g4"), pay5 = n("vii_g5");

  // Tabel kontrol
  const c_e110 = g1, c_h110 = aUang + aLembur;
  const c_e111 = bBiaya + cBiaya, c_h111 = bProduksi;
  const c_e112 = eUangB + eBarangB, c_h112 = eUangD;
  const c_e113 = dDibayar, c_h113 = dDiterima;
  const c_e114 = gTambahTotal, c_h114 = gKurangTotal;
  const c_e115 = pay2 + pay3 + pay4 + pay5, c_h115 = recv2 + recv3 + recv5;
  const total1_e = c_e110 + c_e111 + c_e112 + c_e113 + c_e114 + c_e115;
  const total1_h = c_h110 + c_h111 + c_h112 + c_h113 + c_h114 + c_h115;

  const c_e117 = aBarang, c_h117 = fBangunanB + fLahanB;
  const c_e118 = cProduksi;
  const c_e119 = eBarangD;
  const c_e120 = fBangunanD + fLahanD;
  const c_e121 = recv4;
  const total2_e = c_e117 + c_e118 + c_e119 + c_e120 + c_e121;
  const total2_h = c_h117;

  const c_e123 = total1_e - total2_e;
  const c_h123 = total1_h - total2_h;

  const vii_p1 = c_e123;
  const totalPenerimaanVII = c_e123 + recv2 + recv3 + recv4 + recv5;
  const vii_g1 = c_h123;
  const totalPengeluaranVII = c_h123 + pay2 + pay3 + pay4 + pay5;
  const selisihVII = totalPengeluaranVII - totalPenerimaanVII;

  const diskrepansi = selisihVI - selisihVII;

  return {
    aRows, aUang, aBarang, aLembur,
    bRows, bProduksi, bBiaya, bSurplus,
    cRows, cProduksi, cBiaya, cSurplus,
    dDiterima, dDibayar,
    ePemUang, ePemBarang, eUangD, eBarangD, eUangB, eBarangB,
    fBangunanD, fLahanD, fBangunanB, fLahanB,
    gSubNetto, gAsetUsahaTambah, gAsetUsahaKurang, gAsetUsahaNetto,
    g2Netto, gTambahTotal, gKurangTotal, gNettoTotal,
    p1, p2, p3, p4, p5, p6, totalPenerimaanVI,
    g1, g2v, g3v, g4v, g5v, totalPengeluaranVI, selisihVI,
    c_e110, c_h110, c_e111, c_h111, c_e112, c_h112, c_e113, c_h113,
    c_e114, c_h114, c_e115, c_h115, total1_e, total1_h,
    c_e117, c_h117, c_e118, c_e119, c_e120, c_e121, total2_e, total2_h,
    c_e123, c_h123,
    vii_p1, totalPenerimaanVII, vii_g1, totalPengeluaranVII, selisihVII,
    diskrepansi,
  };
}

// ---------- Small building blocks ----------
function MoneyInput({
  value,
  onChange,
  placeholder = "0",
}: {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatDigits(value)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder}
      className="w-full min-w-[90px] rounded-md border border-line bg-white px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[110px] rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
    />
  );
}

function Th({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <th className="whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-navy-600">
      {children}
      {hint && <span className="block normal-case tracking-normal text-ink/40">{hint}</span>}
    </th>
  );
}

function Money({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <span className={`font-mono text-sm ${strong ? "font-bold" : "font-medium"} ${value < 0 ? "text-rust-500" : "text-ink"}`}>
      {formatRp(value)}
    </span>
  );
}

function BlockHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2.5">
      <span className="rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-navy-600">
        {letter}
      </span>
      <span className="text-sm font-semibold text-navy-900">{title}</span>
    </div>
  );
}

function RecapRow({
  label,
  hint,
  value,
  total,
}: {
  label: string;
  hint?: string;
  value: React.ReactNode;
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0 ${
        total ? "bg-navy-50 font-semibold" : ""
      }`}
    >
      <span className="max-w-[60%] text-sm text-ink">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink/50">{hint}</span>}
      </span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

// ---------- Main component ----------
export default function NeracaRtCalculator() {
  const [state, setState] = useState<FormState>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setState(JSON.parse(raw));
      } else {
        setState(SAMPLE);
      }
    } catch {
      setState(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // abaikan kalau storage penuh/diblokir
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state, loaded]);

  const c = useMemo(() => recompute(state), [state]);

  function set(id: string, v: string) {
    setState((prev) => ({ ...prev, [id]: v }));
  }

  function loadSample() {
    setState(SAMPLE);
  }
  function clearAll() {
    setState({});
  }

  const isBalanced = Math.abs(c.diskrepansi) < 1;
  const nomor = (state.meta_nomor || "").trim();
  const nama = (state.meta_nama || "").trim();
  const idLabel = nomor && nama ? `No. Sampel ${nomor} \u2014 ${nama}` : nomor || nama;

  return (
    <div>
      <p className="text-sm text-ink/70">
        Kalkulator Blok V (Pendapatan), Blok VI (Rekapitulasi), dan Blok VII
        (Transaksi Keuangan) kuesioner neraca rumah tangga. Isi sel putih,
        sel abu-abu terisi otomatis dari rumus.
      </p>

      {/* Ringkasan */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <p className="text-xs text-ink/50">Penerimaan VI</p>
          <p className="mt-1 font-mono text-lg font-semibold text-navy-900">
            {formatRp(c.totalPenerimaanVI)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <p className="text-xs text-ink/50">Pengeluaran VI</p>
          <p className="mt-1 font-mono text-lg font-semibold text-navy-900">
            {formatRp(c.totalPengeluaranVI)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3">
          <p className="text-xs text-ink/50">Selisih VI</p>
          <p className="mt-1 font-mono text-lg font-semibold text-navy-900">
            {formatRp(c.selisihVI)}
          </p>
        </div>
        <div
          className={`rounded-lg border px-4 py-3 ${
            isBalanced ? "border-moss-500 bg-moss-100" : "border-rust-500 bg-rust-100"
          }`}
        >
          <p className={`text-xs ${isBalanced ? "text-moss-700" : "text-rust-700"}`}>
            Diskrepansi
          </p>
          <p
            className={`mt-1 font-mono text-lg font-semibold ${
              isBalanced ? "text-moss-700" : "text-rust-700"
            }`}
          >
            {formatRp(c.diskrepansi)}
          </p>
        </div>
      </div>
      {idLabel && <p className="mt-2 text-sm font-medium text-navy-400">{idLabel}</p>}

      {/* Identitas */}
      <div className="mt-4 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            No. Urut Sampel
          </label>
          <div className="mt-1">
            <TextInput
              value={state.meta_nomor || ""}
              onChange={(v) => set("meta_nomor", v)}
              placeholder="mis. 07"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Nama Responden / KRT
          </label>
          <div className="mt-1">
            <TextInput
              value={state.meta_nama || ""}
              onChange={(v) => set("meta_nama", v)}
              placeholder="mis. Budi Santoso"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Tanggal Pencacahan
          </label>
          <div className="mt-1">
            <input
              type="date"
              value={state.meta_tanggal || ""}
              onChange={(e) => set("meta_tanggal", e.target.value)}
              className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadSample}
          className="rounded-md bg-navy-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-navy-600"
        >
          Muat Contoh Data
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-line px-3.5 py-2 text-sm font-medium text-ink/70 hover:border-navy-400 hover:text-ink"
        >
          Kosongkan Semua
        </button>
        <span className="text-xs text-ink/40">Draf tersimpan otomatis di peramban ini.</span>
      </div>

      {/* Blok V.A */}
      <div className="mt-8">
        <BlockHeader
          letter="V.A"
          title="Pendapatan dari Upah/Gaji Baik Berupa Uang Maupun Barang/Jasa yang Diterima Selama Setahun Terakhir"
        />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>#</Th><Th>Uraian Pekerjaan</Th><Th>Kategori Lapangan Usaha</Th><Th>Jenis Pekerjaan</Th>
                <Th>Upah/Gaji dalam Bentuk Uang</Th><Th>Upah/Gaji dalam Bentuk Barang/Jasa</Th><Th>Lembur, Honorarium, THR, dsb.</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: A_ROWS }, (_, idx) => idx + 1).map((i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-center font-mono text-xs text-ink/40">{i}</td>
                  <td className="px-2 py-1.5"><TextInput value={state[`a${i}_uraian`] || ""} onChange={(v) => set(`a${i}_uraian`, v)} placeholder="Uraian pekerjaan" /></td>
                  <td className="px-2 py-1.5"><TextInput value={state[`a${i}_kategori`] || ""} onChange={(v) => set(`a${i}_kategori`, v)} placeholder="Kategori usaha" /></td>
                  <td className="px-2 py-1.5"><TextInput value={state[`a${i}_jenis`] || ""} onChange={(v) => set(`a${i}_jenis`, v)} placeholder="Jenis pekerjaan" /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`a${i}_uang`] || ""} onChange={(v) => set(`a${i}_uang`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`a${i}_barang`] || ""} onChange={(v) => set(`a${i}_barang`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`a${i}_lembur`] || ""} onChange={(v) => set(`a${i}_lembur`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td colSpan={4} className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.aUang} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.aBarang} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.aLembur} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.B */}
      <div className="mt-8">
        <BlockHeader letter="V.B" title="Pendapatan dari Usaha Rumah Tangga Selama Setahun Terakhir" />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>#</Th><Th>Uraian Kegiatan Usaha</Th><Th>Kategori Lapangan Usaha</Th><Th>Jenis Pekerjaan</Th>
                <Th>Nilai Produksi</Th>
                <Th hint="Bahan Baku dan Penolong, Biaya Listrik, Transportasi, upah/gaji, dll">Biaya Produksi</Th>
                <Th>Surplus Usaha/Mixed Income</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: B_ROWS }, (_, idx) => idx + 1).map((i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-center font-mono text-xs text-ink/40">{i}</td>
                  <td className="px-2 py-1.5"><TextInput value={state[`b${i}_uraian`] || ""} onChange={(v) => set(`b${i}_uraian`, v)} placeholder="Uraian kegiatan usaha" /></td>
                  <td className="px-2 py-1.5"><TextInput value={state[`b${i}_kategori`] || ""} onChange={(v) => set(`b${i}_kategori`, v)} placeholder="Kategori usaha" /></td>
                  <td className="px-2 py-1.5"><TextInput value={state[`b${i}_jenis`] || ""} onChange={(v) => set(`b${i}_jenis`, v)} placeholder="Jenis pekerjaan" /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`b${i}_produksi`] || ""} onChange={(v) => set(`b${i}_produksi`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`b${i}_biaya`] || ""} onChange={(v) => set(`b${i}_biaya`, v)} /></td>
                  <td className="bg-line/40 px-2.5 py-1.5 text-right"><Money value={c.bRows[i - 1].surplus} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td colSpan={4} className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.bProduksi} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.bBiaya} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.bSurplus} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.C */}
      <div className="mt-8">
        <BlockHeader
          letter="V.C"
          title="Pendapatan dari Produksi Rumah Tangga yang Dikonsumsi Sendiri Selama Setahun Terakhir"
        />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Rincian</Th>
                <Th>Nilai Produksi</Th>
                <Th hint="Bahan Baku dan Penolong, Biaya Listrik, Transportasi, upah/gaji, dll">Biaya Produksi</Th>
                <Th>Surplus Usaha/Mixed Income</Th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "sewaRumah", label: "1. Perkiraan Sewa Rumah Milik Sendiri" },
                { key: "hasilLain", label: "2. Hasil Pertanian, Peternakan, Perikanan, Penggalian, Industri, dll" },
              ].map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-sm text-ink">{r.label}</td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`c_${r.key}_produksi`] || ""} onChange={(v) => set(`c_${r.key}_produksi`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`c_${r.key}_biaya`] || ""} onChange={(v) => set(`c_${r.key}_biaya`, v)} /></td>
                  <td className="bg-line/40 px-2.5 py-1.5 text-right"><Money value={c.cRows[`${r.key}_surplus`]} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah (Rincian 1 + 2)</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.cProduksi} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.cBiaya} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.cSurplus} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.D */}
      <div className="mt-8">
        <BlockHeader letter="V.D" title="Pendapatan Kepemilikan Selama Setahun Terakhir" />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-line">
              <tr><Th>Rincian</Th><Th>Diterima</Th><Th>Dibayar</Th></tr>
            </thead>
            <tbody>
              {D_ITEMS.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-sm text-ink">
                    {r.label}
                    {r.hint && <span className="block text-xs text-ink/50">{r.hint}</span>}
                  </td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`d_${r.key}_diterima`] || ""} onChange={(v) => set(`d_${r.key}_diterima`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`d_${r.key}_dibayar`] || ""} onChange={(v) => set(`d_${r.key}_dibayar`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah (Rincian 1 + 2 + 3 + 4)</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.dDiterima} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.dDibayar} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.E */}
      <div className="mt-8">
        <BlockHeader letter="V.E" title="Transfer Berjalan (Selain Aset) Selama Setahun Terakhir" />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Penerimaan</Th>
                <Th>Transfer Diterima &mdash; Uang</Th><Th>Transfer Diterima &mdash; Barang/Jasa</Th>
                <Th>Transfer Dibayar/Diberikan &mdash; Uang</Th><Th>Transfer Dibayar/Diberikan &mdash; Barang/Jasa</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-navy-50 border-b border-line">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">1. Pemerintah</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.ePemUang} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.ePemBarang} strong /></td>
                <td className="bg-gold-100 px-2.5 py-2 text-center text-xs text-gold-600">tidak berlaku</td>
                <td className="bg-gold-100 px-2.5 py-2 text-center text-xs text-gold-600">tidak berlaku</td>
              </tr>
              <tr className="border-b border-line">
                <td className="px-4 py-1.5 text-sm text-ink/70">a. Uang Pensiun</td>
                <td className="px-2 py-1.5"><MoneyInput value={state.e_pensiun_uang || ""} onChange={(v) => set("e_pensiun_uang", v)} /></td>
                <td className="px-2 py-1.5"><MoneyInput value={state.e_pensiun_barang || ""} onChange={(v) => set("e_pensiun_barang", v)} /></td>
                <td /><td />
              </tr>
              <tr className="border-b border-line">
                <td className="px-4 py-1.5 text-sm text-ink/70">
                  b. Bantuan Pemerintah
                  <span className="block text-xs text-ink/50">Premi BPJS PBI, BLT, PKH, BOS, dll</span>
                </td>
                <td className="px-2 py-1.5"><MoneyInput value={state.e_bantuan_uang || ""} onChange={(v) => set("e_bantuan_uang", v)} /></td>
                <td className="px-2 py-1.5"><MoneyInput value={state.e_bantuan_barang || ""} onChange={(v) => set("e_bantuan_barang", v)} /></td>
                <td /><td />
              </tr>
              {E_MAIN.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-sm text-ink">
                    {r.label}
                    {r.hint && <span className="block text-xs text-ink/50">{r.hint}</span>}
                  </td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`e_${r.key}_uangD`] || ""} onChange={(v) => set(`e_${r.key}_uangD`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`e_${r.key}_barangD`] || ""} onChange={(v) => set(`e_${r.key}_barangD`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`e_${r.key}_uangB`] || ""} onChange={(v) => set(`e_${r.key}_uangB`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`e_${r.key}_barangB`] || ""} onChange={(v) => set(`e_${r.key}_barangB`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah (Rincian 1 + 2 + 3 + 4 + 5)</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.eUangD} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.eBarangD} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.eUangB} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.eBarangB} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.F */}
      <div className="mt-8">
        <BlockHeader letter="V.F" title="Transfer Modal / Aset Selama Setahun Terakhir" />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Penerimaan</Th>
                <Th hint="Bangunan, Alat Produksi, Kendaraan, dll">Diterima</Th>
                <Th hint="Lahan/Tanah dan Barang Berharga">Diterima</Th>
                <Th hint="Bangunan, Alat Produksi, Kendaraan, dll">Dibayar</Th>
                <Th hint="Lahan/Tanah dan Barang Berharga">Dibayar</Th>
              </tr>
            </thead>
            <tbody>
              {F_ROWS.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-sm text-ink">{r.label}</td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`f_${r.key}_bangunanD`] || ""} onChange={(v) => set(`f_${r.key}_bangunanD`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`f_${r.key}_lahanD`] || ""} onChange={(v) => set(`f_${r.key}_lahanD`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`f_${r.key}_bangunanB`] || ""} onChange={(v) => set(`f_${r.key}_bangunanB`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`f_${r.key}_lahanB`] || ""} onChange={(v) => set(`f_${r.key}_lahanB`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah (Rincian 1 + 2 + 3 + 4 + 5)</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.fBangunanD} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.fLahanD} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.fBangunanB} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.fLahanB} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok V.G */}
      <div className="mt-8">
        <BlockHeader letter="V.G" title="Penambahan dan Pengurangan Aset Selama Setahun Terakhir" />
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th hint="Pembelian, Pemberian, Pembuatan Sendiri">Rincian</Th>
                <Th>Penambahan</Th><Th>Pengurangan</Th><Th>Netto</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-navy-50 border-b border-line">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">
                  1. Aset Tetap untuk Usaha Rumah Tangga (Rincian a + b + c + d + e)
                </td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gAsetUsahaTambah} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gAsetUsahaKurang} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gAsetUsahaNetto} strong /></td>
              </tr>
              {G_SUB.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-1.5 text-sm text-ink/70">
                    {r.label}
                    {r.hint && <span className="block text-xs text-ink/50">{r.hint}</span>}
                  </td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`g_${r.key}_tambah`] || ""} onChange={(v) => set(`g_${r.key}_tambah`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`g_${r.key}_kurang`] || ""} onChange={(v) => set(`g_${r.key}_kurang`, v)} /></td>
                  <td className="bg-line/40 px-2.5 py-1.5 text-right"><Money value={c.gSubNetto[r.key]} /></td>
                </tr>
              ))}
              {G_ROWS2.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-1.5 text-sm text-ink">
                    {r.label}
                    {r.hint && <span className="block text-xs text-ink/50">{r.hint}</span>}
                  </td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`g_${r.key}_tambah`] || ""} onChange={(v) => set(`g_${r.key}_tambah`, v)} /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={state[`g_${r.key}_kurang`] || ""} onChange={(v) => set(`g_${r.key}_kurang`, v)} /></td>
                  <td className="bg-line/40 px-2.5 py-1.5 text-right"><Money value={c.g2Netto[r.key]} /></td>
                </tr>
              ))}
              <tr className="bg-navy-50">
                <td className="px-2.5 py-2 text-sm font-semibold text-navy-900">Jumlah (Rincian 1 + 2 + 3 + 4)</td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gTambahTotal} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gKurangTotal} strong /></td>
                <td className="px-2.5 py-2 text-right"><Money value={c.gNettoTotal} strong /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Blok VI */}
      <div className="mt-8">
        <BlockHeader
          letter="VI"
          title="Rekapitulasi Penerimaan dan Pengeluaran Rumah Tangga Selama Setahun Terakhir"
        />
        <div className="grid overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-2">
          <div className="sm:border-r sm:border-line">
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Rincian Penerimaan
            </p>
            <RecapRow label="1. Upah dan Gaji" hint="Blok V.A Baris Jumlah Kolom (5)+(6)+(7)" value={<Money value={c.p1} />} />
            <RecapRow label="2. Pendapatan/Surplus dari Usaha Rumah Tangga" hint="Blok V.B Baris Jumlah Kolom (7)" value={<Money value={c.p2} />} />
            <RecapRow label="3. Pendapatan/Surplus dari Produksi RT yang Dikonsumsi Sendiri" hint="Blok V.C Baris Jumlah Kolom (4)" value={<Money value={c.p3} />} />
            <RecapRow label="4. Pendapatan Kepemilikan yang Diterima" hint="Blok V.D Baris Jumlah Kolom (2)" value={<Money value={c.p4} />} />
            <RecapRow label="5. Transfer Berjalan (selain aset) Diterima" hint="Blok V.E Baris Jumlah Kolom (2)+(3)" value={<Money value={c.p5} />} />
            <RecapRow label="6. Transfer Modal/Aset Diterima" hint="Blok V.F Baris Jumlah Kolom (2)+(3)" value={<Money value={c.p6} />} />
            <RecapRow label="Jumlah" value={<Money value={c.totalPenerimaanVI} strong />} total />
          </div>
          <div>
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Rincian Pengeluaran
            </p>
            <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-2">
              <span className="max-w-[55%] text-sm text-ink">
                1. Pengeluaran Konsumsi Rumah Tangga
                <span className="mt-0.5 block text-xs text-ink/50">Blok IV.3.3 Rincian 9 Kolom (3) dikali 12 &mdash; isi manual</span>
              </span>
              <div className="w-32"><MoneyInput value={state.vi_g1 || ""} onChange={(v) => set("vi_g1", v)} /></div>
            </div>
            <RecapRow label="2. Pendapatan Kepemilikan yang Dibayar" hint="Blok V.D Baris Jumlah Kolom (3)" value={<Money value={c.g2v} />} />
            <RecapRow label="3. Transfer Berjalan (selain Aset) Dibayar" hint="Blok V.E Baris Jumlah Kolom (4)+(5)" value={<Money value={c.g3v} />} />
            <RecapRow label="4. Transfer Modal/Aset Dibayar" hint="Blok V.F Baris Jumlah Kolom (4)+(5)" value={<Money value={c.g4v} />} />
            <RecapRow label="5. Total Aset Netto" hint="Blok V.G Rincian Jumlah Kolom (4)" value={<Money value={c.g5v} />} />
            <RecapRow label="Jumlah" value={<Money value={c.totalPengeluaranVI} strong />} total />
          </div>
        </div>
        <div className="rounded-b-lg border border-t-0 border-line bg-navy-50 px-3 py-2.5">
          <RecapRow label="Selisih Penerimaan dan Pengeluaran" hint="Jumlah Kolom (2) \u2212 Jumlah Kolom (4)" value={<Money value={c.selisihVI} strong />} />
        </div>
      </div>

      {/* Blok VII */}
      <div className="mt-8">
        <BlockHeader letter="VII" title="Transaksi Keuangan Rumah Tangga Selama Setahun Terakhir" />
        <div className="grid overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-2">
          <div className="sm:border-r sm:border-line">
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Rincian Penerimaan
            </p>
            <RecapRow label="1. Pengambilan Uang Tunai dan Tabungan" hint="dari tabel kontrol" value={<Money value={c.vii_p1} />} />
            {[
              { id: "vii_p2", label: "2. Meminjam Uang" },
              { id: "vii_p3", label: "3. Menerima Pembayaran Kredit Barang" },
              { id: "vii_p4", label: "4. Kredit Barang" },
              { id: "vii_p5", label: "5. Lainnya", hint: "Pengembalian Piutang, Menggadaikan Barang, Mendapat Arisan, Klaim Asuransi Jiwa/Pendidikan, dll" },
            ].map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2">
                <span className="max-w-[55%] text-sm text-ink">
                  {r.label}
                  {r.hint && <span className="mt-0.5 block text-xs text-ink/50">{r.hint}</span>}
                </span>
                <div className="w-32"><MoneyInput value={state[r.id] || ""} onChange={(v) => set(r.id, v)} /></div>
              </div>
            ))}
            <RecapRow label="Jumlah" value={<Money value={c.totalPenerimaanVII} strong />} total />
          </div>
          <div>
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Rincian Pengeluaran
            </p>
            <RecapRow label="1. Menyimpan Uang Tunai dan Menabung" hint="dari tabel kontrol" value={<Money value={c.vii_g1} />} />
            {[
              { id: "vii_g2", label: "2. Membayar Hutang" },
              { id: "vii_g3", label: "3. Memberikan Kredit Barang" },
              { id: "vii_g4", label: "4. Membayar Kredit Barang" },
              { id: "vii_g5", label: "5. Lainnya", hint: "Meminjamkan Uang, Menebus Barang Gadaian, Membayar Arisan, Premi Asuransi Jiwa/Pendidikan, dll" },
            ].map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2">
                <span className="max-w-[55%] text-sm text-ink">
                  {r.label}
                  {r.hint && <span className="mt-0.5 block text-xs text-ink/50">{r.hint}</span>}
                </span>
                <div className="w-32"><MoneyInput value={state[r.id] || ""} onChange={(v) => set(r.id, v)} /></div>
              </div>
            ))}
            <RecapRow label="Jumlah" value={<Money value={c.totalPengeluaranVII} strong />} total />
          </div>
        </div>
        <div className="rounded-b-lg border border-t-0 border-line bg-navy-50 px-3 py-2.5">
          <RecapRow label="Selisih Pengeluaran dan Penerimaan" hint="Jumlah Kolom (4) \u2212 Jumlah Kolom (2)" value={<Money value={c.selisihVII} strong />} />
        </div>

        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ${
            isBalanced ? "border-moss-500 bg-moss-100" : "border-rust-500 bg-rust-100"
          }`}
        >
          <p className={`max-w-xl text-sm ${isBalanced ? "text-moss-700" : "text-rust-700"}`}>
            <span className="font-semibold">Diskrepansi</span> membandingkan selisih
            Blok VI (penerimaan &minus; pengeluaran barang &amp; jasa) dengan selisih
            Blok VII (pengeluaran &minus; penerimaan keuangan). Idealnya bernilai 0.
          </p>
          <p className={`font-mono text-2xl font-bold ${isBalanced ? "text-moss-700" : "text-rust-700"}`}>
            {formatRp(c.diskrepansi)}
          </p>
        </div>
      </div>

      {/* Tabel kontrol */}
      <div className="mt-8">
        <BlockHeader letter="Kontrol" title="Kontrol Mengambil / Menyimpan Uang dan Tabungan" />
        <p className="mb-2 rounded-md border border-dashed border-line-strong bg-white px-3 py-2 text-xs text-ink/50">
          Tabel ini otomatis diturunkan dari blok-blok di atas untuk menghasilkan
          angka Blok VII rincian (1) &mdash; memisahkan arus tunai (&quot;Total 1&quot;) dari
          arus non-tunai (&quot;Total 2&quot;).
        </p>
        <div className="grid overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-2">
          <div className="sm:border-r sm:border-line">
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Kontrol Mengambil Uang dan Tabungan
            </p>
            <RecapRow label="Konsumsi" value={<Money value={c.c_e110} />} />
            <RecapRow label="Biaya Produksi" value={<Money value={c.c_e111} />} />
            <RecapRow label="Transfer Keluar" value={<Money value={c.c_e112} />} />
            <RecapRow label="Pendapatan Kepemilikan Dibayar" value={<Money value={c.c_e113} />} />
            <RecapRow label="Penambahan Aset" value={<Money value={c.c_e114} />} />
            <RecapRow label="Transaksi Keuangan Keluar" value={<Money value={c.c_e115} />} />
            <RecapRow label="Total 1" value={<Money value={c.total1_e} strong />} total />
            <RecapRow label="Upah Gaji dalam Bentuk Barang" value={<Money value={c.c_e117} />} />
            <RecapRow label="Nilai Produksi Digunakan Sendiri" value={<Money value={c.c_e118} />} />
            <RecapRow label="Transfer Masuk Barang/Jasa" value={<Money value={c.c_e119} />} />
            <RecapRow label="Transfer Masuk Modal" value={<Money value={c.c_e120} />} />
            <RecapRow label="Membeli Barang Kredit" value={<Money value={c.c_e121} />} />
            <RecapRow label="Total 2" value={<Money value={c.total2_e} strong />} total />
            <div className="bg-navy-50 px-3 py-2.5">
              <RecapRow label="Mengambil Uang dan Tabungan (Total 1 \u2212 Total 2)" value={<Money value={c.c_e123} strong />} />
            </div>
          </div>
          <div>
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-600">
              Kontrol Menyimpan Uang dan Menabung
            </p>
            <RecapRow label="Upah/Gaji Dalam Bentuk Uang" value={<Money value={c.c_h110} />} />
            <RecapRow label="Nilai Produksi Usaha" value={<Money value={c.c_h111} />} />
            <RecapRow label="Transfer Masuk Uang" value={<Money value={c.c_h112} />} />
            <RecapRow label="Pendapatan Kepemilikan Diterima" value={<Money value={c.c_h113} />} />
            <RecapRow label="Pengurangan Aset" value={<Money value={c.c_h114} />} />
            <RecapRow label="Transaksi Keuangan Diterima" value={<Money value={c.c_h115} />} />
            <RecapRow label="Total 1" value={<Money value={c.total1_h} strong />} total />
            <RecapRow label="Transfer Modal Keluar" value={<Money value={c.c_h117} />} />
            <RecapRow label="Total 2" value={<Money value={c.total2_h} strong />} total />
            <div className="bg-navy-50 px-3 py-2.5">
              <RecapRow label="Menyimpan Uang dan Menabung (Total 1 \u2212 Total 2)" value={<Money value={c.c_h123} strong />} />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink/40">
        Kalkulator ini meniru struktur dan rumus formulir kuesioner Blok V&ndash;VII
        (Pendapatan, Rekapitulasi, Transaksi Keuangan Rumah Tangga) yang biasa
        digunakan pada survei neraca rumah tangga BPS. Angka disimpan hanya di
        peramban perangkat ini.
      </p>
    </div>
  );
}
