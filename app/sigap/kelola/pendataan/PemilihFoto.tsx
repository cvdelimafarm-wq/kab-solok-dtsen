"use client";

// app/sigap/kelola/pendataan/PemilihFoto.tsx
//
// (30 Okt 2026) Pemilih foto dokumentasi untuk Lampiran B Laporan Sementara. Menampilkan SELURUH foto nomor 1-5 milik kegiatan terpilih, dengan saringan
// peran (PPL / PML / Korwil-Supervisor), nomor foto 1-5, rentang tanggal, dan nama. Memilih: klik kartu (centang), Shift+klik (rentang), seret mouse di atas
// kartu (banyak sekaligus; di layar sentuh ketuk satu per satu), "Pilih halaman ini", atau "Pilih semua hasil saringan" (maks 500, dibatasi 60 foto per laporan).
// Semua permintaan membawa id kegiatan; server menolak foto kegiatan lain. Keadaan (pilihan, opsi) diatur induk (Laporan.tsx).

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import {
  JUMLAH_NOMOR, MAKS_FOTO_LAPORAN, PERAN_FOTO, UKURAN_HALAMAN, bacaHasilDaftarFoto, labelPeran, paramFilterFoto, rentangIndeks, tanggalSingkat, ubahPilihan,
  type FilterFoto, type FotoItem, type HasilDaftarFoto, type KetFoto, type StatusFoto, type UrutFoto,
} from "@/lib/laporanFoto";
import { gambarKecil, gambarKecilTersimpan } from "./fotoKlien";
import { BTN_O } from "../../admin/ui";

const INPUT = "w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13px] text-[#1E2B3F] focus:border-[#1F5FD1] focus:outline-none";
const FILTER_AWAL: FilterFoto = { peran: [], slot: [], dari: "", sampai: "", cari: "", halaman: 1, ukuran: UKURAN_HALAMAN };
const API_FOTO = "/api/portal/pendataan/laporan/foto";

