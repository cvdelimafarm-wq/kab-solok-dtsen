"use client";

// (7 Okt 2026) Portal satu login -- beranda: kartu sesuai peran & periode (dihitung server, /api/portal/beranda).
// Kelompok: Tugas aktif, Pengelolaan, Referensi, Riwayat (arsip baca-saja) -- sesuai mockup yg disetujui user.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Kartu } from "@/lib/portal/server";
import GantiPinCepat from "./GantiPinCepat";
import { PIN_AWAL } from "@/lib/sigapMasukNama";
import { apiPortal, bacaSesi, hapusSemuaSesi, simpanPenyisiran, type SsoPenyisiran } from "./sesi";

type Data = { nama: string; jenis: string; peran: string[]; admin_aplikasi: boolean; kartu: Kartu[]; pin_bawaan?: boolean };
export type InfoDtsen = { nama: string; role: string | null } | null;

const GRUP: { kode: Kartu["grup"]; judul: string }[] = [
  { kode: "tugas", judul: "Tugas aktif" },
  { kode: "kelola", judul: "Pengelolaan" },
  { kode: "referensi", judul: "Referensi" },
  { kode: "riwayat", judul: "Riwayat (baca-saja)" },
];

const NADA: Record<string, string> = {
  aktif: "bg-[#E3F4EE] text-[#1E7A5E]",
  tenggang: "bg-[#FDF1DC] text-[#8A5A0B]",
  arsip: "bg-[#EDF1F5] text-[#4D5B6B]",
  info: "bg-[#E8F1FC] text-[#1A5DB0]",
  peringatan: "bg-[#FDECEA] text-[#8A2B1D]",
};

const GARIS: Record<Kartu["grup"], string> = {
  tugas: "border-l-[#1F6FD1]",
  kelola: "border-l-[#D9971F]",
  referensi: "border-l-[#3DBB98]",
  riwayat: "border-l-[#B8C2CE]",
};

