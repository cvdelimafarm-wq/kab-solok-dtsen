"use client";

// app/sigap/kelola/luring/page.tsx
//
// (14 Nov 2026, rancangan luring butir penjagaan 5) KESEHATAN LURING HP INI: versi service worker, simpanan (kerangka halaman, berkas aplikasi, peta),
// pekerjaan yang belum terkirim (antrean isian, foto, tes/absen/Vanguard tanpa sinyal), paket soal yang siap, dan selisih jam HP terhadap server.
// Hanya membaca keadaan HP yang sedang dipakai (tidak ada data akun lain). Dipakai panitia/pengelola untuk memeriksa HP petugas sebelum hari H.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import { BTN_O, Kartu, Pesan, TD, TH } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import { KUNCI_ANTREAN } from "@/app/portal/sesi";
import { daftarAntrean } from "@/app/sigap/foto/antreanFoto";
import { AWALAN_LURING, selisihJamServer, tandaPemilik } from "@/lib/luringSimpan";
import { teksTerakhir, terakhirDaring } from "@/app/portal/luring";

type Baris = { label: string; nilai: string; nada?: "ok" | "awas" | "galat" };
type Entri = { kunci: string; jenis: string; kotor: boolean; ukuran: number; ket: string };

const JENIS: [RegExp, string][] = [
  [/^paket:/, "Paket soal tes (tersandi)"],
  [/^sesitl:/, "Tes tanpa sinyal"],
  [/^tes:/, "Tes bersinyal (cadangan HP)"],
  [/^ringkas:/, "Ringkasan tes terakhir"],
  [/^absen:/, "Absen tanpa sinyal"],
  [/^vga:/, "Antrean Vanguard"],
  [/^vgr:/, "Kunci latihan Vanguard"],
  [/^vgs:/, "Status Vanguard"],
  [/^jam$/, "Selisih jam server"],
];

async function hitungCache(): Promise<{ nama: string; jumlah: number }[]> {
  if (typeof caches === "undefined") return [];
  const nama = await caches.keys();
  const out: { nama: string; jumlah: number }[] = [];
  for (const n of nama) out.push({ nama: n, jumlah: (await (await caches.open(n)).keys()).length });
  return out;
}

