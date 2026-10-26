"use client";

// app/sigap/delego/lapor/page.tsx
//
// (26 Okt 2026) Lapor harian (HP-first). Satu laporan per delegasi per tanggal; mengirim lagi memperbarui laporan tanggal itu.
// Terlambat hanya ditandai, tidak diblokir. PML dapat melapor mewakili mitra (ditandai "diwakili").

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { angka, bulat, ringkasHariIni, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { NAMA_PERAN, type Delegasi } from "@/lib/delego/tipe";
import { aksiKeu, useKirim, useSaya } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Kosong, Medan, Memuat, Peringatan, fmt } from "../ui";

type Hasil = { id: number; tanggal: string; terlambat: boolean; mewakili: boolean };

function keteranganBukti(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && "ket" in x && typeof (x as { ket: unknown }).ket === "string") return (x as { ket: string }).ket;
  return "";
}

export default function Lapor() {
  const { hari, hak } = useKonteksDelego();
  const q = useSearchParams();
  const s = useSaya();
  const d = s.data;
  const pilihan = useMemo<Delegasi[]>(() => (d ? [...d.delegasi.filter((x) => x.status === "baru" || x.status === "berjalan"), ...d.diwakili] : []), [d]);
  const semuaLaporan = useMemo(() => (d ? [...d.laporan, ...d.laporan_diwakili] : []), [d]);

  const [id, setId] = useState<number | null>(null);
  const [tanggal, setTanggal] = useState(hari);
  const [poin, setPoin] = useState("");
  const [uraian, setUraian] = useState("");
  const [kendala, setKendala] = useState("");
  const [bukti, setBukti] = useState<string[]>([""]);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const kirim = useKirim(s.muat);

  // pilih delegasi awal: dari ?delegasi=, kalau tidak yang pertama belum lapor hari ini, kalau tidak yang pertama
  useEffect(() => {
    if (!d || id !== null || pilihan.length === 0) return;
    const dariUrl = Number(q?.get("delegasi") ?? "");
    const awal = pilihan.find((x) => x.id === dariUrl) ?? pilihan.find((x) => !semuaLaporan.some((l) => l.delegasi_id === x.id && l.tanggal === hari)) ?? pilihan[0];
    setId(awal.id);
  }, [d, id, pilihan, q, semuaLaporan, hari]);

  const terpilih = pilihan.find((x) => x.id === id) ?? null;
  const ada = terpilih ? semuaLaporan.find((l) => l.delegasi_id === terpilih.id && l.tanggal === tanggal) ?? null : null;
  useEffect(() => {
    // isi ulang formulir dengan laporan yang sudah ada untuk delegasi dan tanggal ini
    setPoin(ada ? String(angka(ada.poin)) : "");
    setUraian(ada?.uraian ?? "");
    setKendala(ada?.kendala ?? "");
    const b = (ada?.bukti ?? []).map(keteranganBukti).filter(Boolean);
    setBukti(b.length ? b : [""]);
    setHasil(null);
  }, [ada?.id, terpilih?.id, tanggal]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = terpilih && d ? ringkasHariIni(terpilih, semuaLaporan, tanggal) : null;
  const mewakili = !!terpilih && !!d && terpilih.penerima_akun !== d.akun.id;
  const batasAwal = hak.semua || hak.beri_ro.length > 0 ? (terpilih?.mulai ?? tambahHari(hari, -7)) : tambahHari(hari, -7);
  const poinAngka = Number(poin);
  const sah = !!terpilih && poin.trim() !== "" && Number.isFinite(poinAngka) && poinAngka >= 0 && poinAngka <= 1000 && tanggal >= batasAwal && tanggal <= hari;

  async function kirimLaporan() {
    if (!terpilih || !sah) return;
    setHasil(null);
    await kirim.jalankan(async () => {
      const res = await aksiKeu<Hasil>("keu_dlg_lapor", {
        p_delegasi: terpilih.id,
        p_tanggal: tanggal,
        p_poin: poinAngka,
        p_uraian: uraian.trim(),
        p_kendala: kendala.trim(),
        p_bukti: bukti.map((b) => b.trim()).filter(Boolean).slice(0, 5),
      });
      if (res.ok) setHasil(res.data);
      return res;
    });
  }

  return (
    <Halaman judul="Lapor harian" sub={`Tanggal laporan: ${tglPendek(tanggal)}`}>
      {s.memuat && !d && <Memuat />}
      {s.galat && !d && <Galat>{s.galat}</Galat>}
      {d && pilihan.length === 0 && (
        <Kosong>
          Tidak ada delegasi yang berjalan untuk dilaporkan. <Link href="/sigap/delego/saya" className="font-semibold text-[#0F6B63] underline">Kembali ke Delegasi saya</Link>.
        </Kosong>
      )}
      {d && terpilih && (
        <div className="mx-auto grid max-w-3xl gap-4">
          <Kartu>
            <div className="space-y-3">
              <Medan label="Delegasi">
                <select className={KELAS.isian} value={id ?? ""} onChange={(e) => setId(Number(e.target.value))}>
                  <optgroup label="Tugas saya">
                    {pilihan.filter((x) => x.penerima_akun === d.akun.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.judul}</option>
                    ))}
                  </optgroup>
                  {d.diwakili.length > 0 && (
                    <optgroup label="Mitra yang saya wakili">
                      {d.diwakili.map((x) => (
                        <option key={x.id} value={x.id}>{x.penerima_nama} · {x.judul}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Medan>
              {mewakili && <Info>Anda melapor mewakili <b>{terpilih.penerima_nama}</b>. Laporan akan ditandai &quot;diwakili&quot;.</Info>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Medan label="Tanggal" bantu="Laporan susulan boleh sampai 7 hari ke belakang.">
                  <input type="date" className={KELAS.isian} value={tanggal} min={batasAwal} max={hari} onChange={(e) => setTanggal(e.target.value || hari)} />
                </Medan>
                <Medan label={`Capaian (${terpilih.satuan})`} bantu={r ? `Target ${r.hariKerjaIni ? fmt(r.targetHariIni, 1) : "0 (bukan hari kerja)"}${r.hutangKemarin > 0 ? `; hutang sebelumnya ${fmt(bulat(r.hutangKemarin), 1)}` : ""}.` : undefined}>
                  <input type="number" inputMode="decimal" min={0} max={1000} step="any" className={KELAS.isian} value={poin} onChange={(e) => setPoin(e.target.value)} placeholder="0" />
                </Medan>
              </div>
              {r && r.sisaHariIni > 0 && (
                <button type="button" className={KELAS.tombolKecil} onClick={() => setPoin(String(r.targetHariIni))}>
                  Isi sesuai target ({fmt(r.targetHariIni, 1)})
                </button>
              )}
              <Medan label="Uraian pekerjaan">
                <textarea className={KELAS.isian} rows={3} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} placeholder="Apa yang dikerjakan hari ini" />
              </Medan>
              <Medan label="Kendala" bantu="Tulis bila beban terlalu berat atau ada hambatan di lapangan agar Ketua Tim dapat membantu.">
                <textarea className={KELAS.isian} rows={2} maxLength={500} value={kendala} onChange={(e) => setKendala(e.target.value)} placeholder="Kosongkan bila tidak ada" />
              </Medan>
              <div className="space-y-2">
                <div className="text-[13px] font-semibold">Bukti (opsional, maksimal 5)</div>
                {bukti.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={KELAS.isian} value={b} maxLength={200} placeholder="Nama berkas atau tautan bukti" onChange={(e) => setBukti((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                    {bukti.length > 1 && (
                      <button type="button" className={KELAS.tombolKecil} aria-label={`Hapus bukti ${i + 1}`} onClick={() => setBukti((x) => x.filter((_, j) => j !== i))}>
                        Hapus
                      </button>
                    )}
                  </div>
                ))}
                {bukti.length < 5 && (
                  <button type="button" className={KELAS.tombolKecil} onClick={() => setBukti((x) => [...x, ""])}>
                    + Tambah bukti
                  </button>
                )}
                <p className="m-0 text-[12.5px] text-[#3B4A57]">Tulis nama berkas atau tautan; pengunggahan foto ke Delego belum tersedia.</p>
              </div>
              {tanggal < hari && !ada && <Peringatan>Laporan untuk {tglPendek(tanggal)} akan ditandai terlambat.</Peringatan>}
              {ada && <Info>Sudah ada laporan {tglPendek(tanggal)} ({fmt(angka(ada.poin), 1)} {terpilih.satuan}). Mengirim akan memperbarui laporan itu.</Info>}
              {kirim.galat && <Galat>{kirim.galat}</Galat>}
              {hasil && (
                <Info>
                  Laporan tersimpan{hasil.terlambat ? " (ditandai terlambat)" : ""}{hasil.mewakili ? " (diwakili)" : ""}. <Link href="/sigap/delego/saya" className="font-semibold underline">Kembali ke Delegasi saya</Link>.
                </Info>
              )}
              <button type="button" className={`${KELAS.tombolUtama} w-full`} disabled={!sah || kirim.mengirim} onClick={() => void kirimLaporan()}>
                {kirim.mengirim ? "Mengirim..." : ada ? "Perbarui laporan" : "Kirim laporan"}
              </button>
              <p className="m-0 text-[12px] text-[#3B4A57]">{NAMA_PERAN[terpilih.peran_penerima]} · batas lapor 23:59 WIB pada hari yang sama.</p>
            </div>
          </Kartu>
        </div>
      )}
    </Halaman>
  );
}
