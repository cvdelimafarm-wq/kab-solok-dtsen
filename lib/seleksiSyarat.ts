// lib/seleksiSyarat.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Seleksi petugas oleh PJ survei (paket 2 arus kegiatan). Berkas ini memuat aturan rancangan seleksi dan KELAYAKAN kandidat terhadap syarat
// khusus (domisili kecamatan/nagari dan jarak ke wilayah sampel). Kandidat = Mitra Kepka anggota pool (lib/penggunaPool.ts); filter inilah yang menentukan
// akun mana yang diberi push ajakan seleksi.
//
// Prinsip: kandidat yang titik domisilinya belum ada TIDAK ditolak diam-diam -- statusnya "perlu_lokasi" (dihitung terpisah) supaya PJ tahu berapa orang
// yang tidak bisa dinilai syaratnya dan bisa meminta mereka melengkapi lokasi.

import { titikSah } from "@/lib/penggunaPool";

export type LevelDomisili = "kecamatan" | "nagari";
export type SyaratSeleksi = {
  domisili: { aktif: boolean; level: LevelDomisili };
  jarak: { aktif: boolean; maks_km: number };
};
export type JalurPerekrutan = "penunjukan" | "seleksi";
export type PeringkatLevel = "kecamatan" | "nagari" | "kabupaten";
export type StatusSeleksi = "draft" | "dibuka" | "ditutup" | "selesai" | "batal";

export type WilayahSeleksi = {
  kode: string;
  nama: string;
  kecamatan: string | null;
  nagari: string | null;
  lat: number | null;
  lng: number | null;
  jumlah_sampel: number;
  kebutuhan_ppl: number;
  kebutuhan_pml: number;
};

export type KandidatLokasi = { id: number; nama: string; kecamatan: string | null; nagari: string | null; lat: number | null; lng: number | null };

export type HasilKelayakan = {
  status: "memenuhi" | "tidak" | "perlu_lokasi";
  alasan: string[];
  jarak_km: number | null;
  wilayah_terdekat: string | null;
};

export const SYARAT_BAWAAN: SyaratSeleksi = { domisili: { aktif: false, level: "kecamatan" }, jarak: { aktif: false, maks_km: 10 } };
export const MAKS_JARAK_KM = 200;
export const MAKS_WILAYAH = 400;

