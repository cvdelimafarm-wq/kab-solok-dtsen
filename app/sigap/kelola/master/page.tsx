"use client";

// app/sigap/kelola/master/page.tsx
//
// (7 Nov 2026, tahap C1-C4) Menu Master (Pengelolaan): wilayah, peta, keluarga (KK), mitra, dan pegawai master lintas kegiatan. Khusus admin Master (Ketua): izin
// `master.wilayah` lewat peran `admin_master` (SQL 20261107h). Tab: Wilayah dan peta (C1), Batas wilayah = unggah shapefile berversi (C2, SQL 20261107i),
// KK master = unggah per kecamatan + usulan lapangan (C3, SQL 20261107j), Mitra dan Pegawai = kesehatan master, baca saja (C4).
// Tab terpilih disimpan di ?tab= (tanpa useSearchParams agar halaman tetap statis).

import { useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import { BarisTab, type ItemTab } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import BatasShapefile from "./BatasShapefile";
import KkMaster from "./KkMaster";
import OrangMaster from "./OrangMaster";
import WilayahPeta from "./WilayahPeta";

type TabMaster = "wilayah" | "batas" | "kk" | "orang";
const TAB: ItemTab<TabMaster>[] = [
  { kode: "wilayah", label: "Wilayah dan peta" },
  { kode: "batas", label: "Batas wilayah" },
  { kode: "kk", label: "KK master" },
  { kode: "orang", label: "Mitra dan Pegawai" },
];
const JUDUL: Record<TabMaster, string> = { wilayah: "Wilayah dan peta", batas: "Batas wilayah", kk: "KK master", orang: "Mitra dan Pegawai" };
const sahTab = (t: string | null): t is TabMaster => t === "wilayah" || t === "batas" || t === "kk" || t === "orang";

export default function MasterWilayahHalaman() {
  const [tab, setTab] = useState<TabMaster>("wilayah");

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    const t = new URLSearchParams(window.location.search).get("tab");
    if (sahTab(t)) setTab(t);
  }, []);

  const pilih = (k: TabMaster) => {
    setTab(k);
    try {
      const u = new URL(window.location.href);
      if (k === "wilayah") u.searchParams.delete("tab");
      else u.searchParams.set("tab", k);
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch {
      /* alamat tidak bisa diubah: tab tetap berganti di layar */
    }
  };

  return (
    <Bingkai
      aktif="master_wilayah"
      kecil="SIGAP · Master"
      jejak={["Pengelolaan", "Master", JUDUL[tab]]}
      judul="Master wilayah dan peta"
      sub="Satu sumber wilayah, peta, dan keluarga (KK) untuk semua kegiatan · khusus admin Master"
    >
      <div className="flex flex-col gap-3.5">
        <BarisTab tab={TAB} aktif={tab} onPilih={pilih} />
        {tab === "wilayah" && <WilayahPeta />}
        {tab === "batas" && <BatasShapefile />}
        {tab === "kk" && <KkMaster />}
        {tab === "orang" && <OrangMaster />}
      </div>
    </Bingkai>
  );
}
