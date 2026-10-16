"use client";

// app/sigap/spdt/useSpdt.ts
//
// (16 Okt 2026) Pengambil data Lembar Pendataan SPDT NTP lewat simpanan bersama (app/portal/dataBersama.ts): langsung tampil, diperbarui di belakang.
// Daftar KK bisa dibuka tanpa sinyal setelah pernah dimuat. Pencatatan "koordinat dibuka" bersifat "kirim lalu lupakan": gagal = diabaikan.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import { alamatMasukKembali, apiPortal } from "@/app/portal/sesi";
import { API_SPDT_KK, API_SPDT_MONITORING, type DataKkSpdt, type DataMonitoring } from "@/lib/spdtNtp";

export function useKkSpdt() {
  const router = useRouter();
  const d = useData<DataKkSpdt>(API_SPDT_KK);
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace(alamatMasukKembali());
  }, [d.galat, router]);
  const galat = !d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  return { data: d.data, galat, memuat: d.memuat, muat: d.muat };
}

export function useMonitoringSpdt(aktif: boolean) {
  const d = useData<DataMonitoring>(API_SPDT_MONITORING, { aktif });
  const galat = !d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  return { data: d.data, galat, memuat: aktif && d.memuat, muat: d.muat };
}

const sudahDicatat = new Set<string>();

/** Catat koordinat KK dibuka (sekali per KK per jenis selama halaman terbuka; server menyatukan per hari). */
export function catatBukaKk(kkId: number, navigasi = false) {
  const kunci = `${kkId}:${navigasi ? 1 : 0}`;
  if (sudahDicatat.has(kunci)) return;
  sudahDicatat.add(kunci);
  apiPortal(API_SPDT_KK, { method: "POST", body: JSON.stringify({ kk_id: kkId, navigasi }) }).catch(() => sudahDicatat.delete(kunci));
}
