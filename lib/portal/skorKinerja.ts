// lib/portal/skorKinerja.ts  (hanya server)
//
// (15 Okt 2026) Capaian harian dan realisasi O-K seorang PPL Pendataan Pascabencana -- sumber data untuk tombol float "Capaian hari ini"
// di Lembar Pendataan (lihat lib/skorKinerja.ts untuk rumus dan aturan, Project: rancangan-skor-kinerja-harian-target-harian).
//  - KK terdampak / tidak terdampak / tidak ditemukan: hasil TERKINI tiap KK milik akun ini (bencana_pendataan_kk.ppl_akun_id), pada tanggal WIB
//    waktu kejadiannya (status_at). Bukan dari angka laporan.
//  - Jarak: rumah (sigap_akun.domisili_lat/lng) -> pusat KK tiap Sub SLS (urut waktu) -> rumah; OSRM bila OSRM_BASE_URL diset, selain itu garis lurus x 1,3.
//    Jarak dihitung hanya untuk hari mulai berlaku aturan bobot (15 Okt 2026) dan seterusnya.
//  - Hari kerja & "hari lengkap": dataSpj (penilai yang sama dengan SPJ/kwitansi). Hari ini dianggap lengkap sementara.
// Kegagalan membaca TIDAK boleh merusak Lembar Pendataan: pemanggil menangkap galat (tombol hanya tidak tampil).

import type { Db } from "@/lib/sigap";
import { hariIniWib, penugasanAkun } from "@/lib/sigap";
import { dataSpj } from "@/lib/sigapDokumen";
import { dalamKotak } from "@/lib/pendataan";
import { ATURAN_POIN, MULAI_BOBOT_AWAL, aturanUntukTanggal, hitungPoinHari, hitungRealisasi, type CapaianHari, type DataCapaian, type HariSkor, type JarakMetode } from "@/lib/skorKinerja";
import { jarakPerkiraanKm, kunciRute, pusatTitik, ruteHari, tanggalWibDari, urutanSubPerHari, type Penandaan, type Titik } from "@/lib/skorRute";

const UMUR_CACHE_MS = 30_000;
const UMUR_CACHE_HARI_MS = 3 * 60_000;
const OSRM_TIMEOUT_MS = 4000;
const OSRM_ISTIRAHAT_MS = 2 * 60_000;

const cacheCapaian = new Map<number, { at: number; data: DataCapaian }>();
const cacheHari = new Map<number, { at: number; hari: { tanggal: string; lengkap: boolean }[] }>();
const cacheJarak = new Map<string, { km: number; metode: "jalan" | "perkiraan"; at: number }>();
let osrmIstirahatSampai = 0;