/** Gambar kecil yang baru diambil saat mendekati layar (banyak foto, jaringan terbatas). */
export function GambarFoto({ kegiatanId, id, kelas = "", alt = "" }: { kegiatanId: number; id: number; kelas?: string; alt?: string }) {
  const kotak = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => gambarKecilTersimpan(kegiatanId, id));
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    setGagal(false);
    const ada = gambarKecilTersimpan(kegiatanId, id);
    setSrc(ada);
    if (ada) return;
    const el = kotak.current;
    if (!el) return;
    let batal = false;
    const muat = () => {
      gambarKecil(kegiatanId, id)
        .then((u) => !batal && setSrc(u))
        .catch(() => !batal && setGagal(true));
    };
    if (typeof IntersectionObserver === "undefined") {
      muat();
      return () => {
        batal = true;
      };
    }
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          io.disconnect();
          muat();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      batal = true;
      io.disconnect();
    };
  }, [kegiatanId, id]);
  return (
    <div ref={kotak} className={`flex items-center justify-center overflow-hidden bg-[#EEF2F7] ${kelas}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} draggable={false} className="h-full w-full object-cover" />
      ) : (
        <span className="px-1 text-center text-[10.5px] text-[#8A96A8]">{gagal ? "Gambar tidak tersedia" : "Memuat…"}</span>
      )}
    </div>
  );
}

function Pil({ aktif, onKlik, children }: { aktif: boolean; onKlik: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onKlik}
      aria-pressed={aktif}
      className={`min-h-[34px] rounded-full border px-3 text-[12.5px] font-semibold transition ${aktif ? "border-[#1F5FD1] bg-[#E6EEFC] text-[#1F5FD1]" : "border-[#CBD6E6] bg-white text-[#1B2B4B] hover:bg-[#F5F8FE]"}`}
    >
      {children}
    </button>
  );
}

const KET: { kode: keyof KetFoto; label: string }[] = [
  { kode: "nomor", label: "Nomor foto" },
  { kode: "nama", label: "Nama petugas" },
  { kode: "peran", label: "Peran" },
  { kode: "tanggal", label: "Tanggal" },
  { kode: "lokasi", label: "Lokasi (bila ada)" },
];
const URUT: { kode: UrutFoto; label: string }[] = [
  { kode: "pilih", label: "Urutan saya memilih" },
  { kode: "tanggal", label: "Tanggal lalu nama" },
  { kode: "petugas", label: "Nama petugas lalu tanggal" },
];

export default function PemilihFoto({ kegiatanId, status, onUbah }: { kegiatanId: number; status: StatusFoto; onUbah: (s: StatusFoto) => void }) {
  const [filter, setFilter] = useState<FilterFoto>(FILTER_AWAL);
  const [cariKetik, setCariKetik] = useState("");
  const [hasil, setHasil] = useState<HasilDaftarFoto | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [info, setInfo] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // status terbaru untuk penangan seret (menghindari penangan lama yang menutup nilai usang)
  const statusRef = useRef(status);
  statusRef.current = status;
  const hasilRef = useRef<HasilDaftarFoto | null>(null);
  hasilRef.current = hasil;
  const pilihanIds = new Set(status.pilihan.map((f) => f.id));
  const penuh = status.pilihan.length >= MAKS_FOTO_LAPORAN;

  // pencarian nama ditunda agar tidak memanggil server tiap ketukan
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => (f.cari === cariKetik.trim() ? f : { ...f, cari: cariKetik.trim(), halaman: 1 })), 400);
    return () => clearTimeout(t);
  }, [cariKetik]);

  const kunciFilter = paramFilterFoto(filter);
  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");
    apiPortal<unknown>(`${API_FOTO}?k=${kegiatanId}${kunciFilter ? `&${kunciFilter}` : ""}`)
      .then((m) => !batal && setHasil(bacaHasilDaftarFoto(m)))
      .catch((e) => !batal && setGalat(e instanceof Error ? e.message : "Daftar foto belum bisa dimuat."))
      .finally(() => !batal && setMemuat(false));
    return () => {
      batal = true;
    };
  }, [kegiatanId, kunciFilter]);

  const ubahFilter = (p: Partial<FilterFoto>) => setFilter((f) => ({ ...f, ...p, halaman: p.halaman ?? 1 }));
  const gantiDaftar = <T,>(daftar: T[], x: T): T[] => (daftar.includes(x) ? daftar.filter((y) => y !== x) : [...daftar, x]);

  const terapkan = useCallback(
    (dasar: FotoItem[], baru: FotoItem[], pilih: boolean) => {
      const h = ubahPilihan(dasar, baru, pilih);
      onUbah({ ...statusRef.current, pilihan: h.pilihan });
      setInfo(h.terpotong > 0 ? `Batas ${MAKS_FOTO_LAPORAN} foto per laporan: ${h.terpotong} foto tidak ikut dipilih.` : "");
    },
    [onUbah],
  );

  // ---- pilih satu / rentang / seret
  const jangkar = useRef(-1);
  const seret = useRef<{ mulai: number; pilih: boolean; dasar: FotoItem[] } | null>(null);
  const baruSeret = useRef(false);
  useEffect(() => {
    const akhir = () => {
      seret.current = null;
      // klik yang menyusul pointerup sudah tiba paling lama dalam beberapa milidetik; setelah itu tanda tidak boleh tertinggal
      setTimeout(() => {
        baruSeret.current = false;
      }, 80);
    };
    window.addEventListener("pointerup", akhir);
    window.addEventListener("pointercancel", akhir);
    return () => {
      window.removeEventListener("pointerup", akhir);
      window.removeEventListener("pointercancel", akhir);
    };
  }, []);

  const daftar = hasil?.foto ?? [];
  const ketuk = (i: number) => {
    const f = daftar[i];
    if (!f) return;
    const sudah = statusRef.current.pilihan.some((x) => x.id === f.id);
    terapkan(statusRef.current.pilihan, [f], !sudah);
    jangkar.current = i;
  };
  const tekanMouse = (e: React.PointerEvent, i: number) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    baruSeret.current = true; // klik berikutnya sudah ditangani di sini
    const f = daftar[i];
    if (!f) return;
    if (e.shiftKey && jangkar.current >= 0) {
      const idx = rentangIndeks(daftar.length, jangkar.current, i);
      terapkan(statusRef.current.pilihan, idx.map((j) => daftar[j]), true);
      return;
    }
    const sudah = statusRef.current.pilihan.some((x) => x.id === f.id);
    seret.current = { mulai: i, pilih: !sudah, dasar: statusRef.current.pilihan };
    jangkar.current = i;
    terapkan(statusRef.current.pilihan, [f], !sudah);
  };
  const masukKartu = (i: number) => {
    const s = seret.current;
    if (!s) return;
    const idx = rentangIndeks(daftar.length, s.mulai, i);
    terapkan(s.dasar, idx.map((j) => daftar[j]), s.pilih);
  };
  const klikKartu = (i: number) => {
    if (baruSeret.current) {
      baruSeret.current = false;
      return;
    }
    ketuk(i); // sentuh / pena / papan ketik
  };

  const pilihHalaman = (pilih: boolean) => terapkan(statusRef.current.pilihan, daftar, pilih);

  async function pilihSemuaSaringan() {
    setSibuk(true);
    setGalat("");
    try {
      const sisa = MAKS_FOTO_LAPORAN - status.pilihan.length;
      if (sisa <= 0) {
        setInfo(`Sudah ${MAKS_FOTO_LAPORAN} foto (batas per laporan).`);
        return;
      }
      const p = paramFilterFoto({ ...filter, halaman: 1, ukuran: 0 });
      const m = (await apiPortal<{ total?: number; terpotong?: boolean; foto?: unknown[] }>(`${API_FOTO}?k=${kegiatanId}&mode=id${p ? `&${p}` : ""}`)) ?? {};
      const baru = bacaHasilDaftarFoto({ foto: m.foto }).foto;
      const h = ubahPilihan(statusRef.current.pilihan, baru, true);
      onUbah({ ...statusRef.current, pilihan: h.pilihan });
      const total = Number(m.total) || baru.length;
      setInfo(
        h.terpotong > 0 || total > baru.length
          ? `${total.toLocaleString("id-ID")} foto cocok dengan saringan; ${h.pilihan.length - status.pilihan.length} ditambahkan (batas ${MAKS_FOTO_LAPORAN} foto per laporan). Persempit saringan untuk memilih yang lain.`
          : `${h.pilihan.length - status.pilihan.length} foto ditambahkan.`,
      );
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memilih semua hasil saringan.");
    } finally {
      setSibuk(false);
    }
  }

  const totalHalaman = hasil ? Math.max(1, Math.ceil(hasil.total / hasil.ukuran)) : 1;
  const adaSaringan = filter.peran.length > 0 || filter.slot.length > 0 || !!filter.dari || !!filter.sampai || !!filter.cari;
  const setKet = (k: keyof KetFoto, v: boolean) => onUbah({ ...status, opsi: { ...status.opsi, ket: { ...status.opsi.ket, [k]: v } } });

  return (
    <div className="space-y-3">
      {/* saringan */}
      <div className="space-y-2 rounded-lg border border-[#DDE6F3] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-bold text-[#55657D]">Petugas</span>
          {PERAN_FOTO.map((p) => (
            <Pil key={p.kode} aktif={filter.peran.includes(p.kode)} onKlik={() => ubahFilter({ peran: gantiDaftar(filter.peran, p.kode) })}>
              {p.label}
            </Pil>
          ))}
          <span className="ml-3 mr-1 text-[12px] font-bold text-[#55657D]">Foto ke</span>
          {Array.from({ length: JUMLAH_NOMOR }, (_, i) => i + 1).map((n) => (
            <Pil key={n} aktif={filter.slot.includes(n)} onKlik={() => ubahFilter({ slot: gantiDaftar(filter.slot, n).sort((a, b) => a - b) })}>
              {n}
            </Pil>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-[12px] font-bold text-[#55657D]">
            Dari tanggal
            <input type="date" className={`${INPUT} mt-1 font-normal`} value={filter.dari} onChange={(e) => ubahFilter({ dari: e.target.value })} />
          </label>
          <label className="block text-[12px] font-bold text-[#55657D]">
            Sampai tanggal
            <input type="date" className={`${INPUT} mt-1 font-normal`} value={filter.sampai} onChange={(e) => ubahFilter({ sampai: e.target.value })} />
          </label>
          <label className="block text-[12px] font-bold text-[#55657D]">
            Cari nama petugas
            <input className={`${INPUT} mt-1 font-normal`} value={cariKetik} maxLength={60} placeholder="mis. Ayu" onChange={(e) => setCariKetik(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-[#6B7A90]">
            {memuat ? "Memuat foto…" : hasil ? `${hasil.total.toLocaleString("id-ID")} foto${adaSaringan ? " sesuai saringan" : ""}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-[#55657D]">
              Per halaman
              <select className={`${INPUT} !w-auto py-1`} value={filter.ukuran} onChange={(e) => ubahFilter({ ukuran: Number(e.target.value) })}>
                {[24, 48, 96].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {adaSaringan && (
              <button
                type="button"
                className={BTN_O}
                onClick={() => {
                  setCariKetik("");
                  setFilter({ ...FILTER_AWAL, ukuran: filter.ukuran });
                }}
              >
                Setel ulang saringan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* aksi pilih */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_O} disabled={daftar.length === 0 || penuh} onClick={() => pilihHalaman(true)}>
          Pilih halaman ini
        </button>
        <button type="button" className={BTN_O} disabled={daftar.length === 0} onClick={() => pilihHalaman(false)}>
          Lepas halaman ini
        </button>
        <button type="button" className={BTN_O} disabled={!hasil || hasil.total === 0 || penuh || sibuk} onClick={() => void pilihSemuaSaringan()}>
          {sibuk ? "Memilih…" : "Pilih semua hasil saringan"}
        </button>
        <span className="ml-auto text-[12.5px] font-bold text-[#0F2A52]">
          Terpilih {status.pilihan.length}/{MAKS_FOTO_LAPORAN}
        </span>
      </div>
      <p className="text-[11.5px] text-[#6B7A90]">Klik kartu untuk memilih; tahan dan seret mouse untuk banyak sekaligus; Shift+klik untuk rentang. Di layar sentuh, ketuk satu per satu.</p>
      {info && <p className="rounded-lg border border-[#E8D9A8] bg-[#FFF8E1] px-3 py-1.5 text-[12.5px] text-[#6B5200]">{info}</p>}
      {galat && <p className="rounded-lg border border-[#F0C9C9] bg-[#FDF3F3] px-3 py-2 text-[13px] text-[#9B1C1C]">{galat}</p>}

      {/* kisi foto */}
      {hasil && daftar.length === 0 && !memuat && <p className="rounded-lg bg-[#F6F8FB] px-3 py-6 text-center text-[13px] text-[#55657D]">Tidak ada foto yang cocok dengan saringan ini.</p>}
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 ${memuat ? "opacity-60" : ""}`} style={{ touchAction: "pan-y" }}>
        {daftar.map((f, i) => {
          const dipilih = pilihanIds.has(f.id);
          return (
            <div
              key={f.id}
              role="checkbox"
              aria-checked={dipilih}
              tabIndex={0}
              onPointerDown={(e) => tekanMouse(e, i)}
              onPointerEnter={() => masukKartu(i)}
              onClick={() => klikKartu(i)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  ketuk(i);
                }
              }}
              className={`relative cursor-pointer select-none overflow-hidden rounded-lg border-2 bg-white outline-none transition focus-visible:ring-2 focus-visible:ring-[#1F5FD1] ${dipilih ? "border-[#1F5FD1] shadow-[0_0_0_2px_rgba(31,95,209,.18)]" : "border-[#E3E8EE] hover:border-[#9DB6E4]"}`}
            >
              <GambarFoto kegiatanId={kegiatanId} id={f.id} kelas="aspect-[4/3] w-full" />
              <span className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border text-[12px] font-bold ${dipilih ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-white/80 bg-white/70 text-transparent"}`} aria-hidden>
                ✓
              </span>
              <span className="absolute right-1.5 top-1.5 rounded bg-[#0F2A52]/80 px-1.5 py-0.5 text-[10.5px] font-bold text-white">Foto {f.slot}</span>
              <div className="px-1.5 py-1">
                <p className="truncate text-[11.5px] font-bold text-[#1B2B4B]" title={f.nama}>
                  {f.nama || "Tanpa nama"}
                </p>
                <p className="truncate text-[10.5px] text-[#6B7A90]">
                  {labelPeran(f.peran)} · {tanggalSingkat(f.tanggal)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {hasil && totalHalaman > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" className={BTN_O} disabled={filter.halaman <= 1 || memuat} onClick={() => ubahFilter({ halaman: filter.halaman - 1 })}>
            ← Sebelumnya
          </button>
          <span className="text-[12.5px] text-[#55657D]">
            Halaman {filter.halaman} dari {totalHalaman}
          </span>
          <button type="button" className={BTN_O} disabled={filter.halaman >= totalHalaman || memuat} onClick={() => ubahFilter({ halaman: filter.halaman + 1 })}>
            Berikutnya →
          </button>
        </div>
      )}

      {/* foto terpilih */}
      <div className="space-y-2 rounded-lg border border-[#DDE6F3] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Foto terpilih ({status.pilihan.length})</p>
          <button type="button" className={BTN_O} disabled={status.pilihan.length === 0} onClick={() => (onUbah({ ...status, pilihan: [] }), setInfo(""))}>
            Kosongkan pilihan
          </button>
        </div>
        {status.pilihan.length === 0 ? (
          <p className="text-[12.5px] text-[#6B7A90]">Belum ada foto dipilih. Lampiran B memakai kerangka tabel kosong bila tidak ada foto terpilih.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {status.pilihan.map((f) => (
              <div key={f.id} className="relative h-[52px] w-[70px] overflow-hidden rounded border border-[#CBD6E6]" title={`Foto ${f.slot} · ${f.nama} · ${tanggalSingkat(f.tanggal)}`}>
                <GambarFoto kegiatanId={kegiatanId} id={f.id} kelas="h-full w-full" />
                <button
                  type="button"
                  aria-label={`Lepas foto ${f.slot} ${f.nama}`}
                  onClick={() => terapkan(statusRef.current.pilihan, [f], false)}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-[#B42329]/90 text-[12px] font-bold leading-none text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* tampilan di laporan */}
      <div className="space-y-2 rounded-lg bg-[#F6F8FB] p-3">
        <p className="text-[12px] font-bold text-[#55657D]">Tampilan di laporan</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] font-bold text-[#55657D]">
            Foto per baris
            <select className={`${INPUT} mt-1 font-normal`} value={status.opsi.perBaris} onChange={(e) => onUbah({ ...status, opsi: { ...status.opsi, perBaris: e.target.value === "3" ? 3 : 2 } })}>
              <option value={2}>2 foto per baris (lebih besar)</option>
              <option value={3}>3 foto per baris (lebih ringkas)</option>
            </select>
          </label>
          <label className="block text-[12px] font-bold text-[#55657D]">
            Urutan foto
            <select className={`${INPUT} mt-1 font-normal`} value={status.urut} onChange={(e) => onUbah({ ...status, urut: e.target.value as UrutFoto })}>
              {URUT.map((u) => (
                <option key={u.kode} value={u.kode}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <p className="mb-1 text-[12px] font-bold text-[#55657D]">Keterangan di bawah foto</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {KET.map((k) => (
              <label key={k.kode} className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1E2B3F]">
                <input type="checkbox" checked={status.opsi.ket[k.kode]} onChange={(e) => setKet(k.kode, e.target.checked)} className="h-4 w-4 accent-[#1F5FD1]" />
                {k.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
