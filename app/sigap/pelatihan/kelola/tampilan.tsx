"use client";

// app/sigap/pelatihan/kelola/tampilan.tsx
//
// (2 Nov 2026) Tab "Tampilan baru" di Kelola Pelatihan: (1) saklar tampilan 5 tab + ketentuan undangan, (2) hierarki instruktur > korwil > PML > PPL.
// API: /api/sigap/pelatihan/ketentuan dan /api/sigap/pelatihan/hierarki (keduanya membawa ?kegiatan=ID lewat urlPelatihan).
// Saklar mati = peserta tetap melihat Langkah lama; menyalakan hanya berlaku untuk kegiatan ini dan dapat dimatikan lagi kapan saja.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";
import { LABEL_PERAN_PELATIHAN, type MasalahHierarki, type PeranPelatihan, type SimpulHierarki } from "@/lib/hierarkiPelatihan";
import { MAKS_BUTIR, MAKS_PANJANG_BUTIR } from "@/lib/ketentuanPelatihan";

type DataKetentuan = { kegiatan_id: number; tab_baru: boolean; ketentuan: { butir: string[]; versi: number }; boleh_kelola: boolean };
type DataHierarki = { tersedia: boolean; simpul: SimpulHierarki[]; masalah: MasalahHierarki; boleh_kelola: boolean };

const URUT_PERAN: Record<PeranPelatihan, number> = { korwil: 0, pml: 1, ppl: 2 };

