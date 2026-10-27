"use client";

// app/sigap/kelola/masukan/page.tsx
//
// (28 Okt 2026) SIGAP Kelola > Usulan perbaikan: masukan pengguna dari tombol "Masukan". Admin aplikasi (portal.kelola = kelola) membaca, menandai
// status (baru -> dibaca -> diproses -> selesai | tidak diambil) dan memberi catatan yang dilihat pengirim di "Masukan saya". Tidak ada hapus.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import Bingkai from "../../kontrak/Bingkai";
import { ambilJson } from "../../foto/klien";
import { CATATAN_MAKS, LABEL_JENIS, LABEL_STATUS, STATUS_MASUKAN, adalahJenis, type StatusMasukan } from "@/lib/sigapMasukan";

type Baris = {
  id: number;
  akun_id: number;
  nama_pengirim: string;
  jenis: string;
  isi: string;
  halaman: string | null;
  peran: string | null;
  versi: string | null;
  perangkat: string | null;
  ada_gambar: boolean;
  status: StatusMasukan;
  catatan_admin: string | null;
  nama_pengubah: string | null;
  dibuat_at: string;
  diubah_at: string;
};
type Hitung = Record<StatusMasukan, number>;

const NADA: Record<string, string> = {
  baru: "bg-[#E3EEFB] text-[#1F5FD1]",
  dibaca: "bg-[#EEF1F5] text-[#4D5B6B]",
  diproses: "bg-[#FBEFD6] text-[#9A6200]",
  selesai: "bg-[#E3F6EC] text-[#13794B]",
  ditolak: "bg-[#F6E4E4] text-[#A13030]",
};
const tgl = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function KartuUsulan({ b, onUbah }: { b: Baris; onUbah: (id: number, ubah: { status?: StatusMasukan; catatan?: string }) => Promise<void> }) {
  const [catatan, setCatatan] = useState(b.catatan_admin ?? "");
  const [sibuk, setSibuk] = useState(false);
  const [gambar, setGambar] = useState<string | null>(null);
  const [gagalGambar, setGagalGambar] = useState<string | null>(null);

  useEffect(() => setCatatan(b.catatan_admin ?? ""), [b.catatan_admin]);
  useEffect(() => () => { if (gambar) URL.revokeObjectURL(gambar); }, [gambar]);

  async function lihatGambar() {
    setGagalGambar(null);
    try {
      const s = bacaSesi();
      const r = await fetch(`/api/sigap/masukan?gambar=${b.id}`, { headers: s ? { Authorization: `Bearer ${s}` } : {} });
      if (!r.ok) throw new Error("Tangkapan layar tidak bisa dimuat.");
      setGambar(URL.createObjectURL(await r.blob()));
    } catch (e) {
      setGagalGambar(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }

  async function jalankan(ubah: { status?: StatusMasukan; catatan?: string }) {
    setSibuk(true);
    try {
      await onUbah(b.id, ubah);
    } finally {
      setSibuk(false);
    }
  }

  const catatanBerubah = catatan.trim() !== (b.catatan_admin ?? "").trim();

  return (
    <li className="rounded-2xl border border-[#E3E8EE] bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${NADA[b.status]}`}>{LABEL_STATUS[b.status]}</span>
        <span className="rounded-full bg-[#EEF1F5] px-2 py-0.5 text-[11.5px] font-bold text-[#4D5B6B]">{adalahJenis(b.jenis) ? LABEL_JENIS[b.jenis] : b.jenis}</span>
        <b className="text-[13.5px]">{b.nama_pengirim}</b>
        {b.peran && <span className="text-[12px] text-[#6B7A90]">· {b.peran}</span>}
        <span className="ml-auto text-[11.5px] text-[#7B8794]">{tgl(b.dibuat_at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-snug">{b.isi}</p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-[#7B8794]">
        {[b.halaman && `Halaman ${b.halaman}`, b.perangkat, b.versi && `versi ${b.versi}`].filter(Boolean).join(" · ")}
      </p>

      {b.ada_gambar && (
        <div className="mt-2">
          {gambar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gambar} alt="Tangkapan layar dari pengirim" className="max-h-[360px] w-auto max-w-full rounded-lg border border-[#E3E8EE]" />
          ) : (
            <button type="button" onClick={() => void lihatGambar()} className="min-h-[40px] rounded-lg border border-[#CDD5DE] px-3 text-[12.5px] font-bold text-[#1F5FD1]">
              Lihat tangkapan layar
            </button>
          )}
          {gagalGambar && <p className="mt-1 text-[12px] text-red-700">{gagalGambar}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Ubah status">
        {STATUS_MASUKAN.map((s) => (
          <button
            key={s}
            type="button"
            disabled={sibuk || b.status === s}
            aria-pressed={b.status === s}
            onClick={() => void jalankan({ status: s })}
            className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-bold disabled:opacity-60 ${b.status === s ? "border-[#1F5FD1] bg-[#E3EEFB] text-[#1F5FD1]" : "border-[#CDD5DE] bg-white text-[#4D5B6B]"}`}
          >
            {LABEL_STATUS[s]}
          </button>
        ))}
      </div>

      <label className="mt-2.5 block">
        <span className="mb-1 block text-[12px] font-bold text-[#4D5B6B]">Catatan untuk pengirim (terlihat di &quot;Masukan saya&quot;)</span>
        <textarea value={catatan} onChange={(e) => setCatatan(e.target.value.slice(0, CATATAN_MAKS))} rows={2} className="w-full resize-y rounded-lg border border-[#CDD5DE] px-2.5 py-2 text-[14px] outline-none focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/25" />
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" disabled={sibuk || !catatanBerubah} onClick={() => void jalankan({ catatan })} className="min-h-[38px] rounded-lg bg-[#1F5FD1] px-4 text-[13px] font-bold text-white disabled:opacity-50">
          Simpan catatan
        </button>
        {b.nama_pengubah && <span className="text-[11.5px] text-[#7B8794]">Terakhir diubah {b.nama_pengubah}, {tgl(b.diubah_at)}</span>}
      </div>
    </li>
  );
}

export default function KelolaMasukan() {
  const [daftar, setDaftar] = useState<Baris[] | null>(null);
  const [hitung, setHitung] = useState<Hitung | null>(null);
  const [saring, setSaring] = useState<StatusMasukan | "semua">("semua");
  const [galat, setGalat] = useState<string | null>(null);
  const [dilarang, setDilarang] = useState(false);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<{ masukan: Baris[]; hitung: Hitung }>("/api/sigap/masukan");
      setDaftar(d.masukan);
      setHitung(d.hitung);
      setGalat(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "SESI_BERAKHIR") return keMasuk();
      if ((e as { status?: number }).status === 403) return setDilarang(true);
      setGalat(m || "Gagal memuat usulan.");
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  const ubah = useCallback(
    async (id: number, u: { status?: StatusMasukan; catatan?: string }) => {
      try {
        await ambilJson("/api/sigap/masukan", { method: "PATCH", body: { id, ...u } });
        setGalat(null);
        await muat();
      } catch (e) {
        setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
      }
    },
    [muat]
  );

  const tampil = (daftar ?? []).filter((b) => saring === "semua" || b.status === saring);

  return (
    <Bingkai
      aktif="masukan_kelola"
      kecil="SIGAP · Usulan perbaikan"
      jejak={["Pengelolaan", "Usulan perbaikan"]}
      judul="Usulan perbaikan"
      sub="Masukan, laporan galat, dan pertanyaan dari pengguna lewat tombol Masukan"
      kembali={{ induk: "/" }}
    >
      {dilarang ? (
        <p className="rounded-xl bg-white px-4 py-6 text-center text-[13.5px] text-[#4D5B6B]">Halaman ini hanya untuk admin aplikasi.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status">
            {(["semua", ...STATUS_MASUKAN] as const).map((s) => {
              const n = s === "semua" ? (hitung ? Object.values(hitung).reduce((a, b) => a + b, 0) : 0) : hitung?.[s] ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={saring === s}
                  onClick={() => setSaring(s)}
                  className={`min-h-[38px] rounded-full border px-3 text-[12.5px] font-bold ${saring === s ? "border-[#1F5FD1] bg-[#E3EEFB] text-[#1F5FD1]" : "border-[#CDD5DE] bg-white text-[#4D5B6B]"}`}
                >
                  {s === "semua" ? "Semua" : LABEL_STATUS[s]} · {n}
                </button>
              );
            })}
            <button type="button" onClick={() => void muat()} className="ml-auto min-h-[38px] px-2 text-[12.5px] font-bold text-[#1F5FD1]">
              Muat ulang
            </button>
          </div>
          {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{galat}</p>}
          {!daftar && !galat && <p className="text-[13px] text-[#6B7A90]">Memuat…</p>}
          {daftar && tampil.length === 0 && <p className="rounded-xl bg-white px-4 py-6 text-center text-[13.5px] text-[#6B7A90]">{daftar.length === 0 ? "Belum ada masukan." : "Tidak ada usulan dengan status ini."}</p>}
          <ul className="space-y-2.5">
            {tampil.map((b) => (
              <KartuUsulan key={b.id} b={b} onUbah={ubah} />
            ))}
          </ul>
        </>
      )}
    </Bingkai>
  );
}
