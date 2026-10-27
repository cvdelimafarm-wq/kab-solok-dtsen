// lib/portal/pendataanKinerja.ts  (hanya server)
//
// (19 Okt 2026) Tab Monitoring di Kelola Pendataan -- Fase 2-4 (Transport lokal, Poin kinerja per hari, Perkiraan anggaran). HANYA-BACA.
// Satu muatan data (DataKinerja) dipakai ketiga tampilan; perhitungannya dilakukan di lib/monitorKinerja.ts (murni, di peramban).
//  - Hari kerja, laporan, foto per orang per tanggal: bencana_monitoring_lapangan (sama dengan Monitoring Lapangan).
//  - KK terdampak / tidak terdampak per orang per tanggal WIB: hasil TERKINI tiap KK (bencana_pendataan_kk.ppl_akun_id, status_at).
//  - Jarak (hari >= 15 Okt): rute rumah -> pusat tiap Sub SLS (urut waktu) -> rumah; jarak jalan OSRM (OSRM_BASE_URL) dengan anggaran waktu
//    per permintaan + cache; yang belum sempat dihitung memakai perkiraan (garis lurus x 1,3) dan dihitung ulang pada muat berikutnya (`tertunda`).
//  - Sisa pekerjaan per PPL dan jarak rumah -> pusat KK tersisa: dari data Fase 1 (target per PPL - didata) dan pusat KK tiap Sub SLS.

import type { Db } from "@/lib/sigap";
import { aturanDari, hariIniWib, hariLengkap } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_ID, dalamKotak } from "@/lib/pendataan";
import { monitoringLapangan } from "@/lib/portal/lapangan";
import { muatMonitoringPendataan } from "@/lib/portal/pendataanMonitor";
import { berhasil } from "@/lib/pendataanMonitor";
import {
  ATURAN,
  haversineKm,
  jarakPerkiraanKm,
  kunciRute,
  pusatTitik,
  susunRute,
  tanggalWib,
  urutanSub,
  type DataKinerja,
  type HariOrang,
  type MetodeJarak,
  type OrangKinerja,
  type PeranKinerja,
  type Titik,
} from "@/lib/monitorKinerja";

// Periode kegiatan Pendataan Pascabencana (keputusan user 18 Okt 2026): mulai 10 Okt, batas 10 Nov + 7 hari tenggang.
const MULAI_KEGIATAN = "2026-10-10";
const BATAS_KEGIATAN = "2026-11-10";
const TENGGANG_HARI = 7;

const TTL_MS = 45_000;
const TTL_TERTUNDA_MS = 8_000;
const ANGGARAN_OSRM_MS = 9_000;
const OSRM_TIMEOUT_MS = 4_000;
const OSRM_ISTIRAHAT_MS = 2 * 60_000;
const OSRM_PARALEL = 6;
const UMUR_JALAN_MS = 24 * 3_600_000;
const UMUR_PUSAT_MS = 12 * 3_600_000;
const UMUR_TARIF_MS = 10 * 60_000;

let simpan: { waktu: number; data: DataKinerja } | null = null;
let sedangMuat: Promise<DataKinerja> | null = null;
const cacheJalan = new Map<string, { km: number; at: number }>();
const cachePusat = new Map<string, { titik: Titik | null; at: number }>();
let cacheTarif: { at: number; tarif: DataKinerja["tarif"]; kuota: DataKinerja["kuota"] } | null = null;
let osrmIstirahatSampai = 0;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let dari = 0; dari < 60_000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as T[];
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

