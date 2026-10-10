"use client";

// app/sigap/identifikasi/PetaSheet.tsx
//
// (10 Okt 2026) Lembar bawah "Peta" -- permintaan user: ikon peta di sebelah nama nagari untuk melihat peta WA (desa) dan peta SLS.
// Berkas diunggah belakangan ke bucket Storage "peta-wilayah"; yang belum ada tampil "Belum diunggah". Tautan dari /api/portal/peta (berlaku 1 jam).
// (10 Okt 2026) Peta yang sudah diunduh ke HP (app/portal/petaOffline.ts) dibuka dari alamat tetap /peta-cache/... -- seketika & tanpa sinyal, dan bila SEMUA
// peta yang diperlukan sudah tersimpan, lembar ini tidak memanggil server sama sekali. Yang belum tersimpan tetap memakai tautan bertanda tangan seperti semula.

// (10 Okt 2026) Lembar langsung tampil dari daftar di HP (manifest) tanpa menunggu server -- permintaan user: "klik icon peta dan menunggu modal terbuka penuh masih lambat".
// Server dipanggil di belakang hanya bila ada yang belum lengkap; tanda "di HP" ikut diperbarui saat unduhan latar berjalan; unduhan latar ditahan selama lembar terbuka.

import { useEffect, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { bacaManifest, berkasDiperlukan, daftarPetaDari, jalurPeta, manifestLengkap, pantauPeta, petaTersimpanBanyak, swAktif, tahanUnduh } from "@/app/portal/petaOffline";

type Berkas = { nama: string; url: string; tipe: "pdf" | "gambar"; halaman: number; dari: number };
type Hasil = { wa: Record<string, Berkas[] | undefined>; sls: Record<string, Berkas[] | undefined> };
export type SubPeta = { idsubsls: string; nama: string; sub: string };

export function IkonPeta({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" />
      <path d="M9 4v13M15 7v13" />
    </svg>
  );
}

function Lembar({ berkas, folder, lokal, memuat }: { berkas: Berkas[] | undefined; folder: "wa" | "sls"; lokal: Set<string>; memuat: boolean }) {
  if (berkas === undefined && memuat) return <span className="inline-block h-9 w-28 animate-pulse rounded-full bg-[#E3EAF5]" aria-busy="true" />;
  if (!berkas || berkas.length === 0) return <span className="rounded-full bg-[#EEF2F7] px-3 py-1.5 text-[12px] font-bold text-[#8A97AB]">Belum diunggah</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {berkas.map((b) => {
        const jalur = jalurPeta(folder, b.nama);
        const diHp = lokal.has(jalur);
        const href = diHp ? jalur : b.url;
        const teks = b.dari > 1 ? `Lembar ${b.halaman} dari ${b.dari}` : "Buka peta";
        // belum di HP & tautan belum datang: tampil sebentar sebagai "menyiapkan" (tautan datang dari server beberapa saat kemudian)
        if (!href)
          return (
            <span key={b.nama} className={`inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#EEF2F7] px-3 text-[12.5px] font-extrabold text-[#8A97AB] ${memuat ? "animate-pulse" : ""}`}>
              <IkonPeta className="h-3.5 w-3.5" />
              {teks}
              <span className="ml-0.5 text-[10px] font-bold">{memuat ? "menyiapkan…" : "perlu sinyal"}</span>
            </span>
          );
        return (
          <a key={b.nama} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#E6EEFC] px-3 text-[12.5px] font-extrabold text-[#1F5FD1] active:bg-[#D3E0F5]">
            <IkonPeta className="h-3.5 w-3.5" />
            {teks}
            {diHp && <span className="ml-0.5 rounded-full bg-[#E3F6EC] px-1.5 py-[1px] text-[10px] font-extrabold text-[#13794B]">di HP</span>}
          </a>
        );
      })}
    </span>
  );
}

