// lib/portal/permintaanDaftar.ts  (hanya server)
//
// (13 Okt 2026) Permintaan daftar KK "keluar" di FASIH dari kartu plotting tim -- permintaan user.
// - PML (satu-satunya yang boleh mengirim) mengajukan Sub SLS + PPL untuk tiap Sub SLS (batas TOTAL per PML naik bertahap 7/9/11 menurut tanggal WIB, lib/permintaanDaftar.ts batasPengajuan; dijaga atomik di fungsi database bencana_pendataan_minta_total).
// - Admin (bencana.admin level kelola) meng-assign di FASIH, mengekspor templat Pengawas-Pencacah, lalu menandai "sudah keluar".
// - Push: admin dikabari saat permintaan masuk; PML dan PPL dikabari saat sudah keluar. Kegagalan push TIDAK menggagalkan aksi.
// - Pembatalan dan penyelesaian bersifat lunak (kolom status); tidak ada yang dihapus.

import type { Db } from "@/lib/sigap";
import { kirimKeAkun } from "@/lib/sigapPush";
import { catatAudit } from "@/lib/sigapAkses";
import { gabungPenerima, rapikanNama } from "@/lib/rekapIdentifikasi";
import { akunAdminBencana } from "@/lib/portal/sanggahIdentifikasi";
import type { Tim } from "@/lib/portal/pendataan";
import { adaKkBerhasil, lepasKolam } from "@/lib/portal/kolamWilayah";
import { pesanTolak } from "@/lib/kolamWilayah";
import { batasPengajuan, labelJorong, periksaEmail, susunPushBatal, susunPushKeluar, tanggalWib, type PeranEmail, type Permintaan, type PermintaanAdmin, type Pilihan, type StatusMinta } from "@/lib/permintaanDaftar";

export type Galat = { galat: string; status: number };
const ringkas = (s: string, maks: number) => (s.length > maks ? `${s.slice(0, maks - 1).trimEnd()}…` : s);

type BarisDb = { id: number; idsubsls: string; pml_id: number; ppl_akun_id: number; tanggal: string; status: string; diminta_at: string; selesai_at: string | null; dibatalkan_at: string | null; dari_kolam?: boolean | null };
type Wilayah = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string };

const labelWilayah = (w: Wilayah | undefined, id: string) => (w ? `${rapikanNama(String(w.sls ?? ""))} · ${w.sub_sls} (Nagari ${rapikanNama(String(w.nagari ?? ""))})` : id);

async function petaWilayah(db: Db, ids: string[]): Promise<Map<string, Wilayah>> {
  const m = new Map<string, Wilayah>();
  const unik = [...new Set(ids)];
  for (let i = 0; i < unik.length; i += 200) {
    const { data } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", unik.slice(i, i + 200));
    for (const w of data ?? []) m.set(w.idsubsls as string, w as Wilayah);
  }
  return m;
}

/** Email mitra menurut akun SIGAP (sigap_akun.mitra_id -> bencana_mitra.email). */
async function emailPerAkun(db: Db, akunIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(akunIds)];
  if (!ids.length) return out;
  const { data: ak } = await db.from("sigap_akun").select("id, mitra_id").in("id", ids);
  const mitra = [...new Set((ak ?? []).map((a) => a.mitra_id as number | null).filter((x): x is number => typeof x === "number"))];
  const emailMitra = new Map<number, string>();
  if (mitra.length) {
    const { data: m } = await db.from("bencana_mitra").select("id, email").in("id", mitra);
    for (const x of m ?? []) emailMitra.set(x.id as number, String(x.email ?? "").trim());
  }
  for (const a of ak ?? []) out.set(a.id as number, a.mitra_id != null ? emailMitra.get(a.mitra_id as number) ?? "" : "");
  return out;
}

/** Akun aktif milik petugas (PML) -> id akun pertama; dipakai mencari akun & email PML. */
async function akunPerPetugas(db: Db, petugasIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(petugasIds)];
  if (!ids.length) return out;
  const { data } = await db.from("sigap_akun").select("id, petugas_bencana_id").in("petugas_bencana_id", ids).eq("aktif", true).order("id", { ascending: true });
  for (const a of data ?? []) if (!out.has(a.petugas_bencana_id as number)) out.set(a.petugas_bencana_id as number, a.id as number);
  return out;
}

