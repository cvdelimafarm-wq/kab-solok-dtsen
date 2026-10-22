"use client";

// app/sigap/kelola/pendataan/Ringkasan.tsx
//
// (23 Okt 2026) Tab "Ringkasan" Kelola Pendataan: angka utama (KK dalam daftar, sudah didata, permintaan daftar KK yang menunggu admin) dan
// alur pendataan runut (langkah 1-6 = tab di sebelahnya, satu sumber dengan lib/sigapPendataanTab.ts). Hanya-baca; angka dimuat dari dua API yang
// sama dengan tab Persiapan, dan kegagalan salah satunya tidak menghalangi yang lain.

import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_PERMINTAAN, type DataPermintaanAdmin } from "@/lib/permintaanDaftar";
import { TAB_PENDATAAN, type KodeTabPendataan } from "@/lib/sigapPendataanTab";
import { BTN_O, Chip, Kartu, KartuAngka } from "../../admin/ui";

type DataKk = { total_aktif: number; total_didata: number };

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export default function Ringkasan({ onBuka }: { onBuka: (tab: KodeTabPendataan) => void }) {
  const [kk, setKk] = useState<DataKk | null>(null);
  const [menunggu, setMenunggu] = useState<number | null>(null);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    let batal = false;
    void (async () => {
      const [a, b] = await Promise.allSettled([apiPortal<DataKk>("/api/portal/pendataan/unggah"), apiPortal<DataPermintaanAdmin>(`${API_PERMINTAAN}?admin=1`)]);
      if (batal) return;
      if (a.status === "fulfilled") setKk(a.value);
      if (b.status === "fulfilled") setMenunggu((b.value.permintaan ?? []).filter((p) => p.status === "menunggu").length);
      setSelesai(true);
    })();
    return () => {
      batal = true;
    };
  }, []);

  const persen = kk && kk.total_aktif > 0 ? Math.round((kk.total_didata / kk.total_aktif) * 100) : 0;
  const langkah = TAB_PENDATAAN.filter((t) => t.kode !== "ringkasan");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <KartuAngka label="KK dalam daftar" nilai={kk ? fmt(kk.total_aktif) : "…"} ket="sasaran pendataan keroyokan" />
        <KartuAngka label="Sudah didata" nilai={kk ? fmt(kk.total_didata) : "…"} ket={kk ? `${persen}% dari daftar` : undefined} warna="#13794B" />
        <KartuAngka
          label="Permintaan menunggu admin"
          nilai={menunggu === null ? (selesai ? "-" : "…") : fmt(menunggu)}
          ket="daftar KK yang diajukan PML ke FASIH"
          warna={menunggu ? "#8A6200" : undefined}
        />
      </div>
      {kk && kk.total_aktif > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-[#E3E8EE]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen} aria-label="Kemajuan pendataan">
          <div className="h-full rounded-full bg-[#13794B]" style={{ width: `${persen}%` }} />
        </div>
      )}
      {selesai && kk === null && menunggu === null && <p className="rounded-lg border border-[#DDE6F3] bg-white px-3.5 py-2.5 text-[13px] text-[#55657D]">Angka ringkasan belum bisa dimuat. Tab di atas tetap bisa dipakai.</p>}

      <Kartu judul="Alur pendataan" ket="runut dari persiapan sampai pertanggungjawaban">
        <ol className="grid gap-2 sm:grid-cols-2">
          {langkah.map((t) => (
            <li key={t.kode} className="flex items-start justify-between gap-3 rounded-lg border border-[#DDE6F3] p-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-[#0F2A52]">{t.label}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-[#55657D]">{t.ket}</p>
                {t.kode === "persiapan" && menunggu ? (
                  <p className="mt-1.5">
                    <Chip w="wait">{fmt(menunggu)} permintaan menunggu</Chip>
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={() => onBuka(t.kode)} className={`${BTN_O} shrink-0`}>
                Buka
              </button>
            </li>
          ))}
        </ol>
      </Kartu>
    </div>
  );
}
