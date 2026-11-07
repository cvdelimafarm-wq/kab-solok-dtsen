"use client";

// app/sigap/kelola/arsip/Ambil.tsx
//
// (7 Nov 2026) Tab "Ambil / catat nomor" menu Arsip.
//   1. Ambil nomor baru dari sistem untuk surat yang dibuat di luar SIGAP (mis. surat dinas, SPK, BAST).
//   2. Catat nomor yang SUDAH terbit di luar SIGAP supaya nomor berikutnya tidak bentrok (counter hanya naik).
//   3. Nomor dokumen pengadaan barang/jasa satu paket (kartu PaketPbj).
// Surat tugas translok dan dokumen lanjutan identifikasi tidak lewat sini: nomornya diambil dari halamannya masing-masing.
// Kode arsip mengikuti Perka BPS 99/2018 dan dipilih menurut isi surat, bukan menurut kegiatan (kolom Kegiatan hanya penanda).

import { useMemo, useState } from "react";
import { pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, INPUT, Kartu, Pesan } from "../../admin/ui";
import { contohNomor, kkaSah, perluKka, tahunDariTanggal, uraiNomor } from "@/lib/arsip/nomor";
import PilihKodeArsip from "../../arsip/PilihKodeArsip";
import { aksiA, hariIniWib, type DataPengaturan } from "./api";
import PaketPbj from "./PaketPbj";

const LABEL = "flex flex-col gap-0.5 text-[12px] font-bold text-[#5B6B84]";

export default function Ambil({ peng, onUbah }: { peng: DataPengaturan; onUbah: () => void }) {
  const jenisAktif = useMemo(() => peng.jenis.filter((j) => j.aktif), [peng]);
  const kodeAktif = useMemo(() => peng.kode.filter((k) => k.aktif), [peng]);
  return (
    <>
      <Pesan jenis="info">
        Surat tugas translok diambil dari halaman Penugasan, dan undangan/pengantar/surat tugas identifikasi lanjutan dari halaman dokumennya. Tab ini untuk surat lain (surat dinas, SPK, BAST, dan sebagainya), nomor dokumen pengadaan barang/jasa, serta untuk mencatat nomor yang sudah terbit di luar SIGAP.
        Kode arsip dipilih menurut isi surat (Perka BPS 99/2018), berlaku untuk semua kegiatan.
      </Pesan>
      <PaketPbj onUbah={onUbah} />
      <FormAmbil peng={peng} jenisAktif={jenisAktif} kodeAktif={kodeAktif} onUbah={onUbah} />
      <FormLuar peng={peng} jenisAktif={jenisAktif} kodeAktif={kodeAktif} onUbah={onUbah} />
    </>
  );
}

type Prop = { peng: DataPengaturan; jenisAktif: DataPengaturan["jenis"]; kodeAktif: DataPengaturan["kode"]; onUbah: () => void };

function PilihKka({ nilai, onUbah, peng, kode, bawaan, wajib }: { nilai: string; onUbah: (v: string) => void; peng: DataPengaturan; kode: DataPengaturan["kode"]; bawaan: string | null; wajib: boolean }) {
  return <PilihKodeArsip kode={kode} fungsi={peng.fungsi} sering={peng.sering} nilai={nilai} onUbah={onUbah} bawaan={bawaan} wajib={wajib} />;
}