/** "(002) SUNGAI NANAM" -> "SUNGAI NANAM"; huruf besar, spasi dirapikan. Kosong -> "". */
export function normalWilayah(s: string | null | undefined): string {
  return (s ?? "").replace(/^\s*\(\s*\d+\s*\)\s*/, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Jarak garis lurus dua titik (km), rumus haversine. */
export function jarakKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = 6371.0088;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nilai syarat dari jsonb tersimpan -> bentuk baku; isian rusak jatuh ke bawaan. */
export function bacaSyarat(mentah: unknown): SyaratSeleksi {
  const o = (mentah ?? {}) as { domisili?: { aktif?: unknown; level?: unknown }; jarak?: { aktif?: unknown; maks_km?: unknown } };
  const km = Number(o.jarak?.maks_km);
  return {
    domisili: { aktif: o.domisili?.aktif === true, level: o.domisili?.level === "nagari" ? "nagari" : "kecamatan" },
    jarak: { aktif: o.jarak?.aktif === true, maks_km: Number.isFinite(km) && km > 0 && km <= MAKS_JARAK_KM ? km : SYARAT_BAWAAN.jarak.maks_km },
  };
}

/** Menilai satu kandidat terhadap syarat dan daftar wilayah sampel. */
export function nilaiKelayakan(k: KandidatLokasi, wilayah: WilayahSeleksi[], s: SyaratSeleksi): HasilKelayakan {
  const alasan: string[] = [];
  let status: HasilKelayakan["status"] = "memenuhi";
  let jarak: number | null = null;
  let terdekat: string | null = null;
  const adaTitik = titikSah(k.lat, k.lng);

  // Jarak terdekat dihitung bila titik tersedia (juga berguna sebagai informasi walau syarat jarak mati)
  if (adaTitik) {
    for (const w of wilayah) {
      if (!titikSah(w.lat, w.lng)) continue;
      const d = jarakKm({ lat: k.lat as number, lng: k.lng as number }, { lat: w.lat as number, lng: w.lng as number });
      if (jarak === null || d < jarak) {
        jarak = d;
        terdekat = w.nama;
      }
    }
  }

  if (s.domisili.aktif) {
    const dom = normalWilayah(s.domisili.level === "nagari" ? k.nagari : k.kecamatan);
    if (!dom) {
      status = "perlu_lokasi";
      alasan.push(s.domisili.level === "nagari" ? "Nagari domisili belum tercatat" : "Kecamatan domisili belum tercatat");
    } else {
      const sah = new Set(wilayah.map((w) => normalWilayah(s.domisili.level === "nagari" ? w.nagari : w.kecamatan)).filter(Boolean));
      if (!sah.has(dom)) {
        status = "tidak";
        alasan.push(`Domisili ${s.domisili.level} di luar wilayah sampel`);
      }
    }
  }

  if (s.jarak.aktif) {
    if (!adaTitik) {
      if (status !== "tidak") status = "perlu_lokasi";
      alasan.push("Titik domisili belum ada");
    } else if (jarak === null) {
      if (status !== "tidak") status = "perlu_lokasi";
      alasan.push("Belum ada wilayah sampel berkoordinat");
    } else if (jarak > s.jarak.maks_km) {
      status = "tidak";
      alasan.push(`Jarak terdekat ${jarak.toFixed(1)} km melebihi ${s.jarak.maks_km} km`);
    }
  }

  return { status, alasan, jarak_km: jarak === null ? null : Math.round(jarak * 10) / 10, wilayah_terdekat: terdekat };
}

export type RingkasKelayakan = { total: number; memenuhi: number; tidak: number; perlu_lokasi: number };
export function ringkasKelayakan(hasil: HasilKelayakan[]): RingkasKelayakan {
  const r: RingkasKelayakan = { total: hasil.length, memenuhi: 0, tidak: 0, perlu_lokasi: 0 };
  for (const h of hasil) r[h.status]++;
  return r;
}

/** Sisa kebutuhan yang harus diseleksi = kebutuhan dikurangi yang sudah di-plot pegawai organik (tidak pernah negatif). */
export function sisaKebutuhan(kebutuhan: number, sudahOrganik: number): number {
  const a = Math.max(0, Math.floor(Number(kebutuhan) || 0));
  const b = Math.max(0, Math.floor(Number(sudahOrganik) || 0));
  return Math.max(0, a - b);
}

export type RancanganSeleksi = {
  id?: number;
  kegiatan_id: number;
  nama: string;
  jalur: JalurPerekrutan;
  kebutuhan_ppl: number;
  kebutuhan_pml: number;
  sudah_ppl: number;
  sudah_pml: number;
  syarat: SyaratSeleksi;
  jadwal_buka: string | null;
  jadwal_tutup: string | null;
  peringkat_level: PeringkatLevel;
  tampil_nilai: boolean;
  wilayah: WilayahSeleksi[];
};

const bulat = (v: unknown, maks = 100000): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= maks ? n : null;
};
const tanggalWaktu = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Memeriksa isi simpan rancangan. Mengembalikan rancangan bersih atau daftar pesan galat. */
export function periksaRancangan(isi: unknown): { ok: true; nilai: RancanganSeleksi } | { ok: false; galat: string[] } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const g: string[] = [];
  const kegiatan = bulat(o.kegiatan_id);
  if (!kegiatan) g.push("Kegiatan wajib dipilih.");
  const nama = typeof o.nama === "string" ? o.nama.trim().slice(0, 120) : "";
  if (nama.length < 3) g.push("Nama seleksi minimal 3 huruf.");
  const jalur: JalurPerekrutan = o.jalur === "penunjukan" ? "penunjukan" : "seleksi";
  const kp = bulat(o.kebutuhan_ppl);
  const km = bulat(o.kebutuhan_pml);
  const sp = bulat(o.sudah_ppl) ?? 0;
  const sm = bulat(o.sudah_pml) ?? 0;
  if (kp === null || km === null) g.push("Kebutuhan PPL dan PML harus bilangan bulat 0 atau lebih.");
  if (kp !== null && km !== null && kp + km === 0) g.push("Kebutuhan PPL dan PML tidak boleh sama-sama 0.");
  if (kp !== null && sp > kp) g.push("PPL yang sudah di-plot organik melebihi kebutuhan PPL.");
  if (km !== null && sm > km) g.push("PML yang sudah di-plot organik melebihi kebutuhan PML.");

  const syarat = bacaSyarat(o.syarat);
  const buka = tanggalWaktu(o.jadwal_buka);
  const tutup = tanggalWaktu(o.jadwal_tutup);
  if (buka && tutup && Date.parse(tutup) <= Date.parse(buka)) g.push("Jadwal tutup harus setelah jadwal buka.");
  const peringkat: PeringkatLevel = o.peringkat_level === "kecamatan" || o.peringkat_level === "nagari" ? o.peringkat_level : "kabupaten";

  const mentahW = Array.isArray(o.wilayah) ? o.wilayah : [];
  if (mentahW.length > MAKS_WILAYAH) g.push(`Wilayah paling banyak ${MAKS_WILAYAH}.`);
  const lihat = new Set<string>();
  const wilayah: WilayahSeleksi[] = [];
  for (const m of mentahW.slice(0, MAKS_WILAYAH)) {
    const w = (m ?? {}) as Record<string, unknown>;
    const kode = typeof w.kode === "string" ? w.kode.trim().slice(0, 40) : "";
    if (!kode || lihat.has(kode)) continue;
    lihat.add(kode);
    const lat = typeof w.lat === "number" && Number.isFinite(w.lat) ? w.lat : null;
    const lng = typeof w.lng === "number" && Number.isFinite(w.lng) ? w.lng : null;
    wilayah.push({
      kode,
      nama: (typeof w.nama === "string" ? w.nama.trim() : kode).slice(0, 120) || kode,
      kecamatan: typeof w.kecamatan === "string" && w.kecamatan.trim() ? w.kecamatan.trim().slice(0, 80) : null,
      nagari: typeof w.nagari === "string" && w.nagari.trim() ? w.nagari.trim().slice(0, 80) : null,
      lat: titikSah(lat, lng) ? lat : null,
      lng: titikSah(lat, lng) ? lng : null,
      jumlah_sampel: bulat(w.jumlah_sampel) ?? 0,
      kebutuhan_ppl: bulat(w.kebutuhan_ppl) ?? 0,
      kebutuhan_pml: bulat(w.kebutuhan_pml) ?? 0,
    });
  }
  if (jalur === "seleksi" && (syarat.domisili.aktif || syarat.jarak.aktif) && wilayah.length === 0) g.push("Syarat domisili/jarak butuh minimal satu wilayah sampel.");
  if (jalur === "seleksi" && syarat.jarak.aktif && wilayah.length > 0 && !wilayah.some((w) => w.lat !== null)) g.push("Syarat jarak butuh minimal satu wilayah berkoordinat.");

  if (g.length > 0 || kegiatan === null || kp === null || km === null) return { ok: false, galat: g };
  const id = bulat(o.id);
  return {
    ok: true,
    nilai: {
      ...(id ? { id } : {}),
      kegiatan_id: kegiatan,
      nama,
      jalur,
      kebutuhan_ppl: kp,
      kebutuhan_pml: km,
      sudah_ppl: sp,
      sudah_pml: sm,
      syarat,
      jadwal_buka: buka,
      jadwal_tutup: tutup,
      peringkat_level: peringkat,
      tampil_nilai: o.tampil_nilai === true,
      wilayah,
    },
  };
}