/** Jarak jalan (km) sepanjang rute lewat OSRM Route API; null bila OSRM tidak diset / gagal (lalu pemanggil memakai perkiraan). */
async function jarakJalanOsrm(rute: Titik[]): Promise<number | null> {
  const base = process.env.OSRM_BASE_URL;
  if (!base || Date.now() < osrmIstirahatSampai) return null;
  const koordinat = rute.map((t) => `${t.lng},${t.lat}`).join(";");
  const url = `${base.replace(/\/+$/, "")}/route/v1/driving/${koordinat}?overview=false&alternatives=false&steps=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json().catch(() => null)) as { code?: string; routes?: { distance?: number }[] } | null;
    const meter = data?.code === "Ok" ? data.routes?.[0]?.distance : undefined;
    if (typeof meter !== "number" || !Number.isFinite(meter)) throw new Error("OSRM jawaban tidak sah");
    return Math.round(meter / 10) / 100;
  } catch {
    osrmIstirahatSampai = Date.now() + OSRM_ISTIRAHAT_MS; // OSRM bermasalah: jangan menahan permintaan berikutnya
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function jarakRuteKm(rute: Titik[]): Promise<{ km: number; metode: "jalan" | "perkiraan" }> {
  const kunci = kunciRute(rute);
  const ada = cacheJarak.get(kunci);
  if (ada && Date.now() - ada.at < (ada.metode === "jalan" ? 6 * 3_600_000 : 5 * 60_000)) return { km: ada.km, metode: ada.metode };
  const jalan = await jarakJalanOsrm(rute);
  const hasil = jalan !== null ? { km: jalan, metode: "jalan" as const } : { km: jarakPerkiraanKm(rute), metode: "perkiraan" as const };
  if (cacheJarak.size > 2000) cacheJarak.clear();
  cacheJarak.set(kunci, { ...hasil, at: Date.now() });
  return hasil;
}

/** Baca semua baris (PostgREST membatasi 1000 baris per permintaan). */
async function bacaBertahap<T>(buat: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let dari = 0; dari < 20_000; dari += 1000) {
    const { data, error } = await buat(dari, dari + 999);
    if (error) throw new Error(error.message);
    const baris = (data ?? []) as T[];
    hasil.push(...baris);
    if (baris.length < 1000) break;
  }
  return hasil;
}

type BarisKk = { idsubsls: string; hasil: string; status_at: string };

export async function ambilCapaian(db: Db, akunId: number): Promise<DataCapaian> {
  const sekarang = Date.now();
  const lama = cacheCapaian.get(akunId);
  if (lama && sekarang - lama.at < UMUR_CACHE_MS) return lama.data;

  const pen = (await penugasanAkun(db, akunId)).find((p) => p.kegiatan.kode.startsWith("pascabencana") && (p.peran === "ppl" || p.peran === "korwil"));
  if (!pen) {
    const kosong: DataCapaian = { ada: false };
    cacheCapaian.set(akunId, { at: sekarang, data: kosong });
    return kosong;
  }

  const hariIni = hariIniWib();

  // hari kerja & hari lengkap (penilai SPJ), disimpan 3 menit: berubah lambat, dan query-nya paling berat
  let hariKerja = cacheHari.get(akunId);
  if (!hariKerja || sekarang - hariKerja.at > UMUR_CACHE_HARI_MS) {
    try {
      const spj = await dataSpj(db, pen.id);
      hariKerja = { at: sekarang, hari: spj.hari.map((h) => ({ tanggal: h.tanggal, lengkap: h.lengkap || h.izinAktif })) };
    } catch (e) {
      console.error("[skorKinerja] dataSpj", e instanceof Error ? e.message : e);
      hariKerja = { at: sekarang, hari: [] };
    }
    cacheHari.set(akunId, hariKerja);
  }

  const [kk, akunRow] = await Promise.all([
    bacaBertahap<BarisKk>((a, b) =>
      db.from("bencana_pendataan_kk").select("idsubsls, hasil, status_at").eq("ppl_akun_id", akunId).eq("aktif", true).in("hasil", ["terdampak", "tidak_terdampak", "tidak_ditemukan"]).order("id").range(a, b)
    ),
    db.from("sigap_akun").select("domisili_lat, domisili_lng").eq("id", akunId).maybeSingle(),
  ]);

  // per tanggal WIB: hitungan hasil + urutan Sub SLS
  const hitung = new Map<string, { t: number; n: number; d: number }>();
  const penandaan: Penandaan[] = [];
  for (const r of kk) {
    if (!r.status_at) continue;
    const waktu = Date.parse(r.status_at);
    if (!Number.isFinite(waktu)) continue;
    const tanggal = tanggalWibDari(waktu);
    let h = hitung.get(tanggal);
    if (!h) hitung.set(tanggal, (h = { t: 0, n: 0, d: 0 }));
    if (r.hasil === "terdampak") h.t++;
    else if (r.hasil === "tidak_terdampak") h.n++;
    else h.d++;
    penandaan.push({ tanggal, idsubsls: r.idsubsls, waktu });
  }

  // hari yang butuh jarak: mulai aturan bobot s.d. hari ini, yang ada KK didata
  const tanggalPerlu = [...hitung.keys()].filter((t) => t >= MULAI_BOBOT_AWAL && t <= hariIni).sort();
  const urutan = urutanSubPerHari(penandaan.filter((p) => tanggalPerlu.includes(p.tanggal)));
  const idsSub = [...new Set([...urutan.values()].flat())];

  // pusat KK tiap Sub SLS (rata-rata koordinat KK aktif yang berkoordinat sah)
  const pusat = new Map<string, Titik | null>();
  if (idsSub.length > 0) {
    const titik = await bacaBertahap<{ idsubsls: string; lat: number | null; lng: number | null }>((a, b) =>
      db.from("bencana_pendataan_kk").select("idsubsls, lat, lng").in("idsubsls", idsSub).eq("aktif", true).not("lat", "is", null).not("lng", "is", null).order("id").range(a, b)
    );
    const per = new Map<string, Titik[]>();
    for (const t of titik) {
      if (typeof t.lat !== "number" || typeof t.lng !== "number" || !dalamKotak(t.lat, t.lng)) continue;
      const a = per.get(t.idsubsls);
      if (a) a.push({ lat: t.lat, lng: t.lng });
      else per.set(t.idsubsls, [{ lat: t.lat, lng: t.lng }]);
    }
    for (const id of idsSub) pusat.set(id, pusatTitik(per.get(id) ?? []));
  }

  const rumah: Titik | null =
    akunRow.data && typeof akunRow.data.domisili_lat === "number" && typeof akunRow.data.domisili_lng === "number" ? { lat: akunRow.data.domisili_lat, lng: akunRow.data.domisili_lng } : null;

  const jarak = new Map<string, { km: number; metode: JarakMetode }>();
  for (const tanggal of tanggalPerlu) {
    const rute = ruteHari(rumah, (urutan.get(tanggal) ?? []).map((id) => pusat.get(id) ?? null));
    if (!rute) {
      jarak.set(tanggal, { km: 0, metode: rumah ? "tanpa_titik" : "tanpa_rumah" });
      continue;
    }
    jarak.set(tanggal, await jarakRuteKm(rute));
  }

  const masukan = (tanggal: string): { terdampak: number; tidak_terdampak: number; tidak_ditemukan: number; km: number; metode: JarakMetode } => {
    const h = hitung.get(tanggal);
    const j = jarak.get(tanggal);
    return { terdampak: h?.t ?? 0, tidak_terdampak: h?.n ?? 0, tidak_ditemukan: h?.d ?? 0, km: j?.km ?? 0, metode: h ? (j?.metode ?? "tidak_ada") : "tidak_ada" };
  };

  // hari kerja sampai hari ini; hari ini dianggap lengkap sementara (laporan/foto masih bisa diisi sampai malam)
  const hariSkor: HariSkor[] = hariKerja.hari
    .filter((h) => h.tanggal <= hariIni)
    .map((h) => {
      const m = masukan(h.tanggal);
      return { tanggal: h.tanggal, lengkap: h.tanggal === hariIni ? true : h.lengkap, terdampak: m.terdampak, tidak_terdampak: m.tidak_terdampak, tidak_ditemukan: m.tidak_ditemukan, km: m.km };
    });
  const realisasi = hitungRealisasi(hariSkor);

  const mHari = masukan(hariIni);
  // (20 Okt 2026) aturan menurut TANGGAL: hari yang sudah berlalu tetap memakai angka lama (tidak berlaku mundur)
  const aHari = aturanUntukTanggal(hariIni) ?? ATURAN_POIN;
  const poin = hitungPoinHari(mHari, aHari);
  const hariIniCapaian: CapaianHari = { ...poin, tanggal: hariIni, terdampak: mHari.terdampak, tidak_terdampak: mHari.tidak_terdampak, tidak_ditemukan: mHari.tidak_ditemukan, km: mHari.km, metode: mHari.metode };

  const sebelum = realisasi.rincian.filter((r) => r.tanggal < hariIni);
  const hasil: DataCapaian = {
    ada: true,
    sekarang: new Date(sekarang).toISOString(),
    kegiatan: pen.kegiatan.nama,
    hari_ini: hariIniCapaian,
    realisasi,
    // hutang dibawa dalam O-K lalu dinyatakan dalam poin menurut target hari ini (target bisa berganti antarhari)
    hutang_sebelumnya: sebelum.length ? Math.round(sebelum[sebelum.length - 1].hutang_sesudah_ok * aHari.targetHarian * 100) / 100 : 0,
    bobot_berlaku: hariIni >= MULAI_BOBOT_AWAL,
    aturan: {
      poinTerdampak: aHari.poinTerdampak,
      poinTidakTerdampak: aHari.poinTidakTerdampak,
      poinPerKm: aHari.poinPerKm,
      maksPoinJarak: aHari.maksPoinJarak,
      targetHarian: aHari.targetHarian,
      mulaiBobot: aHari.mulaiBobot,
    },
  };
  if (cacheCapaian.size > 500) cacheCapaian.clear();
  cacheCapaian.set(akunId, { at: sekarang, data: hasil });
  return hasil;
}