export default function PetaSheet({ buka, onTutup, judul, desa, subs }: { buka: boolean; onTutup: () => void; judul: string; desa: string | null; subs: SubPeta[] }) {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [lokal, setLokal] = useState<Set<string>>(new Set());
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const hasilRef = useRef<Hasil | null>(null);
  hasilRef.current = hasil;
  const kunci = `${desa ?? ""}|${subs.map((s) => s.idsubsls).join(",")}`;

  const jalurDari = (h: Hasil) => {
    const j: string[] = [];
    for (const arr of Object.values(h.wa)) for (const b of arr ?? []) j.push(jalurPeta("wa", b.nama));
    for (const arr of Object.values(h.sls)) for (const b of arr ?? []) j.push(jalurPeta("sls", b.nama));
    return j;
  };

  // unduhan latar berhenti mengambil berkas baru selama lembar terbuka (sinyal dipakai lembar ini dulu)
  useEffect(() => {
    if (!buka) return;
    return tahanUnduh();
  }, [buka]);

  // tanda "di HP" ikut berubah saat unduhan latar menyimpan berkas baru
  useEffect(() => {
    if (!buka) return;
    let pewaktu: ReturnType<typeof setTimeout> | null = null;
    const henti = pantauPeta(() => {
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = setTimeout(() => {
        const h = hasilRef.current;
        if (!h || !swAktif()) return;
        void petaTersimpanBanyak(jalurDari(h)).then((ada) => setLokal((lama) => (lama.size === ada.size ? lama : ada)));
      }, 400);
    });
    return () => {
      henti();
      if (pewaktu) clearTimeout(pewaktu);
    };
  }, [buka]);

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    setHasil(null);
    setGalat(null);
    setMemuat(false);
    const daftar = daftarPetaDari(subs.map((s) => s.idsubsls));
    if (desa) daftar.desa = Array.from(new Set([desa, ...daftar.desa]));
    (async () => {
      // 1) tampil SEKETIKA dari daftar di HP (manifest), tanpa menunggu server
      const m = bacaManifest();
      let adaManifest = false;
      let lengkap = false;
      if (m) {
        const lokalDari = (folder: "wa" | "sls", kode: string): Berkas[] | undefined => (kode in m[folder] ? m[folder][kode].map((b) => ({ ...b, url: "" })) : undefined);
        const dariManifest: Hasil = { wa: desa ? { [desa]: lokalDari("wa", desa) } : {}, sls: Object.fromEntries(subs.map((s) => [s.idsubsls, lokalDari("sls", s.idsubsls)])) };
        const ada = swAktif() ? await petaTersimpanBanyak(jalurDari(dariManifest)) : new Set<string>();
        if (batal) return;
        adaManifest = true;
        const perlu = berkasDiperlukan(daftar, m);
        lengkap = manifestLengkap(daftar, m) && swAktif() && perlu.every((x) => ada.has(jalurPeta(x.folder, x.berkas.nama)));
        setLokal(ada);
        setHasil(dariManifest);
        if (lengkap) return; // semua sudah di HP & daftarnya masih baru -> tanpa jaringan sama sekali
      }
      // 2) selebihnya tanya server di belakang (tautan untuk yang belum di HP), lalu tandai yang sudah tersimpan
      setMemuat(true);
      const q = new URLSearchParams();
      if (desa) q.set("desa", desa);
      if (subs.length) q.set("sub", subs.map((s) => s.idsubsls).join(","));
      try {
        const h = await apiPortal<Hasil>(`/api/portal/peta?${q.toString()}`);
        if (batal) return;
        const ada = swAktif() ? await petaTersimpanBanyak(jalurDari(h)) : new Set<string>();
        if (batal) return;
        setLokal(ada);
        setHasil(h);
      } catch (e) {
        if (!batal && !adaManifest) setGalat(e instanceof Error ? e.message : "Gagal memuat peta.");
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, kunci]);

  if (!buka) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/45" onClick={onTutup} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.stopPropagation()} className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-t-[26px] bg-white px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(15,42,82,.25)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#D3DCEA]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Peta wilayah</p>
            <h2 className="text-[17px] font-extrabold leading-tight text-[#0F2A52]">{judul}</h2>
          </div>
          <button type="button" onClick={onTutup} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[18px] font-bold text-[#55657D]" aria-label="Tutup">
            ×
          </button>
        </div>

        {galat && <p className="mt-3 rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!hasil && !galat && <div className="mt-4 h-16 animate-pulse rounded-[14px] bg-[#EEF2F7]" aria-busy="true" />}

        {hasil && (
          <div className="mt-3 space-y-3">
            {desa && (
              <div className="rounded-[16px] bg-[#F1F6FE] p-3">
                <b className="block text-[13.5px] text-[#0F2A52]">Peta WA (wilayah administrasi desa)</b>
                <small className="block text-[11.5px] text-[#55657D]">Batas nagari/desa</small>
                <div className="mt-2">
                  <Lembar berkas={hasil.wa[desa]} folder="wa" lokal={lokal} memuat={memuat} />
                </div>
              </div>
            )}
            {subs.length > 0 && (
              <div className="rounded-[16px] bg-[#F1F6FE] p-3">
                <b className="block text-[13.5px] text-[#0F2A52]">Peta SLS</b>
                <small className="block text-[11.5px] text-[#55657D]">Satu peta untuk tiap Sub SLS wilayah Anda</small>
                <ul className="mt-2 divide-y divide-[#DCE6F6]">
                  {subs.map((s) => (
                    <li key={s.idsubsls} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 text-[12.5px] font-bold leading-tight text-[#0F2A52]">
                        <span className="break-words">{s.nama}</span>
                        <span className="block text-[11px] font-semibold text-[#6B7A90]">Sub {s.sub}</span>
                      </span>
                      <Lembar berkas={hasil.sls[s.idsubsls]} folder="sls" lokal={lokal} memuat={memuat} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11.5px] leading-snug text-[#6B7A90]">Peta terbuka di tab baru. Yang bertanda "Belum diunggah" sedang disiapkan admin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