export default function KesehatanLuring() {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [entri, setEntri] = useState<Entri[]>([]);
  const [cache, setCache] = useState<{ nama: string; jumlah: number }[]>([]);
  const [memuat, setMemuat] = useState(true);

  const periksa = useCallback(async () => {
    setMemuat(true);
    const b: Baris[] = [];
    const reg = typeof navigator !== "undefined" && "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
    const c = await hitungCache().catch(() => []);
    const versi = c.map((x) => x.nama).find((n) => /^sigap-v\d+$/.test(n)) ?? "(tidak ada)";
    b.push({ label: "Service worker", nilai: reg?.active ? `aktif · ${versi}` : "belum terpasang", nada: reg?.active ? "ok" : "galat" });
    b.push({ label: "Sambungan", nilai: navigator.onLine ? "bersinyal" : `tanpa sinyal${terakhirDaring() ? ` · ${teksTerakhir(terakhirDaring() as number)}` : ""}`, nada: navigator.onLine ? "ok" : "awas" });
    const jam = selisihJamServer(localStorage);
    b.push({ label: "Selisih jam HP", nilai: jam ? `${jam.selisih >= 0 ? "HP lebih lambat" : "HP lebih cepat"} ${Math.abs(Math.round(jam.selisih / 1000))} detik` : "belum diukur", nada: !jam ? "awas" : Math.abs(jam.selisih) > 5 * 60_000 ? "awas" : "ok" });
    let antre = 0;
    try {
      const a = JSON.parse(localStorage.getItem(KUNCI_ANTREAN) ?? "[]") as unknown[];
      antre = Array.isArray(a) ? a.length : 0;
    } catch {
      antre = 0;
    }
    b.push({ label: "Antrean isian (pendataan/identifikasi)", nilai: `${antre} menunggu`, nada: antre ? "awas" : "ok" });
    const foto = await daftarAntrean().catch(() => []);
    b.push({ label: "Antrean foto", nilai: `${foto.length} menunggu`, nada: foto.length ? "awas" : "ok" });
    let penyimpanan = "";
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) penyimpanan = `${(est.usage / 1048576).toFixed(1)} MB dipakai${est.quota ? ` dari ${(est.quota / 1048576).toFixed(0)} MB` : ""}`;
    } catch {
      /* tidak didukung */
    }
    if (penyimpanan) b.push({ label: "Penyimpanan peramban", nilai: penyimpanan });
    const pemilik = tandaPemilik(bacaSesi());
    const e: Entri[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(AWALAN_LURING)) continue;
      const isi = localStorage.getItem(k) ?? "";
      let kotor = false;
      let milik = true;
      try {
        const x = JSON.parse(isi) as { kotor?: boolean; pemilik?: string };
        kotor = !!x?.kotor;
        milik = !x?.pemilik || x.pemilik === pemilik;
      } catch {
        /* abaikan */
      }
      const ekor = k.slice(AWALAN_LURING.length);
      e.push({ kunci: ekor, jenis: JENIS.find(([r]) => r.test(ekor))?.[1] ?? "Lainnya", kotor, ukuran: isi.length, ket: milik ? "" : "akun lain" });
    }
    e.sort((a, b2) => Number(b2.kotor) - Number(a.kotor) || a.jenis.localeCompare(b2.jenis));
    setBaris(b);
    setEntri(e);
    setCache(c);
    setMemuat(false);
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void periksa();
  }, [periksa]);

  const kotor = entri.filter((x) => x.kotor).length;
  const warna = (n?: Baris["nada"]) => (n === "ok" ? "text-[#13794B]" : n === "awas" ? "text-[#8A6200]" : n === "galat" ? "text-[#B42329]" : "text-[#1B2B4B]");

  return (
    <Bingkai aktif="pelatihan_kelola" kecil="SIGAP · Kesehatan luring" jejak={["Kelola", "Kesehatan luring"]} judul="Kesehatan luring HP ini" sub="Simpanan tanpa sinyal, pekerjaan yang belum terkirim, dan jam HP" kanan={() => <button type="button" className={BTN_O} onClick={() => void periksa()} disabled={memuat}>{memuat ? "Memeriksa…" : "Periksa lagi"}</button>}>
      <div className="space-y-3">
        {kotor > 0 && <Pesan jenis="peringatan">{kotor} pekerjaan tanpa sinyal belum terkirim. Jangan keluar akun atau menghapus data peramban sebelum HP mendapat sinyal.</Pesan>}
        <Kartu judul="Ringkasan">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
            {baris.map((x) => (
              <div key={x.label} className="contents">
                <dt className="min-w-0 text-[#5B6B84]">{x.label}</dt>
                <dd className={`text-right font-semibold ${warna(x.nada)}`}>{x.nilai}</dd>
              </div>
            ))}
          </dl>
        </Kartu>
        <Kartu judul={`Simpanan tanpa sinyal (${entri.length})`}>
          {entri.length === 0 ? (
            <p className="text-[13px] text-[#6B7A90]">Belum ada simpanan tanpa sinyal di HP ini.</p>
          ) : (
            <div className="relative w-full min-w-0 max-w-full overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <th className={TH}>Jenis</th>
                    <th className={TH}>Status</th>
                    <th className={`${TH} text-right`}>Ukuran</th>
                  </tr>
                </thead>
                <tbody>
                  {entri.map((x) => (
                    <tr key={x.kunci}>
                      <td className={TD}>
                        <span className="font-semibold">{x.jenis}</span>
                        <span className="block break-all text-[11px] text-[#8592A8]">{x.kunci}{x.ket ? ` · ${x.ket}` : ""}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap ${x.kotor ? "font-semibold text-[#8A6200]" : "text-[#13794B]"}`}>{x.kotor ? "Belum terkirim" : "Tersimpan"}</td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{x.ukuran < 1024 ? `${x.ukuran} B` : `${(x.ukuran / 1024).toFixed(1)} KB`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
        <Kartu judul="Simpanan service worker">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
            {cache.map((x) => (
              <div key={x.nama} className="contents">
                <dt className="min-w-0 break-all text-[#5B6B84]">{x.nama === "sigap-halaman-v1" ? "Kerangka halaman" : x.nama === "sigap-app-v1" ? "Berkas aplikasi" : x.nama === "sigap-peta-v1" ? "Peta tersimpan" : x.nama}</dt>
                <dd className="text-right font-semibold tabular-nums">{x.jumlah} berkas</dd>
              </div>
            ))}
            {cache.length === 0 && <dd className="text-[#6B7A90]">Tidak ada.</dd>}
          </dl>
        </Kartu>
      </div>
    </Bingkai>
  );
}
