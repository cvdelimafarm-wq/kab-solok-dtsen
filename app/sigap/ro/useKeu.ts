"use client";

// app/sigap/ro/useKeu.ts
//
// (24 Okt 2026) Pengambil data baca-saja Kertas Kerja Revisi POK: GET /api/sigap/keu/baca (lib/keu/baca.ts) lewat simpanan bersama
// (app/portal/dataBersama.ts): tampil seketika dari simpanan, diperbarui di belakang. Alamat dibentuk lib/keu/ro.ts (urlBaca).

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import { pilihRab, susunAnggaran, urlBaca, type BarisLembar, type BarisPenugasan, type BarisRabItem, type BarisRabRingkas, type BarisRealisasi } from "@/lib/keu/ro";

type Balasan<T> = { data: T[]; jumlah: number; terpotong: boolean };
export type HasilBaca<T> = { baris: T[] | null; memuat: boolean; galat: string | null; terpotong: boolean };

/** `url` null = jangan memuat (mis. data bergantung hasil lain atau tab belum dibuka). */
export function useBacaKeu<T>(url: string | null): HasilBaca<T> {
  const router = useRouter();
  const d = useData<Balasan<T>>(url ?? "/api/sigap/keu/baca", { aktif: url !== null });
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace("/");
  }, [d.galat, router]);
  if (url === null) return { baris: null, memuat: false, galat: null, terpotong: false };
  return {
    baris: d.data?.data ?? null,
    memuat: !d.data && !d.galat,
    // galat hanya bila belum ada data sama sekali (gagal muat ulang di belakang tidak mengganggu tampilan tersimpan)
    galat: !d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null,
    terpotong: d.data?.terpotong ?? false,
  };
}

/** Penugasan peran semua RO (kecil). Tampilan ini baru ada setelah berkas SQL m dijalankan; sebelum itu galat = tanda belum tersedia. */
export function usePenugasan() {
  return useBacaKeu<BarisPenugasan>(urlBaca("keu_v_penugasan_ro", {}, { batas: 2000 }));
}

/** POK berlaku satu RO + realisasi terbaru + RAB yang ditampilkan, sudah disusun Komponen -> Akun -> Item. */
export function useAnggaranRo(kode: string) {
  const lembar = useBacaKeu<BarisLembar>(urlBaca("keu_v_adm_lembar", { ro_kode: kode }, { batas: 5000 }));
  const real = useBacaKeu<BarisRealisasi & { sampai_tanggal: string }>(urlBaca("keu_v_realisasi_terbaru", { ro_kode: kode }, { batas: 5000, kolom: ["detail_id", "real_sd", "pagu", "sampai_tanggal"] }));
  const rabR = useBacaKeu<BarisRabRingkas>(urlBaca("keu_v_rab_ringkas", { ro_kode: kode }, { batas: 200 }));
  const rabPilih = useMemo(() => (rabR.baris ? pilihRab(rabR.baris, kode) : null), [rabR.baris, kode]);
  const rabItem = useBacaKeu<BarisRabItem>(rabPilih ? urlBaca("keu_v_rab_item", { rab_id: rabPilih.rab_id }, { batas: 5000 }) : null);

  const rabSiap = rabR.baris !== null && (rabPilih === null || rabItem.baris !== null);
  const anggaran = useMemo(
    () => (lembar.baris && real.baris && rabSiap ? susunAnggaran(lembar.baris, real.baris, rabItem.baris ?? []) : null),
    [lembar.baris, real.baris, rabItem.baris, rabSiap],
  );
  const galat = lembar.galat ?? real.galat ?? rabR.galat ?? rabItem.galat;
  return {
    anggaran,
    rab: rabPilih,
    sampaiTanggal: real.baris?.[0]?.sampai_tanggal ?? null,
    memuat: !galat && !anggaran,
    galat,
    terpotong: lembar.terpotong || real.terpotong || rabItem.terpotong,
  };
}