async function lengkapi(db: Db, baris: BarisDb[], denganEmail: boolean): Promise<PermintaanAdmin[]> {
  if (!baris.length) return [];
  const [wil, { data: pml }, { data: ppl }, akunPml] = await Promise.all([
    petaWilayah(db, baris.map((b) => b.idsubsls)),
    db.from("bencana_petugas").select("id, nama, email_fasih").in("id", [...new Set(baris.map((b) => b.pml_id))]),
    db.from("sigap_akun").select("id, nama, petugas_bencana_id").in("id", [...new Set(baris.map((b) => b.ppl_akun_id))]),
    denganEmail ? akunPerPetugas(db, baris.map((b) => b.pml_id)) : Promise.resolve(new Map<number, number>()),
  ]);
  const namaPml = new Map((pml ?? []).map((p) => [p.id as number, String(p.nama ?? "")]));
  const namaPpl = new Map((ppl ?? []).map((p) => [p.id as number, String(p.nama ?? "")]));
  const email = denganEmail ? await emailPerAkun(db, [...baris.map((b) => b.ppl_akun_id), ...akunPml.values()]) : new Map<number, string>();
  // email FASIH yang diisi admin (bencana_petugas.email_fasih) DIUTAMAKAN di atas email data mitra
  const emailFasihPetugas = new Map<number, string>();
  if (denganEmail) {
    for (const p of pml ?? []) if (p.email_fasih) emailFasihPetugas.set(p.id as number, String(p.email_fasih));
    const pplPetugas = [...new Set((ppl ?? []).map((a) => a.petugas_bencana_id as number | null).filter((x): x is number => typeof x === "number"))];
    if (pplPetugas.length) {
      const { data: ep } = await db.from("bencana_petugas").select("id, email_fasih").in("id", pplPetugas);
      for (const p of ep ?? []) if (p.email_fasih) emailFasihPetugas.set(p.id as number, String(p.email_fasih));
    }
  }
  const petugasPpl = new Map((ppl ?? []).map((a) => [a.id as number, a.petugas_bencana_id as number | null]));
  return baris.map((b) => {
    const w = wil.get(b.idsubsls);
    const pplPet = petugasPpl.get(b.ppl_akun_id);
    return {
      id: b.id,
      idsubsls: b.idsubsls,
      kecamatan: w?.kecamatan ?? "",
      nagari: w?.nagari ?? "",
      sls: w?.sls ?? "",
      sub_sls: w?.sub_sls ?? "",
      pml_id: b.pml_id,
      pml_nama: namaPml.get(b.pml_id) ?? "",
      ppl_akun_id: b.ppl_akun_id,
      ppl_nama: namaPpl.get(b.ppl_akun_id) ?? "",
      tanggal: b.tanggal,
      status: (b.status === "sudah_keluar" ? "sudah_keluar" : b.status === "dibatalkan" ? "dibatalkan" : "menunggu") as StatusMinta,
      diminta_at: b.diminta_at,
      selesai_at: b.selesai_at,
      dari_kolam: !!b.dari_kolam,
      dibatalkan_at: b.dibatalkan_at,
      email_pengawas: denganEmail ? emailFasihPetugas.get(b.pml_id) ?? email.get(akunPml.get(b.pml_id) ?? -1) ?? "" : "",
      email_pencacah: denganEmail ? (pplPet != null ? emailFasihPetugas.get(pplPet) : undefined) ?? email.get(b.ppl_akun_id) ?? "" : "",
    };
  });
}

const KOLOM = "id, idsubsls, pml_id, ppl_akun_id, tanggal, status, diminta_at, selesai_at, dibatalkan_at, dari_kolam";

