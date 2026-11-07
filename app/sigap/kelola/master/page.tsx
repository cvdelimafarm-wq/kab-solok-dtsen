"use client";

// app/sigap/kelola/master/page.tsx
//
// (7 Nov 2026, tahap C1) Menu Master (Pengelolaan): wilayah, peta, dan keluarga (KK) master lintas kegiatan. Khusus admin Master (Ketua): izin `master.wilayah`
// lewat peran `admin_master` (SQL 20261107h). Tahap ini: tab Wilayah dan Peta (status per sub SLS). Menyusul: unggah shapefile, KK, mitra, pegawai.

import { useEffect } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import Bingkai from "../../kontrak/Bingkai";
import WilayahPeta from "./WilayahPeta";

export default function MasterWilayahHalaman() {
  useEffect(() => {
    if (!bacaSesi()) keMasuk();
  }, []);
  return (
    <Bingkai
      aktif="master_wilayah"
      kecil="SIGAP · Master"
      jejak={["Pengelolaan", "Master", "Wilayah dan peta"]}
      judul="Master wilayah dan peta"
      sub="Satu sumber wilayah, peta, dan keluarga (KK) untuk semua kegiatan · khusus admin Master"
    >
      <WilayahPeta />
    </Bingkai>
  );
}
