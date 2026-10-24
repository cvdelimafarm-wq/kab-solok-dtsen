"use client";

// app/sigap/ro/useKeu.ts
//
// (24 Okt 2026) Pengambil data baca-saja Kertas Kerja Revisi POK: GET /api/sigap/keu/baca (lib/keu/baca.ts) lewat simpanan bersama
// (app/portal/dataBersama.ts): tampil seketika dari simpanan, diperbarui di belakang. Alamat dibentuk lib/keu/ro.ts (urlBaca).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { FUNGSI_BACA } from "@/lib/keu/gerbang";
import type { BarisRabRow, ItemRabRow } from "@/lib/keu/rab";
import { pilihRab, susunAnggaran, urlBaca, type BarisLembar, type BarisPenugasan, type BarisRabItem, type BarisRabRingkas, type BarisRealisasi } from "@/lib/keu/ro";

type Balasan<T> = { data: T[]; jumlah: number; terpotong: boolean };
export type HasilBaca<T> = { baris: T[] | null; memuat: boolean; galat: string | null; terpotong: boolean; muat: () => Promise<void> };

/** `url` null = jangan memuat (mis. data bergantung hasil lain atau tab belum dibuka). */
export function useBacaKeu<T>(url: string | null): HasilBaca<T> {
  const router = useRouter();
  const d = useData<Balasan<T>>(url ?? "/api/sigap/keu/baca", { aktif: url !== null });
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace("/");
  }, [d.galat, router]);
  if (url === null) return { baris: null, memuat: false, galat: null, terpotong: false, muat: d.muat };
  return {
    baris: d.data?.data ?? null,
    memuat: !d.data && !d.galat,
    // galat hanya bila belum ada data sama sekali (gagal muat ulang di belakang tidak mengganggu tampilan tersimpan)
    galat: !d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null,
    terpotong: d.data?.terpotong ?? false,
    muat: d.muat,
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

export type HasilAksi<T = unknown> = { ok: true; data: T } | { ok: false; pesan: string };

/** Memanggil fungsi keu_ lewat gerbang server (POST /api/sigap/keu/panggil). Hak ditegakkan basis data; galat diteruskan sebagai pesan. */
export async function aksiKeu<T = unknown>(fungsi: string, args: Record<string, unknown> = {}): Promise<HasilAksi<T>> {
  const init = { method: "POST", body: JSON.stringify({ fungsi, args }) };
  try {
    // Fungsi yang hanya membaca tidak boleh menandai seluruh simpanan data basi (apiPortal melakukannya untuk setiap POST), jadi dipanggil langsung.
    if (FUNGSI_BACA.includes(fungsi)) {
      const sesi = bacaSesi();
      const res = await fetch("/api/sigap/keu/panggil", { ...init, headers: { "Content-Type": "application/json", ...(sesi ? { Authorization: `Bearer ${sesi}` } : {}) } });
      const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
      if (res.status === 401) return { ok: false, pesan: "Sesi berakhir. Silakan masuk kembali." };
      return res.ok ? { ok: true, data: j.data as T } : { ok: false, pesan: j.error ?? `Gagal (${res.status})` };
    }
    const j = await apiPortal<{ data: T }>("/api/sigap/keu/panggil", init);
    return { ok: true, data: j.data };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Gagal.";
    return { ok: false, pesan: pesan === "SESI_BERAKHIR" ? "Sesi berakhir. Silakan masuk kembali." : pesan };
  }
}

/** Boleh melakukan kewenangan `kew` pada RO ini? null = belum diketahui. Hanya untuk menampilkan tombol; yang memutuskan tetap basis data. */
export function useBoleh(kew: string, ro: string | null): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let hidup = true;
    setV(null);
    void aksiKeu<boolean>("keu_boleh", ro === null ? { p_kew: kew } : { p_kew: kew, p_ro: ro }).then((r) => {
      if (hidup) setV(r.ok ? r.data === true : false);
    });
    return () => {
      hidup = false;
    };
  }, [kew, ro]);
  return v;
}