function KartuTampilan() {
  const [d, setD] = useState<DataKetentuan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [butir, setButir] = useState<string[]>([]);
  const [simpan, setSimpan] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<DataKetentuan>(urlPelatihan("/api/sigap/pelatihan/ketentuan"));
      setD(r);
      setButir(r.ketentuan.butir);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const berubah = useMemo(() => !!d && JSON.stringify(butir.map((b) => b.trim()).filter(Boolean)) !== JSON.stringify(d.ketentuan.butir), [d, butir]);

  async function kirim(isi: { butir?: string[]; tab_baru?: boolean }, pesan: string) {
    setSimpan(true);
    setGalat(null);
    setOk(null);
    try {
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/ketentuan"), { method: "POST", body: JSON.stringify({ aksi: "simpan", ...isi }) });
      setOk(pesan);
      setKonfirmasi(false);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSimpan(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const bisa = d.boleh_kelola;
  const ubah = (i: number, v: string) => setButir((b) => b.map((x, j) => (j === i ? v.slice(0, MAKS_PANJANG_BUTIR) : x)));
  const geser = (i: number, arah: -1 | 1) =>
    setButir((b) => {
      const j = i + arah;
      if (j < 0 || j >= b.length) return b;
      const c = [...b];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  return (
    <Kartu judul="Tampilan lima tab dan ketentuan undangan" ket={`Ketentuan versi ${d.ketentuan.versi}`}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}

      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-[#F3F6FB] p-3">
        <div className="min-w-0 flex-1">
          <b className="text-[13.5px]">Tampilan lima tab (Hari ini · Instrumen · Pelatihan · Kamera · Monitoring)</b>
          <p className="text-[12.5px] text-[#6B7A90]">
            {d.tab_baru ? "Menyala: peserta pelatihan ini dialihkan ke Hari ini dan melihat bilah lima tab." : "Mati: peserta masih melihat Langkah pelatihan seperti biasa."}
          </p>
        </div>
        <Chip w={d.tab_baru ? "ok" : "mut"}>{d.tab_baru ? "Menyala" : "Mati"}</Chip>
        {bisa && !d.tab_baru && !konfirmasi && (
          <button type="button" className={BTN} onClick={() => setKonfirmasi(true)} disabled={simpan}>
            Nyalakan
          </button>
        )}
        {bisa && !d.tab_baru && konfirmasi && (
          <>
            <span className="text-[12.5px] font-semibold text-[#8A6200]">Peserta langsung melihat tampilan baru. Yakin?</span>
            <button type="button" className={BTN} onClick={() => kirim({ tab_baru: true }, "Tampilan lima tab dinyalakan.")} disabled={simpan}>
              Ya, nyalakan
            </button>
            <button type="button" className={BTN_O} onClick={() => setKonfirmasi(false)} disabled={simpan}>
              Batal
            </button>
          </>
        )}
        {bisa && d.tab_baru && (
          <button type="button" className={BTN_R} onClick={() => kirim({ tab_baru: false }, "Tampilan lima tab dimatikan; peserta kembali ke Langkah pelatihan.")} disabled={simpan}>
            Matikan
          </button>
        )}
      </div>

      <h4 className="mt-4 text-[13.5px] font-extrabold text-[#0F2A52]">Ketentuan pelatihan</h4>
      <p className="text-[12.5px] text-[#6B7A90]">
        Waktu dan tempat diambil otomatis dari data undangan. Butir di bawah tampil di modal ketentuan peserta. Mengubah butir menaikkan versi; peserta yang sudah menerima hanya diberi tahu, tanpa persetujuan ulang.
      </p>
      <ol className="mt-2 space-y-2">
        {butir.map((b, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-2 w-5 text-right text-[12px] text-[#6B7A90]">{i + 1}.</span>
            <textarea value={b} onChange={(e) => ubah(i, e.target.value)} rows={2} disabled={!bisa} className={`${INPUT} min-w-0 flex-1`} aria-label={`Butir ketentuan ${i + 1}`} />
            {bisa && (
              <span className="flex flex-col gap-1">
                <button type="button" className={BTN_O} onClick={() => geser(i, -1)} disabled={i === 0} aria-label="Naikkan">
                  ↑
                </button>
                <button type="button" className={BTN_O} onClick={() => geser(i, 1)} disabled={i === butir.length - 1} aria-label="Turunkan">
                  ↓
                </button>
              </span>
            )}
            {bisa && (
              <button type="button" className={BTN_R} onClick={() => setButir((x) => x.filter((_, j) => j !== i))} aria-label="Hapus butir">
                ✕
              </button>
            )}
          </li>
        ))}
        {butir.length === 0 && <li className="text-[12.5px] text-[#6B7A90]">Belum ada butir ketentuan.</li>}
      </ol>
      {bisa && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={() => setButir((b) => [...b, ""])} disabled={butir.length >= MAKS_BUTIR}>
            + Tambah butir
          </button>
          <button type="button" className={BTN} onClick={() => kirim({ butir }, "Ketentuan disimpan.")} disabled={simpan || !berubah}>
            {simpan ? "Menyimpan…" : "Simpan ketentuan"}
          </button>
        </div>
      )}
      {!bisa && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat; mengubah memerlukan izin kelola pelatihan.</p>}
    </Kartu>
  );
}

function KartuHierarki() {
  const [d, setD] = useState<DataHierarki | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | "salin" | null>(null);

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<DataHierarki>(urlPelatihan("/api/sigap/pelatihan/hierarki")));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const urut = useMemo(() => (d ? [...d.simpul].sort((a, b) => URUT_PERAN[a.peran] - URUT_PERAN[b.peran] || a.nama.localeCompare(b.nama)) : []), [d]);
  const nama = useMemo(() => new Map((d?.simpul ?? []).map((s) => [s.akun_id, s.nama])), [d]);

  async function post(isi: Record<string, unknown>, tanda: number | "salin", pesan: (r: Record<string, unknown>) => string) {
    setSibuk(tanda);
    setGalat(null);
    setOk(null);
    try {
      const r = await fetchJson<Record<string, unknown>>(urlPelatihan("/api/sigap/pelatihan/hierarki"), { method: "POST", body: JSON.stringify(isi) });
      setOk(pesan(r));
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const m = d.masalah;
  const bisa = d.boleh_kelola;
  return (
    <Kartu judul="Hierarki peserta" ket={`${d.simpul.length} peserta · instruktur > korwil > PML > PPL`}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}
      {!d.tersedia && <Pesan jenis="peringatan">Hierarki belum disusun (tabel kosong atau SQL 20261102zh belum dijalankan). Daftar di bawah diambil dari penugasan tanpa atasan.</Pesan>}
      {(m.siklus.length > 0 || m.atasan_asing.length > 0) && (
        <Pesan jenis="galat">
          {m.siklus.length > 0 && `${m.siklus.length} peserta memiliki rantai atasan melingkar. `}
          {m.atasan_asing.length > 0 && `${m.atasan_asing.length} peserta memiliki atasan yang bukan peserta pelatihan ini.`}
        </Pesan>
      )}
      {m.tanpa_atasan.length > 0 && <Pesan jenis="info">{m.tanpa_atasan.length} PML/PPL belum punya atasan: hanya instruktur dan panitia yang melihat progres mereka.</Pesan>}

      {bisa && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_O} disabled={sibuk !== null} onClick={() => post({ aksi: "salin" }, "salin", (r) => `Disalin dari data PSP: ${Number(r.ditambah ?? 0)} peserta ditambahkan (yang sudah ada tidak diubah).`)}>
            {sibuk === "salin" ? "Menyalin…" : "Salin atasan dari data PSP"}
          </button>
          <span className="text-[12px] text-[#6B7A90]">Hanya titik awal: data atasan PSP untuk Seruti tidak selalu lengkap, koreksi di tabel.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Peran</th>
              <th className={TH}>Kelas</th>
              <th className={TH}>Atasan</th>
            </tr>
          </thead>
          <tbody>
            {urut.map((s) => (
              <tr key={s.akun_id}>
                <td className={TD}>
                  {s.nama}
                  {s.tersembunyi && (
                    <span className="ml-1.5">
                      <Chip w="bad">Menolak undangan</Chip>
                    </span>
                  )}
                </td>
                <td className={TD}>
                  {bisa ? (
                    <select
                      className={INPUT}
                      value={s.peran}
                      disabled={sibuk !== null}
                      aria-label={`Peran ${s.nama}`}
                      onChange={(e) => post({ aksi: "atur", akun_id: s.akun_id, atasan_akun_id: s.atasan_akun_id, peran: e.target.value }, s.akun_id, () => `Peran ${s.nama} diubah.`)}
                    >
                      {(["korwil", "pml", "ppl"] as PeranPelatihan[]).map((p) => (
                        <option key={p} value={p}>
                          {LABEL_PERAN_PELATIHAN[p]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    LABEL_PERAN_PELATIHAN[s.peran]
                  )}
                </td>
                <td className={TD}>{s.kelas ?? "–"}</td>
                <td className={TD}>
                  {bisa ? (
                    <select
                      className={`${INPUT} max-w-[220px]`}
                      value={s.atasan_akun_id ?? ""}
                      disabled={sibuk !== null}
                      aria-label={`Atasan ${s.nama}`}
                      onChange={(e) => post({ aksi: "atur", akun_id: s.akun_id, atasan_akun_id: e.target.value === "" ? null : Number(e.target.value) }, s.akun_id, () => `Atasan ${s.nama} diubah.`)}
                    >
                      <option value="">(tanpa atasan)</option>
                      {urut
                        .filter((x) => x.akun_id !== s.akun_id)
                        .map((x) => (
                          <option key={x.akun_id} value={x.akun_id}>
                            {x.nama} ({LABEL_PERAN_PELATIHAN[x.peran]})
                          </option>
                        ))}
                    </select>
                  ) : (
                    (s.atasan_akun_id !== null ? nama.get(s.atasan_akun_id) : null) ?? "–"
                  )}
                </td>
              </tr>
            ))}
            {urut.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  Belum ada peserta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Kartu>
  );
}

export default function TampilanKelola() {
  return (
    <div className="space-y-3">
      <KartuTampilan />
      <KartuHierarki />
    </div>
  );
}