export default function Beranda({ dtsen, onKeluar }: { dtsen: InfoDtsen; onKeluar: () => void }) {
  const adaSesi = typeof window !== "undefined" && !!bacaSesi();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  // (8 Okt 2026) Ajakan ganti PIN awal 1303: spanduk tetap tampil sampai PIN diganti; tombolnya membuka layar ganti cepat.
  const [gantiPin, setGantiPin] = useState(false);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return;
    try {
      setData(await apiPortal<Data>("/api/portal/beranda"));
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return onKeluar();
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [onKeluar]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function keluar() {
    hapusSemuaSesi();
    if (dtsen) await createClient().auth.signOut().catch(() => {});
    onKeluar();
  }

  async function bukaSso(k: Kartu) {
    if (k.sso !== "penyisiran") return;
    setSibuk(k.kode);
    setError(null);
    try {
      const d = await apiPortal<SsoPenyisiran>("/api/portal/sso", { method: "POST", body: JSON.stringify({ app: "penyisiran" }) });
      simpanPenyisiran(d);
      window.location.href = "/penyisiran";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka penyisiran.");
      setSibuk(null);
    }
  }

  const kartu: Kartu[] = [...(data?.kartu ?? [])];
  if (dtsen) {
    kartu.unshift({
      kode: "dtsen-operator",
      grup: "tugas",
      judul: "Usulan Update Data DTSEN",
      uraian: "Terbitkan surat keterangan & pantau status usulan.",
      status: { label: "Aktif", nada: "aktif" },
      href: "/dashboard",
      label_aksi: "Buka dashboard",
    });
  }
  const nama = data?.nama ?? dtsen?.nama ?? "";

  return (
    <main className="min-h-screen bg-[#F3F5F8] pb-12 text-[#14202E]">
      <header className="bg-[#0E2A47] px-4 pb-16 pt-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-[12.5px] font-bold italic tracking-wide">BPS KABUPATEN SOLOK</span>
          <button type="button" onClick={keluar} className="rounded-md border border-[#3A5675] px-3 py-1.5 text-[12.5px] text-[#C9D6E6] hover:bg-[#1C3D61]">
            Keluar
          </button>
        </div>
        <div className="mx-auto mt-6 max-w-5xl">
          <p className="text-[13px] text-[#C9D6E6]">Selamat datang,</p>
          <h1 className="text-[22px] font-bold sm:text-[26px]">{nama || "…"}</h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(data?.peran ?? []).map((p) => (
              <span key={p} className="rounded-full bg-[#1C3D61] px-2.5 py-0.5 text-[11.5px] text-[#C9D6E6]">{p}</span>
            ))}
            {data?.jenis === "organik" && <span className="rounded-full bg-[#1C3D61] px-2.5 py-0.5 text-[11.5px] text-[#C9D6E6]">Pegawai organik</span>}
            {data?.jenis === "mitra" && <span className="rounded-full bg-[#1C3D61] px-2.5 py-0.5 text-[11.5px] text-[#C9D6E6]">Mitra statistik</span>}
            {dtsen && <span className="rounded-full bg-[#1C3D61] px-2.5 py-0.5 text-[11.5px] text-[#C9D6E6]">Operator Wali Nagari</span>}
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-5xl space-y-6 px-4">
        {data?.pin_bawaan && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F0D9A0] bg-[#FFF8E6] px-4 py-3 text-[13.5px] text-[#6B4A00]" role="alert">
            <span aria-hidden className="text-[20px]">⚠️</span>
            <p className="min-w-[200px] flex-1 leading-snug">
              <b>Anda masih memakai PIN awal {PIN_AWAL}</b> yang sama dengan pegawai lain. Ganti dengan PIN sendiri agar akun Anda aman.
            </p>
            <button type="button" onClick={() => setGantiPin(true)} className="rounded-lg bg-[#1E7A4C] px-4 py-2 text-[13.5px] font-bold text-white hover:bg-[#17623C]">
              Ganti PIN sekarang
            </button>
          </div>
        )}
        {error && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]">{error}</p>}
        {adaSesi && !data && !error && <p className="rounded-xl border border-[#E3E8EE] bg-white px-4 py-6 text-center text-[13.5px] text-[#7B8794]">Memuat menu…</p>}
        {(data || dtsen) && kartu.length === 0 && (
          <p className="rounded-xl border border-[#E3E8EE] bg-white px-4 py-6 text-center text-[13.5px] text-[#4D5B6B]">
            Belum ada tugas atau menu aktif untuk akun Anda. Hubungi admin anggaran atau PJ kegiatan.
          </p>
        )}
        {GRUP.map((g) => {
          const isi = kartu.filter((k) => k.grup === g.kode);
          if (isi.length === 0) return null;
          return (
            <section key={g.kode}>
              <h2 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-[#7B8794]">{g.judul}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {isi.map((k) => (
                  <KartuItem key={k.kode} k={k} sibuk={sibuk === k.kode} onSso={() => bukaSso(k)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {gantiPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setGantiPin(false)}>
          <div className="max-h-full w-full max-w-[400px] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <GantiPinCepat
              onSelesai={() => {
                setGantiPin(false);
                setData((d) => (d ? { ...d, pin_bawaan: false } : d));
              }}
              onNanti={() => setGantiPin(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function KartuItem({ k, sibuk, onSso }: { k: Kartu; sibuk: boolean; onSso: () => void }) {
  const gelap = !!k.gelap;
  const isi = (
    <div
      className={`flex h-full flex-col gap-2 rounded-xl border border-l-4 p-4 transition ${
        gelap ? "border-[#0E2A47] border-l-[#D9971F] bg-[#0E2A47] text-white" : `border-[#E3E8EE] bg-white ${GARIS[k.grup]}`
      } ${k.href || k.sso ? "hover:-translate-y-0.5 hover:shadow-md" : "opacity-80"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-[15px] leading-snug">{k.judul}</strong>
        {k.status && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${NADA[k.status.nada] ?? NADA.info}`}>{k.status.label}</span>}
      </div>
      <p className={`text-[13px] leading-relaxed ${gelap ? "text-[#C9D6E6]" : "text-[#4D5B6B]"}`}>{k.uraian}</p>
      {(k.href || k.sso) && (
        <span className={`mt-auto text-[13px] font-semibold ${gelap ? "text-[#F2C46D]" : "text-[#1F6FD1]"}`}>{sibuk ? "Membuka…" : `${k.label_aksi ?? "Buka"} →`}</span>
      )}
    </div>
  );
  if (k.sso) {
    return (
      <button type="button" onClick={onSso} disabled={sibuk} className="text-left">
        {isi}
      </button>
    );
  }
  if (k.href) {
    return k.href.startsWith("http") ? (
      <a href={k.href} target="_blank" rel="noopener noreferrer">{isi}</a>
    ) : (
      <Link href={k.href}>{isi}</Link>
    );
  }
  return isi;
}