/** Menulis satu baris tabel keu_ lewat gerbang server (POST /api/sigap/keu/tulis). Hak ditegakkan penjaga tabel di basis data. */
export async function tulisKeuKlien<T = Record<string, unknown>>(tabel: string, op: "insert" | "update", data: Record<string, unknown>, kunci?: Record<string, unknown>): Promise<HasilAksi<T>> {
  try {
    const j = await apiPortal<{ data: T }>("/api/sigap/keu/tulis", { method: "POST", body: JSON.stringify({ tabel, op, data, ...(kunci ? { kunci } : {}) }) });
    return { ok: true, data: j.data };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Gagal.";
    return { ok: false, pesan: pesan === "SESI_BERAKHIR" ? "Sesi berakhir. Silakan masuk kembali." : pesan };
  }
}

/** Status kerja satu formulir: sedang mengirim, pesan galat, dan pembungkus yang memuat ulang data bila berhasil. */
export function useKirim(sesudah: () => void | Promise<void>) {
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  /** Menjalankan satu atau beberapa langkah berurutan; berhenti di langkah pertama yang gagal. */
  const jalankan = useCallback(
    async (langkah: () => Promise<HasilAksi<unknown>>): Promise<boolean> => {
      setMengirim(true);
      setGalat(null);
      const r = await langkah();
      if (!r.ok) {
        setMengirim(false);
        setGalat(r.pesan);
        await sesudah(); // langkah sebelumnya mungkin sudah tersimpan
        return false;
      }
      await sesudah();
      setMengirim(false);
      return true;
    },
    [sesudah],
  );
  const kirim = useCallback((fungsi: string, args: Record<string, unknown>) => jalankan(() => aksiKeu(fungsi, args)), [jalankan]);
  return { kirim, jalankan, mengirim, galat, hapusGalat: () => setGalat(null) };
}

type RabDetail = { id: number; catatan: string; nomor: number | string; status: string; alasan_versi: string | null };
type Jejak = { id: number; aksi: string; dari: string; ke: string; oleh_nama: string | null; catatan: string; waktu: string };

/** RAB yang ditampilkan untuk satu RO (yang sedang disusun, atau yang disahkan terbaru) beserta item, rincian, dan jejaknya. */
export function useRabRo(kode: string) {
  const ringkas = useBacaKeu<BarisRabRingkas>(urlBaca("keu_v_rab_ringkas", { ro_kode: kode }, { batas: 200 }));
  const pilih = useMemo(() => (ringkas.baris ? pilihRab(ringkas.baris, kode) : null), [ringkas.baris, kode]);
  const id = pilih?.rab_id ?? null;
  const detail = useBacaKeu<RabDetail>(id ? urlBaca("keu_rab", { id }, { batas: 1, kolom: ["id", "catatan", "nomor", "status", "alasan_versi"] }) : null);
  const item = useBacaKeu<ItemRabRow>(id ? urlBaca("keu_rab_item", { rab_id: id }, { batas: 5000, kolom: ["id", "pok_kunci", "selesai", "prioritas_kode", "akun_tujuan"] }) : null);
  const baris = useBacaKeu<BarisRabRow>(id ? urlBaca("keu_v_rab_baris", { rab_id: id }, { batas: 20000 }) : null);
  const jejak = useBacaKeu<Jejak>(id ? urlBaca("keu_v_rab_jejak", { rab_id: id }, { urut: "-id", batas: 200 }) : null);
  const muatSemua = useCallback(async () => {
    await ringkas.muat();
    await Promise.all([detail.muat(), item.muat(), baris.muat(), jejak.muat()]);
  }, [ringkas, detail, item, baris, jejak]);
  const galat = ringkas.galat ?? detail.galat ?? item.galat ?? baris.galat ?? jejak.galat;
  const siap = ringkas.baris !== null && (id === null || (item.baris !== null && baris.baris !== null));
  return {
    rab: pilih, catatan: detail.baris?.[0]?.catatan ?? "", alasanVersi: detail.baris?.[0]?.alasan_versi ?? null, itemRab: item.baris ?? [], barisRab: baris.baris ?? [], jejak: jejak.baris ?? [],
    riwayatRab: ringkas.baris ?? [], siap, galat, muatSemua,
  };
}
