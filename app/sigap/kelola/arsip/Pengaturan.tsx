"use client";

// app/sigap/kelola/arsip/Pengaturan.tsx
//
// (7 Nov 2026) Tab Pengaturan menu Arsip:
//   Kode unit kerja, nomor terakhir per register (hanya boleh naik), pola nomor per jenis dokumen, kode klasifikasi arsip (KKA), kode arsip per kegiatan.
// Pola baru hanya berlaku untuk nomor berikutnya; nomor yang sudah terbit tidak berubah.

import { useEffect, useMemo, useState } from "react";
import { pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { contohNomor, KATEGORI, periksaFormat, TOKEN_FORMAT } from "@/lib/arsip/nomor";
import { aksiA, ambilA, type DataPengaturan, type DataRingkas, type JenisArsip, type KodeArsip } from "./api";

const LABEL = "flex flex-col gap-0.5 text-[12px] font-bold text-[#5B6B84]";

export default function Pengaturan({ peng, tahun, onUbah }: { peng: DataPengaturan; tahun: number; onUbah: () => void }) {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const kabar = {
    ok: (teks: string) => setPesan({ jenis: "ok", teks }),
    galat: (e: unknown) => { if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) }); },
  };
  return (
    <>
      {pesan && <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>}
      <Pesan jenis="info">
        Dasar penomoran: Peraturan BPS 1/2023 tentang Pedoman Tata Naskah Dinas (Pasal 63-65). Pola dan kode di bawah dapat diubah bila ada ketentuan baru; perubahan hanya berlaku untuk nomor berikutnya.
      </Pesan>
      <KartuUnit peng={peng} kabar={kabar} onUbah={onUbah} />
      <KartuCounter peng={peng} tahun={tahun} kabar={kabar} onUbah={onUbah} />
      <KartuJenis peng={peng} kabar={kabar} onUbah={onUbah} />
      <KartuKode peng={peng} kabar={kabar} onUbah={onUbah} />
      <KartuKegiatan peng={peng} kabar={kabar} onUbah={onUbah} />
    </>
  );
}

type Kabar = { ok: (t: string) => void; galat: (e: unknown) => void };
type P = { peng: DataPengaturan; kabar: Kabar; onUbah: () => void };

// ---------------------------------------------------------------------------- kode unit
function KartuUnit({ peng, kabar, onUbah }: P) {
  const [unit, setUnit] = useState(peng.unit);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => setUnit(peng.unit), [peng.unit]);
  async function simpan() {
    setSibuk(true);
    try { await aksiA("simpan_unit", { unit: unit.trim() }); kabar.ok("Kode unit kerja disimpan."); onUbah(); } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }
  return (
    <Kartu judul="Kode unit kerja" ket="Bagian nomor surat setelah nomor urut (BPS Kabupaten Solok: 13030).">
      <div className="flex flex-wrap items-end gap-2">
        <label className={LABEL}>Kode unit<input className={`${INPUT} w-32 font-mono`} inputMode="numeric" value={unit} maxLength={6} onChange={(e) => setUnit(e.target.value.replace(/\D/g, ""))} /></label>
        <button type="button" className={BTN} disabled={sibuk || unit === peng.unit || unit.length < 4} onClick={() => void simpan()}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Kartu>
  );
}

