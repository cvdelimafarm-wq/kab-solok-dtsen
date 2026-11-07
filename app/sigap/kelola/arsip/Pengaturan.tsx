"use client";

// app/sigap/kelola/arsip/Pengaturan.tsx
//
// (7 Nov 2026) Tab Pengaturan menu Arsip:
//   Kode unit kerja, nomor terakhir per register (hanya boleh naik), pola nomor per jenis dokumen, kode klasifikasi arsip (KKA) menurut Perka BPS 99/2018.
// Kode arsip berlaku untuk semua kegiatan (dipilih menurut isi surat); tidak ada pengaturan kode per kegiatan.
// Pola baru hanya berlaku untuk nomor berikutnya; nomor yang sudah terbit tidak berubah.

import { useEffect, useMemo, useState } from "react";
import { pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { contohNomor, KATEGORI, periksaFormat, TOKEN_FORMAT } from "@/lib/arsip/nomor";
import PilihKodeArsip, { kodeTerpilihSah } from "../../arsip/PilihKodeArsip";
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
        Dasar penomoran: Peraturan BPS 1/2023 tentang Pedoman Tata Naskah Dinas (Pasal 63-65) dan kode klasifikasi arsip menurut Perka BPS 99/2018. Pola nomor dapat diubah bila ada ketentuan baru; perubahan hanya berlaku untuk nomor berikutnya.
      </Pesan>
      <KartuUnit peng={peng} kabar={kabar} onUbah={onUbah} />
      <KartuCounter peng={peng} tahun={tahun} kabar={kabar} onUbah={onUbah} />
      <KartuJenis peng={peng} kabar={kabar} onUbah={onUbah} />
      <KartuKode peng={peng} kabar={kabar} onUbah={onUbah} />
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
        <div className="sm:col-span-2 lg:col-span-4">
          <PilihKodeArsip kode={peng.kode.filter((k) => k.aktif || k.kode === kka)} fungsi={peng.fungsi} sering={peng.sering} nilai={kka} onUbah={setKka} label="Kode arsip bawaan (kosongkan bila kode dipilih tiap surat)" />
        </div>
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
          <button type="button" className={BTN} disabled={sibuk || !!galatFormat || keamanan.length < 1 || !kodeTerpilihSah(peng.kode, kka)} onClick={() => void simpan({ format: format.trim(), register, kka_bawaan: kka.trim().toUpperCase() || null, keamanan }, `Pengaturan ${j.nama} disimpan. Berlaku untuk nomor berikutnya.`)}>{sibuk ? "Menyimpan…" : "Simpan perubahan"}</button>
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
  const siap = /^[a-z][a-z0-9_]{1,30}$/.test(kode) && nama.trim().length >= 3 && !galatFormat && !!register && kodeTerpilihSah(peng.kode, kka);
  async function simpan() {
    setSibuk(true);
    try {
      await aksiA("simpan_jenis", { baru: true, kode, nama: nama.trim(), kategori: kat, format: format.trim(), register, keamanan: "B", kka_bawaan: kka.trim().toUpperCase() || null });
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
        <div className="sm:col-span-2 lg:col-span-3">
          <PilihKodeArsip kode={peng.kode.filter((k) => k.aktif)} fungsi={peng.fungsi} sering={peng.sering} nilai={kka} onUbah={setKka} label="Kode arsip bawaan (kosongkan bila kode dipilih tiap surat)" />
        </div>
      </div>
      <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">Token tersedia: {TOKEN_FORMAT.join(" ")}. {galatFormat ? <span className="font-semibold text-[#B42329]">{galatFormat}</span> : null}</p>
      <div className="mt-2"><button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void simpan()}>{sibuk ? "Menyimpan…" : "Tambahkan"}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------- kode arsip
const KOSONG: KodeArsip = { kode: "", nama: "", kelompok: "substantif", catatan: null, aktif: true, diverifikasi: false, fungsi: null, induk: null, tingkat: null, sumber: "tambahan" };
const BATAS_TAMPIL = 150;

function KartuKode({ peng, kabar, onUbah }: P) {
  const [ubah, setUbah] = useState<KodeArsip | null>(null);
  const [baru, setBaru] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [cari, setCari] = useState("");
  const [fungsi, setFungsi] = useState("");
  const daftarSemua = useMemo(() => peng.kode.filter((k) => (!fungsi || k.fungsi === fungsi) && (!cari || `${k.kode} ${k.nama}`.toLowerCase().includes(cari.toLowerCase()))), [peng.kode, cari, fungsi]);
  const daftar = daftarSemua.slice(0, BATAS_TAMPIL);
  const resmi = ubah?.sumber === "perka99";
  const namaFungsi = useMemo(() => new Map(peng.fungsi.map((f) => [f.kode, f.nama])), [peng.fungsi]);

  async function simpan(k: KodeArsip, teks: string) {
    setSibuk(true);
    try { await aksiA("simpan_kode", { kode: k.kode, nama: k.nama, kelompok: k.kelompok, catatan: k.catatan, aktif: k.aktif }); kabar.ok(teks); setUbah(null); setBaru(false); onUbah(); } catch (e) { kabar.galat(e); } finally { setSibuk(false); }
  }

  return (
    <Kartu judul="Kode klasifikasi arsip (Perka BPS 99/2018)" ket="Daftar resmi dari Lampiran Perka BPS 99/2018. Kode berlaku untuk semua kegiatan dan dipilih menurut isi surat. Uraian kode resmi tidak dapat diubah; boleh dinonaktifkan. Kode tambahan hanya untuk kebutuhan yang tidak ada di Perka." kanan={<button type="button" className={BTN_O} onClick={() => { setBaru(true); setUbah({ ...KOSONG }); }}>Tambah kode kantor</button>}>
      {ubah && (
        <div className="mb-3 rounded-lg border border-dashed border-[#1F5FD1] bg-[#F5F8FE] p-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className={LABEL}>Kode<input className={`${INPUT} font-mono`} value={ubah.kode} disabled={!baru} maxLength={12} placeholder="VS.330" onChange={(e) => setUbah({ ...ubah, kode: e.target.value.toUpperCase() })} /></label>
            <label className={`${LABEL} lg:col-span-2`}>Nama / uraian<input className={INPUT} value={ubah.nama} maxLength={200} disabled={resmi} onChange={(e) => setUbah({ ...ubah, nama: e.target.value })} /></label>
            <label className={LABEL}>Kelompok<select className={INPUT} value={ubah.kelompok} disabled={resmi} onChange={(e) => setUbah({ ...ubah, kelompok: e.target.value })}><option value="substantif">Substantif</option><option value="fasilitatif">Fasilitatif</option></select></label>
            {!resmi && <label className={`${LABEL} lg:col-span-2`}>Catatan<input className={INPUT} value={ubah.catatan ?? ""} maxLength={300} onChange={(e) => setUbah({ ...ubah, catatan: e.target.value })} /></label>}
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1B2B4B]"><input type="checkbox" checked={ubah.aktif} onChange={(e) => setUbah({ ...ubah, aktif: e.target.checked })} /> Aktif (muncul di pilihan)</label>
          </div>
          {baru && <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">Dua huruf awal harus bidang resmi Perka (mis. VS, KU, KP). Kode tambahan ditandai &quot;Tambahan kantor&quot;.</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN} disabled={sibuk || ubah.kode.length < 6 || ubah.nama.trim().length < 3} onClick={() => void simpan(ubah, `Kode ${ubah.kode} disimpan.`)}>{sibuk ? "Menyimpan…" : "Simpan kode"}</button>
            <button type="button" className={BTN_O} onClick={() => { setUbah(null); setBaru(false); }}>Batal</button>
          </div>
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        <input aria-label="Cari kode arsip" className={`${INPUT} w-full max-w-sm`} placeholder="Cari kode atau uraian" value={cari} onChange={(e) => setCari(e.target.value)} />
        <select aria-label="Bidang" className={INPUT} value={fungsi} onChange={(e) => setFungsi(e.target.value)}>
          <option value="">Semua bidang</option>
          {peng.fungsi.map((f) => <option key={f.kode} value={f.kode}>{f.kode} · {f.nama.length > 60 ? `${f.nama.slice(0, 60)}…` : f.nama}</option>)}
        </select>
      </div>
      <TabelKartu>
        <thead><tr><th className={TH}>Kode</th><th className={TH}>Uraian</th><th className={TH}>Bidang</th><th className={TH}>Status</th><th className={TH} /></tr></thead>
        <tbody>
          {daftar.map((k) => (
            <tr key={k.kode} className={k.aktif ? undefined : "opacity-60"}>
              <td className={`${TD} whitespace-nowrap font-mono font-semibold`}>{k.kode}</td>
              <td className={TD}>{k.nama}{k.catatan ? <span className="block text-[11.5px] text-[#5B6B84]">{k.catatan}</span> : null}</td>
              <td className={TD}>{k.fungsi ? namaFungsi.get(k.fungsi) ?? k.fungsi : "-"}</td>
              <td className={TD}><span className="flex flex-wrap gap-1">{k.sumber === "perka99" ? <Chip w="ok">Perka 99/2018</Chip> : <Chip w="wait">Tambahan kantor</Chip>}{!k.aktif && <Chip w="mut">Nonaktif</Chip>}</span></td>
              <td className={TD}><button type="button" className={BTN_O} onClick={() => { setBaru(false); setUbah({ ...k }); }}>{k.sumber === "perka99" ? (k.aktif ? "Nonaktifkan" : "Aktifkan") : "Ubah"}</button></td>
            </tr>
          ))}
          {daftar.length === 0 && <tr><td className={TD} colSpan={5}>Tidak ada kode yang cocok.</td></tr>}
        </tbody>
      </TabelKartu>
      {daftarSemua.length > BATAS_TAMPIL && <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">Menampilkan {BATAS_TAMPIL} dari {daftarSemua.length} kode. Persempit dengan pencarian atau bidang.</p>}
    </Kartu>
  );
}
