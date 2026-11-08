"use client";

// app/sigap/pelatihan/kelola/instruktur.tsx
//
// (3 Nov 2026) Tab "Tim & Peserta" > Instruktur: menetapkan instruktur per kelas dari aplikasi (tanpa SQL). Cari nama -> pilih kelas -> Tetapkan; kelas dapat
// dipindah lewat pilihan di barisnya, dan instruktur dapat dilepas. Instruktur melihat pelatihan sebagai instruktur (dropdown "Masuk sebagai" muncul bila ia juga peserta/pengelola).
// API: /api/sigap/pelatihan/instruktur.

import { useCallback, useEffect, useRef, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Toast, useToast } from "../../admin/Toast";
import SelectCari from "@/app/components/SelectCari";

type Baris = { akun_id: number; nama: string; kelas: number };
type Data = { instruktur: Baris[]; kelas: number[]; daftar_kelas?: { nomor: number; nama: string }[]; boleh_kelola: boolean };
type Kandidat = { akun_id: number; nama: string; jenis: string | null };

const URL_API = "/api/sigap/pelatihan/instruktur";

export default function InstrukturKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const toast = useToast();
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [kata, setKata] = useState("");
  const [kandidat, setKandidat] = useState<Kandidat[]>([]);
  const [pilih, setPilih] = useState<Kandidat | null>(null);
  const [kelas, setKelas] = useState<number | "">("");
  const nomorCari = useRef(0);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(urlPelatihan(URL_API));
      setD(r);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  // pencarian nama: jeda singkat, hasil lama diabaikan bila sudah ada ketikan baru
  useEffect(() => {
    if (pilih || kata.trim().length < 2) {
      setKandidat([]);
      return;
    }
    const nomor = ++nomorCari.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetchJson<{ kandidat: Kandidat[] }>(urlPelatihan(`${URL_API}?cari=${encodeURIComponent(kata.trim())}`));
        if (nomor === nomorCari.current) setKandidat(r.kandidat);
      } catch {
        if (nomor === nomorCari.current) setKandidat([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [kata, pilih]);

  async function kirim(body: Record<string, unknown>, pesanOk: string, akunId: number) {
    setSibuk(akunId);
    toast.tampil("simpan", "Menyimpan…");
    try {
      await fetchJson(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify(body) });
      toast.tampil("ok", pesanOk);
      await muat();
    } catch (e) {
      toast.tampil("galat", e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  async function tetapkan() {
    if (!pilih || kelas === "") return;
    await kirim({ aksi: "tetapkan", akun_id: pilih.akun_id, kelas }, `${pilih.nama} ditetapkan sebagai instruktur ${namaKelas(Number(kelas))}.`, pilih.akun_id);
    setPilih(null);
    setKata("");
    setKelas("");
  }

  if (!d && !galat) return <Memuat />;
  const boleh = !!d?.boleh_kelola;
  const opsiKelas = d?.kelas ?? [];
  const namaKelas = (k: number) => d?.daftar_kelas?.find((x) => x.nomor === k)?.nama ?? `Kelas ${k}`; // (8 Nov 2026) nama kelas pelatihan

  return (
    <Kartu judul="Instruktur" ket="Instruktur kelas melihat pelatihan sebagai instruktur dan memantau pesertanya. Akun yang juga peserta atau pengelola bisa berganti peran lewat “Masuk sebagai” di HP.">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}

      {d && d.instruktur.length === 0 && <p className="mb-3 text-[13px] text-[#6B7A90]">Belum ada instruktur untuk pelatihan ini.</p>}
      {d && d.instruktur.length > 0 && (
        <ul className="mb-4 divide-y divide-[#E6ECF5] rounded-lg border border-[#DDE6F3]" data-testid="daftar-instruktur">
          {d.instruktur.map((b) => (
            <li key={b.akun_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#1B2B4B]">{b.nama}</span>
              <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6B84]">
                Kelas
                <SelectCari
                  className={INPUT}
                  value={b.kelas}
                  disabled={!boleh || sibuk === b.akun_id}
                  onChange={(e) => void kirim({ aksi: "tetapkan", akun_id: b.akun_id, kelas: Number(e.target.value) }, `Kelas ${b.nama} dipindah ke ${e.target.value}.`, b.akun_id)}
                >
                  {Array.from(new Set([...opsiKelas, b.kelas])).sort((x, y) => x - y).map((k) => (
                    <option key={k} value={k}>
                      {namaKelas(k)}
                    </option>
                  ))}
                </SelectCari>
              </label>
              {boleh && (
                <button type="button" className={BTN_O} disabled={sibuk === b.akun_id} onClick={() => void kirim({ aksi: "lepas", akun_id: b.akun_id }, `${b.nama} dilepas dari instruktur.`, b.akun_id)}>
                  Lepas
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {boleh ? (
        <div className="space-y-2" data-testid="tambah-instruktur">
          <p className="text-[12.5px] font-semibold text-[#5B6B84]">Tambah instruktur</p>
          {pilih ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold text-[#1B2B4B]">{pilih.nama}</span>
              <button type="button" className="text-[12.5px] text-[#1F5FD1] underline" onClick={() => setPilih(null)}>
                ganti
              </button>
            </div>
          ) : (
            <>
              <input className={`${INPUT} w-full`} placeholder="Cari nama akun (minimal 2 huruf)" value={kata} onChange={(e) => setKata(e.target.value)} />
              {kandidat.length > 0 && (
                <ul className="max-h-56 overflow-y-auto rounded-lg border border-[#DDE6F3] bg-white">
                  {kandidat.map((k) => (
                    <li key={k.akun_id}>
                      <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F5F8FE]" onClick={() => setPilih(k)}>
                        {k.nama}
                        {k.jenis ? <span className="ml-1 text-[11.5px] text-[#6B7A90]">· {k.jenis}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SelectCari className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Kelas instruktur">
              <option value="">Pilih kelas</option>
              {opsiKelas.map((k) => (
                <option key={k} value={k}>
                  {namaKelas(k)}
                </option>
              ))}
            </SelectCari>
            <button type="button" className={BTN} disabled={!pilih || kelas === "" || sibuk !== null} onClick={() => void tetapkan()}>
              Tetapkan
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat; menetapkan instruktur butuh izin Kelola.</p>
      )}
      <Toast isi={toast.isi} onTutup={toast.tutup} />
    </Kartu>
  );
}