// ---------------------------------------------------------------------------- nomor terakhir
function KartuCounter({ peng, tahun, kabar, onUbah }: P & { tahun: number }) {
  const [counter, setCounter] = useState<Record<string, number> | null>(null);
  const [isi, setIsi] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [versi, setVersi] = useState(0);
  useEffect(() => {
    let batal = false;
    setCounter(null);
    ambilA<DataRingkas>({ bagian: "ringkas", tahun })
      .then((r) => { if (!batal) { setCounter(Object.fromEntries(r.counter.filter((c) => c.tahun === tahun).map((c) => [c.register, c.terakhir]))); setIsi({}); } })
      .catch((e) => { if (!batal) kabar.galat(e); });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun, versi]);

  async function simpan(register: string) {
    setSibuk(register);
    try {
      const r = await aksiA<{ sebelumnya: number }>("atur_awal", { register, tahun, terakhir: Number(isi[register]) });
      kabar.ok(`Nomor terakhir ${register} tahun ${tahun} diubah dari ${r.sebelumnya} menjadi ${isi[register]}. Nomor berikutnya: ${Number(isi[register]) + 1}.`);
      setVersi((v) => v + 1);
      onUbah();
    } catch (e) { kabar.galat(e); } finally { setSibuk(null); }
  }

  return (
    <Kartu judul={`Nomor terakhir per register, tahun ${tahun}`} ket="Nomor berikutnya = nomor terakhir + 1. Angka hanya boleh dinaikkan (mis. setelah mencatat surat yang terbit di luar SIGAP). Tahun mengikuti pilihan di tab Buku nomor.">
      {!counter ? <Memuat /> : (
        <TabelKartu>
          <thead><tr><th className={TH}>Register</th><th className={TH}>Nomor terakhir</th><th className={TH}>Ubah menjadi</th><th className={TH} /></tr></thead>
          <tbody>
            {peng.register.map((r) => {
              const sekarang = counter[r.kode] ?? 0;
              const baru = Number(isi[r.kode]);
              const sah = isi[r.kode] !== undefined && isi[r.kode] !== "" && Number.isInteger(baru) && baru > sekarang;
              return (
                <tr key={r.kode}>
                  <td className={TD}><span className="font-semibold">{r.nama}</span>{r.catatan ? <span className="block text-[11.5px] text-[#5B6B84]">{r.catatan}</span> : null}</td>
                  <td className={`${TD} font-mono`}>{sekarang}</td>
                  <td className={TD}><input aria-label={`Nomor terakhir baru untuk ${r.nama}`} inputMode="numeric" className={`${INPUT} w-28 font-mono`} value={isi[r.kode] ?? ""} onChange={(e) => setIsi({ ...isi, [r.kode]: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></td>
                  <td className={TD}><button type="button" className={BTN_O} disabled={!sah || sibuk === r.kode} onClick={() => void simpan(r.kode)}>{sibuk === r.kode ? "Menyimpan…" : "Naikkan"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </TabelKartu>
      )}
    </Kartu>
  );
}

// ---------------------------------------------------------------------------- jenis dokumen
function KartuJenis({ peng, kabar, onUbah }: P) {
  const [baru, setBaru] = useState(false);
  return (
    <Kartu judul="Jenis dokumen dan pola nomor" ket="Token: {keamanan} {urut} {urut3} {urut4} {unit} {kka} {tahun}. Pola wajib memuat {urut} dan {tahun}." kanan={<button type="button" className={BTN_O} onClick={() => setBaru((b) => !b)}>{baru ? "Tutup" : "Tambah jenis"}</button>}>
      {baru && <FormJenisBaru peng={peng} kabar={kabar} onUbah={() => { setBaru(false); onUbah(); }} />}
      <div className="flex flex-col gap-3">
        {peng.jenis.map((j) => <BarisJenis key={j.kode} j={j} peng={peng} kabar={kabar} onUbah={onUbah} />)}
      </div>
    </Kartu>
  );
}

function BarisJenis({ j, peng, kabar, onUbah }: { j: JenisArsip } & P) {
  const [format, setFormat] = useState(j.format);
  const [register, setRegister] = useState(j.register);
  const [kka, setKka] = useState(j.kka_bawaan ?? "");
  const [keamanan, setKeamanan] = useState(j.keamanan);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => { setFormat(j.format); setRegister(j.register); setKka(j.kka_bawaan ?? ""); setKeamanan(j.keamanan); }, [j]);
  const galatFormat = periksaFormat(format);
  const ubah = format.trim() !== j.format || register !== j.register || kka !== (j.kka_bawaan ?? "") || keamanan !== j.keamanan;
  const contoh = !galatFormat ? contohNomor(format.trim(), keamanan, peng.unit, kka || null, 123, 2026) : null;

  async function simpan(isi: Record<string, unknown>, teks: string) {
    setSibuk(true);
    try { await aksiA("simpan_jenis", { kode: j.kode, ...isi }); kabar.ok(teks); onUbah(); } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }

  return (
    <div className={`rounded-lg border border-[#DDE6F3] p-3 ${j.aktif ? "" : "bg-[#F5F8FE] opacity-75"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold text-[#1B2B4B]">{j.nama}</span>
        <Chip w="mut">{j.kode}</Chip>
        <Chip w="navy">{KATEGORI[j.kategori]?.nama.split(" (")[0] ?? j.kategori}</Chip>
        {!j.aktif && <Chip w="wait">Nonaktif</Chip>}
        <span className="flex-1" />
        <button type="button" className={BTN_O} disabled={sibuk} onClick={() => void simpan({ aktif: !j.aktif }, j.aktif ? `${j.nama} dinonaktifkan.` : `${j.nama} diaktifkan.`)}>{j.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${LABEL} sm:col-span-2`}>Pola nomor
          <input className={`${INPUT} font-mono`} value={format} maxLength={120} onChange={(e) => setFormat(e.target.value)} />
        </label>
        <label className={LABEL}>Register (urutan nomor)
          <select className={INPUT} value={register} onChange={(e) => setRegister(e.target.value)}>{peng.register.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}</select>
        </label>
        <label className={LABEL}>Kode arsip bawaan
          <select className={INPUT} value={kka} onChange={(e) => setKka(e.target.value)}>
            <option value="">Tanpa bawaan</option>
            {peng.kode.filter((k) => k.aktif || k.kode === kka).map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
          </select>
        </label>
        <label className={LABEL}>Derajat keamanan
          <input className={`${INPUT} w-20 font-mono`} value={keamanan} maxLength={2} onChange={(e) => setKeamanan(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
        </label>
      </div>
      <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">
        {galatFormat ? <span className="font-semibold text-[#B42329]">{galatFormat}</span> : <>Contoh nomor ke-123 tahun 2026: <span className="font-mono font-semibold text-[#1B2B4B]">{contoh}</span></>}
        {j.dasar ? <> · {j.dasar}</> : null}
      </p>
      {ubah && (
        <div className="mt-2 flex gap-2">
          <button type="button" className={BTN} disabled={sibuk || !!galatFormat || keamanan.length < 1} onClick={() => void simpan({ format: format.trim(), register, kka_bawaan: kka || null, keamanan }, `Pengaturan ${j.nama} disimpan. Berlaku untuk nomor berikutnya.`)}>{sibuk ? "Menyimpan…" : "Simpan perubahan"}</button>
          <button type="button" className={BTN_O} onClick={() => { setFormat(j.format); setRegister(j.register); setKka(j.kka_bawaan ?? ""); setKeamanan(j.keamanan); }}>Kembalikan</button>
        </div>
      )}
    </div>
  );
}

function FormJenisBaru({ peng, kabar, onUbah }: P) {
  const kategori = Object.keys(KATEGORI) as (keyof typeof KATEGORI)[];
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [kat, setKat] = useState<keyof typeof KATEGORI>("korespondensi_eksternal");
  const [format, setFormat] = useState(KATEGORI.korespondensi_eksternal.formatBawaan);
  const [register, setRegister] = useState(peng.register[0]?.kode ?? "");
  const [kka, setKka] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const galatFormat = periksaFormat(format);
  const siap = /^[a-z][a-z0-9_]{1,30}$/.test(kode) && nama.trim().length >= 3 && !galatFormat && !!register;
  async function simpan() {
    setSibuk(true);
    try {
      await aksiA("simpan_jenis", { baru: true, kode, nama: nama.trim(), kategori: kat, format: format.trim(), register, keamanan: "B", kka_bawaan: kka || null });
      kabar.ok(`Jenis dokumen ${nama.trim()} ditambahkan.`);
      onUbah();
    } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }
  return (
    <div className="mb-3 rounded-lg border border-dashed border-[#1F5FD1] bg-[#F5F8FE] p-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className={LABEL}>Kode (huruf kecil)<input className={`${INPUT} font-mono`} value={kode} maxLength={31} placeholder="nota_dinas" onChange={(e) => setKode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></label>
        <label className={LABEL}>Nama<input className={INPUT} value={nama} maxLength={120} onChange={(e) => setNama(e.target.value)} /></label>
        <label className={LABEL}>Kategori (Peraturan BPS 1/2023)
          <select className={INPUT} value={kat} onChange={(e) => { const k = e.target.value as keyof typeof KATEGORI; setKat(k); setFormat(KATEGORI[k].formatBawaan); }}>
            {kategori.map((k) => <option key={k} value={k}>{KATEGORI[k].nama}</option>)}
          </select>
        </label>
        <label className={`${LABEL} lg:col-span-2`}>Pola nomor<input className={`${INPUT} font-mono`} value={format} onChange={(e) => setFormat(e.target.value)} /></label>
        <label className={LABEL}>Register
          <select className={INPUT} value={register} onChange={(e) => setRegister(e.target.value)}>{peng.register.map((r) => <option key={r.kode} value={r.kode}>{r.nama}</option>)}</select>
        </label>
        <label className={LABEL}>Kode arsip bawaan
          <select className={INPUT} value={kka} onChange={(e) => setKka(e.target.value)}><option value="">Tanpa bawaan</option>{peng.kode.filter((k) => k.aktif).map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}</select>
        </label>
      </div>
      <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">Token tersedia: {TOKEN_FORMAT.join(" ")}. {galatFormat ? <span className="font-semibold text-[#B42329]">{galatFormat}</span> : null}</p>
      <div className="mt-2"><button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void simpan()}>{sibuk ? "Menyimpan…" : "Tambahkan"}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------- kode arsip
const KOSONG: KodeArsip = { kode: "", nama: "", kelompok: "substantif", catatan: null, aktif: true, diverifikasi: false };

function KartuKode({ peng, kabar, onUbah }: P) {
  const [ubah, setUbah] = useState<KodeArsip | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [cari, setCari] = useState("");
  const daftar = useMemo(() => peng.kode.filter((k) => !cari || `${k.kode} ${k.nama}`.toLowerCase().includes(cari.toLowerCase())), [peng.kode, cari]);
  const belum = peng.kode.filter((k) => !k.diverifikasi).length;

  async function simpan(k: KodeArsip, teks: string) {
    setSibuk(true);
    try { await aksiA("simpan_kode", { ...k }); kabar.ok(teks); setUbah(null); onUbah(); } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }

  return (
    <Kartu judul="Kode klasifikasi arsip (KKA)" ket="Daftar kode yang boleh dipilih di nomor surat. Tandai Terverifikasi setelah dicocokkan dengan tabel resmi klasifikasi arsip BPS." kanan={<button type="button" className={BTN_O} onClick={() => setUbah({ ...KOSONG })}>Tambah kode</button>}>
      {belum > 0 && <div className="mb-3"><Pesan jenis="peringatan">{belum} kode belum ditandai terverifikasi. Arti kode bawaan (VS.330, SS.330, VS.230) diambil dari pola nomor lama dan belum dicocokkan dengan tabel resmi; mohon cek lalu tandai.</Pesan></div>}
      {ubah && (
        <div className="mb-3 rounded-lg border border-dashed border-[#1F5FD1] bg-[#F5F8FE] p-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className={LABEL}>Kode<input className={`${INPUT} font-mono`} value={ubah.kode} disabled={peng.kode.some((k) => k.kode === ubah.kode) && !!ubah.nama} maxLength={12} placeholder="VS.330" onChange={(e) => setUbah({ ...ubah, kode: e.target.value.toUpperCase() })} /></label>
            <label className={`${LABEL} lg:col-span-2`}>Nama / uraian<input className={INPUT} value={ubah.nama} maxLength={200} onChange={(e) => setUbah({ ...ubah, nama: e.target.value })} /></label>
            <label className={LABEL}>Kelompok<select className={INPUT} value={ubah.kelompok} onChange={(e) => setUbah({ ...ubah, kelompok: e.target.value })}><option value="substantif">Substantif</option><option value="fasilitatif">Fasilitatif</option></select></label>
            <label className={`${LABEL} lg:col-span-2`}>Catatan<input className={INPUT} value={ubah.catatan ?? ""} maxLength={300} onChange={(e) => setUbah({ ...ubah, catatan: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1B2B4B]"><input type="checkbox" checked={ubah.diverifikasi} onChange={(e) => setUbah({ ...ubah, diverifikasi: e.target.checked })} /> Terverifikasi dengan tabel resmi</label>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1B2B4B]"><input type="checkbox" checked={ubah.aktif} onChange={(e) => setUbah({ ...ubah, aktif: e.target.checked })} /> Aktif (muncul di pilihan)</label>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN} disabled={sibuk || ubah.kode.length < 6 || ubah.nama.trim().length < 3} onClick={() => void simpan(ubah, `Kode ${ubah.kode} disimpan.`)}>{sibuk ? "Menyimpan…" : "Simpan kode"}</button>
            <button type="button" className={BTN_O} onClick={() => setUbah(null)}>Batal</button>
          </div>
        </div>
      )}
      <input aria-label="Cari kode arsip" className={`${INPUT} mb-2 w-full max-w-sm`} placeholder="Cari kode atau nama" value={cari} onChange={(e) => setCari(e.target.value)} />
      <TabelKartu>
        <thead><tr><th className={TH}>Kode</th><th className={TH}>Uraian</th><th className={TH}>Kelompok</th><th className={TH}>Status</th><th className={TH} /></tr></thead>
        <tbody>
          {daftar.map((k) => (
            <tr key={k.kode} className={k.aktif ? undefined : "opacity-60"}>
              <td className={`${TD} whitespace-nowrap font-mono font-semibold`}>{k.kode}</td>
              <td className={TD}>{k.nama}{k.catatan ? <span className="block text-[11.5px] text-[#5B6B84]">{k.catatan}</span> : null}</td>
              <td className={TD}>{k.kelompok === "fasilitatif" ? "Fasilitatif" : "Substantif"}</td>
              <td className={TD}><span className="flex flex-wrap gap-1">{k.diverifikasi ? <Chip w="ok">Terverifikasi</Chip> : <Chip w="wait">Belum diverifikasi</Chip>}{!k.aktif && <Chip w="mut">Nonaktif</Chip>}</span></td>
              <td className={TD}><button type="button" className={BTN_O} onClick={() => setUbah({ ...k })}>Ubah</button></td>
            </tr>
          ))}
          {daftar.length === 0 && <tr><td className={TD} colSpan={5}>Tidak ada kode yang cocok.</td></tr>}
        </tbody>
      </TabelKartu>
    </Kartu>
  );
}

// ---------------------------------------------------------------------------- kode arsip per kegiatan
function KartuKegiatan({ peng, kabar, onUbah }: P) {
  const [keg, setKeg] = useState("");
  const [kka, setKka] = useState("");
  const [sibuk, setSibuk] = useState(false);
  async function simpan(kegiatanId: number, kode: string | null, teks: string) {
    setSibuk(true);
    try { await aksiA("simpan_kka_kegiatan", { kegiatan_id: kegiatanId, kka: kode }); kabar.ok(teks); setKeg(""); setKka(""); onUbah(); } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }
  return (
    <Kartu judul="Kode arsip per kegiatan" ket="Surat tugas dan dokumen kegiatan memakai kode ini lebih dulu; bila kosong dipakai kode bawaan jenis dokumen.">
      {peng.kegiatan.length > 0 && (
        <div className="mb-3">
          <TabelKartu>
            <thead><tr><th className={TH}>Kegiatan</th><th className={TH}>Kode arsip</th><th className={TH} /></tr></thead>
            <tbody>
              {peng.kegiatan.map((k) => (
                <tr key={k.kegiatan_id}>
                  <td className={TD}>{k.nama}</td>
                  <td className={`${TD} font-mono font-semibold`}>{k.kka}</td>
                  <td className={TD}><button type="button" className={BTN_O} disabled={sibuk} onClick={() => void simpan(k.kegiatan_id, null, `Kode arsip kegiatan ${k.nama} dihapus.`)}>Hapus</button></td>
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${LABEL} min-w-[220px] flex-1`}>Kegiatan
          <select className={INPUT} value={keg} onChange={(e) => setKeg(e.target.value)}>
            <option value="">Pilih kegiatan…</option>
            {peng.kegiatan_semua.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
        <label className={`${LABEL} min-w-[220px] flex-1`}>Kode arsip
          <select className={INPUT} value={kka} onChange={(e) => setKka(e.target.value)}>
            <option value="">Pilih kode…</option>
            {peng.kode.filter((k) => k.aktif).map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.nama}</option>)}
          </select>
        </label>
        <button type="button" className={BTN} disabled={!keg || !kka || sibuk} onClick={() => void simpan(Number(keg), kka, "Kode arsip kegiatan disimpan.")}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Kartu>
  );
}