/** Permintaan yang masih berlaku untuk satu tim (dilihat PML dan PPL-nya). */
export async function permintaanTim(db: Db, pmlId: number): Promise<Permintaan[]> {
  const { data, error } = await db.from("bencana_pendataan_permintaan").select(KOLOM).eq("pml_id", pmlId).in("status", ["menunggu", "sudah_keluar"]).order("id", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return (await lengkapi(db, (data ?? []) as BarisDb[], false)).map(({ email_pengawas: _a, email_pencacah: _b, dibatalkan_at: _c, ...p }) => p);
}

/**
 * Semua permintaan yang masih berlaku (admin), lengkap dengan email untuk templat FASIH, ditambah pembatalan PML atas assignment yang sudah keluar
 * dan belum ditandai dihapus di FASIH (status "dibatalkan").
 */
export async function permintaanSemua(db: Db): Promise<PermintaanAdmin[]> {
  const { data, error } = await db
    .from("bencana_pendataan_permintaan")
    .select(KOLOM)
    .or("status.in.(menunggu,sudah_keluar),and(status.eq.dibatalkan,selesai_at.not.is.null,batal_diproses_at.is.null)")
    .order("id", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return lengkapi(db, (data ?? []) as BarisDb[], true);
}

/** PML mengirim permintaan 1..N Sub SLS + PPL-nya (N = sisa kuota total). Tim = hasil ambilTim (akun sudah dipastikan anggota tim). */
export async function buatPermintaan(db: Db, akun: { id: number; nama?: string | null }, tim: Tim, pilihan: Pilihan[]): Promise<{ ids: number[]; dikirim: number } | Galat> {
  if (tim.saya.peran !== "pml") return { galat: "Hanya PML yang dapat mengirim permintaan. PPL hanya melihat.", status: 403 };
  const subTim = new Set(tim.sub.map((s) => s.idsubsls));
  const pplTim = new Set(tim.anggota.filter((a) => a.peran === "ppl").map((a) => a.akun_id));
  for (const p of pilihan) {
    if (!subTim.has(p.idsubsls)) return { galat: "Ada Sub SLS yang bukan wilayah tim Anda.", status: 403 };
    if (!pplTim.has(p.ppl_akun_id)) return { galat: "PPL yang dipilih bukan anggota tim Anda.", status: 400 };
  }
  const wil = await petaWilayah(db, pilihan.map((p) => p.idsubsls));
  for (const p of pilihan) {
    const { count, error } = await db.from("bencana_pendataan_kk").select("id", { count: "exact", head: true }).eq("idsubsls", p.idsubsls).eq("aktif", true);
    if (error) return { galat: "Gagal memeriksa daftar KK. Coba lagi.", status: 500 };
    if (!count) return { galat: `Daftar KK untuk ${labelWilayah(wil.get(p.idsubsls), p.idsubsls)} belum diunggah admin.`, status: 409 };
  }

  const hariIni = tanggalWib(Date.now());
  const maks = batasPengajuan(hariIni);
  const { data, error } = await db.rpc("bencana_pendataan_minta_total", { p_pml: tim.pml.id, p_akun: akun.id, p_tanggal: hariIni, p_pilihan: pilihan, p_maks: maks });
  if (error) return { galat: "Permintaan gagal disimpan. Coba lagi.", status: 500 };
  const r = data as { status: string; ids?: number[]; alasan?: string; sisa?: number };
  if (r.status !== "ok") {
    if (r.alasan === "melebihi_batas") return { galat: r.sisa ? `Kuota Anda tinggal ${r.sisa} Sub SLS (total maksimal ${maks} per PML hari ini).` : `Kuota total ${maks} Sub SLS hari ini sudah terpakai. Batalkan salah satu bila ingin mengganti.`, status: 409 };
    if (r.alasan === "sudah_diminta") return { galat: "Salah satu Sub SLS sudah diminta sebelumnya dan masih berlaku.", status: 409 };
    return { galat: "Permintaan ditolak.", status: 400 };
  }
  const ids = r.ids ?? [];
  await catatAudit(db, akun.id, "pendataan_minta_daftar", { pml_id: tim.pml.id, permintaan: ids, sub: pilihan.map((p) => p.idsubsls) }).catch(() => undefined);

  let dikirim = 0;
  try {
    const namaPpl = new Map(tim.anggota.map((a) => [a.akun_id, a.nama]));
    const daftar = pilihan.map((p) => `${labelWilayah(wil.get(p.idsubsls), p.idsubsls)} → ${namaPpl.get(p.ppl_akun_id) ?? "PPL"}`).join("; ");
    const admin = await akunAdminBencana(db);
    const h = await kirimKeAkun(db, gabungPenerima([admin], akun.id), {
      judul: "Permintaan daftar KK ke FASIH",
      isi: ringkas(`PML ${rapikanNama(tim.pml.nama)} meminta daftar KK keluar di FASIH: ${daftar}.`, 240),
      url: "/sigap/kelola/pendataan",
      tag: `minta-daftar-${tim.pml.id}`,
    });
    dikirim = h.terkirim;
  } catch (e) {
    console.error("[minta daftar push]", e instanceof Error ? e.message : e);
  }
  return { ids, dikirim };
}

/** PML membatalkan permintaan yang masih menunggu (lunak: status jadi dibatalkan, kuota hari itu kembali). */
export async function batalkanPermintaan(db: Db, akun: { id: number }, tim: Tim, id: number): Promise<{ ok: true } | Galat> {
  if (tim.saya.peran !== "pml") return { galat: "Hanya PML yang dapat membatalkan permintaan.", status: 403 };
  const { data: s } = await db.from("bencana_pendataan_permintaan").select("id, pml_id, status, idsubsls, dari_kolam").eq("id", id).maybeSingle();
  if (!s || s.pml_id !== tim.pml.id) return { galat: "Permintaan tidak ditemukan.", status: 404 };
  if (s.status !== "menunggu") return { galat: "Hanya permintaan yang masih menunggu yang bisa dibatalkan.", status: 409 };
  // (16 Okt 2026) pilihan kolam yang sudah mulai didata tidak boleh dikembalikan ke kolam
  if (s.dari_kolam && (await adaKkBerhasil(db, s.idsubsls as string))) return { galat: pesanTolak("sudah_didata").isi, status: 409 };
  const { data: upd, error } = await db.from("bencana_pendataan_permintaan").update({ status: "dibatalkan", dibatalkan_oleh: akun.id, dibatalkan_at: new Date().toISOString() }).eq("id", id).eq("status", "menunggu").select("id");
  if (error) return { galat: "Pembatalan gagal. Coba lagi.", status: 500 };
  if (!upd || upd.length === 0) return { galat: "Permintaan ini sudah berubah status.", status: 409 };
  await catatAudit(db, akun.id, "pendataan_minta_batal", { permintaan: id, idsubsls: s.idsubsls }).catch(() => undefined);
  if (s.dari_kolam) await lepasKolam(db, id); // kembali ke kolam: baris alokasi yang dibuat pilihan itu dilepas
  return { ok: true };
}

/**
 * PML mengajukan pembatalan assignment yang SUDAH keluar di FASIH. Langsung berlaku tanpa persetujuan (permintaan user 14 Okt 2026): status jadi
 * "dibatalkan" sehingga kuota harian PML dan Sub SLS-nya bebas, PML bisa memilih ulang PPL. Admin dan PPL penerima dikabari; admin menghapus
 * assignment lama di FASIH lalu menandainya (prosesPembatalan). Kegagalan push tidak menggagalkan pembatalan.
 */
export async function ajukanPembatalan(db: Db, akun: { id: number }, tim: Tim, id: number): Promise<{ ok: true; dikirim: number } | Galat> {
  if (tim.saya.peran !== "pml") return { galat: "Hanya PML yang dapat mengajukan pembatalan.", status: 403 };
  const { data: s } = await db.from("bencana_pendataan_permintaan").select("id, pml_id, status, idsubsls, ppl_akun_id, dari_kolam").eq("id", id).maybeSingle();
  if (!s || s.pml_id !== tim.pml.id) return { galat: "Permintaan tidak ditemukan.", status: 404 };
  if (s.status !== "sudah_keluar") return { galat: "Pembatalan assignment hanya untuk yang sudah keluar di FASIH. Yang masih menunggu cukup dibatalkan biasa.", status: 409 };
  // (16 Okt 2026) pilihan kolam yang sudah mulai didata tidak boleh dikembalikan ke kolam
  if (s.dari_kolam && (await adaKkBerhasil(db, s.idsubsls as string))) return { galat: pesanTolak("sudah_didata").isi, status: 409 };
  const { data: upd, error } = await db
    .from("bencana_pendataan_permintaan")
    .update({ status: "dibatalkan", dibatalkan_oleh: akun.id, dibatalkan_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sudah_keluar")
    .select("id");
  if (error) return { galat: "Pembatalan gagal. Coba lagi.", status: 500 };
  if (!upd || upd.length === 0) return { galat: "Permintaan ini sudah berubah status.", status: 409 };
  await catatAudit(db, akun.id, "pendataan_minta_batal_fasih", { permintaan: id, idsubsls: s.idsubsls, ppl_akun_id: s.ppl_akun_id }).catch(() => undefined);
  if (s.dari_kolam) await lepasKolam(db, id); // kembali ke kolam: baris alokasi yang dibuat pilihan itu dilepas

  let dikirim = 0;
  try {
    const [wil, { data: ppl }, admin] = await Promise.all([petaWilayah(db, [s.idsubsls as string]), db.from("sigap_akun").select("id, nama").eq("id", s.ppl_akun_id as number).maybeSingle(), akunAdminBencana(db)]);
    const w = wil.get(s.idsubsls as string);
    const jorong = w ? labelJorong(String(w.sls ?? ""), String(w.sub_sls ?? "")) : (s.idsubsls as string);
    const namaPpl = String(ppl?.nama ?? "PPL");
    const a = susunPushBatal("admin", tim.pml.nama, [{ jorong, ppl: namaPpl }]);
    const h1 = await kirimKeAkun(db, gabungPenerima([admin], akun.id), { judul: a.judul, isi: a.isi, url: "/sigap/kelola/pendataan", tag: `batal-fasih-${id}` });
    const p = susunPushBatal("ppl", tim.pml.nama, [{ jorong, ppl: namaPpl }]);
    const h2 = await kirimKeAkun(db, [s.ppl_akun_id as number], { judul: p.judul, isi: p.isi, url: "/sigap/pendataan", tag: `batal-ppl-${id}` });
    dikirim = h1.terkirim + h2.terkirim;
  } catch (e) {
    console.error("[batal fasih push]", e instanceof Error ? e.message : e);
  }
  return { ok: true, dikirim };
}

/** Admin menandai pembatalan sudah dihapus di FASIH (hilang dari daftar "Perlu dihapus di FASIH"). */
export async function prosesPembatalan(db: Db, akun: { id: number }, ids: number[]): Promise<{ diproses: number } | Galat> {
  const { data, error } = await db
    .from("bencana_pendataan_permintaan")
    .update({ batal_diproses_oleh: akun.id, batal_diproses_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "dibatalkan")
    .not("selesai_at", "is", null)
    .is("batal_diproses_at", null)
    .select("id");
  if (error) return { galat: "Gagal menandai. Coba lagi.", status: 500 };
  const baris = (data ?? []) as { id: number }[];
  if (!baris.length) return { galat: "Tidak ada pembatalan yang cocok (mungkin sudah ditandai).", status: 409 };
  await catatAudit(db, akun.id, "pendataan_batal_fasih_diproses", { permintaan: baris.map((b) => b.id) }).catch(() => undefined);
  return { diproses: baris.length };
}

/** Admin menandai permintaan "sudah keluar di FASIH". PML dan PPL tiap permintaan diberi tahu. */
export async function selesaikanPermintaan(db: Db, akun: { id: number }, ids: number[]): Promise<{ selesai: number; dikirim: number } | Galat> {
  const { data, error } = await db
    .from("bencana_pendataan_permintaan")
    .update({ status: "sudah_keluar", selesai_oleh: akun.id, selesai_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "menunggu")
    .select("id, idsubsls, pml_id, ppl_akun_id");
  if (error) return { galat: "Gagal menandai. Coba lagi.", status: 500 };
  const baris = (data ?? []) as { id: number; idsubsls: string; pml_id: number; ppl_akun_id: number }[];
  if (!baris.length) return { galat: "Tidak ada permintaan menunggu yang cocok (mungkin sudah ditandai atau dibatalkan PML).", status: 409 };
  await catatAudit(db, akun.id, "pendataan_minta_selesai", { permintaan: baris.map((b) => b.id) }).catch(() => undefined);

  let dikirim = 0;
  try {
    const [wil, akunPml, { data: ppl }] = await Promise.all([
      petaWilayah(db, baris.map((b) => b.idsubsls)),
      akunPerPetugas(db, baris.map((b) => b.pml_id)),
      db.from("sigap_akun").select("id, nama").in("id", [...new Set(baris.map((b) => b.ppl_akun_id))]),
    ]);
    const namaPpl = new Map((ppl ?? []).map((p) => [p.id as number, String(p.nama ?? "")]));
    // satu notifikasi per PML (semua Sub SLS-nya) dan satu per PPL
    const perPml = new Map<number, typeof baris>();
    const perPpl = new Map<number, typeof baris>();
    for (const b of baris) {
      perPml.set(b.pml_id, [...(perPml.get(b.pml_id) ?? []), b]);
      perPpl.set(b.ppl_akun_id, [...(perPpl.get(b.ppl_akun_id) ?? []), b]);
    }
    const jorong = (idsubsls: string) => {
      const w = wil.get(idsubsls);
      return w ? labelJorong(String(w.sls ?? ""), String(w.sub_sls ?? "")) : idsubsls;
    };
    for (const [pmlId, rows] of perPml) {
      const a = akunPml.get(pmlId);
      if (!a) continue;
      const { judul, isi } = susunPushKeluar("pml", rows.map((b) => ({ jorong: jorong(b.idsubsls), ppl: namaPpl.get(b.ppl_akun_id) ?? "PPL" })));
      const h = await kirimKeAkun(db, [a], { judul, isi, url: "/sigap/pendataan", tag: `keluar-pml-${pmlId}` });
      dikirim += h.terkirim;
    }
    for (const [pplId, rows] of perPpl) {
      const { judul, isi } = susunPushKeluar("ppl", rows.map((b) => ({ jorong: jorong(b.idsubsls), ppl: namaPpl.get(pplId) ?? "PPL" })));
      const h = await kirimKeAkun(db, [pplId], { judul, isi, url: "/sigap/pendataan", tag: `keluar-ppl-${pplId}` });
      dikirim += h.terkirim;
    }
  } catch (e) {
    console.error("[selesai push]", e instanceof Error ? e.message : e);
  }
  return { selesai: baris.length, dikirim };
}

/** Admin menarik kembali tanda "sudah keluar di FASIH" (salah klik): status kembali "menunggu", tanpa notifikasi. Kuota PML tidak berubah. */
export async function tarikPermintaan(db: Db, akun: { id: number }, ids: number[]): Promise<{ ditarik: number } | Galat> {
  const { data, error } = await db
    .from("bencana_pendataan_permintaan")
    .update({ status: "menunggu", selesai_oleh: null, selesai_at: null })
    .in("id", ids)
    .eq("status", "sudah_keluar")
    .select("id");
  if (error) return { galat: "Gagal menarik kembali. Coba lagi.", status: 500 };
  const baris = (data ?? []) as { id: number }[];
  if (!baris.length) return { galat: "Tidak ada permintaan berstatus sudah keluar yang cocok (mungkin sudah ditarik).", status: 409 };
  await catatAudit(db, akun.id, "pendataan_minta_tarik", { permintaan: baris.map((b) => b.id) }).catch(() => undefined);
  return { ditarik: baris.length };
}

/** Admin mengisi email FASIH pengawas (PML) / pencacah (PPL) dari satu permintaan -> disimpan di bencana_petugas.email_fasih (berlaku untuk semua permintaan petugas itu). */
export async function simpanEmailFasih(db: Db, akun: { id: number }, permintaanId: number, sebagai: PeranEmail, emailMentah: unknown): Promise<{ ok: true; email: string } | Galat> {
  const email = periksaEmail(emailMentah);
  if (!email) return { galat: "Format email tidak sah.", status: 422 };
  const { data: p } = await db.from("bencana_pendataan_permintaan").select("id, pml_id, ppl_akun_id").eq("id", permintaanId).maybeSingle();
  if (!p) return { galat: "Permintaan tidak ditemukan.", status: 404 };
  let petugasId: number | null = p.pml_id as number;
  if (sebagai === "pencacah") {
    const { data: a } = await db.from("sigap_akun").select("petugas_bencana_id").eq("id", p.ppl_akun_id as number).maybeSingle();
    petugasId = (a?.petugas_bencana_id as number | null | undefined) ?? null;
  }
  if (!petugasId) return { galat: "Akun PPL ini belum terhubung ke data petugas, jadi emailnya belum bisa disimpan.", status: 409 };
  const { error } = await db.from("bencana_petugas").update({ email_fasih: email }).eq("id", petugasId);
  if (error) return { galat: "Email gagal disimpan. Coba lagi.", status: 500 };
  await catatAudit(db, akun.id, "pendataan_email_fasih", { petugas_id: petugasId, sebagai, permintaan: permintaanId }).catch(() => undefined);
  return { ok: true, email };
}