/** Jarak jalan (km) lewat OSRM Route API; null bila tidak diset / gagal. */
async function jarakJalanOsrm(rute: Titik[]): Promise<number | null> {
  const base = process.env.OSRM_BASE_URL;
  if (!base) return null;
  const url = `${base.replace(/\/+$/, "")}/route/v1/driving/${rute.map((t) => `${t.lng},${t.lat}`).join(";")}?overview=false&alternatives=false&steps=false`;
  const kontrol = new AbortController();
  const timer = setTimeout(() => kontrol.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: kontrol.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const j = (await res.json().catch(() => null)) as { code?: string; routes?: { distance?: number }[] } | null;
    const meter = j?.code === "Ok" ? j.routes?.[0]?.distance : undefined;
    if (typeof meter !== "number" || !Number.isFinite(meter)) throw new Error("OSRM jawaban tidak sah");
    return Math.round(meter / 10) / 100;
  } catch {
    osrmIstirahatSampai = Date.now() + OSRM_ISTIRAHAT_MS; // OSRM bermasalah: jangan menahan permintaan berikutnya
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tarifKuota(db: Db): Promise<{ tarif: DataKinerja["tarif"]; kuota: DataKinerja["kuota"] }> {
  if (cacheTarif && Date.now() - cacheTarif.at < UMUR_TARIF_MS) return cacheTarif;
  const tarif: DataKinerja["tarif"] = { ppl: 170000, pml: 170000, korwil: 170000 };
  const kuota: DataKinerja["kuota"] = { ppl: null, pml: null, korwil: null };
  const { data, error } = await db.from("sigap_kegiatan_tarif").select("peran, tarif, kuota_ok").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID);
  if (!error)
    for (const r of data ?? []) {
      const p = r.peran as PeranKinerja;
      if (p === "ppl" || p === "pml" || p === "korwil") {
        if (n(r.tarif) > 0) tarif[p] = n(r.tarif);
        kuota[p] = r.kuota_ok == null ? null : n(r.kuota_ok);
      }
    }
  cacheTarif = { at: Date.now(), tarif, kuota };
  return cacheTarif;
}

/** Pusat KK (rata-rata koordinat sah) tiap Sub SLS; disimpan lama karena jarang berubah. */
async function pusatSub(db: Db, ids: string[]): Promise<Map<string, Titik | null>> {
  const hasil = new Map<string, Titik | null>();
  const perlu: string[] = [];
  for (const id of ids) {
    const c = cachePusat.get(id);
    if (c && Date.now() - c.at < UMUR_PUSAT_MS) hasil.set(id, c.titik);
    else perlu.push(id);
  }
  for (let i = 0; i < perlu.length; i += 25) {
    const potong = perlu.slice(i, i + 25);
    const baris = await halaman<{ idsubsls: string; lat: number | null; lng: number | null }>((a, b) =>
      db.from("bencana_pendataan_kk").select("idsubsls, lat, lng").in("idsubsls", potong).eq("aktif", true).not("lat", "is", null).not("lng", "is", null).order("id").range(a, b),
    );
    const per = new Map<string, Titik[]>();
    for (const r of baris) {
      if (typeof r.lat !== "number" || typeof r.lng !== "number" || !dalamKotak(r.lat, r.lng)) continue;
      const a = per.get(r.idsubsls);
      if (a) a.push({ lat: r.lat, lng: r.lng });
      else per.set(r.idsubsls, [{ lat: r.lat, lng: r.lng }]);
    }
    for (const id of potong) {
      const t = pusatTitik(per.get(id) ?? []);
      hasil.set(id, t);
      cachePusat.set(id, { titik: t, at: Date.now() });
    }
  }
  return hasil;
}

type Tugas = { kunci: string; rute: Titik[] };
/** Selesaikan jarak jalan untuk rute yang belum ada di cache, dengan anggaran waktu; sisanya dikembalikan sebagai tertunda. */
async function selesaikanJarak(tugas: Tugas[]): Promise<{ tertunda: Set<string>; osrm: boolean }> {
  const tertunda = new Set<string>();
  const osrmAda = !!process.env.OSRM_BASE_URL;
  const perlu = tugas.filter((t) => {
    const c = cacheJalan.get(t.kunci);
    return !(c && Date.now() - c.at < UMUR_JALAN_MS);
  });
  if (!osrmAda) return { tertunda, osrm: false };
  if (cacheJalan.size > 5000) cacheJalan.clear();
  const batas = Date.now() + ANGGARAN_OSRM_MS;
  let i = 0;
  const pekerja = async () => {
    while (i < perlu.length) {
      const t = perlu[i++];
      if (Date.now() >= batas || Date.now() < osrmIstirahatSampai) {
        tertunda.add(t.kunci);
        continue;
      }
      const km = await jarakJalanOsrm(t.rute);
      if (km === null) tertunda.add(t.kunci);
      else cacheJalan.set(t.kunci, { km, at: Date.now() });
    }
  };
  await Promise.all(Array.from({ length: Math.min(OSRM_PARALEL, perlu.length) }, pekerja));
  return { tertunda, osrm: Date.now() >= osrmIstirahatSampai || tertunda.size < perlu.length };
}

async function muat(db: Db): Promise<DataKinerja> {
  const hariIni = hariIniWib();
  const { data: pend, mentah } = await muatMonitoringPendataan(db);
  const lap = await monitoringLapangan(db, MULAI_KEGIATAN, hariIni);
  const aturan = lap.aturan;
  const akunIds = [...new Set(lap.baris.map((b) => b.akun_id))];

  // KK terdampak / tidak terdampak / tidak ditemukan per akun per tanggal WIB
  const awalUtc = new Date(`${MULAI_KEGIATAN}T00:00:00+07:00`).toISOString();
  const kk = await halaman<{ idsubsls: string; hasil: string; status_at: string; ppl_akun_id: number }>((a, b) =>
    db.from("bencana_pendataan_kk").select("idsubsls, hasil, status_at, ppl_akun_id").eq("aktif", true).in("hasil", ["terdampak", "tidak_terdampak", "tidak_ditemukan"]).not("ppl_akun_id", "is", null).gte("status_at", awalUtc).order("id").range(a, b),
  );
  const hitung = new Map<string, { t: number; n: number; d: number }>(); // `${akun}|${tanggal}`
  const tanda = new Map<string, { idsubsls: string; waktu: number }[]>(); // hanya hari >= mulai bobot
  for (const r of kk) {
    if (mentah.nonaktif.has(r.idsubsls)) continue; // (27 Okt 2026) KK di Sub SLS non aktif tidak dihitung sebagai realisasi
    const waktu = Date.parse(r.status_at);
    if (!Number.isFinite(waktu)) continue;
    const tgl = tanggalWib(waktu);
    const kunci = `${r.ppl_akun_id}|${tgl}`;
    let h = hitung.get(kunci);
    if (!h) hitung.set(kunci, (h = { t: 0, n: 0, d: 0 }));
    if (r.hasil === "terdampak") h.t++;
    else if (r.hasil === "tidak_terdampak") h.n++;
    else h.d++;
    if (tgl >= ATURAN.mulaiBobot && tgl <= hariIni) {
      const a = tanda.get(kunci);
      if (a) a.push({ idsubsls: r.idsubsls, waktu });
      else tanda.set(kunci, [{ idsubsls: r.idsubsls, waktu }]);
    }
  }

  // rumah petugas
  const rumah = new Map<number, Titik>();
  for (let i = 0; i < akunIds.length; i += 200) {
    const { data } = await db.from("sigap_akun").select("id, domisili_lat, domisili_lng").in("id", akunIds.slice(i, i + 200));
    for (const r of data ?? []) if (typeof r.domisili_lat === "number" && typeof r.domisili_lng === "number") rumah.set(r.id as number, { lat: r.domisili_lat, lng: r.domisili_lng });
  }

  // KK tersisa per Sub SLS (sisa target tim) -> pusat tersisa per tim
  const sisaSub = new Map<string, number>(); // `${pml}|${idsubsls}` -> KK belum didata
  const subAktif = new Set(mentah.sub.filter((s) => !mentah.nonaktif.has(s.idsubsls)).map((s) => `${s.pml_id}|${s.idsubsls}`));
  for (const b of mentah.baris) {
    if (b.hasil !== null) continue;
    const k = `${b.pml_id}|${b.idsubsls}`;
    if (subAktif.has(k)) sisaSub.set(k, (sisaSub.get(k) ?? 0) + b.jumlah);
  }
  const idsPusat = new Set<string>();
  for (const [k] of sisaSub) idsPusat.add(k.split("|")[1]);
  for (const t of tanda.values()) for (const x of t) idsPusat.add(x.idsubsls);
  const pusat = await pusatSub(db, [...idsPusat]);
  const pusatTim = new Map<number, Titik | null>();
  const perTim = new Map<number, { lat: number; lng: number; w: number }>();
  for (const [k, sisa] of sisaSub) {
    const [pml, ids] = k.split("|");
    const c = pusat.get(ids);
    if (!c || sisa <= 0) continue;
    const a = perTim.get(Number(pml)) ?? { lat: 0, lng: 0, w: 0 };
    a.lat += c.lat * sisa;
    a.lng += c.lng * sisa;
    a.w += sisa;
    perTim.set(Number(pml), a);
  }
  for (const [pml, a] of perTim) pusatTim.set(pml, a.w > 0 ? { lat: a.lat / a.w, lng: a.lng / a.w } : null);

  // rute per akun per tanggal
  type Rute = { kunci: string; rute: Titik[] } | { kosong: MetodeJarak };
  const rutePer = new Map<string, Rute>();
  const tugas = new Map<string, Tugas>();
  for (const [kunci, t] of tanda) {
    const akun = Number(kunci.split("|")[0]);
    const urut = urutanSub(t);
    const rute = susunRute(rumah.get(akun) ?? null, urut.map((id) => pusat.get(id) ?? null));
    if (!rute) rutePer.set(kunci, { kosong: rumah.has(akun) ? "tanpa_titik" : "tanpa_rumah" });
    else {
      const kc = kunciRute(rute);
      rutePer.set(kunci, { kunci: kc, rute });
      tugas.set(kc, { kunci: kc, rute });
    }
  }
  const { tertunda, osrm } = await selesaikanJarak([...tugas.values()]);

  // petugas -> sisa KK (Fase 1)
  const akunKePpl = new Map<number, number>(); // akun -> petugas_id PPL
  for (const p of mentah.petugas) if (p.peran === "ppl") for (const a of p.akun_ids) akunKePpl.set(a, p.petugas_id);
  const pplMon = new Map(pend.ppl.map((p) => [p.petugas_id, p]));

  // rangkai orang
  const perOrang = new Map<number, OrangKinerja>();
  const baris = [...lap.baris].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  let tertundaRute = 0;
  const tertundaDihitung = new Set<string>();
  for (const b of baris) {
    let o = perOrang.get(b.akun_id);
    if (!o) {
      const pplId = akunKePpl.get(b.akun_id);
      const pm = pplId != null ? pplMon.get(pplId) : undefined;
      const sisa = b.peran === "ppl" && pm ? Math.max(0, pm.target - berhasil(pm.hasil)) : 0;
      const hm = rumah.get(b.akun_id);
      const pt = b.peran === "ppl" && b.pml_id != null ? pusatTim.get(b.pml_id) : null;
      o = { akun_id: b.akun_id, nama: b.nama, peran: b.peran, pml_id: b.pml_id, pml_nama: b.pml_nama, sisa_kk: Math.round(sisa * 10) / 10, rumah_ke_sisa_km: hm && pt ? Math.round(haversineKm(hm, pt) * 100) / 100 : null, hari: [] };
      perOrang.set(b.akun_id, o);
    }
    const kunci = `${b.akun_id}|${b.tanggal}`;
    const h = hitung.get(kunci);
    let km = 0;
    let metode: MetodeJarak = "tidak_ada";
    const r = rutePer.get(kunci);
    if (r) {
      if ("kosong" in r) metode = r.kosong;
      else {
        const j = cacheJalan.get(r.kunci);
        if (j && !tertunda.has(r.kunci)) {
          km = j.km;
          metode = "jalan";
        } else {
          km = jarakPerkiraanKm(r.rute);
          metode = "perkiraan";
          if (tertunda.has(r.kunci) && !tertundaDihitung.has(kunci)) {
            tertundaDihitung.add(kunci);
            tertundaRute++;
          }
        }
      }
    }
    const aktif = b.sub_idf > 0 || b.kk_berhasil > 0 || b.kk_tdk_ditemukan > 0;
    const item: HariOrang = {
      tanggal: b.tanggal,
      hari_kerja: b.hari_kerja,
      lengkap: hariLengkap(b.ada_laporan, b.jumlah_foto, aturan),
      ada_laporan: b.ada_laporan,
      jumlah_foto: b.jumlah_foto,
      aktif,
      terdampak: h?.t ?? 0,
      tidak_terdampak: h?.n ?? 0,
      tidak_ditemukan: h?.d ?? 0,
      km,
      metode,
    };
    o.hari.push(item);
  }
  const { tarif, kuota } = await tarifKuota(db);
  const orang = [...perOrang.values()].sort((a, b) => a.nama.localeCompare(b.nama));
  return { sekarang: new Date().toISOString(), hari_ini: hariIni, mulai_kegiatan: MULAI_KEGIATAN, mulai_bobot: ATURAN.mulaiBobot, batas: BATAS_KEGIATAN, tenggang_hari: TENGGANG_HARI, tarif, kuota, orang, tertunda: tertundaRute, osrm };
}

/** Muatan data Fase 2-4 (cache 45 dtk; 8 dtk bila masih ada jarak jalan yang menunggu dihitung). */
export async function kinerjaPendataan(db: Db, paksa = false): Promise<DataKinerja> {
  const umur = simpan ? (simpan.data.tertunda > 0 ? TTL_TERTUNDA_MS : TTL_MS) : 0;
  if (!paksa && simpan && Date.now() - simpan.waktu < umur) return simpan.data;
  if (!sedangMuat) {
    sedangMuat = muat(db)
      .then((data) => {
        simpan = { waktu: Date.now(), data };
        return data;
      })
      .finally(() => {
        sedangMuat = null;
      });
  }
  return sedangMuat;
}

// dipakai uji: setel ulang cache modul
export function _kosongkanCache() {
  simpan = null;
  cacheJalan.clear();
  cachePusat.clear();
  cacheTarif = null;
  osrmIstirahatSampai = 0;
}
