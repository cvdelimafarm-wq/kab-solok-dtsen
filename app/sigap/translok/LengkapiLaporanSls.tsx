"use client";

// app/sigap/translok/LengkapiLaporanSls.tsx
//
// (8 Nov 2026) Melengkapi LAPORAN hari terlewat (kegiatan Pascabencana) lewat ketik manual: per SLS yang dikunjungi pada tanggal itu, pilih nama SLS
// (dropdown bisa dicari, seluruh SLS Kabupaten Solok) lalu isi jumlah ditemukan terdampak, ditemukan tidak terdampak, dan tidak ditemukan.
// Hanya MENAMBAH laporan yang belum ada; setelah tersimpan tidak bisa diubah. Aturan server: lib/sigapLengkapiMandiri.ts (susunLaporanSls).

import { useMemo, useState } from "react";
import SelectCari from "@/app/components/SelectCari";
import { MAKS_ANGKA_SLS, MAKS_SLS_LAPORAN, kunciSls } from "@/lib/sigapLengkapiMandiri";

type Master = { kecamatan: string; nagari: string; jorong: string };
type Baris = { id: number; sls: string; terdampak: string; tidak_terdampak: string; tidak_ditemukan: string };

const KOTAK = "min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] disabled:opacity-50";

export default function LengkapiLaporanSls({
  token,
  penugasanId,
  tanggal,
  master,
  onTersimpan,
  atasNama = false,
}: {
  token: string;
  penugasanId: number;
  tanggal: string;
  master: Master[];
  onTersimpan: () => Promise<void>;
  /** PML / Supervisor / admin mengisi atas nama anggotanya (endpoint /lengkapi); bawaan: petugas mengisi sendiri */
  atasNama?: boolean;
}) {
  const [baris, setBaris] = useState<Baris[]>([{ id: 1, sls: "", terdampak: "", tidak_terdampak: "", tidak_ditemukan: "" }]);
  const [kendala, setKendala] = useState("");
  const [yakin, setYakin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const opsi = useMemo(
    () =>
      [...master]
        .sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.jorong.localeCompare(b.jorong))
        .map((m) => ({ kunci: kunciSls(m), label: `${m.jorong} · ${m.nagari}, ${m.kecamatan}` })),
    [master],
  );
  const angka = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const valid = (v: string) => v.trim() === "" || (/^\d+$/.test(v.trim()) && Number(v) <= MAKS_ANGKA_SLS);
  const total = baris.reduce((n, b) => n + angka(b.terdampak) + angka(b.tidak_terdampak) + angka(b.tidak_ditemukan), 0);
  const kembar = new Set(baris.map((b) => b.sls).filter((k, i, a) => k && a.indexOf(k) !== i));
  const siap =
    baris.length > 0 &&
    baris.every((b) => b.sls && !kembar.has(b.sls) && valid(b.terdampak) && valid(b.tidak_terdampak) && valid(b.tidak_ditemukan)) &&
    total <= MAKS_ANGKA_SLS;

  function ubah(id: number, kolom: keyof Omit<Baris, "id">, nilai: string) {
    setYakin(false);
    setBaris((v) => v.map((b) => (b.id === id ? { ...b, [kolom]: kolom === "sls" ? nilai : nilai.replace(/[^\d]/g, "").slice(0, 3) } : b)));
  }

  async function simpan() {
    setBusy(true);
    setGalat(null);
    try {
      const rincian_sls = baris.map((b) => {
        const m = master.find((x) => kunciSls(x) === b.sls)!;
        return { kecamatan: m.kecamatan, nagari: m.nagari, jorong: m.jorong, terdampak: angka(b.terdampak), tidak_terdampak: angka(b.tidak_terdampak), tidak_ditemukan: angka(b.tidak_ditemukan) };
      });
      const res = await fetch(atasNama ? `/api/sigap/translok/${encodeURIComponent(token)}/lengkapi` : `/api/sigap/translok/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: atasNama ? "laporan_sls" : "realisasi", penugasan_id: penugasanId, tanggal, rincian_sls, kendala }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Gagal menyimpan laporan.");
      await onTersimpan();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan laporan.");
      setYakin(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-md">
      <p className="text-[15px] font-extrabold">Isi laporan manual</p>
      <p className="mt-0.5 text-[12px] text-[#55657D]">Isi hanya SLS yang Anda kunjungi pada tanggal ini. Tulis angka sesuai hasil pendataan hari itu.</p>

      <div className="mt-3 space-y-3">
        {baris.map((b, i) => (
          <div key={b.id} className="rounded-xl border border-[#D8E0EC] bg-[#F9FAFC] p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[12px] font-bold text-[#0F3D7A]" htmlFor={`sls-${b.id}`}>SLS {i + 1}</label>
              {baris.length > 1 && (
                <button type="button" onClick={() => { setYakin(false); setBaris((v) => v.filter((x) => x.id !== b.id)); }} className="min-h-[36px] rounded-lg px-2 text-[12px] font-bold text-red-700">
                  Hapus
                </button>
              )}
            </div>
            <SelectCari id={`sls-${b.id}`} className={`${KOTAK} mt-1`} value={b.sls} onChange={(e) => ubah(b.id, "sls", e.target.value)} aria-label={`Nama SLS ${i + 1}`}>
              <option value="">Pilih nama SLS (ketik untuk mencari)…</option>
              {opsi.map((o) => (
                <option key={o.kunci} value={o.kunci}>{o.label}</option>
              ))}
            </SelectCari>
            {kembar.has(b.sls) && <p className="mt-1 text-[12px] font-semibold text-red-700">SLS ini sudah dipilih di baris lain.</p>}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                ["terdampak", "Ditemukan terdampak"],
                ["tidak_terdampak", "Ditemukan tidak terdampak"],
                ["tidak_ditemukan", "Tidak ditemukan"],
              ] as const).map(([kolom, label]) => (
                <label key={kolom} className="block">
                  <span className="block min-h-[30px] text-[10.5px] font-bold leading-tight text-[#55657D]">{label}</span>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={b[kolom]}
                    onChange={(e) => ubah(b.id, kolom, e.target.value)}
                    className={`${KOTAK} text-center font-bold`}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {baris.length < MAKS_SLS_LAPORAN && (
        <button
          type="button"
          onClick={() => { setYakin(false); setBaris((v) => [...v, { id: Math.max(...v.map((x) => x.id)) + 1, sls: "", terdampak: "", tidak_terdampak: "", tidak_ditemukan: "" }]); }}
          className="mt-3 min-h-[44px] w-full rounded-xl border-2 border-dashed border-[#9DB4D8] text-[13.5px] font-extrabold text-[#0F3D7A]"
        >
          + Tambah SLS
        </button>
      )}

      <label className="mt-3 block text-[12px] font-bold text-[#55657D]">
        Kendala (boleh kosong)
        <textarea value={kendala} onChange={(e) => setKendala(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-[14px] font-normal" />
      </label>

      <p className="mt-3 text-[13px] font-bold">
        Jumlah seluruhnya: {total}
        {total > MAKS_ANGKA_SLS && <span className="ml-2 text-red-700">melebihi {MAKS_ANGKA_SLS}</span>}
      </p>
      {galat && <p className="mt-2 text-[12.5px] font-semibold text-red-700">⚠ {galat}</p>}

      {!yakin ? (
        <button type="button" disabled={!siap || busy} onClick={() => setYakin(true)} className="mt-3 min-h-[48px] w-full rounded-xl bg-[#0F3D7A] text-[14.5px] font-extrabold text-white shadow disabled:opacity-40">
          Simpan laporan
        </button>
      ) : (
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className="text-[13px] font-bold text-amber-950">Laporan tanggal terlewat tidak bisa diubah setelah disimpan. Sudah benar?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => setYakin(false)} className="min-h-[46px] flex-1 rounded-xl border border-[#C9D6EA] bg-white text-[14px] font-extrabold text-[#55657D]">Periksa lagi</button>
            <button type="button" disabled={busy} onClick={simpan} className="min-h-[46px] flex-[2] rounded-xl bg-[#1E7A4C] text-[14px] font-extrabold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Ya, simpan"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