function FormAmbil({ peng, jenisAktif, kodeAktif, onUbah }: Prop) {
  const [jenis, setJenis] = useState("");
  const [kka, setKka] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [perihal, setPerihal] = useState("");
  const [kegiatan, setKegiatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ nomor: string; perihal: string } | null>(null);
  const [tersalin, setTersalin] = useState(false);

  const j = jenisAktif.find((x) => x.kode === jenis) ?? null;
  const pakaiKka = !!j && perluKka(j.format);
  const kkaEfektif = kka.trim().toUpperCase() || j?.kka_bawaan || null;
  const kkaSahPilih = !kkaEfektif || kodeAktif.some((k) => k.kode === kkaEfektif);
  const tahun = tahunDariTanggal(tanggal);
  const siap = !!j && !!tahun && perihal.trim().length >= 3 && (!pakaiKka || (!!kkaEfektif && kkaSahPilih));
  const pratinjau = j && tahun ? contohNomor(j.format.split("{urut}").join("NNN").split("{urut3}").join("NNN").split("{urut4}").join("NNNN"), j.keamanan, peng.unit, kkaEfektif, 0, tahun) : null;

  async function ambil() {
    if (!j) return;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await aksiA<{ nomor: string }>("ambil", { jenis: j.kode, kka: kkaEfektif && pakaiKka ? kkaEfektif : undefined, tanggal, perihal: perihal.trim(), kegiatan_id: kegiatan ? Number(kegiatan) : undefined });
      setHasil({ nomor: r.nomor, perihal: perihal.trim() });
      setTersalin(false);
      setPerihal("");
      onUbah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  async function salin() {
    if (!hasil) return;
    try { await navigator.clipboard.writeText(hasil.nomor); setTersalin(true); } catch { setTersalin(false); }
  }

  return (
    <Kartu judul="Ambil nomor baru" ket="Nomor langsung tercatat di buku. Bila suratnya batal dibuat, batalkan nomornya di tab Buku nomor.">
      {galat && <div className="mb-3"><Pesan onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Jenis dokumen *
          <select className={INPUT} value={jenis} onChange={(e) => { setJenis(e.target.value); setKka(""); }}>
            <option value="">Pilih jenis…</option>
            {jenisAktif.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
          </select>
        </label>
        <label className={LABEL}>Tanggal surat *
          <input type="date" className={INPUT} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </label>
        {j && pakaiKka && <div className="sm:col-span-2"><PilihKka nilai={kka} onUbah={setKka} peng={peng} kode={kodeAktif} bawaan={j.kka_bawaan} wajib={!j.kka_bawaan} /></div>}
        <label className={LABEL}>Kegiatan (penanda saja, tidak menentukan kode)
          <select className={INPUT} value={kegiatan} onChange={(e) => setKegiatan(e.target.value)}>
            <option value="">Tidak terkait kegiatan</option>
            {peng.kegiatan_semua.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>Perihal / untuk apa nomor ini *
          <input className={INPUT} value={perihal} maxLength={300} placeholder="mis. Surat pengantar permohonan data ke Wali Nagari" onChange={(e) => setPerihal(e.target.value)} />
        </label>
      </div>
      {j && (
        <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">
          Pola: <span className="font-mono">{j.format}</span>{pratinjau ? <> · contoh bentuk: <span className="font-mono">{pratinjau}</span></> : null}{j.dasar ? <> · dasar: {j.dasar}</> : null}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void ambil()}>{sibuk ? "Mengambil…" : "Ambil nomor"}</button>
      </div>
      {hasil && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#BFE3CF] bg-[#F1FAF5] p-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11.5px] font-bold uppercase tracking-wide text-[#13794B]">Nomor Anda</p>
            <p className="m-0 break-all text-[20px] font-bold text-[#0F6340]">{hasil.nomor}</p>
            <p className="m-0 text-[12px] text-[#5B6B84]">{hasil.perihal}</p>
          </div>
          <button type="button" className={BTN_O} onClick={() => void salin()}>{tersalin ? "Tersalin" : "Salin nomor"}</button>
        </div>
      )}
    </Kartu>
  );
}

function FormLuar({ peng, jenisAktif, kodeAktif, onUbah }: Prop) {
  const [jenis, setJenis] = useState("");
  const [nomorTeks, setNomorTeks] = useState("");
  const [urut, setUrut] = useState("");
  const [kka, setKka] = useState("");
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [perihal, setPerihal] = useState("");
  const [kegiatan, setKegiatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const j = jenisAktif.find((x) => x.kode === jenis) ?? null;
  const pakaiKka = !!j && perluKka(j.format);
  const urai = nomorTeks.trim() ? uraiNomor(nomorTeks) : null;
  const tahunTgl = tahunDariTanggal(tanggal);
  const tahunBeda = !!urai && !!tahunTgl && urai.tahun !== tahunTgl;
  const urutAkhir = urai ? urai.urut : Number(urut);
  const kkaAkhir = kka || (urai?.kka ?? "");
  const siap = !!j && !!tahunTgl && Number.isInteger(urutAkhir) && urutAkhir > 0 && !tahunBeda && (!pakaiKka || !!(kkaAkhir || j.kka_bawaan)) && (!kkaAkhir || kkaSah(kkaAkhir));

  function tempel(v: string) {
    setNomorTeks(v);
    const u = uraiNomor(v);
    if (u) {
      setUrut(String(u.urut));
      if (u.kka) setKka(u.kka);
    }
  }

  async function catat() {
    if (!j) return;
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      const r = await aksiA<{ nomor: string }>("catat_luar", { jenis: j.kode, urut: urutAkhir, tanggal, perihal: perihal.trim() || undefined, kka: kkaAkhir || undefined, kegiatan_id: kegiatan ? Number(kegiatan) : undefined, nomor: urai ? nomorTeks.trim() : undefined });
      setOk(`Nomor ${r.nomor} tercatat.`);
      setNomorTeks("");
      setUrut("");
      setPerihal("");
      onUbah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu judul="Catat nomor yang sudah terbit di luar SIGAP" ket="Untuk surat yang nomornya sudah dipakai (ditulis tangan, dari buku agenda lama). Nomor berikutnya dari sistem otomatis melanjutkan nomor tertinggi.">
      {galat && <div className="mb-3"><Pesan onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
      {ok && <div className="mb-3"><Pesan jenis="ok" onTutup={() => setOk(null)}>{ok}</Pesan></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Jenis dokumen *
          <select className={INPUT} value={jenis} onChange={(e) => { setJenis(e.target.value); setKka(""); }}>
            <option value="">Pilih jenis…</option>
            {jenisAktif.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
          </select>
        </label>
        <label className={LABEL}>Tanggal surat *
          <input type="date" className={INPUT} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </label>
        <label className={`${LABEL} sm:col-span-2`}>Nomor lengkap (opsional, bila ingin ditempel apa adanya)
          <input className={INPUT} value={nomorTeks} placeholder="mis. B-1452/13030/VS.330/2026" onChange={(e) => tempel(e.target.value)} />
        </label>
        {nomorTeks.trim() && !urai && <p className="m-0 text-[12px] text-[#8A6200] sm:col-span-2">Bentuk nomor tidak dikenali; isi nomor urut di bawah, nomor akan disusun dari pola jenis dokumen.</p>}
        {tahunBeda && <p className="m-0 text-[12px] font-semibold text-[#B42329] sm:col-span-2">Tahun pada nomor ({urai?.tahun}) berbeda dengan tahun tanggal surat ({tahunTgl}). Samakan dulu.</p>}
        <label className={LABEL}>Nomor urut *
          <input inputMode="numeric" className={INPUT} value={urai ? String(urai.urut) : urut} disabled={!!urai} onChange={(e) => setUrut(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </label>
        {j && pakaiKka && <div className="sm:col-span-2"><PilihKka nilai={kka} onUbah={setKka} peng={peng} kode={kodeAktif} bawaan={urai?.kka ?? j.kka_bawaan} wajib={!(urai?.kka ?? j.kka_bawaan)} /></div>}
        <label className={LABEL}>Kegiatan (penanda saja, tidak menentukan kode)
          <select className={INPUT} value={kegiatan} onChange={(e) => setKegiatan(e.target.value)}>
            <option value="">Tidak terkait kegiatan</option>
            {peng.kegiatan_semua.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>Perihal
          <input className={INPUT} value={perihal} maxLength={300} onChange={(e) => setPerihal(e.target.value)} />
        </label>
      </div>
      <div className="mt-3">
        <button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void catat()}>{sibuk ? "Mencatat…" : "Catat nomor"}</button>
      </div>
    </Kartu>
  );
}
